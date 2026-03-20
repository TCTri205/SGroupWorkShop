import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { routeMessage, createRouteFromIntent, extractTopic } from "../src/lib/router.mjs";
import { createServer } from "../src/server.mjs";

let server;
let baseUrl;

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

  it("should default extractTopic when message is only punctuation", () => {
    assert.equal(extractTopic(" ??? "), "AI chatbot");
  });

  it("should fall back to general route for invalid intent", () => {
    const route = createRouteFromIntent("test", "bad-intent");
    assert.equal(route.intent, "general");
    assert.equal(route.toolName, null);
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
    assert.equal(typeof payload.graph.usedFallbackRouter, "boolean");
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
