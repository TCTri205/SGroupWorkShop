/**
 * MCP Tools Unit Tests
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
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

beforeEach(() => {
  cacheClear();
  process.env.OPENWEATHER_API_KEY = "";
  process.env.NEWS_API_KEY = "";
  process.env.EXA_API_KEY = "";
  process.env.GOOGLE_API_KEY = "";
  process.env.FETCH_TIMEOUT_MS = "50";
  global.fetch = originalFetch;
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

  it("should reject empty MCP tool inputs", async () => {
    const knowledge = await executeTool("search_sgroup_knowledge", { query: "   " });
    const itSearch = await executeTool("search_it_knowledge", { topic: "   " });
    const assistant = await executeTool("run_sgroup_assistant", { message: "   " });

    assert.equal(knowledge.isError, true);
    assert.equal(itSearch.isError, true);
    assert.equal(assistant.isError, true);
  });

  it("should run the LangGraph assistant tool with fallback router", async () => {
    const result = await executeTool("run_sgroup_assistant", { message: "Tin cong nghe moi nhat" });
    assert.strictEqual(result.isError, false);
    assert.match(result.content[0].text, /Route:/);
    assert.match(result.content[0].text, /news/);
  });

  it("should expose graph payload directly for shared orchestration", async () => {
    const payload = await invokeAssistantGraph({ message: "Thoi tiet Ha Noi", channel: "web", sessionId: "test-session" });
    assert.equal(payload.route.intent, "weather");
    assert.equal(payload.graph.usedFallbackRouter, true);
    assert.equal(payload.graph.sessionId, "test-session");
    assert.match(payload.response.message, /thời tiết/i);
  });

  it("should return a greeting guidance message for general hello input", async () => {
    const payload = await invokeAssistantGraph({ message: "hello", channel: "web", sessionId: "hello-session" });
    assert.equal(payload.route.intent, "general");
    assert.deepStrictEqual(payload.response.mcp.toolNames, []);
    assert.match(payload.response.message, /chao ban|ho tro|AI Team|Thoi tiet Ha Noi hom nay|MCP/i);
    assert.doesNotMatch(payload.response.message, /Khong tim thay ket qua|The user's input/i);
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



