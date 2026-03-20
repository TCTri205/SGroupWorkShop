import Fuse from "fuse.js";
import aiTeamRecords from "../../data/ai-team.json" with { type: "json" };
import sgroupRecords from "../../data/sgroup.json" with { type: "json" };

const datasets = {
  "ai-team": aiTeamRecords,
  sgroup: sgroupRecords,
};

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

const fuseInstances = {
  "ai-team": buildFuse(aiTeamRecords),
  sgroup: buildFuse(sgroupRecords),
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
  if (!fuse) return [];

  const results = fuse.search(query);
  // Lọc kết quả có score tốt (score thấp = khớp tốt hơn trong Fuse.js)
  return results
    .filter((r) => (r.score ?? 1) < 0.6)
    .map((r) => r.item);
}

export function listAiTeamModules() {
  return aiTeamRecords.filter((record) => record.module).map((record) => record.module);
}
