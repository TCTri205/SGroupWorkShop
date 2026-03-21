# Multi-Agent Assistant tại SGroupWorkShop  
## Kịch bản thuyết trình đầy đủ (speaker script chi tiết)

> Mục tiêu: dùng tài liệu này để trình bày 25–40 phút về kiến trúc Multi-Agent của dự án `SGroupWorkShop`, vừa phù hợp cho audience kỹ thuật, vừa dễ hiểu với audience product/business.

---

## 0) Lời mở đầu (1–2 phút)

Xin chào mọi người, hôm nay mình trình bày về chủ đề **“Thiết kế và triển khai hệ thống Multi-Agent Assistant trong SGroupWorkShop”**.  
Điểm đặc biệt của hệ thống này là:

- Không chỉ có một chatbot trả lời chung chung.
- Mà có một cơ chế điều phối gồm **Router → Planner → Tool Executor → Synthesizer**.
- Mỗi yêu cầu được phân loại intent và gọi đúng capability.
- Hỗ trợ cả **Web Chat** và **MCP Server** với cùng một graph orchestration.

Nói ngắn gọn: đây là kiến trúc “chia vai rõ ràng”, giúp hệ thống dễ mở rộng, dễ kiểm soát và phù hợp môi trường production hơn mô hình “một prompt làm tất cả”.

---

## 1) Bối cảnh bài toán (2–3 phút)

Trong một chatbot nội bộ/đối ngoại, user hỏi rất nhiều loại câu hỏi khác nhau:
- Câu chào xã giao
- Thời tiết theo địa điểm
- Tin tức theo danh mục/chủ đề
- Tri thức IT bên ngoài
- Tri thức nội bộ SGroup/AI Team
- Hoặc câu hỏi lai giữa tri thức nội bộ + tri thức kỹ thuật bên ngoài

Nếu dùng một model với một prompt duy nhất:
- Khó kiểm soát chất lượng route
- Khó giới hạn tool nào được gọi
- Khó debug khi sai
- Khó scale khi thêm domain mới

Vì vậy dự án dùng hướng **Multi-Agent orchestration**:
- Tách quyết định thành nhiều bước nhỏ.
- Mỗi bước có schema và guardrail rõ ràng.
- Có trace (`executedNodes`, `toolCalls`, `errors`, `decisionNotes`) để quan sát vận hành.

---

## 2) Kiến trúc tổng quan (3–4 phút)

### 2.1 Các khối chính

1. **Input Normalizer**
   - Chuẩn hoá message, sessionId, channel.
   - Fast-path cho greeting/empty để tiết kiệm tài nguyên.

2. **Router (Hybrid: LLM + Rules)**
   - Hàm: `routeIntentWithLlm` phối hợp với `routeMessage`.
   - Cơ chế: LLM phân loại chính; nếu LLM trả về `general` nhưng Rules tìm thấy intent cụ thể hơn, hệ thống sẽ ưu tiên Rules. Ngoài ra, Rules giúp bổ sung các tham số (args) bị thiếu.
   - Trả về: intent, agent, confidence, reasoningSummary, args.

3. **Planner (LLM + Fallback Rules)**
   - Hàm: `planToolCallsWithLlm`.
   - Từ route + message để quyết định gọi tool nào, args gì.
   - **Self-recovery**: Nếu LLM planning bị lỗi hoặc trả về danh sách tool trống cho một intent đã xác định, Graph sẽ tự động dùng bộ Rules để tạo kế hoạch gọi tool dự phòng.

4. **Tool Executor**
   - Hàm: `executeCapabilityCall` trong `assistant-graph.mjs`.
   - Gọi các capability thật:
     - `get_weather`
     - `get_news`
     - `search_it_knowledge`
     - `search_sgroup_knowledge`
     - `read_project_document` (Đọc tài liệu kỹ thuật nội bộ)
     - `executeExternalTool` (Gọi các MCP tools bên ngoài)

5. **Synthesizer (LLM-based)**
   - Hàm: `synthesizeAnswerWithLlm`.
   - Tổng hợp final answer dựa trên route + tool results + errors.

6. **Post-processing**
   - Gom citations, chọn webUrl chính, tổng hợp fallback status.
   - Trả payload thống nhất cho UI / MCP.

### 2.2 Vì sao là “multi-agent”
Trong code, mỗi intent map tới 1 specialist agent:
- weather-specialist
- news-specialist
- it-specialist
- sgroup-specialist
- research-specialist
- github-specialist
- generalist

Dù triển khai thực tế dưới dạng một orchestration graph, nhưng về tư duy và hành vi nó đúng mô hình multi-agent: **nhiều “vai chuyên trách” dưới một coordinator**.

---

## 3) Luồng xử lý chi tiết (5–7 phút)

### 3.1 Luồng web chat (`src/server.mjs`)
- API `/api/chat` nhận message.
- Gọi `invokeAssistantGraph({ message, channel: "web", sessionId })`.
- Trả payload gồm:
  - `route`
  - `response` (message, citations, webUrl, statusSteps, mcp)
  - `graph` (executedNodes, toolCalls, errors, routeSource, plannerSource...)

### 3.2 Luồng MCP (`src/lib/mcp-runtime.mjs`)
- Tool `run_sgroup_assistant` cũng gọi `invokeAssistantGraph`, chỉ khác channel = `"mcp"`.
- Cho thấy cùng một “brain”, nhiều điểm vào khác nhau.

### 3.3 Fast-path
Trong `assistant-graph.mjs`:
- Nếu message rỗng hoặc greeting → không cần route/planner/synthesis bằng LLM.
- Trả response an toàn ngay.
- Lợi ích: giảm latency + chi phí + giảm tỷ lệ lỗi phụ thuộc provider.

### 3.4 Error-safe & Self-recovery path
Mỗi giai đoạn có try/catch riêng và cơ chế phục hồi:
- **Route**: Nếu LLM fail, vẫn có trace lỗi nhưng thường ưu tiên trả lỗi vì route là gốc. Tuy nhiên, nếu LLM trả `general`, Rules sẽ "cứu" bằng cách gán lại intent chuyên biệt nếu khớp keyword.
- **Planner**: Khả năng tự phục hồi mạnh. Nếu LLM planner lỗi, Graph dùng `buildFallbackToolCalls` để tiếp tục chạy các tool tối thiểu cần thiết cho intent đó.
- **Synthesis**: Nếu synthesis lỗi, trả về payload lỗi chuẩn (`buildGraphFailurePayload`) để UI hiển thị thông báo an toàn.

Nhờ vậy hệ thống fail mềm, có thông điệp rõ ràng cho UI và vẫn giữ trace debugging đầy đủ.

---

## 4) Phân tích từng thành phần kỹ thuật (10–12 phút)

## 4.1 Router & Planner dùng Structured Output (`assistant-llm.mjs`)

Điểm mạnh rất lớn của hệ này là dùng **Zod schema**:
- `ROUTE_SCHEMA`
- `TOOL_CALL_SCHEMA`
- `PLAN_SCHEMA`
- `SYNTHESIS_SCHEMA`

Model được ép trả về output đúng shape, giảm rủi ro “hallucinated JSON”.

### Ý nghĩa từng schema

- `ROUTE_SCHEMA`: bắt buộc intent thuộc tập cho phép.
- `PLAN_SCHEMA`: danh sách toolCalls + planningSummary.
- `TOOL_CALL_SCHEMA`: tool name chỉ trong allow-list.
- `SYNTHESIS_SCHEMA`: bắt buộc message có nội dung.

=> Đây là guardrail quan trọng để nâng hệ thống từ “demo” lên “production-ready baseline”.

---

## 4.2 Validation tool call trong graph (`normalizeToolCall`)

Dù planner đã có schema, graph vẫn kiểm tra lại:
- `get_weather` phải có `location`
- `get_news` phải có `category` hoặc `query`
- `search_it_knowledge` phải có `topic`
- `search_sgroup_knowledge` phải có `query`
- `read_project_document` phải có `filename`
- `brave_web_search` (MCP) phải có `query`

Đây là mẫu **defense-in-depth**: kiểm tra ở nhiều lớp.

---

## 4.3 Capability layer (`src/lib/capabilities.mjs`)

Tầng này chuẩn hoá output raw từ provider/search nội bộ thành format chung:
- `kind`
- `summary`
- `items`
- `citations`
- `webUrl`
- `fallbackUsed`
- `metadata`

Vai trò:
- Tách business orchestration khỏi provider-specific logic.
- Dễ thay thế backend mà không đụng graph quá nhiều.

---

## 4.4 Provider layer (`src/lib/providers.mjs`)

### Weather
- Ưu tiên OpenWeather nếu có API key.
- Không có key hoặc lỗi API → fallback message an toàn.
- Có cache TTL (`WEATHER_TTL = 600`).

### News
- Nếu có NEWS_API_KEY → gọi NewsAPI.
- Nếu lỗi / thiếu key → fallback RSS.
- Có lọc theo topic bằng token matching.
- Cache TTL (`NEWS_TTL = 900`).

### IT Search & External MCP
- Ưu tiên Exa API hoặc Brave Search (MCP).
- Brave Search hỗ trợ tìm kiếm web, tin tức và địa điểm thời gian thực.
- Context7 (MCP) hỗ trợ tra cứu tài liệu SDK/Framework qua library-id.
- GitHub (MCP) hỗ trợ truy cứu mã nguồn, issues và PRs.
- Lỗi/thiếu key -> fallback Google search link hoặc RSS.
- Cache TTL (`SEARCH_TTL = 3600`).

### Ý nghĩa kiến trúc fallback
- Hệ thống luôn có câu trả lời (graceful recovery).
- Tự động phục hồi tham số (argument recovery) từ route nếu planner bỏ sót.
- Minh bạch trạng thái qua `fallbackUsed` và status steps.

---

## 4.5 Tri thức nội bộ (`src/lib/knowledge.mjs` + `data/*.json`)

- Dùng Fuse.js cho fuzzy search.
- Chuẩn hoá tiếng Việt bỏ dấu (`normalize("NFD")`, bỏ Diacritic).
- Có rerank bằng token score + officialBoost + rootBoost.
- Domain:
  - `ai-team`
  - `sgroup` (gồm `sgroup.json` + `sgroup-site.json`)

Lợi ích:
- Chịu được sai chính tả, gõ không dấu.
- Ưu tiên nguồn chính thức khi độ liên quan tương đương.
- Phù hợp chatbot tiếng Việt thực tế.

---

## 4.6 Frontend quan sát graph (`public/app.js`)

UI không chỉ hiển thị câu trả lời, mà còn hiển thị:
- status chips
- citations
- detail graph:
  - agent
  - intent
  - tool names
  - executed path
  - tool trace
  - graph errors/fallback notice
  - reasoning summary

Đây là điểm rất “engineering-friendly”, cực tốt cho demo và debugging live.

---

## 5) Kịch bản demo đề xuất (5–7 phút)

## Demo 1: Greeting fast path
Input: “hello”  
Kỳ vọng:
- intent general
- không gọi tool
- executedNodes: normalize_input → fast_path_general

Thông điệp demo: hệ thống biết tiết kiệm tài nguyên cho tác vụ đơn giản.

## Demo 2: Weather có location
Input: “Thời tiết Hà Nội hôm nay thế nào?”  
Kỳ vọng:
- intent weather
- tool get_weather
- nếu thiếu API key vẫn trả fallback rõ ràng

Thông điệp demo: graceful degradation khi thiếu cấu hình.

## Demo 3: News theo chủ đề
Input: “Tin tức Redis mới nhất”  
Kỳ vọng:
- intent news
- get_news với query Redis
- có citations

Thông điệp demo: planner sinh args có ý nghĩa nghiệp vụ.

## Demo 4: SGroup knowledge
Input: “Giới thiệu AI Team SGroup”  
Kỳ vọng:
- intent sgroup-knowledge
- search_sgroup_knowledge
- trả items từ data nội bộ

Thông điệp demo: chatbot trả tri thức nội bộ không phụ thuộc internet.

## Demo 5: GitHub / Source lookup
Input: "Kiểm tra mã nguồn của MCP client trong dự án"
Kỳ vọng:
- intent github
- gọi tool github_search_repositories hoặc github_read_file
- trả về tóm tắt cấu trúc code

## Demo 6: Mixed research
Input: “MCP có thể áp dụng cho chatbot nội bộ SGroup không?”  
Kỳ vọng:
- intent mixed-research
- gọi cả search_it_knowledge + search_sgroup_knowledge
- synthesis hợp nhất 2 nguồn

Thông điệp demo: multi-agent mạnh nhất ở bài toán lai nguồn dữ liệu.

---

## 6) Điểm mạnh hệ thống (2–3 phút)

1. **Kiến trúc rõ ràng, phân lớp sạch**  
2. **Quan sát vận hành tốt** qua graph metadata  
3. **An toàn vận hành** nhờ fallback + structured output + validation  
4. **Dễ mở rộng**: thêm intent/tool/domain tương đối độc lập  
5. **Reuse tốt** giữa Web và MCP  

---

## 7) Hạn chế hiện tại (2–3 phút)

1. Chưa có persistent memory theo session dài hạn  
2. Một số chuỗi hiển thị bị cắt/placeholder trong mã nguồn mẫu  
3. Chưa có retry/backoff chiến lược cho từng provider cụ thể  
4. Chưa có cơ chế đánh giá chất lượng route/planning theo telemetry thực tế

---

## 8) Roadmap cải tiến (3–4 phút)

### 8.1 Ngắn hạn
- Đồng nhất response templates.
- Bổ sung test cho edge cases planner/schema violations.
- Tối ưu hóa prompt cho Gemini 2.5 Flash để giảm latency.

### 8.2 Trung hạn
- Thêm tracing ID xuyên suốt request.
- Instrument metrics:
  - route accuracy proxy
  - tool success rate
  - fallback rate
  - latency per node

### 8.3 Dài hạn
- Multi-model strategy (router model nhẹ, synthesis model mạnh hơn).
- Policy engine cho tool permission theo role user.
- Hybrid retrieval (BM25 + vector) cho kho tri thức nội bộ.
- Học từ phản hồi người dùng để cải thiện routing.

---

## 9) Kết luận (1 phút)

Hệ thống Multi-Agent trong SGroupWorkShop đã đạt một baseline tốt cho sản phẩm thật:
- Có điều phối thông minh
- Có khả năng fallback
- Có tính minh bạch và khả năng mở rộng

Thông điệp chính muốn gửi:
**Multi-Agent không chỉ là “nhiều bot”, mà là một phương pháp thiết kế giúp hệ thống AI đáng tin cậy hơn trong môi trường thực tế.**

---

# Phụ lục A — Script MC/Presenter (đọc gần như nguyên văn)

“Xin chào mọi người, hôm nay mình trình bày kiến trúc Multi-Agent Assistant trong SGroupWorkShop.  
Thay vì để một model làm tất cả, hệ thống chia thành các bước: định tuyến intent, lập kế hoạch tool, thực thi capability, và tổng hợp câu trả lời.  
Điểm quan trọng là mỗi bước đều có guardrail bằng schema và validation.  
Khi provider lỗi hoặc thiếu API key, hệ thống không sập mà trả fallback an toàn, vẫn có trải nghiệm liên tục cho người dùng.  
Ngoài ra UI hiển thị đầy đủ trace xử lý để team dễ demo và debug.  
Với cách tiếp cận này, chúng ta vừa giữ được sự linh hoạt của LLM, vừa kiểm soát tốt chất lượng vận hành.”

---

# Phụ lục B — Q&A mẫu

**Q1: Tại sao cần cả router và planner, không gộp một bước?**  
A: Tách bước giúp rõ trách nhiệm, dễ debug, và giảm sai sót. Router quyết định “làm gì”, planner quyết định “gọi gì”.

**Q2: Nếu LLM trả sai JSON thì sao?**  
A: Có Zod parse + validation bổ sung ở graph, lỗi sẽ được chặn và trả payload lỗi an toàn.

**Q3: Vì sao cần fallback?**  
A: Thực tế production luôn có lỗi mạng, quota, thiếu key. Fallback giúp dịch vụ vẫn usable.

**Q4: Làm sao mở rộng thêm domain HR/CRM?**  
A: Thêm intent mới, tool mới, capability mới và cập nhật rules cho router/planner + test.

**Q5: Hệ thống có phù hợp scale lớn không?**  
A: Có nền tảng tốt. Để scale lớn cần thêm observability, rate limiting, memory, và worker queue.

---

# Phụ lục C — Checklist trước khi thuyết trình

- [ ] Chạy test: `node --test`
- [ ] Mở web demo: `node src/server.mjs`
- [ ] Chuẩn bị 5 prompt demo đã nêu
- [ ] Kiểm tra env key để demo cả nhánh success + fallback
- [ ] Chuẩn bị màn hình hiển thị Graph Logic details
- [ ] Có sẵn Q&A về an toàn, chi phí, latency, mở rộng