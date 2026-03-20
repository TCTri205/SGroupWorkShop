const VALID_INTENTS = new Set(["general", "weather", "news", "it-research", "sgroup-knowledge", "mixed-research"]);

const WEATHER_HINTS = ["thoi tiet", "weather", "nhiet do", "troi", "mua", "nang", "do am", "du bao", "bao nhieu do"];
const NEWS_HINTS = ["tin tuc", "tin moi", "bao moi", "news", "thoi su", "headline", "ban tin", "cap nhat", "tin cong nghe", "tin kinh te"];
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

const NEWS_GENERIC_TERMS = new Set([
  "tin",
  "tuc",
  "tin tuc",
  "tin moi",
  "bao moi",
  "news",
  "thoi su",
  "headline",
  "ban tin",
  "cap nhat",
  "moi",
  "moi nhat",
  "gan day",
  "hom nay",
  "cho toi",
  "ve"
]);

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

function sanitizeWeatherLocationCandidate(candidate) {
  const cleaned = String(candidate ?? "")
    .trim()
    .replace(/^(?:o|tai|cho)\s+/i, "")
    .replace(/^(?:thanh pho|tp\.?)\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[^a-z0-9]+|[^a-z0-9.-]+$/gi, "")
    .trim();

  if (
    !cleaned ||
    /^(?:hom nay|hien tai|bay gio|luc nay|bao nhieu do|the nao|ra sao|nhu the nao|mai|ngay mai|tuan nay)$/.test(cleaned) ||
    cleaned === "thoi tiet" ||
    cleaned === "du bao thoi tiet" ||
    cleaned === "weather"
  ) {
    return null;
  }

  return titleCaseWords(cleaned);
}

export function extractWeatherLocation(normalized) {
  for (const [alias, label] of Object.entries(CITY_ALIASES)) {
    if (normalized.includes(alias)) {
      return label;
    }
  }

  const stripped = normalized
    .replace(/\b(?:thoi tiet|du bao thoi tiet|weather)\b/g, " ")
    .replace(/\b(?:hien tai|hom nay|bay gio|luc nay|bao nhieu do|the nao|ra sao|nhu the nao|mai|ngay mai|tuan nay)\b/g, " ")
    .replace(/\b(?:o|tai|cho)\b/g, " ")
    .replace(/\b(?:thanh pho|tp)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return sanitizeWeatherLocationCandidate(stripped);
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

export function extractNewsTopic(message, normalized = normalizeText(message)) {
  const category = extractNewsCategory(normalized);
  const stripped = normalized
    .replace(/\b(tin tuc|tin moi|bao moi|news|thoi su|headline|ban tin|cap nhat|tin)\b/g, " ")
    .replace(/\b(moi nhat|gan day|hom nay)\b/g, " ")
    .replace(/\b(cho toi|ve)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!stripped) {
    return "";
  }

  if (stripped === category.replace(/-/g, " ")) {
    return "";
  }

  if (NEWS_GENERIC_TERMS.has(stripped)) {
    return "";
  }

  return stripped;
}

export function extractNewsArgs(message, normalized = normalizeText(message)) {
  const category = extractNewsCategory(normalized);
  const query = extractNewsTopic(message, normalized);
  return query ? { category, query } : { category };
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
      const detectedLocation = extractWeatherLocation(normalized);
      route.args = { location: detectedLocation ?? "Da Nang" };
      if (!overrides.reasoningSummary) {
        route.reasoningSummary = detectedLocation
          ? "Cau hoi tap trung vao thoi tiet theo dia diem."
          : "Cau hoi ve thoi tiet nhung khong neu dia diem, mac dinh su dung Da Nang.";
      }
      break;
    }
    case "news": {
      route.args = extractNewsArgs(message, normalized);
      if (!overrides.reasoningSummary) {
        route.reasoningSummary = route.args.query
          ? "Cau hoi yeu cau tim tin tuc theo chu de cu the."
          : "Cau hoi yeu cau tong hop tin tuc theo danh muc.";
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
