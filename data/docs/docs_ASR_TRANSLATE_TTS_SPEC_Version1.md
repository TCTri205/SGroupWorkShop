1. # ASR_Translate_TTS – TÀI LIỆU ĐẶC TẢ KỸ THUẬT CHUYÊN SÂU (PART 1)
2. 
3. > Repo: `ASR_Translate_TTS`  
4. > Mục tiêu: mô tả cực kỳ chi tiết và chính xác về kiến trúc, pipeline, model, huấn luyện, inference, và triển khai production.  
5. > Lưu ý: Part 1 mô tả tổng quan, mục tiêu, kiến trúc, và pipeline tổng thể.  
6. 
7. ---
8. 
9. ## 1. GIỚI THIỆU DỰ ÁN
10. 
11. **ASR_Translate_TTS** là một hệ thống xử lý tiếng nói đầu-cuối (end‑to‑end) bao gồm 3 nhiệm vụ chính:
12. 1) **ASR (Automatic Speech Recognition)** – chuyển giọng nói thành văn bản.  
13. 2) **Translation** – dịch văn bản (ví dụ en → vi).  
14. 3) **TTS (Text‑to‑Speech)** – chuyển văn bản thành giọng nói tổng hợp.  
15. 
16. Điểm khác biệt của repo này là nó không chỉ chứa mã inference, mà còn bao gồm:
17. - Pipeline **tiền xử lý dữ liệu** quy mô lớn (Modal volumes).
18. - Pipeline **huấn luyện Whisper bằng QLoRA** trên GPU T4.
19. - **Hạ tầng inference** chạy trên Modal (batch + streaming + real‑time server).
20. - Script **download checkpoint** từ Modal về local.
21. - Các notebook hỗ trợ đào tạo TTS và translation model.
22. 
23. Mục tiêu của hệ thống là xây dựng một **sản phẩm âm thanh thông minh**:
24. - Nhận đầu vào là file audio / video.
25. - Trả về transcript (tiếng nói đã được nhận dạng).
26. - Có thể dịch transcript sang ngôn ngữ khác.
27. - Có thể tổng hợp lại thành giọng nói mới (TTS).
28. - Hỗ trợ cả batch, realtime (WebSocket), và API inference.
29. 
30. ---
31. 
32. ## 2. MỤC ĐÍCH DỰ ÁN
33. 
34. **Mục đích kỹ thuật:**
35. - Tạo một pipeline hoàn chỉnh từ **data → training → inference**.
36. - Áp dụng **Whisper + QLoRA** để fine‑tune hiệu quả trên GPU nhỏ.
37. - Đảm bảo inference nhanh, tối ưu chi phí bằng Modal.
38. - Tách bạch rõ ràng giữa preprocessing, training, inference và evaluation.
39. 
40. **Mục đích sản phẩm:**
41. - Cung cấp nền tảng ASR chất lượng cao cho tiếng Anh (và có khả năng mở rộng đa ngôn ngữ).
42. - Cho phép tích hợp nhanh vào ứng dụng dịch và tổng hợp giọng nói.
43. - Hỗ trợ realtime transcription cho các ứng dụng live (streaming).
44. 
45. ---
46. 
47. ## 3. KIẾN TRÚC TỔNG THỂ (HIGH‑LEVEL ARCHITECTURE)
48. 
49. Kiến trúc hệ thống được chia thành 5 lớp chính:
50. 
51. **(A) Data Layer (Raw + Processed)**
52. - Raw audio: lưu trong Modal volume `asr-raw-data`.
53. - Raw subtitles: lưu trong Modal volume `asr-raw-data` (thư mục subtitles).
54. - Processed segments: lưu trong Modal volume `asr-processed-data`.
55. - Checkpoints: lưu trong Modal volume `asr-checkpoints`.
56. 
57. **(B) Preprocessing Layer**
58. - Cắt audio thành segments theo VTT.
59. - Làm sạch transcript.
60. - Normalize audio.
61. - Tạo dataset JSON train/val/test.
62. 
63. **(C) Training Layer**
64. - Fine‑tune Whisper bằng QLoRA.
65. - Lưu LoRA adapter thay vì full model.
66. - Resume từ checkpoint tự động.
67. 
68. **(D) Inference Layer**
69. - Batch inference (Modal ASGI app).
70. - Realtime inference (FastAPI + WebSocket).
71. - Local server (load checkpoint từ local).
72. - Modal function (RPC style).
73. 
74. **(E) Evaluation Layer**
75. - Đánh giá pretrained vs finetuned.
76. - Tính WER, CER.
77. 
78. ---
79. 
80. ## 4. CẤU TRÚC THƯ MỤC CHÍNH
81. 
82. ```
83. ASR_Translate_TTS/
84. ├── inference/
85. │   ├── download_checkpoint.py
86. │   ├── local_server.py
87. │   ├── modal_batch.py
88. │   ├── modal_fn.py
89. │   ├── modal_server.py
90. │   └── modal_streaming.py
91. ├── preprocessing/
92. │   ├── audio_segmenter.py
93. │   ├── dataset_splitter.py
94. │   ├── modal_preprocess.py
95. │   ├── text_normalizer.py
96. │   └── vtt_parser.py
97. ├── training/
98. │   └── whisper_finetune/
99. │       ├── dataset.py
100. │       ├── modal_train.py
101. │       ├── model.py
102. │       └── config.yaml
103. ├── evaluation/
104. │   ├── modal_eval.py
105. │   └── modal_pretrained_eval.py
106. ├── utils/
107. │   ├── audio_utils.py
108. │   └── text_utils.py
109. ├── notebooks/
110. │   └── m2m100_lora.ipynb
111. └── VITS_Vietnamese_LongForm_Colab (1).ipynb
112. ```
113. 
114. ---
115. 
116. ## 5. PIPELINE TỔNG THỂ (END‑TO‑END FLOW)
117. 
118. Pipeline đầy đủ chạy theo thứ tự:
119. 
120. 1) **Raw data ingest**  
121.    - Audio `.wav` + subtitle `.vtt` được đưa vào `asr-raw-data` volume.  
122. 
123. 2) **Preprocessing**  
124.    - `modal_preprocess.py` chạy trên Modal: cắt audio thành segments.  
125.    - Sinh JSON `train.json`, `val.json`, `test.json`.  
126. 
127. 3) **Training**  
128.    - `modal_train.py` chạy QLoRA trên Whisper-small.  
129.    - Lưu checkpoint vào volume `asr-checkpoints`.  
130. 
131. 4) **Evaluation**  
132.    - So sánh pretrained vs finetuned bằng WER/CER.  
133. 
134. 5) **Inference**  
135.    - Batch API: `modal_batch.py` (FastAPI ASGI).  
136.    - Realtime API: `modal_streaming.py` (WebSocket).  
137.    - Local server: `local_server.py` (GPU local).  
138. 
139. 6) **Deployment**  
140.    - API exposed qua Modal endpoint.  
141.    - Option: tải checkpoint về local qua `download_checkpoint.py`.  
142. 
143. ---
144. 
145. ## 6. MÔ HÌNH SỬ DỤNG (MODEL OVERVIEW)
146. 
147. **ASR Model: Whisper**
148. - Base model: `openai/whisper-small`.
149. - Fine-tune bằng QLoRA để giảm VRAM.
150. - Load bằng `WhisperForConditionalGeneration`.
151. 
152. **Translation Model (tuỳ module)**
153. - Code inference có scaffold cho M2M100 hoặc mô hình dịch riêng.
154. - Notebook `m2m100_lora.ipynb` hỗ trợ huấn luyện LoRA translation.
155. 
156. **TTS Model**
157. - Notebook `VITS_Vietnamese_LongForm_Colab (1).ipynb` cho fine‑tune VITS.
158. - Tập trung vào tiếng Việt, single‑speaker.
159. 
160. ---
161. 
162. ## 7. DỮ LIỆU ĐẦU VÀO / ĐẦU RA
163. 
164. **Input (huấn luyện ASR):**
165. - Audio `.wav`
166. - Subtitle `.vtt` (timestamp + text)
167. 
168. **Output (training dataset):**
169. - `segments/*.wav`
170. - `train.json`, `val.json`, `test.json` chứa metadata
171. 
172. **Input (inference):**
173. - Audio `.wav` hoặc video `.mp4/.mov/.mkv`
174. 
175. **Output (inference):**
176. - JSON transcript (text + segments)
177. - Nếu bật translation/TTS: thêm text dịch, audio base64.
178. 
179. ---
180. 
181. ## 8. CÁC THÀNH PHẦN CHÍNH LIÊN QUAN ĐẾN DỮ LIỆU
182. 
183. **preprocessing/audio_segmenter.py**
184. - Cắt audio dựa trên VTT.
185. - Loại bỏ segment quá ngắn / quá dài.
186. - Normalize audio.
187. 
188. **preprocessing/vtt_parser.py**
189. - Parse VTT, merge cues, đảm bảo segment hợp lý.
190. 
191. **utils/audio_utils.py**
192. - Load/resample audio.
193. - Normalize & trim silence.
194. - Extract audio segment.
195. 
196. **utils/text_utils.py**
197. - Clean transcript.
198. - Normalize text.
199. - Tokenize, tính WER/CER.
200. 
201. ---
202. 
203. ## 9. ĐỊNH NGHĨA CHUẨN CỦA SEGMENT
204. 
205. Một segment chuẩn trong dataset có:
206. - `audio`: đường dẫn file wav (relative).
207. - `text`: transcript sạch, đã normalize.
208. - `duration`: thời lượng (giây).
209. - `start_time`, `end_time`: timestamp gốc.
210. - `file_id`: id file nguồn.
211. - `segment_id`: index trong file.
212. - `language`: "en" (mặc định).
213. - `sample_rate`: 16000.
214. 
215. ---
216. 
217. ## 10. GIẢI THÍCH VỀ QLoRA TRONG DỰ ÁN
218. 
219. QLoRA = Quantized LoRA:
220. - Base model được load ở **4‑bit** (BitsAndBytes).
221. - LoRA adapter chỉ train một phần nhỏ tham số.
222. - Tiết kiệm VRAM, phù hợp T4 GPU.
223. 
224. Trong `training/whisper_finetune/model.py`:
225. - `BitsAndBytesConfig(load_in_4bit=True, ...)`
226. - `LoraConfig(task_type="SEQ_2_SEQ_LM")`
227. - `get_peft_model` inject adapters.
228. 
229. ---
230. 
231. ## 11. TỔNG QUAN VỀ MODAL
232. 
233. Modal được dùng như nền tảng chạy training/inference:
234. - **Volume** để lưu dataset/checkpoint.
235. - **GPU T4** cho training và inference.
236. - **FastAPI ASGI** để expose endpoints.
237. 
238. Các volume chính:
239. - `asr-raw-data` → dữ liệu thô.
240. - `asr-processed-data` → dataset đã cắt.
241. - `asr-checkpoints` → LoRA adapters.
242. - `asr-eval` → kết quả đánh giá.
243. 
244. ---
245. 
246. ## 12. NGUYÊN TẮC THIẾT KẾ CHUNG
247. 
248. - Tất cả các bước đều có thể chạy độc lập.
249. - Các step được thiết kế để resume (training).
250. - Inference tách riêng khỏi training.
251. - Realtime inference dùng WebSocket (giảm latency).
252. - Batch inference dùng chunk 30s (giảm RAM).
253. 
254. ---
255. 
256. ## 13. KHÁI NIỆM “BATCH vs STREAMING”
257. 
258. **Batch inference:**
259. - Audio file lớn → cắt thành 30s chunks.
260. - Tổng hợp transcript bằng cách nối các đoạn.
261. 
262. **Streaming inference:**
263. - Mỗi chunk 5s PCM gửi qua WebSocket.
264. - Trả về text ngay, hỗ trợ realtime caption.
265. 
266. ---
267. 
268. ## 14. CÁC TẬP TIN INFERENCE CHÍNH
269. 
270. 1) `modal_batch.py` – Batch ASGI API  
271. 2) `modal_fn.py` – Modal function RPC  
272. 3) `modal_streaming.py` – WebSocket realtime ASR  
273. 4) `local_server.py` – chạy local bằng checkpoint tải về  
274. 5) `download_checkpoint.py` – tải LoRA từ Modal volume về local  
275. 
276. ---
277. 
278. ## 15. GIAO ƯỚC THIẾT KẾ API (CHUNG)
279. 
280. **Health check:** `/health`  
281. - Trả về status + model + device  
282. 
283. **Transcribe:** `/transcribe`  
284. - Input: file audio/video  
285. - Output: transcript + segments  
286. 
287. **Streaming:** `/stream` (WebSocket)  
288. - Input: PCM 16‑bit, 16kHz, mono (5s chunk)  
289. - Output: JSON {text, is_final}  
290. 
308. ## 17. PREPROCESSING: TỔNG QUAN
309. 
310. Mục tiêu của preprocessing là biến dữ liệu thô (audio + subtitle) thành dataset chuẩn cho Whisper training.
311. 
312. Các bước preprocessing chính:
313. 1) Parse VTT và merge cues.
314. 2) Chọn segment dựa trên điều kiện duration.
315. 3) Extract audio tương ứng.
316. 4) Normalize audio.
317. 5) Normalize text.
318. 6) Ghi metadata JSON và audio segments.
319. 
320. Mỗi bước có file riêng:
321. - `preprocessing/vtt_parser.py`
322. - `preprocessing/audio_segmenter.py`
323. - `preprocessing/text_normalizer.py`
324. - `preprocessing/dataset_splitter.py`
325. - `preprocessing/modal_preprocess.py`
326. 
327. ---
328. 
329. ## 18. VTT PARSER – CẤU TRÚC VÀ LOGIC
330. 
331. File: `preprocessing/vtt_parser.py`
332. 
333. ### 18.1. Mục tiêu
334. - Đọc file `.vtt` (WebVTT).
335. - Trích timestamp và text.
336. - Loại bỏ tag HTML và cues dư thừa.
337. - Merge các cue gần nhau thành segment dài hơn.
338. 
339. ### 18.2. Các bước parse chính
340. 
341. **Bước 1: đọc nội dung file**
342. - Dùng `with open(...)` đọc toàn bộ nội dung.
343. - Split theo `\n\n` để tách block.
344. 
345. **Bước 2: tìm dòng timestamp**
346. - Regex: `(\d{2}:\d{2}:\d{2}\.\d{3}) --> (...)`
347. - Mỗi block có thể có nhiều dòng text, lấy dòng cuối.
348. 
349. **Bước 3: clean text**
350. - Xóa `<c>` và HTML tags.
351. - Remove entities (`&nbsp;`, `&amp;`…).
352. - Collapse whitespace.
353. 
354. **Bước 4: merge segments**
355. - Merge nếu gap <= `max_gap`.
356. - Merge nếu chưa đủ min_duration.
357. - Merge nếu câu chưa kết thúc (`.?!`).
358. 
359. ### 18.3. Thông số merge mặc định
360. - `max_duration = 12.0`
361. - `min_duration = 2.0`
362. - `max_gap = 1.0`
363. 
364. ### 18.4. Ví dụ logic merge
365. Nếu có 3 cue:
366. - 00:00–00:01: "Hello"
367. - 00:01–00:02: "world"
368. - 00:05–00:06: "New sentence."
369. 
370. Cue 1 + 2 được merge vì gap nhỏ và duration <2s.
371. Cue 3 tách riêng vì gap > max_gap.
372. 
373. ---
374. 
375. ## 19. AUDIO SEGMENTER – CẮT AUDIO THEO VTT
376. 
377. File: `preprocessing/audio_segmenter.py`
378. 
379. ### 19.1. Tham số quan trọng
380. - `BOUNDARY_PAD = 0.15`  
381. - `MIN_DURATION = 2.0`  
382. - `MAX_DURATION = 15.0`
383. 
384. Ý nghĩa:
385. - Padding thêm 150ms vào đầu và cuối để tránh cắt mất âm.
386. - Segment ngắn hơn 2s bị bỏ (dễ hallucination).
387. - Segment dài hơn 15s bị bỏ (quá dài cho Whisper).
388. 
389. ### 19.2. Quy trình segment_file
390. 
391. 1) Load audio bằng `load_audio` (utils/audio_utils).
392. 2) Parse VTT và merge segments.
393. 3) Với từng segment:
394.    - Kiểm tra duration.
395.    - Clean transcript (qua `parse_vtt_file`).
396.    - Apply padding.
397.    - Extract segment audio.
398.    - Normalize audio nếu bật.
399.    - Save `.wav`.
400.    - Ghi metadata.
401. 
402. ### 19.3. Cấu trúc metadata mỗi segment
403. - `audio_path`: đường dẫn .wav.
404. - `text`: transcript.
405. - `duration`: thời lượng thực tế.
406. - `start_time`, `end_time`.
407. - `file_id`.
408. - `segment_id`.
409. 
410. ---
411. 
412. ## 20. TEXT NORMALIZER
413. 
414. File: `preprocessing/text_normalizer.py`
415. 
416. ### 20.1. Mục tiêu
417. - Làm sạch transcript.
418. - Chuẩn hóa theo ngôn ngữ.
419. 
420. ### 20.2. Logic chính
421. - Gọi `clean_transcript` từ `utils/text_utils.py`.
422. - Gọi `normalize_text`.
423. 
424. ### 20.3. Lý do normalization quan trọng
425. - Whisper training yêu cầu text sạch.
426. - Nếu giữ tags hoặc ký tự lạ sẽ gây nhiễu.
427. - Normalize giữ punctuation (không lower-case toàn bộ).
428. 
429. ---
430. 
431. ## 21. UTILITIES: AUDIO UTILS
432. 
433. File: `utils/audio_utils.py`
434. 
435. ### 21.1. Các hàm chính
436. - `load_audio`: librosa.load + resample.
437. - `save_audio`: soundfile write.
438. - `normalize_audio`: đưa RMS về −20 dB.
439. - `extract_segment`: cắt theo start/end.
440. - `compute_mel_spectrogram`.
441. - `trim_silence`.
442. 
443. ### 21.2. Chi tiết normalize_audio
444. - Tính RMS.
445. - Scalar = 10^(target_db/20) / rms.
446. - Clip vào [-1,1].
447. 
448. ---
449. 
450. ## 22. UTILITIES: TEXT UTILS
451. 
452. File: `utils/text_utils.py`
453. 
454. ### 22.1. normalize_text
455. - Remove [Music], [Applause].
456. - Remove HTML tags.
457. - Nếu language=en: remove accents.
458. - Giữ punctuation `. , ! ? ' -`.
459. - Collapse whitespace.
460. 
461. ### 22.2. clean_transcript
462. - Xóa tag `<00:00:01.234>` và `<c>` trong VTT.
463. - Xóa nội dung trong dấu `[...]`.
464. - Collapse whitespace.
465. 
466. ### 22.3. Tokenize & WER/CER
467. - `tokenize_text` khác nhau cho vi/en.
468. - `calculate_wer` dùng dynamic programming.
469. - `calculate_cer` tương tự.
470. 
471. ---
472. 
473. ## 23. DATASET SPLITTER
474. 
475. File: `preprocessing/dataset_splitter.py`
476. 
477. ### 23.1. Mục tiêu
478. - Chia data thành train/val/test.
479. - Stratifiy theo `language`.
480. 
481. ### 23.2. Default ratio
482. - train: 0.8
483. - val: 0.1
484. - test: 0.1
485. 
486. ### 23.3. Quy trình
487. - Group theo language.
488. - Shuffle mỗi group.
489. - Chia theo ratio.
490. - Shuffle lại toàn bộ.
491. 
492. ### 23.4. save_splits
493. - Ghi JSON ra thư mục output.
494. - Log số lượng sample, tổng duration.
495. 
496. ---
497. 
498. ## 24. MODAL PREPROCESS PIPELINE
499. 
500. File: `preprocessing/modal_preprocess.py`
501. 
502. ### 24.1. Volume mapping
503. - Raw: `asr-raw-data`
504. - Processed: `asr-processed-data`
505. 
506. ### 24.2. Main workflow
507. - `verify_volumes`: kiểm tra số file raw/processed.
508. - `preprocess_dataset`: pipeline chính.
509. 
510. ### 24.3. preprocess_dataset logic
511. 1) Load tất cả `.wav`.
512. 2) Với mỗi file:
513.    - tìm `.vtt`.
514.    - parse segments.
515.    - extract audio.
516.    - normalize.
517.    - ghi metadata.
518. 3) Shuffle, split train/val/test.
519. 4) Lưu JSON.
520. 5) commit Modal volume.
521. 
522. ### 24.4. Tham số quan trọng
523. - `MIN_SEG_DURATION = 2.0`
524. - `MAX_SEG_DURATION = 15.0`
525. - `TRAIN_RATIO = 0.70`
526. - `VAL_RATIO = 0.15`
527. 
528. ### 24.5. Output JSON
529. - `train.json`, `val.json`, `test.json`
530. 
531. ---
546. ---
547. 
548. ## 26. DATASET TRAINING: WhisperASRDataset
549. 
550. File: `training/whisper_finetune/dataset.py`
551. 
552. ### 26.1. Mục tiêu
553. - Đọc JSON metadata.
554. - Load audio segment.
555. - Chuyển audio thành input_features.
556. - Tokenize transcript thành label.
557. 
558. ### 26.2. Quy trình __getitem__
559. 
560. 1) Lấy item từ `self.data`.
561. 2) Load audio file từ `segments_dir.parent / item['audio']`.
562. 3) Nếu dài quá `max_audio_length` thì cắt.
563. 4) Gọi `processor` để tạo `input_features`.
564. 5) Tokenize text với Whisper tokenizer.
565. 6) Trả về dict `{input_features, labels}`.
566. 
567. ### 26.3. Lý do dùng collate_fn
568. - Labels có độ dài khác nhau.
569. - Dùng dynamic padding.
570. - Pad bằng `-100` để loss bỏ qua padding.
571. 
572. ---
573. 
574. ## 27. MODEL QLoRA: LOAD & CONFIG
575. 
576. File: `training/whisper_finetune/model.py`
577. 
578. ### 27.1. load_whisper_qlora_model
579. 
580. - Tạo `BitsAndBytesConfig(load_in_4bit=True)`.
581. - Load base model `WhisperForConditionalGeneration`.
582. - Load processor `WhisperProcessor`.
583. - `prepare_model_for_kbit_training`.
584. - Inject LoRA adapters bằng `get_peft_model`.
585. 
586. ### 27.2. Lý do task_type = SEQ_2_SEQ_LM
587. - Whisper là encoder‑decoder.
588. - Nếu dùng CAUSAL_LM sẽ gây lỗi forward.
589. 
590. ### 27.3. LoRA config
591. - r = config['qlora']['r']
592. - lora_alpha, lora_dropout, target_modules...
593. 
594. ### 27.4. Save adapter
595. - `save_lora_adapter(model, output_dir)`
596. - Chỉ lưu adapter weights (~50MB).
597. 
598. ### 27.5. load_lora_adapter
599. - Load base model 4bit.
600. - Attach LoRA adapter từ checkpoint.
601. - Load processor.
602. 
603. ---
604. 
605. ## 28. TRAINING PIPELINE (MODAL)
606. 
607. File: `training/whisper_finetune/modal_train.py`
608. 
609. ### 28.1. Mục tiêu
610. - Train Whisper-small bằng QLoRA trên Modal GPU.
611. - Auto resume checkpoint.
612. - Save checkpoint định kỳ.
613. 
614. ### 28.2. Modal container setup
615. - Image debian_slim Python 3.11.
616. - Cài torch, transformers, peft, bitsandbytes, librosa...
617. - Mount volumes:
618.   - `/data/processed` → dataset
619.   - `/checkpoints` → checkpoints
620. 
621. ### 28.3. Auto resume logic
622. - Tìm checkpoint mới nhất trong `/checkpoints/checkpoint-*`.
623. - Nếu có:
624.   - Load adapter weights.
625.   - Load optimizer & scheduler state.
626.   - Resume global_step.
627. 
628. ### 28.4. Training loop
629. - Dùng gradient accumulation.
630. - Logging mỗi `logging_steps`.
631. - Evaluation mỗi `eval_steps`.
632. - Save checkpoint mỗi `save_steps`.
633. 
634. ### 28.5. Whisper forward workaround
635. - PEFT wrapper đôi khi inject `input_ids`.
636. - Code dùng `whisper_model = model.base_model.model`
637. - Forward trực tiếp Whisper core để tránh bug.
638. 
639. ---
640. 
641. ## 29. CHECKPOINT LOGIC
642. 
643. ### 29.1. Lưu checkpoint
644. - Lưu adapter weights vào `checkpoint-N`.
645. - Lưu optimizer & scheduler state vào `training_state.pt`.
646. 
647. ### 29.2. Resume
648. - Load adapter weights từ checkpoint.
649. - Restore optimizer, scheduler.
650. - Set resume_step.
651. 
652. ### 29.3. Final checkpoint
653. - Save vào `/checkpoints/final`.
654. - Save processor vào final.
655. 
656. ---
657. 
658. ## 30. TRAINING CONFIG (config.yaml)
659. 
660. Mặc dù file không được liệt kê đầy đủ, pipeline phụ thuộc:
661. - `model.name` (openai/whisper-small)
662. - `model.language`, `model.task`
663. - `training.max_steps`, `batch_size`, `lr`
664. - `qlora` params (r, alpha, dropout, target_modules)
665. - `optimizer` params (betas, weight_decay)
666. 
667. ---
668. 
669. ## 31. LÝ DO DÙNG QLoRA VỚI T4
670. 
671. - Whisper-small full precision dễ vượt VRAM T4.
672. - QLoRA giúp load model 4‑bit.
673. - Chỉ LoRA adapter train (~few million params).
674. - Cho phép training dài (24h) trên T4.
675. 
676. ---
677. 
678. ## 32. GIẢI THÍCH VỀ CHUNK AUDIO
679. 
680. Trong inference batch:
681. - Audio được chia thành 30s chunk.
682. - Mỗi chunk feed vào Whisper.
683. - Transcript cuối = join các đoạn.
684. 
685. Lý do:
686. - Whisper có giới hạn input length.
687. - 30s là sweet spot cho accuracy.
688. 
689. ---
690. 
691. ## 33. EVALUATION PIPELINE (TÓM TẮT)
692. 
693. File: `evaluation/modal_eval.py`, `modal_pretrained_eval.py`
694. 
695. - Dùng WER/CER.
696. - Compare finetuned vs pretrained.
697. - Cho phép giới hạn max_samples.
698. 
699. ---
716. ## 35. INFERENCE: TỔNG QUAN
717. 
718. Hệ thống inference được thiết kế đa dạng để phù hợp nhiều kịch bản:
719. 1) **Batch API** – xử lý file audio/video lớn.
720. 2) **Realtime API** – WebSocket streaming.
721. 3) **Local server** – chạy offline bằng checkpoint tải về.
722. 4) **Modal function** – RPC-style inference.
723. 
724. ---
725. 
726. ## 36. BATCH INFERENCE (modal_batch.py)
727. 
728. File: `inference/modal_batch.py`
729. 
730. ### 36.1. Mục tiêu
731. - Cung cấp FastAPI ASGI endpoint `/transcribe`.
732. - Xử lý file audio/video upload.
733. - Trả về transcript + segments.
734. 
735. ### 36.2. Modal container setup
736. - GPU: T4.
737. - Mount checkpoint volume tại `/checkpoints`.
738. - Load model bằng `load_lora_adapter`.
739. 
740. ### 36.3. Flow transcribe
741. 1) Nhận file upload (audio/video).
742. 2) Nếu là video → extract audio bằng `pydub`.
743. 3) Load audio bằng librosa (sr=16000).
744. 4) Chunk 30s.
745. 5) For mỗi chunk:
746.    - Processor → input_features.
747.    - Generate ids (beam search = 4).
748.    - Decode text.
749. 6) Join text thành transcript.
750. 
751. ### 36.4. Output JSON
752. - `success`, `filename`, `duration`
753. - `transcript` (full)
754. - `segments` (list with start/end/text)
755. 
756. ---
757. 
758. ## 37. MODAL FUNCTION INFERENCE (modal_fn.py)
759. 
760. File: `inference/modal_fn.py`
761. 
762. ### 37.1. Mục tiêu
763. - Cung cấp function `transcribe_audio` callable trong Modal.
764. - Dùng khi không cần FastAPI.
765. 
766. ### 37.2. Flow
767. - Nhận bytes audio.
768. - Save temp file.
769. - Nếu video → chuyển thành wav.
770. - Load audio → chunk 30s.
771. - Generate transcript.
772. - Return dict JSON.
773. 
774. ---
775. 
776. ## 38. REALTIME STREAMING (modal_streaming.py)
777. 
778. File: `inference/modal_streaming.py`
779. 
780. ### 38.1. Mục tiêu
781. - Cung cấp WebSocket `/stream`.
782. - Nhận PCM audio chunk 5s.
783. - Trả text realtime.
784. 
785. ### 38.2. Flow
786. - Load Whisper + LoRA adapter khi app start.
787. - Mỗi message:
788.   - Convert bytes → np.int16 → float.
789.   - Pad/trim tới 5s.
790.   - Generate text (num_beams=1, greedy).
791.   - Return JSON `{text, is_final: False}`.
792. 
793. ### 38.3. Tính realtime
794. - Dùng greedy decoding giảm latency.
795. - Không chunk lớn (5s fixed).
796. 
797. ---
798. 
799. ## 39. LOCAL SERVER INFERENCE
800. 
801. File: `inference/local_server.py`
802. 
803. ### 39.1. Mục tiêu
804. - Chạy local server với checkpoint tải về.
805. - So sánh base vs finetuned.
806. - Hỗ trợ dịch và TTS.
807. 
808. ### 39.2. Load config
809. - Đọc từ `training/whisper_finetune/config.yaml`.
810. - Lấy model name, language, task.
811. 
812. ### 39.3. Load Whisper base model
813. ```python
814. WhisperProcessor.from_pretrained(MODEL_NAME, language=LANGUAGE, task=TASK)
815. WhisperForConditionalGeneration.from_pretrained(MODEL_NAME)
816. ```
817. 
818. ### 39.4. Load LoRA adapter
819. - `_local_ckpt_dir = models/whisper_lora_final`
820. - `load_lora_adapter` nếu muốn finetuned.
821. 
822. ### 39.5. Translation + TTS
823. - Có scaffold cho M2M100 (dịch).
824. - Có scaffold cho SpeechT5 (TTS).
825. - Các model này sẽ được load nếu có đường dẫn.
826. 
827. ---
828. 
829. ## 40. DOWNLOAD CHECKPOINT
830. 
831. File: `inference/download_checkpoint.py`
832. 
833. ### 40.1. Mục tiêu
834. - Download LoRA adapter từ Modal volume về local.
835. 
836. ### 40.2. Flow
837. - `modal.Volume.from_name("asr-checkpoints")`
838. - List files dưới `final/`.
839. - Download từng file.
840. - Lưu vào `models/whisper_lora_final`.
841. 
842. ### 40.3. Output
843. - `adapter_model.safetensors`
844. - `adapter_config.json`
845. - `tokenizer.json` (nếu có)
846. 
847. ---
848. 
849. ## 41. DEPLOYMENT PRODUCTION
850. 
851. ### 41.1. Deploy trên Modal (khuyến nghị)
852. - Deploy `modal_batch.py` cho batch API.
853. - Deploy `modal_streaming.py` cho realtime.
854. - Modal tự scale theo request.
855. 
856. ### 41.2. Deploy self-host
857. - Tải checkpoint về local.
858. - Chạy `uvicorn inference.local_server:app`.
859. - Cần GPU + CUDA.
860. 
861. ### 41.3. Best practices
862. - Dùng Nginx reverse proxy.
863. - Thêm auth token nếu public.
864. - Cache transcript cho file giống nhau.
865. - Log request theo job_id.
866. 
867. ---
868. 
869. ## 42. TRANSLATION MODULE (M2M100)
870. 
871. File scaffold: `m2m100_lora.ipynb`
872. 
873. ### 42.1. Mục tiêu
874. - Fine‑tune M2M100 bằng LoRA.
875. - Dịch tiếng Anh → tiếng Việt.
876. 
877. ### 42.2. Integration
878. - `local_server.py` có endpoint `/translate`.
879. - Nếu model không load, fallback base.
880. 
881. ---
882. 
883. ## 43. TTS MODULE (VITS)
884. 
885. File: `VITS_Vietnamese_LongForm_Colab (1).ipynb`
886. 
887. ### 43.1. Mục tiêu
888. - Fine‑tune VITS trên dataset VietTTS.
889. - Sinh giọng đọc tiếng Việt dài (long form).
890. 
891. ### 43.2. Integration
892. - `local_server.py` có endpoint `/tts`.
893. - Dữ liệu audio trả về dạng base64.
894. 
895. ---
896. 
897. ## 44. EVALUATION CHI TIẾT
898. 
899. Evaluation chạy trên Modal:
900. - `modal_pretrained_eval.py` → đánh giá whisper base.
901. - `modal_eval.py` → đánh giá checkpoint finetuned.
902. 
903. Các metric:
904. - **WER (Word Error Rate)**.
905. - **CER (Character Error Rate)**.
906. 
907. Output được lưu vào volume `asr-eval`.
908. 
909. ---
910. 
911. ## 45. HƯỚNG MỞ RỘNG
912. 
913. - Thêm language code khác (vi, ja, ko).
914. - Tăng dataset bằng CommonVoice.
915. - Dùng Whisper-medium nếu GPU đủ.
916. - Thêm diarization (phân biệt speaker).
917. - Thêm alignment word‑level timestamp.
918. 
919. ---
920. 
921. ## 46. KẾT LUẬN
922. 
923. Hệ thống ASR_Translate_TTS là một pipeline hoàn chỉnh:
924. - Preprocess data → Train Whisper QLoRA → Inference → Streaming → Eval.
925. - Dùng Modal để tối ưu chi phí và tự động scale.
926. - Có thể triển khai production hoặc local tùy nhu cầu.
927. 
928. ---
929. ## Thành viên
930. Cao Hữu Hiệp
931. Nguyễn Văn Phúc Vĩnh
932. Võ Như Khoa