1. # PROJECT_AI_SGROUP – TÀI LIỆU ĐẶC TẢ KỸ THUẬT CHUYÊN SÂU (PART 1)
2. 
3. > Nguồn: Notebook `Project_AI_Sgroup (3).ipynb`  
4. > Mục tiêu: mô tả chi tiết pipeline xử lý video + index + tìm kiếm bằng CLIP.  
5. > Part 1: giới thiệu, mục đích, kiến trúc tổng quan, pipeline tổng thể.  
6. 
7. ---
8. 
9. ## 1. GIỚI THIỆU DỰ ÁN
10. 
11. Dự án **Project_AI_Sgroup** là một pipeline tìm kiếm video dựa trên hình ảnh/clip, sử dụng mô hình **CLIP (clip‑ViT‑B‑32)** trong thư viện **SentenceTransformers** để:
12. - Trích xuất embedding cho các frame của video.
13. - Lưu embedding vào database (file pickle).
14. - Cho phép truy vấn sau này bằng text/image để tìm thời điểm xuất hiện trong video.
15. 
16. Notebook được thiết kế chạy trên Google Colab, tận dụng Google Drive để lưu dữ liệu video và database vector.
17. 
18. ---
19. 
20. ## 2. MỤC ĐÍCH DỰ ÁN
21. 
22. **Mục đích kỹ thuật:**
23. - Tạo hệ thống index embedding cho tập video.
24. - Giảm chi phí lưu trữ bằng cách lấy frame theo bước thời gian (ví dụ mỗi 5 giây).
25. - Áp dụng model CLIP để map hình ảnh và text vào cùng một không gian vector.
26. 
27. **Mục đích sản phẩm:**
28. - Tìm nhanh vị trí trong video mà một hình ảnh hoặc mô tả xuất hiện.
29. - Tạo nền tảng cho hệ thống tìm kiếm video thông minh (video search).
30. 
31. ---
32. 
33. ## 3. KIẾN TRÚC TỔNG QUAN
34. 
35. Pipeline của notebook chia làm 4 lớp chính:
36. 
37. 1) **Data Layer**  
38.    - Video lưu ở Google Drive: `/content/drive/MyDrive/VideoSearchProject/videos`  
39.    - Database vector lưu ở: `/content/drive/MyDrive/VideoSearchProject/database`
40. 
41. 2) **Preprocessing Layer**  
42.    - Cắt frame mỗi N giây từ video (skip_seconds=5).
43. 
44. 3) **Embedding Layer**  
45.    - Dùng `SentenceTransformer("clip-ViT-B-32")`.
46.    - Tạo vector cho từng frame.
47. 
48. 4) **Indexing/Storage Layer**  
49.    - Vector embedding được lưu vào `vectors.pkl`.
50.    - Metadata (video name + timestamp) lưu vào `metadata.pkl`.
51. 
52. ---
53. 
54. ## 4. PIPELINE TỔNG THỂ (END-TO-END)
55. 
56. Pipeline chính trong notebook:
57. 
58. 1) **Load model CLIP**  
59. 2) **Duyệt qua toàn bộ video** trong thư mục Drive  
60. 3) **Trích xuất frame** mỗi 5 giây  
61. 4) **Encode frame thành embedding**  
62. 5) **Lưu embedding + metadata** vào database  
63. 
64. ---
65. 
66. ## 5. CẤU HÌNH CHÍNH TRONG NOTEBOOK
67. 
68. Các biến quan trọng:
69. 
70. - `VIDEO_PATH = '/content/drive/MyDrive/VideoSearchProject/videos'`  
71. - `DB_PATH = '/content/drive/MyDrive/VideoSearchProject/database'`  
72. - `MODEL_NAME = 'clip-ViT-B-32'`  
73. 
74. Ý nghĩa:
75. - `VIDEO_PATH`: nơi chứa toàn bộ video cần index.
76. - `DB_PATH`: nơi lưu database vector.
77. - `MODEL_NAME`: model CLIP chuẩn.
78. 
79. ---
80. 
81. ## 6. CÁC THƯ VIỆN ĐƯỢC SỬ DỤNG
82. 
83. Notebook sử dụng:
84. - `cv2` (OpenCV): đọc video và extract frame.
85. - `glob`, `os`: duyệt file hệ thống.
86. - `torch`, `numpy`: xử lý tensor.
87. - `pickle`: lưu database.
88. - `PIL.Image`: chuyển frame thành ảnh.
89. - `sentence_transformers`: load CLIP model.
90. 
91. ---
92. 
93. ## 7. MODEL SỬ DỤNG: CLIP ViT-B-32
94. 
95. Model `clip-ViT-B-32` thuộc dòng CLIP của OpenAI.
96. - Vision encoder: ViT-B/32.
97. - Text encoder: Transformer.
98. - Embedding output ở không gian chung.
99. 
100. Lý do chọn:
101. - Model gọn, chạy ổn trên GPU Colab.
102. - Phù hợp cho embedding ảnh & text trong cùng vector space.
103. 
104. ---
105. 
106. ## 8. LOAD MODEL
107. 
108. Code trong notebook:
109. ```python
110. model = SentenceTransformer(MODEL_NAME)
111. print("Đã load xong Model!")
112. ```
113. 
114. Cơ chế:
115. - SentenceTransformers tự tải model từ HuggingFace.
116. - Nếu có GPU, tự động dùng CUDA.
117. - Nếu không, fallback CPU.
118. 
119. ---
120. 
121. ## 9. TỔNG QUAN HÀM EXTRACT_FRAMES
122. 
123. Trong notebook có hàm:
124. ```python
125. def extract_frames(video_path, skip_seconds=5):
126.     video_capture = cv2.VideoCapture(video_path)
127.     fps = int(video_capture.get(cv2.CAP_PROP_FPS))
128.     frames = []
129.     timestamps = []
130. ```
131. 
132. Mục tiêu:
133. - Lấy frame cách nhau mỗi `skip_seconds`.
134. - Giảm số lượng frame xử lý.
135. - Lưu timestamp theo giây.
136. 
137. ---
138. 
139. ## 10. LUỒNG XỬ LÝ FRAME
140. 
141. Bên trong `extract_frames`:
142. - Đọc từng frame với `video_capture.read()`.
143. - Nếu `count % (fps * skip_seconds) == 0` thì lấy frame.
144. - Convert BGR → RGB.
145. - Convert sang PIL Image.
146. - Lưu vào list `frames`.
147. - Lưu timestamp = `count / fps`.
148. 
149. ---
150. 
151. ## 11. INDEXING TOÀN BỘ VIDEO
152. 
153. Hàm chính:
154. ```python
155. def index_videos(video_folder):
156.     all_embeddings = []
157.     metadata = []
158.     video_files = glob.glob(os.path.join(video_folder, "*.mp4"))
159. ```
160. 
161. Từng video:
162. - Extract frames.
163. - Encode batch ảnh thành embedding.
164. - Lưu embedding vào list.
165. - Lưu metadata {video, time}.
166. 
167. ---
168. 
169. ## 12. EMBEDDING BATCH
170. 
171. Code:
172. ```python
173. img_emb = model.encode(images, batch_size=32, convert_to_tensor=True)
174. ```
175. 
176. Ý nghĩa:
177. - Batch size 32 tránh tràn RAM.
178. - convert_to_tensor=True giúp tận dụng GPU.
179. - Output là torch tensor.
180. 
181. Sau đó:
182. - `img_emb.cpu().numpy()` để lưu trữ.
183. 
184. ---
185. 
186. ## 13. LƯU DATABASE VECTOR
187. 
188. Sau khi index xong:
189. ```python
190. with open(f'{DB_PATH}/vectors.pkl', 'wb') as f:
191.     pickle.dump(vectors, f)
192. with open(f'{DB_PATH}/metadata.pkl', 'wb') as f:
193.     pickle.dump(meta, f)
194. ```
195. 
196. Kết quả:
197. - `vectors.pkl`: ma trận numpy shape (N, D).
198. - `metadata.pkl`: list dict với video + timestamp.
199. 
200. ---
201. 
202. ## 14. KIỂM TRA TRẠNG THÁI
203. 
204. Notebook in ra:
205. - “Tìm thấy X video.”
206. - “Đang xử lý: vid_name...”
207. - Nếu không c�� video: “Không tìm thấy video hoặc lỗi xử lý.”
208. 
209. ---
210. 
226. ## 16. KẾT NỐI GOOGLE DRIVE
227. 
228. Trong notebook, cell đầu tiên là:
229. ```
230. Connect vào Google drive
231. ```
232. 
233. Ý nghĩa:
234. - Google Colab không lưu dữ liệu lâu dài.
235. - Video dataset cần lưu ở Google Drive để không mất sau mỗi session.
236. 
237. Luồng chuẩn:
238. ```python
239. from google.colab import drive
240. drive.mount('/content/drive')
241. ```
242. 
243. Sau khi mount:
244. - `/content/drive/MyDrive/...` là thư mục của user.
245. - `VIDEO_PATH` và `DB_PATH` trỏ vào đây.
246. 
247. ---
248. 
249. ## 17. HF TOKEN WARNING
250. 
251. Notebook hiển thị warning:
252. ```
253. The secret HF_TOKEN does not exist...
254. Warning: You are sending unauthenticated requests to the HF Hub.
255. ```
256. 
257. **Ý nghĩa:**
258. - Model CLIP được tải từ HuggingFace.
259. - Không có token → tốc độ chậm, quota thấp.
260. - Nhưng vẫn tải được vì model public.
261. 
262. **Khuyến nghị production:**
263. - Tạo token tại https://huggingface.co/settings/tokens
264. - Add token vào Colab Secrets (HF_TOKEN).
265. 
266. ---
267. 
268. ## 18. LOAD MODEL: CHI TIẾT SÂU
269. 
270. Khi gọi:
271. ```python
272. model = SentenceTransformer(MODEL_NAME)
273. ```
274. 
275. Nội bộ:
276. - HuggingFace Hub tải config.
277. - Tải model weights.
278. - SentenceTransformers wrap lại CLIPModel.
279. 
280. Notebook cũng log:
281. ```
282. CLIPModel LOAD REPORT ...
283. text_model.embeddings.position_ids | UNEXPECTED
284. vision_model.embeddings.position_ids | UNEXPECTED
285. ```
286. 
287. Đây là cảnh báo bình thường vì model tải từ task khác.
288. Không ảnh hưởng đến inference.
289. 
290. ---
291. 
292. ## 19. XỬ LÝ VIDEO: FILE PATTERN
293. 
294. Code:
295. ```python
296. video_files = glob.glob(os.path.join(video_folder, "*.mp4"))
297. ```
298. 
299. Điều này có nghĩa:
300. - Chỉ đọc file .mp4.
301. - Nếu dataset có .avi hoặc .mkv → sẽ bị bỏ qua.
302. 
303. Khuyến nghị:
304. - Thêm các pattern khác:
305.   - `"*.avi"`, `"*.mkv"`, `"*.mov"`.
306. 
307. ---
308. 
309. ## 20. CẤU TRÚC METADATA
310. 
311. Mỗi frame được lưu metadata dạng:
312. ```python
313. {"video": vid_name, "time": round(t, 2)}
314. ```
315. 
316. Ý nghĩa:
317. - `video`: tên file video gốc.
318. - `time`: giây xuất hiện frame.
319. 
320. Ví dụ:
321. ```
322. {"video": "movie1.mp4", "time": 35.0}
323. ```
324. 
325. Khi truy vấn (phần chưa có trong notebook):
326. - Dùng metadata để biết frame nào khớp.
327. - Dùng `video + time` để jump vào video.
328. 
329. ---
330. 
331. ## 21. CẤU TRÚC VECTOR DATABASE
332. 
333. File `vectors.pkl`:
334. - Numpy array shape `(N, D)`.
335. - N = số frame tổng.
336. - D = chiều embedding (CLIP ViT-B-32 = 512).
337. 
338. File `metadata.pkl`:
339. - List length N.
340. - Mỗi phần tử tương ứng 1 vector.
341. 
342. Tương quan 1‑1:
343. - `vectors[i]` ↔ `metadata[i]`.
344. 
345. ---
346. 
347. ## 22. CHI TIẾT HÀM index_videos
348. 
349. Hàm:
350. ```python
351. def index_videos(video_folder):
352.     all_embeddings = []
353.     metadata = []
354. ```
355. 
356. Bên trong:
357. - Duyệt video_files.
358. - Với mỗi video:
359.   - `images, times = extract_frames(...)`
360.   - `img_emb = model.encode(...)`
361.   - `all_embeddings.append(img_emb.cpu().numpy())`
362.   - Append metadata cho mỗi timestamp.
363. 
364. Sau cùng:
365. - Nếu có embeddings → dùng `np.vstack`.
366. - Nếu không → return None.
367. 
368. ---
369. 
370. ## 23. BATCH SIZE 32
371. 
372. Lý do chọn batch size 32:
373. - Không quá lớn gây out‑of‑memory.
374. - Không quá nhỏ làm chậm.
375. 
376. Nếu GPU mạnh hơn:
377. - Có thể tăng batch size 64/128.
378. 
379. Nếu CPU:
380. - Giảm batch size 8 hoặc 4 để tránh RAM overflow.
381. 
382. ---
383. 
384. ## 24. ĐIỂM NGHẼN HIỆU NĂNG
385. 
386. - Extract frame bằng OpenCV khá chậm.
387. - Encoding CLIP cũng tốn GPU.
388. - Số frame lớn → tăng thời gian.
389. 
390. Khuyến nghị tối ưu:
391. - Tăng `skip_seconds`.
392. - Dùng multiprocessing.
393. - Cache frame tạm.
394. 
395. ---
396. 
397. ## 25. XỬ LÝ LỖI NẾU KHÔNG CÓ VIDEO
398. 
399. Notebook hiện in:
400. - “Không tìm thấy video hoặc lỗi xử lý.”
401. 
402. Điều này xảy ra khi:
403. - `video_files` rỗng.
404. - Folder trống hoặc sai đường dẫn.
405. - Không có file .mp4.
406. 
407. ---
408. 
409. ## 26. LƯU TRỮ VÀ PHỤC HỒI DATABASE
410. 
411. Khi lưu bằng pickle:
412. - Lần sau có thể load lại thay vì index lại.
413. - Giảm thời gian chạy notebook.
414. 
415. Load lại:
416. ```python
417. with open(f'{DB_PATH}/vectors.pkl', 'rb') as f:
418.     vectors = pickle.load(f)
419. with open(f'{DB_PATH}/metadata.pkl', 'rb') as f:
420.     meta = pickle.load(f)
421. ```
439. ## 28. CƠ CHẾ TÌM KIẾM THEO EMBEDDING (LOGIC ĐỀ XUẤT)
440. 
441. Notebook hiện tại mới dừng ở bước **indexing**.  
442. Để tìm kiếm video theo mô tả, pipeline truy vấn chuẩn sẽ gồm:
443. 
444. 1) Nhập query (text hoặc image).
445. 2) Encode query bằng chính model CLIP.
446. 3) Tính cosine similarity giữa query embedding và toàn bộ vectors.
447. 4) Chọn top‑K kết quả có similarity cao nhất.
448. 5) Dùng metadata để trả về video + timestamp.
449. 
450. ---
451. 
452. ## 29. COSINE SIMILARITY – CHUẨN TOÁN HỌC
453. 
454. Cosine similarity giữa hai vector A và B:
455. ```
456. cosine = (A · B) / (||A|| * ||B||)
457. ```
458. 
459. Ý nghĩa:
460. - cosine = 1 → rất giống nhau.
461. - cosine = 0 → không liên quan.
462. - cosine < 0 → đối lập (hiếm gặp với CLIP).
463. 
464. Trong SentenceTransformers có thể dùng:
465. ```python
466. from sentence_transformers import util
467. scores = util.cos_sim(query_emb, vectors)
468. ```
469. 
470. ---
471. 
472. ## 30. QUERY THEO TEXT
473. 
474. Nếu query là text:
475. ```python
476. query_emb = model.encode(["a person cooking"], convert_to_tensor=True)
477. scores = util.cos_sim(query_emb, torch.tensor(vectors))
478. top_k = torch.topk(scores, k=5)
479. ```
480. 
481. Sau đó:
482. - Lấy `top_k.indices`.
483. - Map sang metadata để ra `video` + `time`.
484. 
485. ---
486. 
487. ## 31. QUERY THEO IMAGE
488. 
489. Nếu query là ảnh:
490. ```python
491. query_emb = model.encode([pil_image], convert_to_tensor=True)
492. ```
493. 
494. Vì CLIP hỗ trợ ảnh và text trong cùng không gian, pipeline tương tự text query.
495. 
496. ---
497. 
498. ## 32. TRẢ KẾT QUẢ TÌM KIẾM
499. 
500. Kết quả gợi ý nên gồm:
501. - video file name
502. - timestamp (seconds)
503. - similarity score
504. 
505. Ví dụ:
506. ```
507. [
508.   {"video": "vid1.mp4", "time": 35.0, "score": 0.78},
509.   {"video": "vid2.mp4", "time": 120.0, "score": 0.72}
510. ]
511. ```
512. 
513. ---
514. 
515. ## 33. VẤN ĐỀ HIỆU NĂNG KHI VECTOR LỚN
516. 
517. Nếu dataset có hàng triệu frame:
518. - Tính cosine similarity toàn bộ là O(N*D).
519. - Rất chậm trên CPU.
520. 
521. Giải pháp:
522. - Dùng FAISS để làm Approximate Nearest Neighbor.
523. - Lưu vectors trong HNSW index.
524. - Chia nhỏ theo video hoặc theo chủ đề.
525. 
526. ---
527. 
528. ## 34. ĐỀ XUẤT FAISS INDEX
529. 
530. Pipeline FAISS:
531. ```python
532. import faiss
533. index = faiss.IndexFlatIP(512)  # inner product (cosine)
534. faiss.normalize_L2(vectors)
535. index.add(vectors)
536. ```
537. 
538. Query:
539. ```python
540. faiss.normalize_L2(query_vec)
541. D, I = index.search(query_vec, k=5)
542. ```
543. 
544. Lợi ích:
545. - Tốc độ query rất nhanh.
546. - Có thể scale tới millions vector.
547. 
548. ---
549. 
550. ## 35. PRODUCTION PIPELINE ĐỀ XUẤT
551. 
552. Một pipeline production nên chia thành 3 service:
553. 
554. **(A) Indexing Service**
555. - Chạy batch.
556. - Extract frames + encode.
557. - Update database vector.
558. 
559. **(B) Query Service**
560. - Nhận text/image query.
561. - Tính vector.
562. - Truy vấn index.
563. - Trả kết quả JSON.
564. 
565. **(C) Storage Service**
566. - Lưu video gốc (S3 hoặc GCS).
567. - Lưu metadata + index.
568. 
569. ---
570. 
571. ## 36. DEPLOYMENT CHO GOOGLE CLOUD / AWS
572. 
573. - Indexing chạy bằng batch job (Cloud Run / EC2).
574. - Query service chạy bằng FastAPI + GPU nếu cần encode nhanh.
575. - Vector DB có thể dùng FAISS hoặc Milvus.
576. 
577. ---
578. 
579. ## 37. BẢO TRÌ DATABASE
580. 
581. Khi có video mới:
582. - Extract frames.
583. - Encode.
584. - Append vectors vào index.
585. - Append metadata.
586. 
587. Nếu dùng FAISS:
588. - Phải update index và lưu lại.
589. - Có thể dùng FAISS + IVF để hỗ trợ incremental.
590. 
591. ---
592. 
593. ## 38. CHUẨN HÓA TIMESTAMP
594. 
595. Timestamp hiện lấy `round(t, 2)`:
596. - Độ chính xác 0.01s.
597. - Nếu cần chính xác hơn có thể tăng.
598. 
599. Dùng timestamp để:
600. - Seek video khi hiển thị UI.
601. - Tạo link dạng `video.mp4#t=35`.
602. 
603. ---
604. 
605. ## 39. UI QUERY GỢI Ý
606. 
607. Gợi ý giao diện:
608. - User nhập text (ví dụ “cooking in kitchen”).
609. - Hệ thống trả danh sách kết quả.
610. - Hiển thị thumbnail + nút “jump to timestamp”.
611. 
612. ---
613. 
614. ## 40. GỢI Ý BỔ SUNG: LƯU THUMBNAIL
615. 
616. Khi index frame:
617. - Có thể lưu ảnh thumbnail.
618. - Lưu vào storage kèm timestamp.
619. - Hiển thị thumbnail khi query.
620. 
621. ---
622. 
623. ## 41. CHUẨN HOÁ FRAME RATE
624. 
625. Nếu video có FPS khác nhau:
626. - Timestamp vẫn chuẩn vì count / fps.
627. - Nhưng số frame được lấy phụ thuộc fps.
628. - Có thể gây bias nếu video fps cao.
629. 
630. Giải pháp:
631. - Luôn lấy theo thời gian (skip_seconds) là ổn.
632. - Không phụ thuộc fps tuyệt đối.
633. 
634. ---
648. ---
649. 
650. ## 43. TRIỂN KHAI PRODUCTION – KIẾN TRÚC ĐỀ XUẤT
651. 
652. Để triển khai sản phẩm tìm kiếm video dựa trên CLIP embedding, kiến trúc nên gồm:
653. 
654. **1) Video Storage Layer**
655. - Lưu video gốc trên S3 / GCS.
656. - Metadata video lưu trong database (PostgreSQL / Firestore).
657. 
658. **2) Indexing Worker**
659. - Chạy batch job khi có video mới.
660. - Extract frames, encode, update vector DB.
661. 
662. **3) Vector Database**
663. - FAISS (local) hoặc Milvus/Weaviate (distributed).
664. - Lưu embedding + ID.
665. 
666. **4) Query API**
667. - FastAPI / Flask.
668. - Nhận text/image query.
669. - Encode query bằng CLIP.
670. - Search in vector DB.
671. - Trả kết quả JSON.
672. 
673. ---
674. 
675. ## 44. DEPLOYMENT FLOW CHUẨN
676. 
677. 1) Upload video vào Storage.
678. 2) Trigger index worker (Celery / Cloud Run job).
679. 3) Worker cập nhật vectors + metadata.
680. 4) Query API sẵn sàng nhận yêu cầu.
681. 
682. ---
683. 
684. ## 45. MONITORING & LOGGING
685. 
686. Production nên ghi log:
687. - Số video được index.
688. - Thời gian xử lý mỗi video.
689. - Số frame trích xuất.
690. - Thời gian encode.
691. 
692. Monitoring nên có:
693. - CPU/GPU usage.
694. - Memory usage (embedding có thể lớn).
695. - Response latency của query API.
696. 
697. ---
698. 
699. ## 46. CHI PHÍ & TỐI ƯU
700. 
701. Chi phí chính:
702. - GPU cho encoding (indexing).
703. - Lưu trữ video & embedding.
704. - Query compute.
705. 
706. Tối ưu:
707. - Tăng skip_seconds để giảm số frame.
708. - Dùng batch encoding.
709. - Cache query embedding nếu query lặp.
710. 
711. ---
712. 
713. ## 47. BẢO MẬT
714. 
715. - API cần auth token/JWT.
716. - Không public query endpoint nếu không cần.
717. - Hạn chế upload file độc hại.
718. 
719. ---
720. 
721. ## 48. SCALING STRATEGY
722. 
723. Khi dataset lớn:
724. - Dùng FAISS IVF + HNSW.
725. - Phân vùng index theo category.
726. - Scale query API theo autoscaling.
727. 
728. ---
729. 
730. ## 49. KỊCH BẢN TRIỂN KHAI END‑TO‑END
731. 
732. **Bước 1:** Chuẩn bị video dataset trong S3.  
733. **Bước 2:** Chạy indexing worker → sinh vector DB.  
734. **Bước 3:** Deploy query API.  
735. **Bước 4:** UI gọi query API.  
736. **Bước 5:** Người dùng nhận kết quả với timestamp.  
737. 
738. ---
739. 
740. ## 50. KẾT LUẬN
741. 
742. Notebook Project_AI_Sgroup (3) là nền tảng để:
743. - Xây dựng hệ thống tìm kiếm video theo nội dung.
744. - Dùng CLIP embedding để map text/image vào cùng không gian.
745. - Hỗ trợ tìm kiếm thông minh theo thời điểm trong video.
746. 
747. Với các mở rộng production (FAISS + API), hệ thống có thể scale lên hàng triệu video.
748. ## 51 Thành viên
749. Hà Đức Kiên
750. Huỳnh Thảo Nhi