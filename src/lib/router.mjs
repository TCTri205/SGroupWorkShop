const VALID_INTENTS = new Set(["general", "weather", "news", "it-research", "sgroup-knowledge", "mixed-research"]);

const WEATHER_HINTS = ["thoi tiet", "weather", "nhiet do", "troi", "mua", "nang", "do am", "du bao", "bao nhieu do"];
const NEWS_HINTS = ["tin tuc", "tin moi", "bao moi", "news", "thoi su", "headline", "tin cong nghe", "tin kinh te"];
const IT_HINTS = [
  "it",
  "lap trinh",
  "programming",
  "javascript",
  "typescript",
  "react",
  "node",
  "python",
  "machine learning",
  "llm",
  "mcp",
  "langgraph",
  "crewai",
  "autogen",
  "rag",
  "vector",
  "database",
  "api"
];
const SGROUP_HINTS = ["sgroup", "ai team", "clb", "du an", "module", "nhan su", "noi bo", "chatbot"];
const GREETING_HINTS = ["hello", "hi", "hey", "xin chao", "chao", "chao ban", "alo"];
const WEATHER_TIME_SUFFIX = "(?:hom nay|bay gio|luc nay|bao nhieu do|the nao|ra sao|nhu the nao|mai|ngay mai|tuan nay)";

export const INTENTS = ["general", "weather", "news", "it-research", "sgroup-knowledge", "mixed-research"];

const CITY_ALIASES = {
  "ha noi": "Ha Noi",
  hanoi: "Ha Noi",
  "tp.hcm": "Ho Chi Minh City",
  "ho chi minh": "Ho Chi Minh City",
  "da nang": "Da Nang",
  "can tho": "Can Tho",
  "hai phong": "Hai Phong",
  hue: "Hue"
};
const NEWS_CATEGORIES = {
  "cong nghe": "cong-nghe",
  "kinh te": "kinh-te",
  "the thao": "the-thao",
  "doi song": "doi-song"
};

const AGENT_BY_INTENT = {
  weather: "weather-specialist",
  news: "news-specialist",
  "sgroup-knowledge": "sgroup-specialist",
  "it-research": "it-specialist",
  "mixed-research": "research-specialist",
  general: "generalist"
};

const TOOL_BY_INTENT = {
  weather: "get_weather",
  news: "get_news",
  "sgroup-knowledge": "search_sgroup_knowledge",
  "it-research": "search_it_knowledge",
  "mixed-research": "search_it_knowledge + search_sgroup_knowledge",
  general: null
};

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .toLowerCase()
    .trim();
}

function includesAny(haystack, needles) {
  return needles.some((needle) => haystack.includes(needle));
}

export function getToolNamesForIntent(intent) {
  const toolName = TOOL_BY_INTENT[intent] ?? null;
  if (!toolName) {
    return [];
  }

  return String(toolName)
    .split("+")
    .map((name) => name.trim())
    .filter(Boolean);
}

export function isGreetingMessage(message) {
  const normalized = normalizeText(message);
  if (!normalized) {
    return false;
  }

  if (normalized.length <= 12 && includesAny(normalized, GREETING_HINTS)) {
    return true;
  }

  return /^(xin chao|chao ban|chao|hello|hi|hey|alo)(\s+[a-z0-9]+){0,2}[!.?]*$/.test(normalized);
}

function titleCaseWords(value) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function extractWeatherLocation(normalized) {
  for (const [alias, label] of Object.entries(CITY_ALIASES)) {
    if (normalized.includes(alias)) {
      return label;
    }
  }

  const boundary = new RegExp(`(?=\\s+${WEATHER_TIME_SUFFIX}\\b|$)`);
  const weatherLeadPatterns = [
    new RegExp(`\\b(?:thoi tiet|du bao thoi tiet|weather)\\s+(?:tai|o|cho)?\\s*([a-z][a-z0-9.-]*(?:\\s+[a-z0-9.-]+){0,2}?)${boundary.source}`),
    new RegExp(`\\b(?:o|tai|cho)\\s+([a-z][a-z0-9.-]*(?:\\s+[a-z0-9.-]+){0,2}?)${boundary.source}`),
    new RegExp(`^([a-z][a-z0-9.-]*(?:\\s+[a-z0-9.-]+){0,2}?)${boundary.source}`)
  ];

  for (const pattern of weatherLeadPatterns) {
    const candidate = pattern.exec(normalized)?.[1]?.trim();
    if (!candidate || /^(?:hom nay|bay gio|luc nay|bao nhieu do|the nao|ra sao|nhu the nao|mai|ngay mai|tuan nay)$/.test(candidate) || candidate === "thoi tiet" || candidate === "du bao thoi tiet" || candidate === "weather") {
      continue;
    }

    return titleCaseWords(candidate);
  }

  return null;
}

export function extractNewsCategory(normalized) {
  for (const [label, category] of Object.entries(NEWS_CATEGORIES)) {
    if (normalized.includes(label)) {
      return category;
    }
  }

  if (normalized.includes("cong nghe") || normalized.includes("ai") || normalized.includes("it")) {
    return "cong-nghe";
  }

  return "tong-hop";
}

export function extractTopic(message, normalized = normalizeText(message)) {
  const stripped = String(message ?? "").trim().replace(/[?\s]+$/g, "");
  if (!stripped) {
    return "AI chatbot";
  }

  const prefixes = ["tim hieu", "tra cuu", "nghien cuu", "giai thich", "gioi thieu", "cho minh biet", "hay cho biet"];

  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      const candidate = stripped.slice(prefix.length).trim();
      return candidate || "AI chatbot";
    }
  }

  return stripped || "AI chatbot";
}

export function createRouteFromIntent(message, intent, overrides = {}) {
  const normalized = normalizeText(message);
  const safeIntent = VALID_INTENTS.has(intent) ? intent : "general";
  const defaultReasoningSummary =
    safeIntent === "general" && isGreetingMessage(message)
      ? "Nguoi dung dang mo dau cuoc tro chuyen bang loi chao ngan, phu hop voi phan hoi chao va goi y kha nang he thong."
      : "Khong co dau hieu ro rang, uu tien tra loi tong quan va goi y nang luc he thong.";
  const route = {
    agent: AGENT_BY_INTENT[safeIntent] ?? AGENT_BY_INTENT.general,
    intent: safeIntent,
    confidence: overrides.confidence ?? 0.55,
    reasoningSummary: overrides.reasoningSummary ?? defaultReasoningSummary,
    toolName: TOOL_BY_INTENT[safeIntent] ?? null,
    toolNames: overrides.toolNames ?? getToolNamesForIntent(safeIntent),
    args: {}
  };

  switch (safeIntent) {
    case "mixed-research": {
      const topic = extractTopic(message, normalized);
      route.args = { topic, query: topic };
      if (!overrides.reasoningSummary) {
        route.reasoningSummary = "Cau hoi can ket hop tri thuc noi bo va nguon ky thuat ben ngoai.";
      }
      break;
    }
    case "weather": {
      route.args = { location: extractWeatherLocation(normalized) };
      if (!overrides.reasoningSummary) {
        route.reasoningSummary = route.args.location
          ? "Cau hoi tap trung vao thoi tiet theo dia diem."
          : "Cau hoi ve thoi tiet nhung chua du dia diem de goi tool mot cach an toan.";
      }
      break;
    }
    case "news": {
      route.args = { category: extractNewsCategory(normalized) };
      if (!overrides.reasoningSummary) {
        route.reasoningSummary = "Cau hoi yeu cau tong hop tin tuc theo chu de.";
      }
      break;
    }
    case "sgroup-knowledge": {
      route.args = { query: extractTopic(message, normalized) };
      if (!overrides.reasoningSummary) {
        route.reasoningSummary = "Cau hoi lien quan den tri thuc noi bo cua SGroup hoac AI Team.";
      }
      break;
    }
    case "it-research": {
      route.args = { topic: extractTopic(message, normalized) };
      if (!overrides.reasoningSummary) {
        route.reasoningSummary = "Cau hoi nghien cuu cong nghe phu hop voi tool tim kiem IT.";
      }
      break;
    }
    default:
      break;
  }

  return route;
}

export function routeMessage(message) {
  const normalized = normalizeText(message);
  const mentionsWeather = includesAny(normalized, WEATHER_HINTS);
  const mentionsNews = includesAny(normalized, NEWS_HINTS);
  const mentionsIt = includesAny(normalized, IT_HINTS);
  const mentionsSgroup = includesAny(normalized, SGROUP_HINTS);
  const mentionsInternalResearch =
    mentionsSgroup && /\b(co the|ap dung|kien truc|he thong|ket hop|tich hop|mcp|rag|llm|agent)\b/.test(normalized);

  if (mentionsInternalResearch && mentionsIt) {
    return createRouteFromIntent(message, "mixed-research", { confidence: 0.9 });
  }

  if (mentionsWeather) {
    return createRouteFromIntent(message, "weather", { confidence: 0.95 });
  }

  if (mentionsNews) {
    return createRouteFromIntent(message, "news", { confidence: 0.92 });
  }

  if (mentionsSgroup) {
    return createRouteFromIntent(message, "sgroup-knowledge", { confidence: 0.88 });
  }

  if (mentionsIt) {
    return createRouteFromIntent(message, "it-research", { confidence: 0.86 });
  }

  return createRouteFromIntent(message, "general", { confidence: 0.55 });
}
