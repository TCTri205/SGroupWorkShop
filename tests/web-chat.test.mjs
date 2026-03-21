import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createRouteFromIntent, extractTopic, routeMessage } from "../src/lib/router.mjs";
import { createServer } from "../src/server.mjs";
import { resetAssistantLlmAdapterForTests, setAssistantLlmAdapterForTests } from "../src/lib/langgraph/assistant-llm.mjs";

let server;
let baseUrl;

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
      if (normalized.includes("tin cong nghe")) {
        return {
          intent: "news",
          agent: "news-specialist",
          confidence: 0.93,
          reasoningSummary: "LLM route to technology news.",
          args: { category: "cong-nghe" }
        };
      }

      if (normalized.includes("thoi tiet")) {
        return {
          intent: "weather",
          agent: "weather-specialist",
          confidence: 0.95,
          reasoningSummary: "LLM route to weather.",
          args: normalized.includes("ha noi") ? { location: "Ha Noi" } : {}
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
        case "news":
          return {
            toolCalls: [{ name: "get_news", args: route.args, reason: "Need news data." }],
            planningSummary: "Use news tool."
          };
        case "weather":
          return {
            toolCalls: route.args.location ? [{ name: "get_weather", args: route.args, reason: "Need weather data." }] : [],
            planningSummary: route.args.location ? "Use weather tool." : "Need clarification."
          };
        default:
          return { toolCalls: [], planningSummary: "No tools needed." };
      }
    },

    async synthesize({ route, results }) {
      if (route.intent === "general") {
        return { message: "Toi co the ho tro tri thuc SGroup/AI Team, thoi tiet, tin tuc va nghien cuu IT." };
      }

      if (route.intent === "weather" && !route.args.location) {
        return { message: "Ban muon xem thoi tiet o dau?" };
      }

      return {
        message: results.map((result) => result.summary).filter(Boolean).join("\n\n") || `Da xu ly intent ${route.intent}.`
      };
    }
  };
}

setAssistantLlmAdapterForTests(buildMockAssistantAdapter());

async function ensureServer() {
  if (server) {
    return;
  }

  server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
}

function sendRawRequest(port, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );
    request.on("error", reject);
    if (body) {
      request.write(body);
    }
    request.end();
  });
}

after(async () => {
  resetAssistantLlmAdapterForTests();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe("Web router", () => {
  it("should route weather prompts to the weather specialist", () => {
    const route = routeMessage("Thoi tiet Ha Noi hom nay the nao?");
    assert.equal(route.intent, "weather");
    assert.equal(route.agent, "weather-specialist");
    assert.equal(route.args.location, "Ha Noi");
    assert.deepStrictEqual(route.toolNames, ["get_weather"]);
  });

  it("should extract an international city for weather prompts", () => {
    const route = routeMessage("Thoi tiet Dubai hom nay the nao?");
    assert.equal(route.intent, "weather");
    assert.equal(route.args.location, "Dubai");
  });

  it("should strip city prefixes before calling the weather tool", () => {
    assert.equal(routeMessage("Thoi tiet Thanh Pho Dubai hom nay").args.location, "Dubai");
    assert.equal(routeMessage("Thoi tiet hien tai o Dubai").args.location, "Dubai");
    assert.equal(routeMessage("Thoi tiet Dubai hom nay?").args.location, "Dubai");
  });

  it("should default weather prompts without a city to Da Nang", () => {
    const route = routeMessage("Thoi tiet hom nay the nao?");
    assert.equal(route.intent, "weather");
    assert.equal(route.args.location, "Da Nang");
    assert.match(route.reasoningSummary, /Da Nang/);
  });

  it("should route SGroup prompts to internal knowledge", () => {
    const route = routeMessage("Gioi thieu AI Team SGroup");
    assert.equal(route.intent, "sgroup-knowledge");
    assert.equal(route.toolName, "search_sgroup_knowledge");
  });

  it("should route mixed prompts to combined research", () => {
    const route = routeMessage("MCP co the ap dung cho chatbot noi bo cua SGroup khong?");
    assert.equal(route.intent, "mixed-research");
    assert.match(route.toolName, /search_it_knowledge/);
    assert.match(route.toolName, /search_sgroup_knowledge/);
  });

  it("should keep a specific news topic instead of collapsing to tong-hop", () => {
    const route = routeMessage("Tin tuc chien tranh moi nhat");
    assert.equal(route.intent, "news");
    assert.equal(route.args.category, "tong-hop");
    assert.equal(route.args.query, "chien tranh");
    assert.match(route.reasoningSummary, /chu de cu the/i);
  });

  it("should keep category-only news prompts without forcing a query", () => {
    const route = routeMessage("Tin cong nghe moi nhat");
    assert.equal(route.intent, "news");
    assert.equal(route.args.category, "cong-nghe");
    assert.equal(route.args.query, undefined);
  });

  it("should default extractTopic when message is only punctuation", () => {
    assert.equal(extractTopic(" ??? "), "AI chatbot");
  });

  it("should fall back to general route for invalid intent", () => {
    const route = createRouteFromIntent("test", "bad-intent");
    assert.equal(route.intent, "general");
    assert.equal(route.toolName, null);
    assert.deepStrictEqual(route.toolNames, []);
  });
});

describe("Web server", () => {
  it("should serve the split-pane UI", async () => {
    await ensureServer();

    const response = await fetch(baseUrl + "/");
    const html = await response.text();
    const appResponse = await fetch(baseUrl + "/app.js");
    const appJs = await appResponse.text();

    assert.equal(response.status, 200);
    assert.match(html, /web-panel/);
    assert.match(appJs, /api\/chat/);
    assert.match(appJs, /usedFallbackRouter/);
    assert.match(appJs, /executedNodes/);
  });

  it("should return chat payload matching the graph UI contract", async () => {
    await ensureServer();

    const response = await fetch(baseUrl + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Tin cong nghe moi nhat" })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.route.intent, "news");
    assert.equal(typeof payload.route.reasoningSummary, "string");
    assert.equal(typeof payload.response.message, "string");
    assert.ok(Array.isArray(payload.response.statusSteps));
    assert.ok(Array.isArray(payload.response.citations));
    assert.ok(Array.isArray(payload.response.mcp.toolNames));
    assert.equal(payload.response.mcp.toolNames[0], "get_news");
    assert.ok(Array.isArray(payload.graph.executedNodes));
    assert.ok(Array.isArray(payload.graph.toolCalls));
    assert.ok(Array.isArray(payload.graph.warnings));
    assert.equal(typeof payload.graph.usedFallbackRouter, "boolean");
    assert.equal(payload.graph.executedNodes[0], "normalize_input");
    assert.match(payload.graph.executedNodes.join(","), /plan_tool_calls/);
  });

  it("should reject empty messages", async () => {
    await ensureServer();

    const response = await fetch(baseUrl + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "   " })
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "message is required");
  });

  it("should reject malformed JSON bodies", async () => {
    await ensureServer();
    const address = server.address();
    const response = await sendRawRequest(address.port, "/api/chat", '{"message":', {
      "Content-Type": "application/json"
    });
    const payload = JSON.parse(response.body);

    assert.equal(response.statusCode, 400);
    assert.equal(payload.error, "invalid_json_body");
  });

  it("should block path traversal attempts", async () => {
    await ensureServer();

    const response = await fetch(baseUrl + "/..%2Fpackage.json");
    assert.equal(response.status, 403);
  });
});

