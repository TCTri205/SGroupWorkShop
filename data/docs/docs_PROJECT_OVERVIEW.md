1. # Hệ thống Gợi ý Video YouTube – Tài liệu kiến trúc chuyên sâu
2. 
3. ## 1. Giới thiệu
4. 1.1. Dự án “Recommendationsystem” xây dựng pipeline thu thập, làm sạch, biểu diễn và đẩy dữ liệu video YouTube vào đồ thị Neo4j, đồng thời cung cấp chức năng gợi ý cho người dùng.
5. 1.2. Ngôn ngữ chính: Python 3.x; framework đồ thị: PyTorch Geometric (torch_geometric); cơ sở dữ liệu đồ thị: Neo4j; mô hình ngôn ngữ: SentenceTransformers (“all-MiniLM-L6-v2”).
6. 1.3. Phạm vi: từ crawler (YouTube Data API) → tiền xử lý → xây dựng đồ thị dị thể (heterogeneous graph) → đẩy đồ thị vào Neo4j → ứng dụng dòng lệnh cho đăng ký, đăng nhập, ghi nhận lượt xem, gợi ý video.
7. 1.4. Mục tiêu cốt lõi: thu được tập dữ liệu đa chủ đề, xây dựng quan hệ giữa video–kênh–thẻ–chủ đề–thời gian, khai thác tương đồng ngữ nghĩa tiêu đề để tạo cạnh similarity, sau đó gợi ý video dựa trên lịch sử xem.
8. 1.5. Yêu cầu hạ tầng: Python, Neo4j (bolt://localhost:7687), GPU tùy chọn cho SentenceTransformer, biến môi trường `YOUTUBE_API_KEY`, thư mục `data/raw`, `graph/`.
9. 
10. ## 2. Mục đích và lợi ích
11. 2.1. Thu thập nhanh danh sách video theo các chủ đề seed và mở rộng theo kênh, bảo đảm đa dạng nội dung.
12. 2.2. Chuẩn hóa schema dữ liệu video, đồng bộ kiểu dữ liệu số (view/like/comment), chuỗi thời lượng ISO8601, mốc thời gian.
13. 2.3. Xây dựng đồ thị dị thể cho phép khai thác nhiều loại nút và cạnh: Video, Channel, Tag, Category, Time; cạnh UploadedBy, HasTag, InCategory, PublishedIn, SimilarTo.
14. 2.4. Tích hợp Neo4j để trực quan hóa và truy vấn graph, kết hợp ứng dụng CLI cho gợi ý theo người dùng.
15. 2.5. Tạo nền tảng mở rộng: bổ sung embedding mô tả/thumbnail, tích hợp GNN, huấn luyện ranking, triển khai dịch vụ web.
16. 
17. ## 3. Toàn cảnh pipeline (high-level)
18. 3.1. **Khởi tạo cấu hình** (`config/config.py`): định nghĩa danh sách TOPICS, TARGET_SIZE, RAW_DATA_PATH.
19. 3.2. **Crawler** (`crawler/video_crawler.py`): tìm video theo seed topic, lấy chi tiết video, mở rộng theo kênh, gom tất cả vào `data/raw/crawled_data.json`.
20. 3.3. **Cleaner** (`crawler/data_cleaner.py`): chuẩn hóa trường video, ép kiểu số, thêm trường `topic_seed`.
21. 3.4. **Graph builder** (`graph/node_builder.py`, `graph/feature_builder.py`, `graph/edge_builder.py`, `graph/graph_builder.py`): tạo node maps, encode tiêu đề bằng SentenceTransformer, dựng edge metadata + similarity, lưu `graph/video_graph.pt`.
22. 3.5. **Neo4j push** (`run_push.py`, `database/neo4j_service.py`): tạo ràng buộc, clear DB, đẩy nodes & edges vào Neo4j.
23. 3.6. **Ứng dụng người dùng** (`run_user.py`, `database/user_service.py`, `services/recommendation_service.py`): đăng ký/đăng nhập, ghi nhận WATCHED, gợi ý dựa trên đồ thị và truy vấn Cypher.
24. 
25. ## 4. Cấu trúc thư mục
26. 4.1. `config/`: cấu hình chủ đề, đường dẫn dữ liệu thô.
27. 4.2. `crawler/`: client YouTube, cleaner, crawler chính.
28. 4.3. `database/`: lớp thao tác Neo4j (graph & user).
29. 4.4. `graph/`: builder nodes, edges, features, graph tổng.
30. 4.5. `services/`: dịch vụ gợi ý.
31. 4.6. `utils/`: hàm trợ giúp `time_bucket`.
32. 4.7. `run_graph.py`, `run_push.py`, `run_user.py`: entry points cho từng bước pipeline.
33. 4.8. `cookies.txt`: file cookie yt-dlp (không dùng trong code hiện tại).
34. 
35. ## 5. Cấu hình chi tiết (`config/config.py`)
36. 5.1. Thuộc tính `TOPICS`: 5 seed topic (“vietnam travel documentary”, “street food vietnam”, “coffee brewing tutorial”, “wildlife documentary”, “machine learning basics”).
37. 5.2. `TARGET_SIZE`: 1000 – số video mục tiêu sau khi mở rộng kênh.
38. 5.3. `RAW_DATA_PATH`: đường dẫn output cho dữ liệu thô JSON.
39. 5.4. Khuyến nghị mở rộng: thêm tham số `MAX_RESULTS_PER_TOPIC`, `CHANNEL_EXPAND_LIMIT`, `SLEEP_TIME`.
40. 
41. ## 6. Thành phần Crawler
42. 6.1. **YouTubeClient (`crawler/youtube_client.py`)**
43. 6.1.1. Dựa trên YouTube Data API v3, endpoint `search` và `videos`.
44. 6.1.2. Phương thức `search_videos(query, max_results=40)`: trả về danh sách videoId theo truy vấn, order=relevance.
45. 6.1.3. Phương thức `get_video_details(video_ids)`: lấy `snippet, contentDetails, statistics` cho list IDs.
46. 6.1.4. Phương thức `get_channel_videos(channel_id, max_results=20)`: tìm video mới nhất trong kênh, order=date.
47. 6.1.5. Quản lý lỗi: `_get` raise Exception khi HTTP !=200; cần retry/backoff thực tế.
48. 6.1.6. Bảo mật: yêu cầu `YOUTUBE_API_KEY` trong `.env`.
49. 
50. 6.2. **DataCleaner (`crawler/data_cleaner.py`)**
51. 6.2.1. Hàm `clean_video(item, topic_seed)`: chuẩn hóa dict video.
52. 6.2.2. Trích trường: id, title, description, channel_id/title, category_id, tags, published_at, duration, view/like/comment counts.
53. 6.2.3. Ép kiểu int cho view_count, like_count, comment_count.
54. 6.2.4. Gán `topic_seed` để truy vết nguồn.
55. 6.2.5. Nâng cấp đề xuất: chuẩn hóa ISO8601 duration → giây; chuẩn hóa timezone; xử lý missing fields.
56. 
57. 6.3. **VideoCrawler (`crawler/video_crawler.py`)**
58. 6.3.1. Thuộc tính: `topics`, `target_size`, `all_videos` (dict id→video), `channel_seen` (set).
59. 6.3.2. Khởi tạo output path `data/raw/crawled_data.json`, tạo thư mục nếu chưa có.
60. 6.3.3. `_fetch_and_clean(video_ids, topic)`: gọi YouTubeClient, loop items, gọi DataCleaner.
61. 6.3.4. `crawl_seed()`: với mỗi topic seed, search → fetch/clean → lưu vào `all_videos`; sleep 1s để tránh quota burst.
62. 6.3.5. `expand_channels()`: lấy danh sách channel từ seed; bỏ qua kênh đã xử lý; dừng nếu đủ `target_size`; search video mới nhất từng kênh; sleep 0.5s.
63. 6.3.6. `save()`: ghi list(all_videos.values()) vào JSON indent=2 UTF-8.
64. 6.3.7. `run()`: thực thi seed → expand → save.
65. 6.3.8. Điểm cải tiến:
66. 6.3.8.1. Thêm logging chuẩn (structlog/logging).
67. 6.3.8.2. Thêm quota tracking và exponential backoff khi 403/429.
68. 6.3.8.3. Giới hạn số video mỗi kênh, tránh kênh lớn lấn át.
69. 6.3.8.4. Lưu checkpoint để resume khi dở dang.
70. 6.3.8.5. Song song hóa (asyncio, multiprocessing) nếu quota cho phép.
71. 
72. ## 7. Tiền xử lý dữ liệu
73. 7.1. Định dạng JSON đầu ra: mỗi phần tử là một video đã làm sạch với các trường dòng 52-55.
74. 7.2. Chuẩn hóa thời gian: published_at giữ ISO8601; chưa tách timezone.
75. 7.3. Duration: giữ dạng ISO8601 (“PT#M#S”); cần hàm chuyển sang giây nếu dùng cho mô hình.
76. 7.4. Tags: danh sách string, convert lower tại EdgeBuilder khi tạo map.
77. 7.5. Category: dùng category_id thô; cần ánh xạ id→tên nếu muốn hiển thị.
78. 7.6. Thiếu dữ liệu: nếu không có stats/tags sẽ thành giá trị mặc định (0 hoặc []).
79. 
80. ## 8. Builder Node & Feature
81. 8.1. **NodeBuilder (`graph/node_builder.py`)**
82. 8.1.1. Đọc JSON data_path.
83. 8.1.2. Tạo danh sách `video_ids`, `titles`.
84. 8.1.3. `channel_map`: dict channel_id→index; `tag_map`: tag lower→index; `category_map`: category_id→index; `time_map`: bucket→index.
85. 8.1.4. Hàm `time_bucket` (utils/helpers.py): year>=2024→recent; >=2022→mid; else old.
86. 8.1.5. Trả về dict node_data gồm videos, maps, titles, video_ids.
87. 
88. 8.2. **FeatureBuilder (`graph/feature_builder.py`)**
89. 8.2.1. Dùng SentenceTransformer “all-MiniLM-L6-v2” để encode tiêu đề → embedding (float32 tensor).
90. 8.2.2. Hàm `build_video_features(titles)`: encode với progress bar.
91. 8.2.3. Hàm `build_dummy_features(size)`: tensor ones (size,1) cho Channel/Tag/Category/Time.
92. 8.2.4. Đề xuất: caching embedding, batch size cấu hình, GPU/CPU auto-detect.
93. 
94. ## 9. Builder Edge
95. 9.1. **EdgeBuilder (`graph/edge_builder.py`)**
96. 9.1.1. Nhận node_data, giữ maps và danh sách videos.
97. 9.1.2. `build_metadata_edges(data)`:
98. 9.1.2.1. Video→Channel (uploaded_by): từ video_map & channel_map.
99. 9.1.2.2. Video→Tag (has_tag): duyệt tags lower, chỉ tạo nếu tag tồn tại trong tag_map.
100. 9.1.2.3. Video→Category (in_category): map category_id.
101. 9.1.2.4. Video→Time (published_in): bucket hóa năm.
102. 9.1.3. `build_similarity_edges(embeddings, threshold=0.8)`:
103. 9.1.3.1. Tính cosine_similarity pairwise.
104. 9.1.3.2. Tạo cạnh (i,j) nếu sim>0.8; bỏ qua tự nối; một chiều (i<j).
105. 9.1.3.3. Trả tensor [2, E] hoặc None nếu không có cạnh.
106. 9.1.4. Cải tiến: dùng top-k per node, sparse sim, faiss, chuẩn hóa L2 trước tính sim.
107. 9.1.5. Cân nhắc ngưỡng động theo phân vị.
108. 
109. ## 10. GraphBuilder tổng (`graph/graph_builder.py`)
110. 10.1. Khởi tạo HeteroData.
111. 10.2. Xây node_data qua NodeBuilder.
112. 10.3. Gán feature video_x = embedding tiêu đề; các node khác = ones.
113. 10.4. Tạo metadata_edges → gán edge_index cho từng loại quan hệ.
114. 10.5. Tạo similarity_edges → gán edge_index (“video”,“similar_to”,“video”) nếu có.
115. 10.6. Lưu graph thành `graph/video_graph.pt` (torch.save).
116. 10.7. In thống kê đồ thị.
117. 10.8. Cải tiến:
118. 10.8.1. Chuẩn hóa thuộc tính nút (view_count, like_count) làm feature số.
119. 10.8.2. Hỗ trợ bipartite collapse hoặc projection nếu cần.
120. 10.8.3. Lưu metadata (maps) kèm graph để dùng lại khi push Neo4j.
121. 
122. ## 11. Neo4j layer
123. 11.1. **Neo4jGraphService (`database/neo4j_service.py`)**
124. 11.1.1. Kết nối qua GraphDatabase.driver(uri, auth).
125. 11.1.2. `clear_database()`: MATCH (n) DETACH DELETE n.
126. 11.1.3. `create_constraints()`: tạo các constraint UNIQUE cho label Video/Channel/Tag/Category/Time/User trên thuộc tính `id` (hoặc username).
127. 11.1.4. `push_graph(graph)`: 
128. 11.1.4.1. Tạo node Video, Channel, Tag, Category, Time với id 0..num_nodes-1.
129. 11.1.4.2. Hàm create_edges(edge_index, rel, src_label, dst_label) cho từng quan hệ.
130. 11.1.4.3. Hỗ trợ cạnh SIMILAR_TO nếu tồn tại trong edge_types.
131. 11.1.5. In log từng bước.
132. 11.2. Lưu ý: `graph["video"].num_nodes` phụ thuộc maps; cần đồng bộ id với dữ liệu Video thực (video_id gốc). Hiện push dùng chỉ số index, không phải video_id string → có độ lệch với RecommendationService (dùng rec.id). Cần chỉnh để lưu video_id thực.
133. 
134. ## 12. User & Recommendation layer
135. 12.1. **UserService (`database/user_service.py`)**
136. 12.1.1. Hash mật khẩu bằng SHA256 (không salt).
137. 12.1.2. `register(username,password)`: MERGE User, set password lần đầu.
138. 12.1.3. `login(...)`: MATCH user với username & hashed password, trả True/False.
139. 12.1.4. `add_watch(username, video_id)`: MERGE quan hệ WATCHED từ User đến Video (theo id số).
140. 12.1.5. Cải tiến bảo mật: dùng bcrypt + salt; kiểm tra trùng username, quản lý phiên; tránh lưu mật khẩu thuần hash không salt.
141. 
142. 12.2. **RecommendationService (`services/recommendation_service.py`)**
143. 12.2.1. Cypher:
144. ```
145. MATCH (u:User {username:$username})-[:WATCHED]->(v:Video)
146. MATCH (v)-[:HAS_TAG|IN_CATEGORY|SIMILAR_TO]->(rec:Video)
147. WHERE NOT (u)-[:WATCHED]->(rec) AND v <> rec
148. RETURN rec.id AS video_id, COUNT(*) AS score
149. ORDER BY score DESC
150. LIMIT $limit
151. ```
152. 12.2.2. Logic: đếm số đường dẫn từ video đã xem đến video rec qua tag/category/similarity.
153. 12.2.3. Giới hạn: không dùng trọng số; không cá nhân hóa theo thời gian; phụ thuộc id số Neo4j (khác video_id gốc).
154. 
155. 12.3. **Ứng dụng CLI (`run_user.py`)**
156. 12.3.1. Menu: Register / Login / Exit.
157. 12.3.2. Sau login: Watch video (nhập id 0-1005), Recommend, Logout.
158. 12.3.3. Kết nối Neo4jGraphService với URI=bolt://localhost:7687, user neo4j, pass 12345678.
159. 12.3.4. Cải tiến UI: validate input, auto gợi ý tên video, hiển thị top-k với tiêu đề.
160. 
161. ## 13. Entry points
162. 13.1. `run_graph.py`: build graph từ `data/raw/crawled_data.json`, lưu `graph/video_graph.pt`.
163. 13.2. `run_push.py`: load graph, clear DB, tạo constraints, push nodes/edges.
164. 13.3. `run_user.py`: ứng dụng CLI người dùng.
165. 
166. ## 14. Luồng dữ liệu chi tiết (end-to-end)
167. 14.1. Bước 1: Thiết lập `.env` với `YOUTUBE_API_KEY`.
168. 14.2. Bước 2: Chạy `VideoCrawler.run()` → sinh `data/raw/crawled_data.json`.
169. 14.3. Bước 3: Chạy `python run_graph.py` → tạo `graph/video_graph.pt`.
170. 14.4. Bước 4: Chạy `python run_push.py` → đẩy graph vào Neo4j.
171. 14.5. Bước 5: Chạy `python run_user.py` → tương tác người dùng (đăng ký, xem, gợi ý).
172. 
173. ## 15. Sơ đồ logic (diễn giải)
174. 15.1. Crawler: TOPIC → search → ids → details → clean → all_videos.
175. 15.2. Expand: từ channel_id seed → search newest → details → merge.
176. 15.3. NodeBuilder: sinh map & danh sách.
177. 15.4. FeatureBuilder: encode titles → video_x.
178. 15.5. EdgeBuilder: metadata edges + similarity.
179. 15.6. GraphBuilder: gán node/edge/feature → lưu pt.
180. 15.7. Neo4jService: clear → constraints → push nodes → push edges.
181. 15.8. UserService: register/login/watch.
182. 15.9. RecommendationService: Cypher truy vấn gợi ý.
183. 
184. ## 16. Phân tích dữ liệu thô
185. 16.1. Trường bắt buộc: video_id, title, description, channel_id, published_at.
186. 16.2. Trường thống kê: view_count, like_count, comment_count.
187. 16.3. Độ phủ tags: phụ thuộc API; cần kiểm tra tỉ lệ missing.
188. 16.4. Category_id: số; cần ánh xạ bằng `videoCategories.list`.
189. 16.5. topic_seed: phân biệt nguồn tạo.
190. 
191. ## 17. Ràng buộc & nhất quán dữ liệu
192. 17.1. Neo4j constraint hiện dùng thuộc tính `id`; song dữ liệu Video có key `video_id`. Cần đồng bộ để tránh mismatch.
193. 17.2. Khi push graph, id=chỉ số; RecommendationService truy vấn `rec.id` → phải trùng chỉ số. Nếu muốn dùng video_id thật, cần thay đổi GraphBuilder & push_graph để lưu `videoId`.
194. 17.3. WATCHED dùng `video_id` số; cần UI map số→tiêu đề.
195. 
196. ## 18. Hiệu năng & tối ưu
197. 18.1. Crawling: giới hạn quota API; nên batch detail (50 ids/lần).
198. 18.2. Embedding: dùng GPU nếu có; batch size ~64-256.
199. 18.3. Cosine similarity O(n^2); nên dùng ANN (faiss) hoặc top-k để giảm chi phí với n>10k.
200. 18.4. Neo4j push: hiện chạy tuần tự; có thể dùng UNWIND cho batch edges.
201. 18.5. I/O: JSON 1000 video nhỏ; vẫn ok.
202. 
203. ## 19. Bảo mật
204. 19.1. API key lưu trong .env, không commit.
205. 19.2. Mật khẩu user: SHA256 không salt → dễ tấn công từ điển; cần bcrypt/argon2.
206. 19.3. Không có rate-limit login; cần thêm.
207. 19.4. Cookie file chứa thông tin nhạy cảm; cần loại khỏi repo công khai.
208. 
209. ## 20. Khả năng mở rộng
210. 20.1. Thêm nguồn dữ liệu khác (shorts, playlists, trending).
211. 20.2. Thêm đặc trưng: mô tả, tag embedding, thumbnail CLIP.
212. 20.3. Thêm GNN: GraphSAGE/HGT để học biểu diễn.
213. 20.4. Triển khai REST/gRPC phục vụ gợi ý online.
214. 20.5. Lưu lịch sử tương tác thời gian thực để cập nhật trọng số.
215. 
216. ## 21. Kiểm thử
217. 21.1. Unit test cho cleaner, time_bucket, similarity threshold.
218. 21.2. Integration test: chạy crawler mock API, build graph nhỏ.
219. 21.3. E2E test: crawl→build→push→recommend với dataset toy.
220. 
221. ## 22. Logging & Monitoring
222. 22.1. Thêm logger chuẩn thay vì print.
223. 22.2. Ghi thời gian crawl, số video/thất bại.
224. 22.3. Theo dõi số cạnh similarity, phân phối độ dài cạnh.
225. 22.4. Giám sát Neo4j: memory, cache, query plan.
226. 
227. ## 23. Triển khai
228. 23.1. Docker hóa: service crawler, builder, neo4j, app CLI/web.
229. 23.2. Dùng docker-compose: neo4j + api.
230. 23.3. CI: lint (ruff/flake8), test, security scan (bandit).
231. 
232. ## 24. Mô tả chi tiết từng file (theo repo)
233. 24.1. `config/config.py`: cấu hình topic, target, raw path.
234. 24.2. `crawler/youtube_client.py`: client YouTube API.
235. 24.3. `crawler/data_cleaner.py`: chuẩn hóa video object.
236. 24.4. `crawler/video_crawler.py`: điều phối crawl & expand.
237. 24.5. `database/graph_nodes.py`: phiên bản cũ hơn cho Neo4j (sử dụng videoId string); không được gọi trong pipeline chính hiện tại.
238. 24.6. `database/neo4j_service.py`: service chính push graph.
239. 24.7. `database/user_service.py`: quản lý User, WATCHED.
240. 24.8. `graph/node_builder.py`: tạo maps & lists.
241. 24.9. `graph/feature_builder.py`: tạo embedding & dummy.
242. 24.10. `graph/edge_builder.py`: tạo edges metadata & similarity.
243. 24.11. `graph/graph_builder.py`: hợp nhất node/edge/feature.
244. 24.12. `services/recommendation_service.py`: truy vấn gợi ý.
245. 24.13. `utils/helpers.py`: time_bucket.
246. 24.14. `run_graph.py`: build graph từ JSON.
247. 24.15. `run_push.py`: đẩy graph vào Neo4j.
248. 24.16. `run_user.py`: app CLI người dùng.
249. 24.17. `cookies.txt`: cookie yt-dlp (không dùng).
250. 
251. ## 25. Rủi ro & nợ kỹ thuật
252. 25.1. Mismatch id Neo4j (số) vs video_id thật → gợi ý không map sang video thật.
253. 25.2. Không lưu thông tin channel_name/tag_name khi push Neo4j (chỉ id số).
254. 25.3. Không có xử lý quota/caching API.
255. 25.4. Mật khẩu không salt.
256. 25.5. Không có migration khi thay đổi schema.
257. 
258. ## 26. Kế hoạch khắc phục (ưu tiên)
259. 26.1. Sửa GraphBuilder & push_graph để lưu thuộc tính `videoId` (string) và dùng nó trong RecommendationService.
260. 26.2. Thêm ánh xạ category_id→tên; lưu vào node Category.
261. 26.3. Áp dụng bcrypt cho mật khẩu; thêm kiểm tra username tồn tại.
262. 26.4. Thêm retry/backoff, quota guard cho crawler.
263. 26.5. Thêm logs + metrics.
264. 26.6. Bổ sung tests.
265. 
266. ## 27. Chi tiết luồng Recommendation
267. 27.1. Người dùng xem video → tạo cạnh WATCHED (User)-[:WATCHED]->(Video).
268. 27.2. Truy vấn gợi ý duyệt từ video đã xem qua cạnh HAS_TAG, IN_CATEGORY, SIMILAR_TO.
269. 27.3. Đếm số đường dẫn đến rec; sắp xếp giảm dần.
270. 27.4. Lọc bỏ video đã xem; loại tự vòng.
271. 27.5. Trả về top N id.
272. 27.6. Cải tiến: thêm trọng số theo loại cạnh (similarity cao hơn tag), theo thời gian xem, theo độ mới.
273. 
274. ## 28. Định dạng & schema đồ thị trong PyTorch Geometric
275. 28.1. Node types: video, channel, tag, category, time.
276. 28.2. Edge types: 
277. 28.2.1. (video, uploaded_by, channel) – hướng Video→Channel.
278. 28.2.2. (video, has_tag, tag) – nhiều tag/video.
279. 28.2.3. (video, in_category, category) – một category/video.
280. 28.2.4. (video, published_in, time) – bucket thời gian.
281. 28.2.5. (video, similar_to, video) – cạnh không đối xứng (chỉ i<j).
282. 28.3. Features:
283. 28.3.1. video.x: embedding 384 chiều (all-MiniLM-L6-v2).
284. 28.3.2. channel/tag/category/time.x: ones shape (n,1).
285. 28.4. Edge index tensor shape [2, E].
286. 
287. ## 29. Schema trong Neo4j (sau push)
288. 29.1. Node labels: Video(id), Channel(id), Tag(id), Category(id), Time(id), User(username).
289. 29.2. Relationships: UPLOADED_BY, HAS_TAG, IN_CATEGORY, PUBLISHED_IN, SIMILAR_TO, WATCHED.
290. 29.3. Unique constraints trên id hoặc username.
291. 29.4. Thiếu thuộc tính videoId gốc; cần bổ sung.
292. 
293. ## 30. Đề xuất Cypher bổ sung
294. 30.1. Thêm thuộc tính khi push:
295. 30.1.1. Video {id, videoId, title, viewCount, likeCount, commentCount, publishedAt, duration}.
296. 30.1.2. Channel {id, channelId, name}.
297. 30.1.3. Tag {id, name}.
298. 30.1.4. Category {id, categoryId, name}.
299. 30.2. Truy vấn top video mới:
300. ```
301. MATCH (v:Video) RETURN v ORDER BY v.publishedAt DESC LIMIT 10;
302. ```
303. 30.3. Truy vấn video theo tag:
304. ```
305. MATCH (t:Tag {name:$tag})<-[:HAS_TAG]-(v:Video) RETURN v LIMIT 20;
306. ```
307. 30.4. Gợi ý theo kênh đã xem:
308. ```
309. MATCH (u:User {username:$u})-[:WATCHED]->(v)-[:UPLOADED_BY]->(c)<-[:UPLOADED_BY]-(rec)
310. WHERE NOT (u)-[:WATCHED]->(rec) AND v<>rec
311. RETURN rec LIMIT 10;
312. ```
313. 
314. ## 31. Chất lượng dữ liệu & kiểm soát
315. 31.1. Loại bỏ video trùng lặp nhờ dict all_videos (key video_id).
316. 31.2. Chưa có lọc theo độ dài, ngôn ngữ; có thể thêm.
317. 31.3. Chưa loại bỏ video private/deleted; API search có thể trả; cần kiểm tra status.
318. 
319. ## 32. Các tham số có thể cấu hình thêm
320. 32.1. `SEARCH_MAX_RESULTS`: số video/seed.
321. 32.2. `CHANNEL_MAX_RESULTS`: số video/kênh.
322. 32.3. `SIM_THRESHOLD`: ngưỡng similarity.
323. 32.4. `EMB_MODEL_NAME`: mô hình sentence transformer.
324. 32.5. `TIME_BUCKET_RULE`: ngưỡng năm.
325. 
326. ## 33. Bảo trì & vận hành
327. 33.1. Cập nhật API quota, thay key khi hết hạn.
328. 33.2. Sao lưu Neo4j (dump) trước khi clear.
329. 33.3. Lên lịch crawl định kỳ và rebuild graph.
330. 
331. ## 34. Kịch bản ví dụ (demo)
332. 34.1. Chạy `python -m crawler.video_crawler` (cần hàm main) hoặc viết script gọi `VideoCrawler(Config.TOPICS, Config.TARGET_SIZE).run()`.
333. 34.2. Chạy `python run_graph.py`.
334. 34.3. Chạy `python run_push.py`.
335. 34.4. Chạy `python run_user.py`, đăng ký “alice”, password “secret”.
336. 34.5. Ghi WATCHED video id 0,1; chọn Recommend → nhận danh sách rec id & score.
337. 
338. ## 35. Phân tích bảo mật sâu hơn
339. 35.1. Lưu cookie yt-dlp trong repo có rủi ro rò rỉ; nên .gitignore.
340. 35.2. Không mã hóa kết nối Neo4j (bolt://); cần bật TLS trong prod.
341. 35.3. Không có phân quyền user/role; tất cả query đều mở.
342. 
343. ## 36. Quan hệ giữa các module
344. 36.1. VideoCrawler phụ thuộc YouTubeClient, DataCleaner, Config.TOPICS.
345. 36.2. GraphBuilder phụ thuộc NodeBuilder→FeatureBuilder→EdgeBuilder.
346. 36.3. Neo4jGraphService độc lập, được dùng bởi run_push và UserService/RecommendationService.
347. 36.4. RecommendationService phụ thuộc UserService để tạo WATCHED (gián tiếp).
348. 
349. ## 37. Đề xuất refactor
350. 37.1. Trích riêng `models` cho dataclass Video, Channel, Tag.
351. 37.2. Dùng pydantic để validate đầu vào crawler.
352. 37.3. Dùng config `.yaml` thay hardcode TOPICS.
353. 37.4. Thêm interface repository cho Neo4j để dễ test (mock).
354. 37.5. Chuyển CLI thành FastAPI/Flask cho front-end.
355. 
356. ## 38. Khả năng huấn luyện GNN (tương lai)
357. 38.1. Dùng HeteroData để huấn luyện HeteroGraphConv/HGT.
358. 38.2. Task: link prediction (WATCHED) hoặc recommendation ranking.
359. 38.3. Negative sampling từ video chưa xem.
360. 38.4. Feature bổ sung: thống kê view/like, embedding mô tả.
361. 38.5. Loss: BPR, InfoNCE.
362. 
363. ## 39. Kiến trúc lưu trữ và ID
364. 39.1. Hiện node id trong graph là index; cần map index→video_id khi trả kết quả.
365. 39.2. Lưu dictionary `video_index_to_id` kèm file .pt hoặc file JSON bên cạnh.
366. 39.3. Khi push Neo4j, set cả `id` (index) và `videoId` (string) để RecommendationService trả videoId thật.
367. 
368. ## 40. Theo dõi chất lượng gợi ý
369. 40.1. Thu thập implicit feedback: WATCHED, LIKE, thời lượng xem.
370. 40.2. Metric offline: HitRate@k, NDCG@k dựa trên holdout.
371. 40.3. Metric online: CTR, watch time uplift.
372. 
373. ## 41. Hướng dẫn thiết lập môi trường
374. 41.1. Tạo venv: `python -m venv .venv && source .venv/bin/activate`.
375. 41.2. Cài đặt: `pip install -r requirements.txt` (chưa có file; cần tạo).
376. 41.3. Tạo `.env` với `YOUTUBE_API_KEY=...`.
377. 41.4. Chạy Neo4j local: docker `neo4j:5` với auth neo4j/12345678 và mở bolt 7687.
378. 41.5. Tạo thư mục `data/raw`, `graph/`.
379. 
380. ## 42. File cookies và yt-dlp
381. 42.1. `cookies.txt` chứa cookie YouTube; hiện không sử dụng trong code; nên bỏ hoặc thêm .gitignore.
382. 42.2. Nếu tích hợp yt-dlp, dùng `--cookies cookies.txt` để tải video/metadata thay vì API.
383. 
384. ## 43. Chi tiết logging hiện tại
385. 43.1. Tất cả module dùng `print`.
386. 43.2. Đề xuất: thay bằng `logging` với cấu hình level, format, file handler.
387. 43.3. Thêm progress metrics (số video, kênh đã crawl, tỉ lệ lỗi).
388. 
389. ## 44. Phân tích độ phức tạp
390. 44.1. Crawler: O(T * R) với T topic, R max_results.
391. 44.2. Similarity: O(N^2) tính cosine; bottleneck khi N lớn.
392. 44.3. Push Neo4j: O(V+E) câu lệnh MERGE; chi phí mạng cao nếu không batch.
393. 
394. ## 45. Thiết kế batch cho Neo4j (đề xuất)
395. 45.1. Dùng UNWIND cho nodes:
396. ```
397. UNWIND $videos AS v
398. MERGE (n:Video {id:v.id})
399. SET n.videoId=v.videoId, n.title=v.title, ...
400. ```
401. 45.2. Tương tự cho edges.
402. 45.3. Giảm round-trip, tăng tốc đáng kể.
403. 
404. ## 46. Ràng buộc dữ liệu đề xuất
405. 46.1. Video.id UNIQUE, Channel.id UNIQUE, Tag.name UNIQUE, Category.id UNIQUE, Time.id UNIQUE, User.username UNIQUE.
406. 46.2. Index trên Video.videoId nếu thêm thuộc tính.
407. 
408. ## 47. Đường dẫn tệp quan trọng
409. 47.1. `data/raw/crawled_data.json`: output crawler.
410. 47.2. `graph/video_graph.pt`: output builder.
411. 47.3. `.env`: API key.
412. 47.4. `cookies.txt`: cookie (không dùng).
413. 
414. ## 48. Kiểm soát phiên bản & reproducibility
415. 48.1. Pin version `sentence-transformers==2.x`, `torch`, `torch-geometric`.
416. 48.2. Lưu seed random (torch.manual_seed).
417. 48.3. Ghi lại commit OID khi build graph để tái tạo.
418. 
419. ## 49. Minh họa vòng đời dữ liệu (chi tiết)
420. 49.1. `Topic -> search -> video_ids -> get_video_details -> clean -> append`.
421. 49.2. `all_videos` giữ unique bằng key video_id.
422. 49.3. Sau expand, convert dict→list → JSON.
423. 49.4. NodeBuilder đọc JSON, sinh maps.
424. 49.5. FeatureBuilder encode titles.
425. 49.6. EdgeBuilder tạo edge tensors.
426. 49.7. GraphBuilder hợp nhất → lưu .pt.
427. 49.8. run_push load .pt → tạo node/edge trong Neo4j.
428. 49.9. run_user tạo WATCHED, query gợi ý.
429. 
430. ## 50. Ràng buộc thời gian & bucket
431. 50.1. time_bucket: recent (≥2024), mid (2022–2023), old (<2022).
432. 50.2. Đề xuất tinh chỉnh: quartile theo phân phối năm, hoặc theo tháng.
433. 
434. ## 51. Công thức tính similarity
435. 51.1. cosine_similarity từ sklearn; đầu vào numpy.
436. 51.2. Ngưỡng 0.8; kết quả không đối xứng (i<j) → đồ thị vô hướng giả định.
437. 51.3. Có thể thêm cạnh đối xứng (add j->i) khi push.
438. 
439. ## 52. Mapping ID giữa các tầng (vấn đề quan trọng)
440. 52.1. GraphBuilder: video_map sử dụng index từ thứ tự video_ids.
441. 52.2. EdgeBuilder dùng index này trong edge_index.
442. 52.3. Neo4j push tạo node id=index → RecommendationService trả rec.id=index.
443. 52.4. Không ánh xạ sang video_id string → người dùng không biết tiêu đề.
444. 52.5. Giải pháp: lưu thuộc tính videoId, title khi push; sửa query trả cả title.
445. 
446. ## 53. Các bước sửa cụ thể (PR gợi ý)
447. 53.1. Thay `create_constraints` dùng `videoId` UNIQUE thay vì `id`.
448. 53.2. Khi push graph: kèm danh sách video_id, title, view_count, like_count... trong graph object (hoặc file JSON kèm).
449. 53.3. RecommendationService: MATCH (rec:Video) RETURN rec.videoId, rec.title, rec.score.
450. 53.4. UserService.add_watch: nhận videoId string, MATCH (v:Video {videoId:$id}).
451. 
452. ## 54. Định nghĩa chất lượng dữ liệu mong muốn
453. 54.1. Đủ >= TARGET_SIZE video.
454. 54.2. Không trùng video_id.
455. 54.3. Tỉ lệ video có tags >60%.
456. 54.4. Phân phối thời gian: recent/mid/old không lệch quá 80/10/10.
457. 
458. ## 55. Đề xuất quản lý cấu hình
459. 55.1. Dùng pydantic settings / dynaconf để nạp .env + .yaml.
460. 55.2. Cho phép override qua biến môi trường (TARGET_SIZE, SIM_THRESHOLD).
461. 
462. ## 56. Kiến trúc triển khai nhiều môi trường
463. 56.1. dev: Neo4j local, sample 200 video.
464. 56.2. staging: Neo4j docker, 5k video.
465. 56.3. prod: cluster Neo4j Aura, 50k video, authentication mạnh.
466. 
467. ## 57. Bản đồ phụ thuộc Python
468. 57.1. requests, python-dotenv, torch, torch_geometric, sentence-transformers, scikit-learn, tqdm, neo4j.
469. 57.2. Thiếu trong repo: requirements.txt; cần bổ sung.
470. 
471. ## 58. Hạn chế hiện tại
472. 58.1. Không có UI web.
473. 58.2. Không có pipeline CI/CD.
474. 58.3. Không caching kết quả API.
475. 58.4. Không đo lường chất lượng gợi ý.
476. 
477. ## 59. Lộ trình phát triển 3 giai đoạn
478. 59.1. Giai đoạn 1: sửa mapping id, thêm metadata khi push, bổ sung requirements, logging.
479. 59.2. Giai đoạn 2: thêm ANN similarity, batch Neo4j, bcrypt, API REST gợi ý.
480. 59.3. Giai đoạn 3: huấn luyện GNN, A/B testing gợi ý, triển khai production.
481. 
482. ## 60. Kết luận
483. 60.1. Dự án cung cấp pipeline khép kín từ crawl → graph → gợi ý.
484. 60.2. Cần ưu tiên đồng bộ ID và bảo mật để dùng thực tế.
485. 60.3. Kiến trúc mở rộng cho học máy nâng cao và phục vụ thời gian thực.
486. 
487. ---
488. ## Thành viên
489. Lưu Hoàng Phúc
490. Nguyễn Thị Sương Mai