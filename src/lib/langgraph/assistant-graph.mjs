import { randomUUID } from "node:crypto";

import {
  collectCitations,
  getNewsRaw,
  getWeatherRaw,
  pickPrimaryWebUrl,
  searchItKnowledgeRaw,
  searchSgroupKnowledgeRaw,
  summarizeFallbackUsage
} from "../capabilities.mjs";
import { createRouteFromIntent, getToolNamesForIntent, isGreetingMessage, routeMessage } from "../router.mjs";

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

async function executeCapabilityCall(name, args) {
  switch (name) {
    case "get_weather":
      return getWeatherRaw(args.location);
    case "get_news":
      return getNewsRaw(args.category);
    case "search_it_knowledge":
      return searchItKnowledgeRaw(args.topic);
    case "search_sgroup_knowledge":
      return searchSgroupKnowledgeRaw(args.query);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function buildGeneralResponse(route) {
  const greetingMessage = isGreetingMessage(route.originalMessage)
    ? "Xin chao. Toi co the ho tro thoi tiet, tin tuc, tri thuc SGroup/AI Team va nghien cuu IT."
    : "Toi co the ho tro tri thuc SGroup/AI Team, thoi tiet, tin tuc va nghien cuu IT.";

  return {
    message: `${greetingMessage} Hay dat cau hoi cu the hon, vi du: \`gioi thieu AI Team\`, \`thoi tiet Dubai hom nay\`, \`tin cong nghe\`, hoac \`tim hieu MCP\`.`,
    citations: [],
    webUrl: "",
    statusSteps: [
      "Da phan loai intent tong quan.",
      "Khong can goi tool chuyen biet cho cau hoi hien tai."
    ],
    mcp: { toolNames: [], confidence: route.confidence }
  };
}

function buildClarifyWeatherResponse(route) {
  return {
    message: "Ban muon xem thoi tiet o dau? Hay gui them dia diem cu the, vi du: `Dubai`, `Ha Noi`, hoac `Da Nang`.",
    citations: [],
    webUrl: "",
    statusSteps: [
      "Da phan loai intent thoi tiet.",
      "Chua goi tool vi thieu dia diem cu the."
    ],
    mcp: { toolNames: [], confidence: route.confidence }
  };
}

function buildResponseFromResults(route, results, toolCalls) {
  const citations = collectCitations(results);
  const webUrl = pickPrimaryWebUrl(results);
  const fallbackUsed = summarizeFallbackUsage(results);
  const toolNames = toolCalls.map((toolCall) => toolCall.name);

  switch (route.intent) {
    case "weather": {
      const [result] = results;
      return {
        message: `## Thoi tiet hien tai\n\n${result.summary}${webUrl ? `\n\n[Nguon tham khao](${webUrl})` : ""}`,
        citations,
        webUrl,
        statusSteps: [
          "Da phan loai intent thoi tiet.",
          `Da goi tool ${toolNames.join(", ")}.`,
          fallbackUsed ? "Dang dung fallback an toan do thieu hoac loi provider." : "Da lay du lieu tu provider chinh."
        ],
        mcp: { toolNames, confidence: route.confidence }
      };
    }
    case "news": {
      const [result] = results;
      return {
        message: `## Tin tuc moi nhat\n\n${result.summary}${webUrl ? `\n\n[Nguon tham khao](${webUrl})` : ""}`,
        citations,
        webUrl,
        statusSteps: [
          "Da phan loai intent tin tuc.",
          `Da goi tool ${toolNames.join(", ")}.`,
          fallbackUsed ? "Dang dung RSS/mock fallback an toan." : "Da lay du lieu tu provider chinh."
        ],
        mcp: { toolNames, confidence: route.confidence }
      };
    }
    case "it-research": {
      const [result] = results;
      return {
        message: `## Kien thuc IT\n\n${result.summary}${webUrl ? `\n\n[Nguon tham khao](${webUrl})` : ""}`,
        citations,
        webUrl,
        statusSteps: [
          "Da phan loai intent nghien cuu IT.",
          `Da goi tool ${toolNames.join(", ")}.`,
          fallbackUsed ? "Dang dung fallback an toan do chua cau hinh provider." : "Da lay ket qua tim kiem tu provider chinh."
        ],
        mcp: { toolNames, confidence: route.confidence }
      };
    }
    case "sgroup-knowledge": {
      const [result] = results;
      const items = result.items ?? [];
      const body = items.length
        ? items
            .slice(0, 4)
            .map((item, index) => `${index + 1}. **${item.title}**\n${item.content}`)
            .join("\n\n")
        : "Chua tim thay ban ghi phu hop trong kho tri thuc noi bo.";
      return {
        message: `## Tri thuc noi bo lien quan\n\n**Truy van:** ${route.args.query}\n\n${body}`,
        citations,
        webUrl,
        statusSteps: [
          "Da phan loai intent tri thuc noi bo.",
          `Da goi tool ${toolNames.join(", ")}.`,
          items.length ? "Da tong hop ket qua tu kho tri thuc noi bo." : "Khong co ban ghi khop, da tra ve ket qua an toan."
        ],
        mcp: { toolNames, confidence: route.confidence }
      };
    }
    case "mixed-research": {
      const external = results.find((result) => result.kind === "it-research");
      const internal = results.find((result) => result.kind === "sgroup-knowledge");
      const internalBody = (internal?.items ?? []).length
        ? internal.items
            .slice(0, 4)
            .map((item, index) => `${index + 1}. **${item.title}**\n${item.content}`)
            .join("\n\n")
        : "Chua tim thay ban ghi phu hop trong kho tri thuc noi bo.";
      return {
        message: `## Nghien cuu tong hop\n\n### Tong quan ky thuat\n${external?.summary ?? "Khong co du lieu."}\n\n### Lien he he thong noi bo\n${internalBody}`,
        citations,
        webUrl,
        statusSteps: [
          "Da phan loai intent nghien cuu ket hop.",
          ...toolNames.map((toolName) => `Da goi tool ${toolName}.`),
          "Da hop nhat nguon ben ngoai va tri thuc noi bo."
        ],
        mcp: { toolNames, confidence: route.confidence }
      };
    }
    default:
      return buildGeneralResponse(route);
  }
}

function normalizeRoute(route, message) {
  const toolNames = Array.isArray(route.toolNames) ? route.toolNames : getToolNamesForIntent(route.intent);
  return {
    ...route,
    originalMessage: message,
    toolName: route.toolName ?? (toolNames.length ? toolNames.join(" + ") : null),
    toolNames
  };
}

export async function invokeAssistantGraph({ message, channel = "web", sessionId } = {}) {
  const safeSessionId = sessionId || randomUUID();
  const originalMessage = String(message ?? "");
  const normalizedMessage = originalMessage.trim();
  const executedNodes = ["normalize_input"];
  const errors = [];
  const decisionNotes = [];

  const route = normalizeRoute(routeMessage(normalizedMessage), normalizedMessage);
  executedNodes.push("route_intent");
  decisionNotes.push(`intent=${route.intent}`);

  let plannedToolNames = [...route.toolNames];
  if (route.intent === "weather" && !route.args.location) {
    plannedToolNames = [];
    decisionNotes.push("weather_missing_location");
  } else if (plannedToolNames.length) {
    decisionNotes.push(`tool_plan=${plannedToolNames.join(",")}`);
  } else {
    decisionNotes.push("no_tool_needed");
  }
  executedNodes.push("plan_tool_calls");

  const toolCalls = [];
  const results = [];
  if (plannedToolNames.length) {
    executedNodes.push("execute_tools");
    for (const name of plannedToolNames) {
      const args = buildToolArgs(name, route.args);
      toolCalls.push({ name, args });
      try {
        results.push(await executeCapabilityCall(name, args));
      } catch (error) {
        errors.push(error?.message ?? String(error));
      }
    }
  }

  let response;
  if (route.intent === "general") {
    response = buildGeneralResponse(route);
  } else if (route.intent === "weather" && !route.args.location) {
    response = buildClarifyWeatherResponse(route);
  } else if (results.length > 0) {
    response = buildResponseFromResults(route, results, toolCalls);
  } else if (errors.length > 0) {
    response = {
      message: "Rat tiec, he thong gap loi khi xu ly yeu cau nay.",
      citations: [],
      webUrl: "",
      statusSteps: ["Da ghi nhan loi trong qua trinh goi tool."],
      mcp: { toolNames: plannedToolNames, confidence: route.confidence }
    };
  } else {
    response = buildGeneralResponse(createRouteFromIntent(normalizedMessage, "general", { confidence: route.confidence }));
  }
  executedNodes.push("synthesize_answer");

  return {
    route,
    response,
    graph: {
      sessionId: safeSessionId,
      executedNodes,
      toolCalls,
      errors,
      usedFallbackRouter: true,
      routeSource: "rule",
      plannerSource: "deterministic",
      decisionNotes,
      channel
    }
  };
}
