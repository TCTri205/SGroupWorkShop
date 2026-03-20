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
import { isGreetingMessage } from "../router.mjs";
import { planToolCallsWithLlm, routeIntentWithLlm, synthesizeAnswerWithLlm } from "./assistant-llm.mjs";

const AGENT_BY_INTENT = {
  weather: "weather-specialist",
  news: "news-specialist",
  "sgroup-knowledge": "sgroup-specialist",
  "it-research": "it-specialist",
  "mixed-research": "research-specialist",
  general: "generalist"
};

const ALLOWED_TOOLS = new Set(["get_weather", "get_news", "search_it_knowledge", "search_sgroup_knowledge"]);

function clampConfidence(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeRoute(decision, message) {
  const toolNames = [];
  return {
    agent: decision.agent || AGENT_BY_INTENT[decision.intent] || AGENT_BY_INTENT.general,
    intent: decision.intent,
    confidence: clampConfidence(decision.confidence),
    reasoningSummary: String(decision.reasoningSummary ?? "").trim(),
    toolName: null,
    toolNames,
    args: { ...(decision.args ?? {}) },
    originalMessage: message
  };
}

function normalizeToolCall(toolCall) {
  if (!ALLOWED_TOOLS.has(toolCall.name)) {
    throw new Error(`Planner returned unsupported tool: ${toolCall.name}`);
  }

  const args = { ...(toolCall.args ?? {}) };
  switch (toolCall.name) {
    case "get_weather":
      if (!String(args.location ?? "").trim()) {
        throw new Error("Planner must provide location for get_weather.");
      }
      return { name: toolCall.name, args: { location: String(args.location).trim() }, reason: toolCall.reason };
    case "get_news": {
      const category = String(args.category ?? "").trim();
      const query = String(args.query ?? "").trim();
      if (!category && !query) {
        throw new Error("Planner must provide category or query for get_news.");
      }
      return {
        name: toolCall.name,
        args: {
          ...(category ? { category } : {}),
          ...(query ? { query } : {})
        },
        reason: toolCall.reason
      };
    }
    case "search_it_knowledge":
      if (!String(args.topic ?? "").trim()) {
        throw new Error("Planner must provide topic for search_it_knowledge.");
      }
      return { name: toolCall.name, args: { topic: String(args.topic).trim() }, reason: toolCall.reason };
    case "search_sgroup_knowledge":
      if (!String(args.query ?? "").trim()) {
        throw new Error("Planner must provide query for search_sgroup_knowledge.");
      }
      return { name: toolCall.name, args: { query: String(args.query).trim() }, reason: toolCall.reason };
    default:
      throw new Error(`Unknown tool: ${toolCall.name}`);
  }
}

async function executeCapabilityCall(name, args) {
  switch (name) {
    case "get_weather":
      return getWeatherRaw(args.location);
    case "get_news":
      return getNewsRaw(args);
    case "search_it_knowledge":
      return searchItKnowledgeRaw(args.topic);
    case "search_sgroup_knowledge":
      return searchSgroupKnowledgeRaw(args.query);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function buildStatusSteps(route, toolCalls, fallbackUsed, results, synthesisSource) {
  const toolNames = toolCalls.map((toolCall) => toolCall.name);
  const steps = [`Đã phân loại intent ${route.intent} bằng LLM.`, `Đã tổng hợp phản hồi bằng ${synthesisSource}.`];

  if (toolNames.length > 0) {
    steps.splice(1, 0, `Đã gọi tool ${toolNames.join(", ")}.`);
  } else {
    steps.splice(1, 0, "Không gọi tool nào cho yêu cầu này.");
  }

  if (!results.length) {
    return steps;
  }

  switch (route.intent) {
    case "weather":
      steps.push(fallbackUsed ? "Đang dùng fallback an toàn do thiếu hoặc lỗi provider." : "Đã lấy dữ liệu từ provider chính.");
      break;
    case "news":
      steps.push(fallbackUsed ? "Đang dùng RSS/mock fallback an toàn." : "Đã lấy dữ liệu từ provider chính.");
      break;
    case "it-research":
      steps.push(fallbackUsed ? "Đang dùng fallback an toàn do chưa cấu hình provider." : "Đã lấy kết quả tìm kiếm từ provider chính.");
      break;
    case "sgroup-knowledge":
      steps.push((results[0]?.items ?? []).length ? "Đã tổng hợp kết quả từ kho tri thức nội bộ." : "Không có bản ghi khớp, đã trả về kết quả an toàn.");
      break;
    case "mixed-research":
      steps.push("Đã hợp nhất nguồn bên ngoài và tri thức nội bộ.");
      break;
    default:
      break;
  }

  return steps;
}

function buildGraphFailurePayload({ message, safeSessionId, normalizedMessage, channel, executedNodes, errors, decisionNotes }) {
  const route = {
    agent: AGENT_BY_INTENT.general,
    intent: "general",
    confidence: 0,
    reasoningSummary: "Không thể hoàn tất phân tích bằng LLM.",
    toolName: null,
    toolNames: [],
    args: {},
    originalMessage: normalizedMessage
  };

  return {
    route,
    response: {
      message,
      citations: [],
      webUrl: "",
      statusSteps: ["Đã ghi nhận lỗi orchestration bằng LLM."],
      mcp: { toolNames: [], confidence: 0 }
    },
    graph: {
      sessionId: safeSessionId,
      executedNodes,
      toolCalls: [],
      errors,
      usedFallbackRouter: false,
      routeSource: "error",
      plannerSource: "error",
      decisionNotes,
      channel
    }
  };
}

function buildGeneralFastPathPayload({ message, safeSessionId, normalizedMessage, channel, decisionNotes, statusStep }) {
  return {
    route: {
      agent: AGENT_BY_INTENT.general,
      intent: "general",
      confidence: 0.99,
      reasoningSummary: "Simple conversational request; no LLM orchestration needed.",
      toolName: null,
      toolNames: [],
      args: {},
      originalMessage: normalizedMessage
    },
    response: {
      message,
      citations: [],
      webUrl: "",
      statusSteps: [statusStep],
      mcp: { toolNames: [], confidence: 0.99 }
    },
    graph: {
      sessionId: safeSessionId,
      executedNodes: ["normalize_input", "fast_path_general"],
      toolCalls: [],
      errors: [],
      usedFallbackRouter: false,
      routeSource: "fast-path",
      plannerSource: "fast-path",
      decisionNotes,
      channel
    }
  };
}

export async function invokeAssistantGraph({ message, channel = "web", sessionId } = {}) {
  const safeSessionId = sessionId || randomUUID();
  const originalMessage = String(message ?? "");
  const normalizedMessage = originalMessage.trim();
  const executedNodes = ["normalize_input"];
  const errors = [];
  const decisionNotes = [];

  if (!normalizedMessage) {
    decisionNotes.push("empty_general_fast_path");
    return buildGeneralFastPathPayload({
      message:
        "Toi co the ho tro tri thuc SGroup/AI Team, thoi tiet, tin tuc va nghien cuu IT. Hay dat cau hoi cu the hon, vi du: gioi thieu AI Team, thoi tiet Ha Noi, tin cong nghe, hoac tim hieu MCP.",
      safeSessionId,
      normalizedMessage,
      channel,
      decisionNotes,
      statusStep: "Da xu ly yeu cau rong bang fast-path an toan."
    });
  }

  if (isGreetingMessage(normalizedMessage)) {
    decisionNotes.push("greeting_general_fast_path");
    return buildGeneralFastPathPayload({
      message:
        "Chao ban. Toi co the ho tro tri thuc SGroup/AI Team, thoi tiet, tin tuc va nghien cuu IT. Hay dat cau hoi cu the hon, vi du: gioi thieu AI Team, thoi tiet Ha Noi hom nay, tin cong nghe, hoac tim hieu MCP.",
      safeSessionId,
      normalizedMessage,
      channel,
      decisionNotes,
      statusStep: "Da xu ly loi chao bang fast-path an toan."
    });
  }

  let route;
  try {
    const routeDecision = await routeIntentWithLlm(normalizedMessage);
    route = normalizeRoute(routeDecision, normalizedMessage);
    executedNodes.push("route_intent_llm");
    decisionNotes.push(`intent=${route.intent}`);
  } catch (error) {
    const errorMessage = error?.message ?? String(error);
    errors.push(errorMessage);
    decisionNotes.push("route_error");
    return buildGraphFailurePayload({
      message: `Không thể phân tích yêu cầu bằng LLM lúc này: ${errorMessage}`,
      safeSessionId,
      normalizedMessage,
      channel,
      executedNodes,
      errors,
      decisionNotes
    });
  }

  let toolCalls = [];
  let planningSummary = "No tool plan.";
  try {
    const plan = await planToolCallsWithLlm({ message: normalizedMessage, route });
    toolCalls = plan.toolCalls.map(normalizeToolCall);
    planningSummary = plan.planningSummary;
    route.toolNames = toolCalls.map((toolCall) => toolCall.name);
    route.toolName = route.toolNames.length ? route.toolNames.join(" + ") : null;
    executedNodes.push("plan_tool_calls_llm");
    decisionNotes.push(`tool_plan=${route.toolNames.length ? route.toolNames.join(",") : "none"}`);
    decisionNotes.push(`planning=${planningSummary}`);
  } catch (error) {
    const errorMessage = error?.message ?? String(error);
    errors.push(errorMessage);
    decisionNotes.push("planner_error");
    return buildGraphFailurePayload({
      message: `Không thể lập kế hoạch gọi tool bằng LLM lúc này: ${errorMessage}`,
      safeSessionId,
      normalizedMessage,
      channel,
      executedNodes,
      errors,
      decisionNotes
    });
  }

  const results = [];
  if (toolCalls.length) {
    executedNodes.push("execute_tools");
    for (const toolCall of toolCalls) {
      try {
        results.push(await executeCapabilityCall(toolCall.name, toolCall.args));
      } catch (error) {
        errors.push(error?.message ?? String(error));
      }
    }
  }

  let synthesis;
  try {
    synthesis = await synthesizeAnswerWithLlm({
      message: normalizedMessage,
      route,
      toolCalls,
      results,
      errors
    });
    executedNodes.push("synthesize_answer_llm");
  } catch (error) {
    const errorMessage = error?.message ?? String(error);
    errors.push(errorMessage);
    decisionNotes.push("synthesis_error");
    return buildGraphFailurePayload({
      message: `Không thể tổng hợp câu trả lời bằng LLM lúc này: ${errorMessage}`,
      safeSessionId,
      normalizedMessage,
      channel,
      executedNodes,
      errors,
      decisionNotes
    });
  }

  const citations = collectCitations(results);
  const webUrl = pickPrimaryWebUrl(results);
  const fallbackUsed = summarizeFallbackUsage(results);

  return {
    route,
    response: {
      message: synthesis.message,
      citations,
      webUrl,
      statusSteps: buildStatusSteps(route, toolCalls, fallbackUsed, results, "LLM"),
      mcp: { toolNames: route.toolNames, confidence: route.confidence }
    },
    graph: {
      sessionId: safeSessionId,
      executedNodes,
      toolCalls,
      errors,
      usedFallbackRouter: false,
      routeSource: "llm",
      plannerSource: "llm",
      decisionNotes,
      channel
    }
  };
}
