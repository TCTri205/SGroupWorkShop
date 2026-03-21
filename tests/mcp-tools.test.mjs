/**
 * MCP Tools Unit Tests
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import { cacheClear } from "../src/lib/cache.mjs";
import { searchKnowledge, listAiTeamModules } from "../src/lib/knowledge.mjs";
import {
  executeTool,
  formatErrorContent,
  formatTextContent,
  handleReadResource
} from "../src/lib/mcp-runtime.mjs";
import { PROMPTS, getPromptMessages } from "../src/mcp-server.mjs";
import { queryWeather, queryNews, queryWebSearch } from "../src/lib/providers.mjs";
import { invokeAssistantGraph } from "../src/lib/langgraph/assistant-graph.mjs";
import { resetAssistantLlmAdapterForTests, selectExternalToolsForRoute, setAssistantLlmAdapterForTests } from "../src/lib/langgraph/assistant-llm.mjs";
import { createRouteFromIntent } from "../src/lib/router.mjs";

const originalFetch = global.fetch;
const originalEnv = {
  OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY,
  NEWS_API_KEY: process.env.NEWS_API_KEY,
  EXA_API_KEY: process.env.EXA_API_KEY,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  GOOGLE_MODEL: process.env.GOOGLE_MODEL,
  FETCH_TIMEOUT_MS: process.env.FETCH_TIMEOUT_MS
};

function createJsonResponse(payload, init = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  };
}

function createTextResponse(text, init = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    json: async () => {
      throw new Error("json() should not be called for text response");
    },
    text: async () => text
  };
}

function normalize(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .toLowerCase()
    .trim();
}

function buildMockAssistantAdapter() {
  return {
    async route(message) {
      const normalized = normalize(message);
      if (normalized.includes("thoi tiet")) {
        const location = normalized.includes("ha noi") ? "Ha Noi" : normalized.includes("dubai") ? "Dubai" : undefined;
        return {
          intent: "weather",
          agent: "weather-specialist",
          confidence: 0.95,
          reasoningSummary: "LLM route to weather.",
          args: location ? { location } : {}
        };
      }

      if (normalized.includes("tin") && normalized.includes("redis")) {
        return {
          intent: "news",
          agent: "news-specialist",
          confidence: 0.93,
          reasoningSummary: "LLM route to news topic.",
          args: { category: "tong-hop", query: "Redis" }
        };
      }

      if (normalized.includes("tin cong nghe")) {
        return {
          intent: "news",
          agent: "news-specialist",
          confidence: 0.93,
          reasoningSummary: "LLM route to technology news.",
          args: { category: "cong-nghe" }
        };
      }

      if ((normalized.includes("mcp") || normalized.includes("langgraph")) && normalized.includes("sgroup")) {
        return {
          intent: "mixed-research",
          agent: "research-specialist",
          confidence: 0.91,
          reasoningSummary: "LLM route to mixed research.",
          args: { topic: String(message).trim(), query: String(message).trim() }
        };
      }

      if (normalized.includes("ai team") || normalized.includes("sgroup")) {
        return {
          intent: "sgroup-knowledge",
          agent: "sgroup-specialist",
          confidence: 0.88,
          reasoningSummary: "LLM route to internal knowledge.",
          args: { query: String(message).trim() }
        };
      }

      if (normalized.includes("cache") || normalized.includes("redis") || normalized.includes("mcp") || normalized.includes("api")) {
        return {
          intent: "it-research",
          agent: "it-specialist",
          confidence: 0.89,
          reasoningSummary: "LLM route to IT research.",
          args: { topic: String(message).trim() }
        };
      }

      return {
        intent: "general",
        agent: "generalist",
        confidence: 0.6,
        reasoningSummary: "LLM route to general.",
        args: {}
      };
    },

    async plan({ route }) {
      switch (route.intent) {
        case "weather":
          return {
            toolCalls: route.args.location
              ? [{ name: "get_weather", args: { location: route.args.location }, reason: "Need weather data." }]
              : [],
            planningSummary: route.args.location ? "Use weather tool." : "Need clarification."
          };
        case "news":
          return {
            toolCalls: [{ name: "get_news", args: route.args, reason: "Need news data." }],
            planningSummary: "Use news tool."
          };
        case "it-research":
          return {
            toolCalls: [{ name: "search_it_knowledge", args: { topic: route.args.topic }, reason: "Need IT search." }],
            planningSummary: "Use IT search."
          };
        case "sgroup-knowledge":
          return {
            toolCalls: [{ name: "search_sgroup_knowledge", args: { query: route.args.query }, reason: "Need internal knowledge." }],
            planningSummary: "Use SGroup knowledge."
          };
        case "mixed-research":
          return {
            toolCalls: [
              { name: "search_it_knowledge", args: { topic: route.args.topic }, reason: "Need external context." },
              { name: "search_sgroup_knowledge", args: { query: route.args.query }, reason: "Need internal context." }
            ],
            planningSummary: "Use mixed tools."
          };
        default:
          return { toolCalls: [], planningSummary: "No tools needed." };
      }
    },

    async synthesize({ route, results, errors }) {
      if (errors.length && !results.length) {
        return { message: `Khong the xu ly yeu cau: ${errors[0]}` };
      }

      if (route.intent === "general") {
        return { message: "Toi co the ho tro tri thuc SGroup/AI Team, thoi tiet, tin tuc va nghien cuu IT." };
      }

      if (route.intent === "weather" && !route.args.location) {
        return { message: "Ban muon xem thoi tiet o dau?" };
      }

      if (route.intent === "sgroup-knowledge") {
        const items = results[0]?.items ?? [];
        return { message: items.length ? `Da tim thay ${items.length} ban ghi noi bo lien quan.` : "Chua tim thay ban ghi noi bo phu hop." };
      }

      return {
        message: results.map((result) => result.summary).filter(Boolean).join("\n\n") || `Da xu ly intent ${route.intent}.`
      };
    }
  };
}

beforeEach(() => {
  cacheClear();
  process.env.OPENWEATHER_API_KEY = "";
  process.env.NEWS_API_KEY = "";
  process.env.EXA_API_KEY = "";
  process.env.GOOGLE_API_KEY = "";
  process.env.FETCH_TIMEOUT_MS = "50";
  global.fetch = originalFetch;
  setAssistantLlmAdapterForTests(buildMockAssistantAdapter());
});

afterEach(() => {
  cacheClear();
  process.env.OPENWEATHER_API_KEY = originalEnv.OPENWEATHER_API_KEY;
  process.env.NEWS_API_KEY = originalEnv.NEWS_API_KEY;
  process.env.EXA_API_KEY = originalEnv.EXA_API_KEY;
  process.env.GOOGLE_API_KEY = originalEnv.GOOGLE_API_KEY;
  process.env.GOOGLE_MODEL = originalEnv.GOOGLE_MODEL;
  process.env.FETCH_TIMEOUT_MS = originalEnv.FETCH_TIMEOUT_MS;
  global.fetch = originalFetch;
  resetAssistantLlmAdapterForTests();
});


describe("Planner Tool Visibility", () => {
  const externalTools = [
    { name: "brave_web_search", inputSchema: { required: ["query"] } },
    { name: "resolve-library-id", inputSchema: { required: ["query", "libraryName"] } },
    { name: "query-docs", inputSchema: { required: ["libraryId", "query"] } },
    { name: "search_repositories", inputSchema: { required: ["query"] } }
  ];

  it("should hide external tools for weather intent", () => {
    const visibleTools = selectExternalToolsForRoute({
      message: "Thoi tiet Da Nang",
      route: { intent: "weather" },
      externalTools
    });

    assert.deepStrictEqual(visibleTools, []);
  });

  it("should expose only brave search for latest version lookups", () => {
    const visibleTools = selectExternalToolsForRoute({
      message: "Phien ban moi nhat cua Python la gi?",
      route: { intent: "it-research" },
      externalTools
    });

    assert.deepStrictEqual(visibleTools.map((tool) => tool.name), ["brave_web_search"]);
  });

  it("should expose only github tools for github intent", () => {
    const visibleTools = selectExternalToolsForRoute({
      message: "Tim repo LangGraph tren GitHub",
      route: { intent: "github" },
      externalTools
    });

    assert.deepStrictEqual(visibleTools.map((tool) => tool.name), ["search_repositories"]);
  });
});
describe("Knowledge Module (Fuzzy Search)", () => {
  describe("searchKnowledge", () => {
    it("should find AI Team records by keyword", () => {
      const results = searchKnowledge("ai-team", "chatbot");
      assert.ok(results.length > 0);
    });

    it("should find SGroup records by keyword", () => {
      const results = searchKnowledge("sgroup", "gioi thieu");
      assert.ok(Array.isArray(results));
    });

    it("should find official SGroup website snapshot records", () => {
      const results = searchKnowledge("sgroup", "S Group la gi vay");
      assert.ok(results.length > 0);
      assert.equal(results.some((record) => record.sourceUrl === "https://sgroupvn.org/"), true);
    });

    it("should return empty array for unrelated query", () => {
      const results = searchKnowledge("ai-team", "xyzabc123notexist");
      assert.deepStrictEqual(results, []);
    });

    it("should handle case-insensitive search", () => {
      const lowerResults = searchKnowledge("ai-team", "chatbot");
      const upperResults = searchKnowledge("ai-team", "CHATBOT");
      assert.ok(lowerResults.length > 0);
      assert.ok(upperResults.length > 0);
    });

    it("should handle empty query gracefully", () => {
      const results = searchKnowledge("ai-team", "");
      assert.deepStrictEqual(results, []);
    });

    it("should handle unknown domain gracefully", () => {
      const results = searchKnowledge("unknown-domain", "chatbot");
      assert.deepStrictEqual(results, []);
    });

    it("should tolerate minor typos", () => {
      const results = searchKnowledge("ai-team", "chatbt");
      assert.ok(Array.isArray(results));
    });
  });

  describe("listAiTeamModules", () => {
    it("should return array of module identifiers", () => {
      const modules = listAiTeamModules();
      assert.ok(Array.isArray(modules));
      assert.ok(modules.length > 0);
      modules.forEach((mod) => {
        assert.ok(typeof mod === "string");
      });
    });
  });
});

describe("Providers Module", () => {
  describe("queryWeather", () => {
    it("should return mock data when API key is missing", async () => {
      const result = await queryWeather("Ho Chi Minh City");
      assert.equal(result.fallbackUsed, true);
      assert.match(result.message, /OPENWEATHER_API_KEY/);
    });

    it("should call OpenWeather endpoint and cache the result", async () => {
      process.env.OPENWEATHER_API_KEY = "weather-key";
      const calls = [];
      global.fetch = async (url) => {
        calls.push(url);
        return createJsonResponse({
          id: 123,
          name: "Ha Noi",
          weather: [{ description: "scattered clouds" }],
          main: { temp: 29, feels_like: 31, humidity: 70 },
          wind: { speed: 3.2 }
        });
      };

      const first = await queryWeather("Hanoi");
      const second = await queryWeather("Hanoi");

      assert.equal(calls.length, 1);
      assert.match(String(calls[0]), /api\.openweathermap\.org/);
      assert.match(String(calls[0]), /q=Hanoi/);
      assert.equal(first.fallbackUsed, false);
      assert.equal(second.message, first.message);
    });

    it("should degrade gracefully when OpenWeather returns HTTP error", async () => {
      process.env.OPENWEATHER_API_KEY = "weather-key";
      global.fetch = async () => createJsonResponse({}, { ok: false, status: 401, statusText: "Unauthorized" });
      const result = await queryWeather("Da Nang");
      assert.equal(result.fallbackUsed, true);
      assert.match(result.message, /Fallback/);
      assert.match(result.error, /OpenWeather API loi 401/);
    });
  });

  describe("queryNews", () => {
    it("should use RSS fallback when NEWS_API_KEY is missing", async () => {
      const rssXml = `
        <rss><channel>
          <item><title><![CDATA[Tin cong nghe 1]]></title><link>https://example.com/1</link></item>
          <item><title>Tin cong nghe 2</title><link>https://example.com/2</link></item>
        </channel></rss>`;
      const calls = [];
      global.fetch = async (url) => {
        calls.push(url);
        return createTextResponse(rssXml);
      };

      const result = await queryNews("cong-nghe");

      assert.equal(calls.length, 1);
      assert.equal(String(calls[0]), "https://vnexpress.net/rss/so-hoa.rss");
      assert.equal(result.fallbackUsed, true);
      assert.match(result.message, /RSS/);
      assert.equal(result.citations.length, 2);
    });

    it("should filter RSS results by specific news topic", async () => {
      const rssXml = `
        <rss><channel>
          <item><title>Chi?n tranh leo thang</title><description>chien tranh va xung dot</description><link>https://example.com/war</link></item>
          <item><title>Kinh t? s?ng nay</title><description>thi truong va doanh nghiep</description><link>https://example.com/economy</link></item>
        </channel></rss>`;
      global.fetch = async () => createTextResponse(rssXml);

      const result = await queryNews({ category: "tong-hop", query: "chien tranh" });

      assert.equal(result.fallbackUsed, true);
      assert.match(result.message, /chien tranh/i);
      assert.equal(result.citations.length, 1);
      assert.equal(result.citations[0].url, "https://example.com/war");
    });

    it("should use NewsAPI when key is available", async () => {
      process.env.NEWS_API_KEY = "news-key";
      const calls = [];
      global.fetch = async (url) => {
        calls.push(url);
        return createJsonResponse({
          articles: [
            { title: "Article A", url: "https://example.com/a", source: { name: "NewsAPI Source" } }
          ]
        });
      };

      const result = await queryNews("cong-nghe");

      assert.equal(calls.length, 1);
      assert.match(String(calls[0]), /newsapi\.org\/v2\/top-headlines/);
      assert.match(String(calls[0]), /category=technology/);
      assert.match(String(calls[0]), /apiKey=news-key/);
      assert.equal(result.fallbackUsed, false);
      assert.match(result.message, /Article A/);
    });

    it("should fallback to RSS when NewsAPI fails", async () => {
      process.env.NEWS_API_KEY = "news-key";
      let callIndex = 0;
      global.fetch = async () => {
        callIndex += 1;
        if (callIndex === 1) {
          return createJsonResponse({}, { ok: false, status: 500, statusText: "Server Error" });
        }
        return createTextResponse("<rss><channel><item><title>RSS rescue</title><link>https://example.com/rss</link></item></channel></rss>");
      };

      const result = await queryNews("tong-hop");

      assert.equal(callIndex, 2);
      assert.equal(result.fallbackUsed, true);
      assert.match(result.message, /RSS rescue/);
    });

    it("should still return fallback object when NewsAPI and RSS both fail", async () => {
      process.env.NEWS_API_KEY = "news-key";
      global.fetch = async () => createJsonResponse({}, { ok: false, status: 503, statusText: "Unavailable" });
      const result = await queryNews("tong-hop");
      assert.equal(result.fallbackUsed, true);
      assert.match(result.message, /Fallback/);
      assert.ok(Array.isArray(result.citations));
    });
  });

  describe("queryWebSearch", () => {
    it("should return mock data when API key is missing", async () => {
      const result = await queryWebSearch("JavaScript async await");
      assert.equal(result.fallbackUsed, true);
      assert.match(result.message, /EXA_API_KEY/);
    });

    it("should call Exa with expected POST body and cache the result", async () => {
      process.env.EXA_API_KEY = "exa-key";
      const calls = [];
      global.fetch = async (url, options) => {
        calls.push({ url, options });
        return createJsonResponse({
          results: [
            {
              title: "Async Await Guide",
              url: "https://example.com/async-await",
              text: "Deep dive into async and await patterns."
            }
          ]
        });
      };

      const first = await queryWebSearch("JavaScript async await");
      const second = await queryWebSearch("JavaScript async await");
      const requestBody = JSON.parse(String(calls[0].options.body));

      assert.equal(calls.length, 1);
      assert.equal(String(calls[0].url), "https://api.exa.ai/search");
      assert.equal(calls[0].options.method, "POST");
      assert.equal(calls[0].options.headers["x-api-key"], "exa-key");
      assert.equal(requestBody.query, "JavaScript async await");
      assert.equal(requestBody.type, "auto");
      assert.equal(requestBody.num_results, 5);
      assert.equal(requestBody.contents.text.max_characters, 4000);
      assert.equal(first.fallbackUsed, false);
      assert.equal(second.message, first.message);
    });

    it("should degrade gracefully when Exa returns HTTP error", async () => {
      process.env.EXA_API_KEY = "exa-key";
      global.fetch = async () => createJsonResponse({}, { ok: false, status: 429, statusText: "Too Many Requests" });
      const result = await queryWebSearch("rate limit");
      assert.equal(result.fallbackUsed, true);
      assert.match(result.message, /Fallback/);
      assert.match(result.error, /Exa API loi 429/);
    });
  });
});

describe("MCP Response Format", () => {
  it("should return valid MCP success response", () => {
    const response = formatTextContent("Hello World");
    assert.ok(Array.isArray(response.content));
    assert.strictEqual(response.isError, false);
    assert.strictEqual(response.content[0].type, "text");
    assert.strictEqual(response.content[0].text, "Hello World");
  });

  it("should return valid MCP error response", () => {
    const response = formatErrorContent("Something went wrong");
    assert.strictEqual(response.isError, true);
    assert.ok(response.content[0].text.startsWith("Error: "));
  });
});

describe("Integration Tests", () => {
  it("should handle full weather tool flow", async () => {
    const result = await executeTool("get_weather", { location: "Hanoi" });
    assert.strictEqual(result.isError, false);
    assert.match(result.content[0].text, /Thoi tiet hien tai/);
  });

  it("should handle full knowledge search flow", async () => {
    const result = await executeTool("search_sgroup_knowledge", { query: "AI Team" });
    assert.strictEqual(result.isError, false);
    assert.match(result.content[0].text, /AI Team/);
  });

  it("should answer basic SGroup overview questions from imported official records", async () => {
    const result = await executeTool("search_sgroup_knowledge", { query: "S Group la gi vay" });
    assert.strictEqual(result.isError, false);
    assert.match(result.content[0].text, /SGroup|sgroupvn\.org|Think Different/i);
  });

  it("should reject empty MCP tool inputs", async () => {
    const knowledge = await executeTool("search_sgroup_knowledge", { query: "   " });
    const itSearch = await executeTool("search_it_knowledge", { topic: "   " });
    const assistant = await executeTool("run_sgroup_assistant", { message: "   " });
    const news = await executeTool("get_news", { category: "   ", query: "   " });

    assert.equal(knowledge.isError, true);
    assert.equal(itSearch.isError, true);
    assert.equal(assistant.isError, true);
    assert.equal(news.isError, true);
  });

  it("should run the LangGraph assistant tool with LLM orchestration", async () => {
    const result = await executeTool("run_sgroup_assistant", { message: "Tin cong nghe moi nhat" });
    assert.strictEqual(result.isError, false);
    assert.match(result.content[0].text, /Route:/);
    assert.match(result.content[0].text, /news/);
  });

  it("should expose graph payload directly for shared orchestration", async () => {
    const payload = await invokeAssistantGraph({ message: "Thoi tiet Ha Noi", channel: "web", sessionId: "test-session" });
    assert.equal(payload.route.intent, "weather");
    assert.equal(payload.graph.usedFallbackRouter, false);
    assert.equal(payload.graph.sessionId, "test-session");
    assert.ok(Array.isArray(payload.graph.warnings));
    assert.match(payload.response.message, /OPENWEATHER_API_KEY|thoi tiet|Th?i ti?t/i);
  });

  it("should recover missing weather args from route without hard error", async () => {
    setAssistantLlmAdapterForTests({
      async route() {
        return {
          intent: "weather",
          agent: "weather-specialist",
          confidence: 0.95,
          reasoningSummary: "LLM route to weather.",
          args: { location: "Da Nang" }
        };
      },
      async plan() {
        return {
          toolCalls: [{ name: "get_weather", args: {}, reason: "Need weather data." }],
          planningSummary: "Use weather tool."
        };
      },
      async synthesize({ results, errors }) {
        return { message: errors.length && !results.length ? errors[0] : "Weather recovered" };
      }
    });

    const payload = await invokeAssistantGraph({ message: "Thoi tiet Da Nang", channel: "web", sessionId: "weather-recover" });

    assert.equal(payload.route.intent, "weather");
    assert.equal(payload.graph.plannerSource, "llm");
    assert.deepStrictEqual(payload.graph.errors, []);
    assert.equal(payload.graph.toolCalls[0].args.location, "Da Nang");
    assert.match(payload.graph.warnings[0], /get_weather/);
    assert.match(payload.response.statusSteps.join(" "), /tham số tool từ route/i);

    setAssistantLlmAdapterForTests(buildMockAssistantAdapter());
  });

  it("should recover missing sgroup query from route without hard error", async () => {
    setAssistantLlmAdapterForTests({
      async route(message) {
        return {
          intent: "sgroup-knowledge",
          agent: "sgroup-specialist",
          confidence: 0.9,
          reasoningSummary: "LLM route to internal knowledge.",
          args: { query: String(message).trim() }
        };
      },
      async plan() {
        return {
          toolCalls: [{ name: "search_sgroup_knowledge", args: {}, reason: "Need internal knowledge." }],
          planningSummary: "Use SGroup knowledge."
        };
      },
      async synthesize({ results, errors }) {
        return { message: errors.length && !results.length ? errors[0] : results[0]?.summary || "SGroup recovered" };
      }
    });

    const payload = await invokeAssistantGraph({ message: "Sgroup la gi?", channel: "web", sessionId: "sgroup-recover" });

    assert.equal(payload.route.intent, "sgroup-knowledge");
    assert.deepStrictEqual(payload.graph.errors, []);
    assert.equal(payload.graph.plannerSource, "llm");
    assert.equal(payload.graph.toolCalls[0].args.query, "Sgroup la gi?");
    assert.match(payload.graph.warnings[0], /search_sgroup_knowledge/);

    setAssistantLlmAdapterForTests(buildMockAssistantAdapter());
  });

  it("should downgrade invalid planner version lookup to warning when fallback succeeds", async () => {
    setAssistantLlmAdapterForTests({
      async route(message) {
        return {
          intent: "it-research",
          agent: "it-specialist",
          confidence: 0.92,
          reasoningSummary: "LLM route to IT research.",
          args: { topic: String(message).trim() }
        };
      },
      async plan() {
        return {
          toolCalls: [{ name: "brave_web_search", args: {}, reason: "Need latest version info." }],
          planningSummary: "Use brave search."
        };
      },
      async synthesize({ toolCalls }) {
        return { message: `Recovered with ${toolCalls[0]?.name || "none"}` };
      }
    });

    const payload = await invokeAssistantGraph({ message: "phien ban moi nhat cua Python?", channel: "web", sessionId: "python-recover" });

    assert.equal(payload.route.intent, "it-research");
    assert.deepStrictEqual(payload.graph.errors, []);
    assert.equal(payload.graph.plannerSource, "fallback");
    assert.equal(payload.graph.toolCalls[0].name, "search_it_knowledge");
    assert.match(payload.graph.warnings[0], /brave_web_search/);

    setAssistantLlmAdapterForTests(buildMockAssistantAdapter());
  });

  it("should return a greeting guidance message for general hello input", async () => {
    const payload = await invokeAssistantGraph({ message: "hello", channel: "web", sessionId: "hello-session" });
    assert.equal(payload.route.intent, "general");
    assert.deepStrictEqual(payload.response.mcp.toolNames, []);
    assert.match(payload.response.message, /chao ban|ho tro|AI Team|Thoi tiet Ha Noi hom nay|MCP/i);
    assert.doesNotMatch(payload.response.message, /Khong tim thay ket qua|The user's input/i);
  });


  it("should route cache and redis questions to the IT specialist", async () => {
    const payload = await invokeAssistantGraph({ message: "Cache l? g?? Redis l? g??", channel: "web", sessionId: "redis-session" });
    assert.equal(payload.route.intent, "it-research");
    assert.equal(payload.route.agent, "it-specialist");
    assert.equal(payload.response.mcp.toolNames[0], "search_it_knowledge");
  });

  it("should return explicit orchestration error when GOOGLE_API_KEY is missing and no test adapter is installed", async () => {
    resetAssistantLlmAdapterForTests();
    const payload = await invokeAssistantGraph({ message: "Tin cong nghe moi nhat", channel: "web", sessionId: "llm-error" });
    assert.equal(payload.graph.routeSource, "error");
    assert.equal(payload.graph.plannerSource, "error");
    assert.match(payload.response.message, /GOOGLE_API_KEY/);
    setAssistantLlmAdapterForTests(buildMockAssistantAdapter());
  });

  it("should support structured output planner schemas with dynamic args under zod v4", () => {
    const toolCallSchema = z.object({
      name: z.string().trim().min(1),
      args: z.object({}).catchall(z.unknown()).default({}),
      reason: z.string().trim().min(1)
    });
    const planSchema = z.object({
      toolCalls: z.array(toolCallSchema),
      planningSummary: z.string().trim().min(1)
    });

    const model = new ChatGoogleGenerativeAI({
      apiKey: "test-key",
      model: "gemini-2.5-flash"
    });

    assert.doesNotThrow(() => {
      model.withStructuredOutput(planSchema, { name: "ToolPlan" });
    });
  });

  it("should create safe general route for invalid intent", () => {
    const route = createRouteFromIntent("???", "not-real-intent");
    assert.equal(route.intent, "general");
    assert.equal(route.toolName, null);
  });

  it("should return MCP error shape for unknown tool", async () => {
    const result = await executeTool("unknown_tool", {});
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /Unknown tool/);
  });

  it("should return resource error payload for unknown resource", async () => {
    const result = await handleReadResource("sgroup://missing");
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Resource not found/);
  });
});

describe("MCP Prompt Registry", () => {
  it("should expose seven prompts covering the main use cases", () => {
    const names = PROMPTS.map((prompt) => prompt.name);

    assert.equal(PROMPTS.length, 7);
    assert.deepStrictEqual(names, [
      "tom-tat-du-an-sgroup",
      "bao-cao-sang-nay",
      "tra-cuu-kien-thuc-it",
      "tom-tat-ai-team",
      "tom-tat-sgroup-overview",
      "nghien-cuu-chu-de-noi-bo",
      "hoi-dap-da-buoc-sgroup"
    ]);
  });

  it("should render morning report prompt with city override", () => {
    const messages = getPromptMessages("bao-cao-sang-nay", { city: "Da Nang" });
    assert.equal(messages.length, 1);
    assert.match(messages[0].content.text, /get_weather/);
    assert.match(messages[0].content.text, /get_news/);
    assert.match(messages[0].content.text, /Da Nang/);
  });

  it("should render IT research prompt with topic argument", () => {
    const messages = getPromptMessages("tra-cuu-kien-thuc-it", { topic: "React Server Components" });
    assert.equal(messages.length, 1);
    assert.match(messages[0].content.text, /search_it_knowledge/);
    assert.match(messages[0].content.text, /React Server Components/);
  });

  it("should render resource-backed prompts for AI Team and SGroup overview", () => {
    const aiTeamMessages = getPromptMessages("tom-tat-ai-team");
    const sgroupMessages = getPromptMessages("tom-tat-sgroup-overview");

    assert.match(aiTeamMessages[0].content.text, /sgroup:\/\/knowledge\/ai-team/);
    assert.match(sgroupMessages[0].content.text, /sgroup:\/\/knowledge\/sgroup-overview/);
  });

  it("should render internal research prompt with both internal and external tools", () => {
    const messages = getPromptMessages("nghien-cuu-chu-de-noi-bo", { topic: "vector database" });
    assert.equal(messages.length, 1);
    assert.match(messages[0].content.text, /search_it_knowledge/);
    assert.match(messages[0].content.text, /search_sgroup_knowledge/);
    assert.match(messages[0].content.text, /vector database/);
  });

  it("should render LangGraph assistant prompt", () => {
    const messages = getPromptMessages("hoi-dap-da-buoc-sgroup", { message: "MCP cho noi bo" });
    assert.equal(messages.length, 1);
    assert.match(messages[0].content.text, /run_sgroup_assistant/);
  });

  it("should throw for unknown prompt", () => {
    assert.throws(() => getPromptMessages("missing-prompt"), /Prompt khong ton tai/);
  });
});







