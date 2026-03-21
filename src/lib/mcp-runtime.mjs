import { randomUUID } from "node:crypto";

﻿import { searchKnowledge } from "./knowledge.mjs";
import { invokeAssistantGraph } from "./langgraph/assistant-graph.mjs";
import { queryNews, queryWeather, queryWebSearch } from "./providers.mjs";

function safeTrim(value) {
  return String(value ?? "").trim();
}

export function formatTextContent(text) {
  return {
    content: [{ type: "text", text: String(text ?? "") }],
    isError: false
  };
}

export function formatErrorContent(message) {
  return {
    content: [{ type: "text", text: `Error: ${String(message ?? "Unknown error")}` }],
    isError: true
  };
}

function buildKnowledgeSummary(records) {
  if (!records.length) {
    return "Không tìm thấy kết quả phù hợp.";
  }

  return records
    .slice(0, 3)
    .map((record, index) => `${index + 1}. ${record.title}\n${record.content}`)
    .join("\n\n");
}

export const TOOLS = [
  {
    name: "get_weather",
    description: "Lấy thông tin thời tiết theo địa điểm.",
    inputSchema: {
      type: "object",
      properties: {
        location: { type: "string", description: "Tên thành phố hoặc địa điểm." }
      },
      required: ["location"]
    }
  },
  {
    name: "get_news",
    description: "Lấy tin tức theo danh mục hoặc chủ đề.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Danh mục tin tức, ví dụ cong-nghe." },
        query: { type: "string", description: "Chủ đề tin tức cụ thể, ví dụ chiến tranh Ukraine." }
      },
      anyOf: [{ required: ["category"] }, { required: ["query"] }]
    }
  },
  {
    name: "search_it_knowledge",
    description: "Tìm kiếm thông tin công nghệ từ nguồn bên ngoài.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Chủ đề cần tìm kiếm." }
      },
      required: ["topic"]
    }
  },
  {
    name: "search_sgroup_knowledge",
    description: "Tra cứu tri thức nội bộ của SGroup và AI Team.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Từ khóa tìm kiếm nội bộ." }
      },
      required: ["query"]
    }
  },
  {
    name: "run_sgroup_assistant",
    description: "Chạy trợ lý nội bộ để route và tổng hợp câu trả lời.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Tin nhắn của người dùng." },
        sessionId: { type: "string", description: "Mã phiên làm việc tùy chọn." }
      },
      required: ["message"]
    }
  }
];

export const RESOURCES = [
  {
    uri: "sgroup://knowledge/ai-team",
    name: "AI Team Knowledge",
    description: "Tổng hợp tri thức nội bộ về AI Team.",
    mimeType: "text/plain"
  },
  {
    uri: "sgroup://knowledge/sgroup-overview",
    name: "SGroup Overview",
    description: "Tổng quan tri thức nội bộ về SGroup.",
    mimeType: "text/plain"
  }
];

export async function ensureClientsInitialized() {
  return;
}

export async function listAllTools() {
  return TOOLS;
}

export async function callMcpTool(name, args) {
  return executeTool(name, args);
}

export async function executeTool(name, args = {}) {
  try {
    switch (name) {
      case "get_weather": {
        const location = safeTrim(args.location);
        if (!location) {
          return formatErrorContent("location is required");
        }
        const result = await queryWeather(location);
        return formatTextContent("## Thoi tiet hien tai\n\n" + result.message);
      }
      case "get_news": {
        const category = safeTrim(args.category);
        const query = safeTrim(args.query);
        if (!category && !query) {
          return formatErrorContent("category or query is required");
        }
        const result = await queryNews({ category: category || "tong-hop", query });
        return formatTextContent(result.message);
      }
      case "search_it_knowledge": {
        const topic = safeTrim(args.topic);
        if (!topic) {
          return formatErrorContent("topic is required");
        }
        const result = await queryWebSearch(topic);
        return formatTextContent(result.message);
      }
      case "search_sgroup_knowledge": {
        const query = safeTrim(args.query);
        if (!query) {
          return formatErrorContent("query is required");
        }

        const aiTeamResults = searchKnowledge("ai-team", query);
        const sgroupResults = searchKnowledge("sgroup", query);
        const text = [
          "AI Team:\n" + buildKnowledgeSummary(aiTeamResults),
          "SGroup:\n" + buildKnowledgeSummary(sgroupResults)
        ].join("\n\n");

        return formatTextContent(text);
      }
      case "run_sgroup_assistant": {
        const message = safeTrim(args.message);
        if (!message) {
          return formatErrorContent("message is required");
        }

        const sessionId = safeTrim(args.sessionId) || randomUUID();
        const payload = await invokeAssistantGraph({ message, channel: "mcp", sessionId });
        const toolNames = payload.response?.mcp?.toolNames ?? [];
        const text = [
          `Route: ${payload.route.intent}`,
          `Agent: ${payload.route.agent}`,
          toolNames.length ? `Tools: ${toolNames.join(", ")}` : "Tools: none",
          `Session: ${sessionId}`,
          "",
          payload.response.message
        ].join("\n");

        return formatTextContent(text);
      }
      default:
        return formatErrorContent(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return formatErrorContent(error?.message ?? "Tool execution failed");
  }
}

export async function handleReadResource(uri) {
  switch (uri) {
    case "sgroup://knowledge/ai-team": {
      const records = searchKnowledge("ai-team", "AI Team");
      return {
        contents: [{ uri, mimeType: "text/plain", text: buildKnowledgeSummary(records) }]
      };
    }
    case "sgroup://knowledge/sgroup-overview": {
      const records = searchKnowledge("sgroup", "SGroup");
      return {
        contents: [{ uri, mimeType: "text/plain", text: buildKnowledgeSummary(records) }]
      };
    }
    default:
      return formatErrorContent(`Resource not found: ${uri}`);
  }
}
