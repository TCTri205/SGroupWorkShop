import "dotenv/config";

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";

const ROUTE_SCHEMA = z.object({
  intent: z.enum(["general", "weather", "news", "it-research", "sgroup-knowledge", "mixed-research", "github"]),
  agent: z
    .enum(["generalist", "weather-specialist", "news-specialist", "it-specialist", "sgroup-specialist", "research-specialist", "github-specialist"])
    .optional(),
  confidence: z.number().min(0).max(1).optional(),
  reasoningSummary: z.string().min(1),
  args: z
    .object({
      location: z.string().trim().min(1).optional(),
      category: z.string().trim().min(1).optional(),
      query: z.string().trim().min(1).optional(),
      topic: z.string().trim().min(1).optional()
    })
    .partial()
    .default({})
});

const TOOL_CALL_SCHEMA = z.object({
  name: z.string().trim().min(1),
  args: z.object({}).catchall(z.unknown()).default({}),
  reason: z.string().trim().min(1)
});

const PLAN_SCHEMA = z.object({
  toolCalls: z.array(TOOL_CALL_SCHEMA),
  planningSummary: z.string().trim().min(1)
});

const SYNTHESIS_SCHEMA = z.object({
  message: z.string().trim().min(1)
});

const DEFAULT_MODEL = process.env.GOOGLE_MODEL || "gemini-2.5-flash";
const DEFAULT_TIMEOUT_MS = Number(process.env.GOOGLE_TIMEOUT_MS || 8000);
const BRAVE_TOOL_NAMES = new Set(["brave_web_search", "brave_local_search"]);
const CONTEXT7_TOOL_NAMES = new Set(["resolve-library-id", "query-docs"]);

let adapterOverride = null;

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .toLowerCase()
    .trim();
}

function isVersionLookupMessage(message) {
  const normalized = normalizeText(message);
  return /\b(phien ban|version|latest|moi nhat|current|hien tai|release)\b/.test(normalized);
}

function isDocsLookupMessage(message) {
  const normalized = normalizeText(message);
  return /\b(doc|docs|documentation|tai lieu|api|sdk|framework|library|thu vien|package|npm|pip)\b/.test(normalized);
}

function isGithubTool(toolName) {
  return !BRAVE_TOOL_NAMES.has(toolName) && !CONTEXT7_TOOL_NAMES.has(toolName);
}

export function selectExternalToolsForRoute({ message, route, externalTools = [] }) {
  switch (route?.intent) {
    case "weather":
    case "news":
    case "sgroup-knowledge":
    case "mixed-research":
      return [];
    case "github":
      return externalTools.filter((tool) => isGithubTool(tool.name));
    case "it-research":
      if (isDocsLookupMessage(message) && !isVersionLookupMessage(message)) {
        return externalTools.filter((tool) => CONTEXT7_TOOL_NAMES.has(tool.name));
      }

      if (isVersionLookupMessage(message)) {
        return externalTools.filter((tool) => tool.name === "brave_web_search");
      }

      return [];
    default:
      return [];
  }
}

function getGoogleModel() {
  const apiKey = String(process.env.GOOGLE_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is required for LLM orchestration.");
  }

  return new ChatGoogleGenerativeAI({
    apiKey,
    model: String(process.env.GOOGLE_MODEL ?? "").trim() || DEFAULT_MODEL,
    temperature: 0,
    maxRetries: 0,
    timeout: Number(process.env.GOOGLE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  });
}

function normalizeTextResponse(content) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part && typeof part === "object" && "text" in part) {
          return String(part.text ?? "");
        }

        return "";
      })
      .join("\n")
      .trim();
  }

  return String(content ?? "").trim();
}

async function invokeStructuredOutput(schema, name, instruction) {
  const model = getGoogleModel().withStructuredOutput(schema, { name });
  return model.invoke(instruction);
}

async function invokeText(instruction) {
  const response = await getGoogleModel().invoke(instruction);
  const text = normalizeTextResponse(response?.content);
  if (!text) {
    throw new Error("LLM synthesis returned empty content.");
  }

  return text;
}

function buildDefaultAdapter() {
  return {
    async route(message) {
      const instruction = [
        "You classify user messages for a Vietnamese assistant.",
        "Return structured output only.",
        "Allowed intents: general, weather, news, it-research, sgroup-knowledge, mixed-research, github.",
        "Allowed agents: generalist, weather-specialist, news-specialist, it-specialist, sgroup-specialist, research-specialist, github-specialist.",
        "Rules:",
        "- Choose mixed-research only when the message clearly needs both external IT knowledge and internal SGroup knowledge.",
        "- Choose news for requests asking for news, updates, headlines, or latest developments.",
        "- Choose weather for weather requests.",
        "- Choose sgroup-knowledge for SGroup or AI Team internal knowledge.",
        "- Choose github for requests asking to read source code, pull requests, issues, or search github repositories.",
        "- Choose it-research for technology, software, infrastructure, programming, architecture, databases, cache, Redis, APIs, MCP, LangGraph, AI engineering, or explainers about IT concepts.",
        "- Use general only when no specialist intent is appropriate.",
        "- Extract only args that are explicitly supported by the intent.",
        `User message: ${JSON.stringify(String(message ?? ""))}`
      ].join("\n");

      return invokeStructuredOutput(ROUTE_SCHEMA, "RouteDecision", instruction);
    },

    async plan({ message, route, externalTools = [] }) {
      const visibleExternalTools = selectExternalToolsForRoute({ message, route, externalTools });
      const extToolDescs = visibleExternalTools
        .map((tool) => `- ${tool.name}(args: ${JSON.stringify(tool.inputSchema?.properties || {})}) - ${tool.description}`)
        .join("\n");
      const instruction = [
        "You plan tool calls for a Vietnamese assistant.",
        "Return structured output only.",
        "Available tools:",
        "- get_weather(args: { location })",
        "- get_news(args: { category?, query? })",
        "- search_it_knowledge(args: { topic })",
        "- search_sgroup_knowledge(args: { query })",
        "- read_project_document(args: { filename })",
        extToolDescs,
        "Rules:",
        "- Use zero tools for general chat or when the assistant should ask a clarifying question.",
        "- For weather, call get_weather only when location is present, and copy the location from route.args.location when provided.",
        "- For news, use get_news with category and/or query, preferring route.args.category and route.args.query when available.",
        "- For it-research version/latest/current questions, prefer brave_web_search or search_it_knowledge. Do NOT use resolve-library-id for language or platform version lookups.",
        "- Use resolve-library-id ONLY when you specifically need to map a human-readable library/package/framework name to a machine-readable Context7 ID for documentation lookup.",
        "- Only use Brave search tools (brave_web_search) for breaking news, latest version lookups, troubleshooting specific error messages/StackOverflow, or when you need recent web results.",
        "- Use search_it_knowledge when a general IT lookup is needed and no external documentation tool is necessary.",
        "- Route args are the primary source of truth for tool arguments. If route already contains location/category/query/topic, you must copy those values into the tool call instead of leaving args empty.",
        "- EXTREMELY IMPORTANT: When calling ANY tool (e.g., search_sgroup_knowledge, search_it_knowledge, brave_web_search, get_news), you MUST provide its required arguments (like 'query', 'topic', 'location'). NEVER output `args: {}` if the tool requires them.",
        "- For brave_web_search, the 'query' argument is strictly required. You MUST extract the core search intent.",
        "- Example of correct tool call for search: {\"toolCalls\": [{\"name\": \"search_sgroup_knowledge\", \"args\": {\"query\": \"sgroup là gì\"}, \"reason\": \"Searching for SGroup info\"}]}",
        "- Never call a tool with empty arguments if it requires them.",
        "- For github, prioritize github tools such as github_read_file, github_search_repositories, etc.",
        "- For sgroup-knowledge, use search_sgroup_knowledge with a concrete query.",
        "- If you need deeper technical details about an AI project after finding its filename in search_sgroup_knowledge, use read_project_document.",
        "- For mixed-research, call both search_it_knowledge and search_sgroup_knowledge.",
        "- Only use tools from the Available tools list.",
        `Route: ${JSON.stringify(route)}`,
        `User message: ${JSON.stringify(String(message ?? ""))}`
      ].join("\n");

      return invokeStructuredOutput(PLAN_SCHEMA, "ToolPlan", instruction);
    },

    async synthesize({ message, route, toolCalls, results, errors }) {
      const instruction = [
        "You are a Vietnamese assistant synthesizing the final answer for a chat UI.",
        "Write concise Vietnamese with diacritics.",
        "Do not invent sources, tool outputs, or facts outside the provided data.",
        "If no tools were called and the route is general, briefly state supported capabilities and ask for a more specific question.",
        "If no tools were called and the route is weather without location, ask for a location.",
        "If there are tool errors and no successful results, explain the failure clearly.",
        `User message: ${JSON.stringify(String(message ?? ""))}`,
        `Route: ${JSON.stringify(route)}`,
        `Tool calls: ${JSON.stringify(toolCalls ?? [])}`,
        `Tool results: ${JSON.stringify(results ?? [])}`,
        `Tool errors: ${JSON.stringify(errors ?? [])}`,
        "Return only the final answer text."
      ].join("\n");

      const text = await invokeText(instruction);
      return SYNTHESIS_SCHEMA.parse({ message: text });
    }
  };
}

function getAdapter() {
  return adapterOverride ?? buildDefaultAdapter();
}

export async function routeIntentWithLlm(message) {
  return ROUTE_SCHEMA.parse(await getAdapter().route(message));
}

export async function planToolCallsWithLlm(input) {
  return PLAN_SCHEMA.parse(await getAdapter().plan(input));
}

export async function synthesizeAnswerWithLlm(input) {
  return SYNTHESIS_SCHEMA.parse(await getAdapter().synthesize(input));
}

export function setAssistantLlmAdapterForTests(adapter) {
  adapterOverride = adapter;
}

export function resetAssistantLlmAdapterForTests() {
  adapterOverride = null;
}

