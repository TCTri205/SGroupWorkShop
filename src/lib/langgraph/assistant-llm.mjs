import "dotenv/config";

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";

const ROUTE_SCHEMA = z.object({
  intent: z.enum(["general", "weather", "news", "it-research", "sgroup-knowledge", "mixed-research"]),
  agent: z
    .enum(["generalist", "weather-specialist", "news-specialist", "it-specialist", "sgroup-specialist", "research-specialist"])
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
  name: z.enum(["get_weather", "get_news", "search_it_knowledge", "search_sgroup_knowledge"]),
  args: z
    .object({
      location: z.string().trim().min(1).optional(),
      category: z.string().trim().min(1).optional(),
      query: z.string().trim().min(1).optional(),
      topic: z.string().trim().min(1).optional()
    })
    .partial()
    .default({}),
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

let adapterOverride = null;

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
        "Allowed intents: general, weather, news, it-research, sgroup-knowledge, mixed-research.",
        "Allowed agents: generalist, weather-specialist, news-specialist, it-specialist, sgroup-specialist, research-specialist.",
        "Rules:",
        "- Choose mixed-research only when the message clearly needs both external IT knowledge and internal SGroup knowledge.",
        "- Choose news for requests asking for news, updates, headlines, or latest developments.",
        "- Choose weather for weather requests.",
        "- Choose sgroup-knowledge for SGroup or AI Team internal knowledge.",
        "- Choose it-research for technology, software, infrastructure, programming, architecture, databases, cache, Redis, APIs, MCP, LangGraph, AI engineering, or explainers about IT concepts.",
        "- Use general only when no specialist intent is appropriate.",
        "- Extract only args that are explicitly supported by the intent.",
        `User message: ${JSON.stringify(String(message ?? ""))}`
      ].join("\n");

      return invokeStructuredOutput(ROUTE_SCHEMA, "RouteDecision", instruction);
    },

    async plan({ message, route }) {
      const instruction = [
        "You plan tool calls for a Vietnamese assistant.",
        "Return structured output only.",
        "Available tools:",
        "- get_weather(args: { location })",
        "- get_news(args: { category?, query? })",
        "- search_it_knowledge(args: { topic })",
        "- search_sgroup_knowledge(args: { query })",
        "Rules:",
        "- Use zero tools for general chat or when the assistant should ask a clarifying question.",
        "- For weather, call get_weather only when location is present.",
        "- For news, use get_news with category and/or query.",
        "- For it-research, use search_it_knowledge with a concrete topic.",
        "- For sgroup-knowledge, use search_sgroup_knowledge with a concrete query.",
        "- For mixed-research, call both search_it_knowledge and search_sgroup_knowledge.",
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
