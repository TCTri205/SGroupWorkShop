import { randomUUID } from "node:crypto";

import {
  collectCitations,
  getNewsRaw,
  getWeatherRaw,
  pickPrimaryWebUrl,
  searchItKnowledgeRaw,
  searchSgroupKnowledgeRaw,
  summarizeFallbackUsage,
  readProjectDocumentRaw
} from "../capabilities.mjs";
import { isGreetingMessage, routeMessage } from "../router.mjs";
import { planToolCallsWithLlm, routeIntentWithLlm, synthesizeAnswerWithLlm } from "./assistant-llm.mjs";
import { getAvailableExternalTools, executeExternalTool } from "../mcp-client-manager.mjs";

const AGENT_BY_INTENT = {
  weather: "weather-specialist",
  news: "news-specialist",
  "sgroup-knowledge": "sgroup-specialist",
  "it-research": "it-specialist",
  "mixed-research": "research-specialist",
  github: "github-specialist",
  general: "generalist"
};

const ALLOWED_TOOLS = new Set(["get_weather", "get_news", "search_it_knowledge", "search_sgroup_knowledge", "read_project_document"]);

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

function hasValue(value) {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return value !== undefined && value !== null;
}

function getExternalToolByName(name) {
  return getAvailableExternalTools().find((tool) => tool.name === name) ?? null;
}

function getRouteBoundLocalArgs(toolName, args, route) {
  const routeArgs = route?.args ?? {};
  const nextArgs = { ...(args ?? {}) };
  const recoveredFields = [];

  function applyField(fieldName, ...candidates) {
    if (hasValue(nextArgs[fieldName])) {
      if (typeof nextArgs[fieldName] === "string") {
        nextArgs[fieldName] = String(nextArgs[fieldName]).trim();
      }
      return;
    }

    const candidate = candidates.find((value) => hasValue(value));
    if (candidate === undefined) {
      return;
    }

    nextArgs[fieldName] = typeof candidate === "string" ? String(candidate).trim() : candidate;
    recoveredFields.push(fieldName);
  }

  switch (toolName) {
    case "get_weather":
      applyField("location", routeArgs.location);
      break;
    case "get_news":
      applyField("category", routeArgs.category);
      applyField("query", routeArgs.query);
      break;
    case "search_it_knowledge":
      applyField("topic", routeArgs.topic, route?.originalMessage);
      break;
    case "search_sgroup_knowledge":
      applyField("query", routeArgs.query, route?.originalMessage);
      break;
    default:
      break;
  }

  return { args: nextArgs, recoveredFields };
}

function normalizeExternalArgs(toolName, args, route, warnings, decisionNotes) {
  const tool = getExternalToolByName(toolName);
  if (!tool) {
    throw new Error(`Planner returned unsupported tool: ${toolName}`);
  }

  const normalizedArgs = { ...(args ?? {}) };
  const required = Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required : [];
  for (const fieldName of required) {
    if (!hasValue(normalizedArgs[fieldName]) && toolName === "brave_web_search" && fieldName === "query") {
      const fallbackQuery = route?.args?.query ?? route?.args?.topic ?? route?.originalMessage;
      if (hasValue(fallbackQuery)) {
        normalizedArgs[fieldName] = String(fallbackQuery).trim();
        warnings.push(`Planner omitted ${fieldName} for ${toolName}; recovered from route/message.`);
        decisionNotes.push(`${toolName}_arg_recovered=${fieldName}`);
      }
    }

    if (!hasValue(normalizedArgs[fieldName])) {
      throw new Error(`Planner must provide ${fieldName} for ${toolName}.`);
    }

    if (typeof normalizedArgs[fieldName] === "string") {
      normalizedArgs[fieldName] = String(normalizedArgs[fieldName]).trim();
    }
  }

  return normalizedArgs;
}

function normalizeToolCall(toolCall, route, warnings, decisionNotes) {
  const isLocal = ALLOWED_TOOLS.has(toolCall.name);
  const isExternal = Boolean(getExternalToolByName(toolCall.name));

  if (!isLocal && !isExternal) {
    throw new Error(`Planner returned unsupported tool: ${toolCall.name}`);
  }

  if (isExternal) {
    return {
      name: toolCall.name,
      args: normalizeExternalArgs(toolCall.name, toolCall.args, route, warnings, decisionNotes),
      reason: toolCall.reason
    };
  }

  const { args, recoveredFields } = getRouteBoundLocalArgs(toolCall.name, toolCall.args, route);
  if (recoveredFields.length) {
    warnings.push(`Planner omitted ${recoveredFields.join(", ")} for ${toolCall.name}; recovered from route.`);
    for (const fieldName of recoveredFields) {
      decisionNotes.push(`${toolCall.name}_arg_recovered=${fieldName}`);
    }
  }

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
    case "read_project_document":
      if (!String(args.filename ?? "").trim()) {
        throw new Error("Planner must provide filename for read_project_document.");
      }
      return { name: toolCall.name, args: { filename: String(args.filename).trim() }, reason: toolCall.reason };
    default:
      throw new Error(`Unknown tool: ${toolCall.name}`);
  }
}

function mergeRouteWithFallbackRoute(route, fallbackRoute, decisionNotes) {
  let merged = route;
  let usedFallbackRouter = false;

  if (route.intent === "general" && fallbackRoute.intent !== "general") {
    merged = {
      ...route,
      agent: fallbackRoute.agent,
      intent: fallbackRoute.intent,
      confidence: Math.max(route.confidence, clampConfidence(fallbackRoute.confidence)),
      reasoningSummary: `${route.reasoningSummary} | Fallback route: ${fallbackRoute.reasoningSummary}`,
      args: { ...fallbackRoute.args },
      originalMessage: route.originalMessage
    };
    usedFallbackRouter = true;
    decisionNotes.push(`fallback_intent=${fallbackRoute.intent}`);
  } else {
    const nextArgs = { ...route.args };
    for (const [key, value] of Object.entries(fallbackRoute.args ?? {})) {
      if (!hasValue(nextArgs[key]) && hasValue(value)) {
        nextArgs[key] = value;
        usedFallbackRouter = true;
        decisionNotes.push(`fallback_arg=${key}`);
      }
    }

    if (usedFallbackRouter) {
      merged = {
        ...route,
        args: nextArgs,
        reasoningSummary: `${route.reasoningSummary} | Fallback args enriched.`
      };
    }
  }

  return { route: merged, usedFallbackRouter };
}

function buildFallbackToolCalls(route) {
  switch (route.intent) {
    case "weather":
      return hasValue(route.args.location)
        ? [{ name: "get_weather", args: { location: route.args.location }, reason: "Fallback planner used route location." }]
        : [];
    case "news": {
      const category = String(route.args.category ?? "").trim();
      const query = String(route.args.query ?? "").trim();
      return category || query
        ? [{ name: "get_news", args: { ...(category ? { category } : {}), ...(query ? { query } : {}) }, reason: "Fallback planner used route news args." }]
        : [];
    }
    case "it-research":
      return hasValue(route.args.topic)
        ? [{ name: "search_it_knowledge", args: { topic: route.args.topic }, reason: "Fallback planner used route topic." }]
        : [];
    case "sgroup-knowledge":
      return hasValue(route.args.query)
        ? [{ name: "search_sgroup_knowledge", args: { query: route.args.query }, reason: "Fallback planner used route query." }]
        : [];
    case "mixed-research": {
      const topic = String(route.args.topic ?? route.args.query ?? "").trim();
      const query = String(route.args.query ?? route.args.topic ?? "").trim();
      return topic && query
        ? [
            { name: "search_it_knowledge", args: { topic }, reason: "Fallback planner used route topic." },
            { name: "search_sgroup_knowledge", args: { query }, reason: "Fallback planner used route query." }
          ]
        : [];
    }
    default:
      return [];
  }
}

function finalizeToolNames(route, toolCalls) {
  route.toolNames = toolCalls.map((toolCall) => toolCall.name);
  route.toolName = route.toolNames.length ? route.toolNames.join(" + ") : null;
}

async function executeCapabilityCall(name, args) {
  if (ALLOWED_TOOLS.has(name)) {
    switch (name) {
      case "get_weather":
        return getWeatherRaw(args.location);
      case "get_news":
        return getNewsRaw(args);
      case "search_it_knowledge":
        return searchItKnowledgeRaw(args.topic);
      case "search_sgroup_knowledge":
        return searchSgroupKnowledgeRaw(args.query);
      case "read_project_document":
        return readProjectDocumentRaw(args.filename);
      default:
        throw new Error(`Unknown local tool: ${name}`);
    }
  }

  const result = await executeExternalTool(name, args);
  const textContent = result.content?.map((content) => content.text).join("\n") || "";
  return {
    kind: "external-mcp",
    summary: textContent,
    isError: result.isError,
    citations: [],
    webUrl: "",
    fallbackUsed: false,
    metadata: { toolName: name }
  };
}

function buildStatusSteps(route, toolCalls, fallbackUsed, results, synthesisSource, { usedFallbackRouter, plannerSource, warnings }) {
  const toolNames = toolCalls.map((toolCall) => toolCall.name);
  const steps = [`Đã phân loại intent ${route.intent} bằng ${usedFallbackRouter ? "LLM + fallback rules" : "LLM"}.`, `Đã tổng hợp phản hồi bằng ${synthesisSource}.`];

  if (toolNames.length > 0) {
    steps.splice(1, 0, `Đã gọi tool ${toolNames.join(", ")}.`);
  } else {
    steps.splice(1, 0, "Không gọi tool nào cho yêu cầu này.");
  }

  if (plannerSource === "fallback") {
    steps.splice(2, 0, "Đã tự phục hồi tool plan bằng fallback rules.");
  } else if (warnings.length) {
    steps.splice(2, 0, "Đã tự phục hồi tham số tool từ route mà không cần hard fail.");
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
    case "it-research": {
      const toolNamesList = toolCalls.map((toolCall) => toolCall.name).join(", ");
      steps.push(fallbackUsed ? "Đang dùng fallback an toàn do chưa cấu hình provider." : `Đã lấy kết quả tìm kiếm IT từ ${toolNamesList}.`);
      break;
    }
    case "sgroup-knowledge":
      steps.push((results[0]?.items ?? []).length ? "Đã tổng hợp kết quả từ kho tri thức nội bộ." : "Không có bản ghi khớp, đã trả về kết quả an toàn.");
      break;
    case "github":
      steps.push("Đã tra cứu mã nguồn/repo qua Github MCP.");
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
    reasoningSummary: "Khong the hoan tat phan tich bang LLM.",
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
      warnings: [],
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
      warnings: [],
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
  const warnings = [];
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
      statusStep: "Đã xử lý yêu cầu rỗng bằng fast-path an toàn."
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
      statusStep: "Đã xử lý lời chào bằng fast-path an toàn."
    });
  }

  let route;
  let usedFallbackRouter = false;
  let routeSource = "llm";
  try {
    const routeDecision = await routeIntentWithLlm(normalizedMessage);
    route = normalizeRoute(routeDecision, normalizedMessage);
    executedNodes.push("route_intent_llm");
    decisionNotes.push(`intent=${route.intent}`);

    const fallbackRoute = routeMessage(normalizedMessage);
    const fallbackOutcome = mergeRouteWithFallbackRoute(route, fallbackRoute, decisionNotes);
    route = fallbackOutcome.route;
    usedFallbackRouter = fallbackOutcome.usedFallbackRouter;
    if (usedFallbackRouter) {
      executedNodes.push("fallback_route_rules");
      routeSource = "fallback-rules";
    }
  } catch (error) {
    const errorMessage = error?.message ?? String(error);
    errors.push(errorMessage);
    decisionNotes.push("route_error");
    return buildGraphFailurePayload({
      message: `Khong the phan tich yeu cau bang LLM luc nay: ${errorMessage}`,
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
  let plannerSource = "llm";
  const fallbackToolCalls = buildFallbackToolCalls(route);
  try {
    const plan = await planToolCallsWithLlm({ message: normalizedMessage, route, externalTools: getAvailableExternalTools() });
    const normalizedToolCalls = plan.toolCalls.map((toolCall) => normalizeToolCall(toolCall, route, warnings, decisionNotes));
    executedNodes.push("plan_tool_calls_llm");

    if (!normalizedToolCalls.length && fallbackToolCalls.length) {
      toolCalls = fallbackToolCalls.map((toolCall) => normalizeToolCall(toolCall, route, warnings, decisionNotes));
      planningSummary = "Fallback plan generated from route.";
      plannerSource = "fallback";
      executedNodes.push("fallback_plan_rules");
      decisionNotes.push("fallback_plan=empty_llm_plan");
    } else {
      toolCalls = normalizedToolCalls;
      planningSummary = plan.planningSummary;
    }

    finalizeToolNames(route, toolCalls);
    decisionNotes.push(`tool_plan=${route.toolNames.length ? route.toolNames.join(",") : "none"}`);
    decisionNotes.push(`planning=${planningSummary}`);
  } catch (error) {
    const errorMessage = error?.message ?? String(error);
    if (fallbackToolCalls.length) {
      warnings.push(errorMessage);
      toolCalls = fallbackToolCalls.map((toolCall) => normalizeToolCall(toolCall, route, warnings, decisionNotes));
      plannerSource = "fallback";
      planningSummary = `Fallback plan generated after planner error: ${errorMessage}`;
      finalizeToolNames(route, toolCalls);
      executedNodes.push("fallback_plan_rules");
      decisionNotes.push("planner_error_recovered");
      decisionNotes.push(`planning=${planningSummary}`);
    } else {
      errors.push(errorMessage);
      decisionNotes.push("planner_error");
      return buildGraphFailurePayload({
        message: `Khong the lap ke hoach goi tool bang LLM luc nay: ${errorMessage}`,
        safeSessionId,
        normalizedMessage,
        channel,
        executedNodes,
        errors,
        decisionNotes
      });
    }
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
      message: `Khong the tong hop cau tra loi bang LLM luc nay: ${errorMessage}`,
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
      statusSteps: buildStatusSteps(route, toolCalls, fallbackUsed, results, "LLM", { usedFallbackRouter, plannerSource, warnings }),
      mcp: { toolNames: route.toolNames, confidence: route.confidence }
    },
    graph: {
      sessionId: safeSessionId,
      executedNodes,
      toolCalls,
      errors,
      warnings,
      usedFallbackRouter,
      routeSource,
      plannerSource,
      decisionNotes,
      channel
    }
  };
}
