import { randomUUID } from "node:crypto";

import { handleChatMessage } from "../chat-orchestrator.mjs";

function normalizeToolNames(mcp = {}) {
  if (Array.isArray(mcp.toolNames)) {
    return mcp.toolNames.filter(Boolean);
  }

  if (mcp.toolName) {
    return String(mcp.toolName)
      .split("+")
      .map((name) => name.trim())
      .filter(Boolean);
  }

  return [];
}

function buildToolArgs(name, routeArgs = {}) {
  switch (name) {
    case "get_weather":
      return { location: routeArgs.location };
    case "get_news":
      return { category: routeArgs.category };
    case "search_it_knowledge":
      return { topic: routeArgs.topic };
    case "search_sgroup_knowledge":
      return { query: routeArgs.query };
    default:
      return {};
  }
}

export async function invokeAssistantGraph({ message, channel = "web", sessionId } = {}) {
  const safeSessionId = sessionId || randomUUID();
  const payload = await handleChatMessage(String(message ?? ""));
  const toolNames = normalizeToolNames(payload.response?.mcp);
  const toolCalls = toolNames.map((name) => ({
    name,
    args: buildToolArgs(name, payload.route?.args ?? {})
  }));

  return {
    route: payload.route,
    response: {
      ...payload.response,
      mcp: {
        toolNames,
        confidence: payload.response?.mcp?.confidence ?? payload.route?.confidence ?? 0
      }
    },
    graph: {
      sessionId: safeSessionId,
      executedNodes: ["route_message", "execute_local_tools", "build_response"],
      toolCalls,
      errors: [],
      usedFallbackRouter: true,
      channel
    }
  };
}
