import Fuse from "fuse.js";
import aiTeamRecords from "../../data/ai-team.json" with { type: "json" };
import sgroupRecords from "../../data/sgroup.json" with { type: "json" };
import sgroupSiteRecords from "../../data/sgroup-site.json" with { type: "json" };

const datasets = {
  "ai-team": aiTeamRecords,
  sgroup: [...sgroupRecords, ...sgroupSiteRecords],
};

const QUERY_STOPWORDS = new Set(["la", "gi", "vay", "ve", "cho", "toi", "minh", "hay", "biet", "them"]);

/**
 * Cấu hình Fuse.js: tìm kiếm mờ đa trường với ngưỡng sai số hợp lý.
 * threshold 0.4 = chấp nhận khoảng cách chỉnh sửa ≤ 40% độ dài chuỗi.
 */
function buildFuse(records) {
  return new Fuse(records, {
    keys: [
      { name: "title", weight: 3 },
      { name: "keywords", weight: 2 },
      { name: "summary", weight: 1.5 },
      { name: "content", weight: 1 },
      { name: "module", weight: 1 },
    ],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true,
    useExtendedSearch: false,
  });
}

function normalizeSearchText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .toLowerCase()
    .trim();
}

function tokenizeQuery(query = "") {
  return normalizeSearchText(query)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !QUERY_STOPWORDS.has(token));
}

function scoreRecord(record, tokens) {
  const haystack = normalizeSearchText(
    [record.title, record.summary, record.content, record.module, ...(record.keywords ?? [])]
      .filter(Boolean)
      .join(" ")
  );
  const tokenScore = tokens.reduce((count, token) => count + (haystack.includes(token) ? 1 : 0), 0);
  const officialBoost = record.sourceType === "official" ? 2 : 0;
  const rootBoost = record.sourceUrl === "https://sgroupvn.org/" ? 3 : 0;
  return tokenScore + officialBoost + rootBoost;
}

function rerankRecords(records, query) {
  const tokens = tokenizeQuery(query);
  if (!tokens.length) {
    return records;
  }

  return [...records].sort((left, right) => scoreRecord(right, tokens) - scoreRecord(left, tokens));
}

function searchByTokens(records, query) {
  const tokens = tokenizeQuery(query);
  if (!tokens.length) {
    return [];
  }

  return records
    .map((record) => ({ record, score: scoreRecord(record, tokens) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.record);
}

const fuseInstances = {
  "ai-team": buildFuse(aiTeamRecords),
  sgroup: buildFuse(datasets.sgroup),
};

/**
 * Tìm kiếm trong kho tri thức nội bộ.
 * Sử dụng Fuse.js (fuzzy search) để chịu được lỗi chính tả và gõ sai dấu.
 *
 * @param {string} domain - "ai-team" hoặc "sgroup"
 * @param {string} query
 * @returns {Array} Mảng records phù hợp, sắp xếp theo độ tương đồng giảm dần.
 */
export function searchKnowledge(domain, query) {
  if (!query || !query.trim()) return [];

  const fuse = fuseInstances[domain];
  const records = datasets[domain];
  if (!fuse || !records) return [];

  const results = fuse
    .search(query)
    .filter((r) => (r.score ?? 1) < 0.6)
    .map((r) => r.item);

  if (results.length > 0) {
    return rerankRecords(results, query);
  }

  return searchByTokens(records, query);
}

export function listAiTeamModules() {
  return aiTeamRecords.filter((record) => record.module).map((record) => record.module);
}
