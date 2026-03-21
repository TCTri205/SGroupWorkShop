TÀI LIỆU ĐẶC TẢ KỸ THUẬT CHUYÊN SÂU – AI VIDEO SUMMARY WEBSITE

Phiên bản tài liệu: 1.0
Dự án: haduckien-raccoon/video-summary-website
Mục tiêu: Mô tả đầy đủ kiến trúc, pipeline, model, vận hành và triển khai sản phẩm

---

1. GIỚI THIỆU DỰ ÁN

Dự án AI Video Summary Website là một sản phẩm hoàn chỉnh với giao diện web, cho phép người dùng tải video lên và nhận lại:
- Bản tóm tắt nội dung bằng tiếng Việt (ngắn gọn, giàu ngữ nghĩa).
- Video highlight (các cảnh nổi bật được cắt tự động).
- (Tuỳ cấu hình) transcript đầy đủ được trích từ lời thoại.

Dự án này kết hợp nhiều bước xử lý đa phương tiện:
- Âm thanh (Speech-to-Text)
- Hình ảnh (Captioning frame)
- Ngôn ngữ (Summarization / Story generation)

Và cuối cùng được cung cấp qua một ứng dụng web FastAPI + HTML/CSS có UI hoàn chỉnh.

Điểm khác biệt lớn:
- Không chạy trực tiếp model nặng trên server chính.
- Model được chạy ở Colab và expose qua ngrok.
- Server backend chỉ làm nhiệm vụ gọi API đến các model đang chạy remote.

---

2. MỤC ĐÍCH VÀ GIÁ TRỊ CỐT LÕI

Mục đích kỹ thuật:
- Tạo một pipeline có thể xử lý video tự động từ đầu tới cuối.
- Tối ưu trải nghiệm người dùng với UI realtime (status updates).
- Tận dụng mô hình AI sẵn có (Whisper, BLIP, Qwen) để tạo output chất lượng cao.

Mục đích sản phẩm:
- Giúp người dùng hiểu nội dung video dài trong thời gian ngắn.
- Tạo bản highlight giúp xem nhanh phần đặc sắc.
- Hỗ trợ truyền thông, marketing, học tập nhanh.

---

3. KIẾN TRÚC TỔNG THỂ (HIGH-LEVEL ARCHITECTURE)

Toàn bộ hệ thống được chia thành 5 tầng chính:

(A) Frontend/UI Layer
- HTML + CSS (templates/index.html, static/style.css)
- Javascript front-end dùng fetch để upload file và polling status

(B) Backend API Layer
- FastAPI (app.py)
- Nhận upload, chạy pipeline background, trả trạng thái

(C) Pipeline Layer
- Xử lý video: tách audio, tách frame, caption, summarize

(D) Model API Layer (Remote Inference)
- Whisper (speech to text)
- BLIP (image caption)
- Qwen (text generation)

(E) Storage Layer
- Lưu file tạm trong data/uploads
- Lưu output trong data/output
- Không dùng DB (status lưu in-memory)

---

4. DỮ LIỆU ĐẦU VÀO & ĐẦU RA

Input:
- File video (mp4, mov, avi, …)

Output:
- summary.txt (bản tóm tắt tiếng Việt)
- transcript.txt (toàn bộ lời thoại – nếu có audio)
- captions.json (danh sách caption cho các frame)
- highlight.mp4 (video highlight)

---

5. PIPELINE TỔNG THỂ (END-TO-END)

Pipeline tổng quát như sau:

- Upload video (FastAPI /upload)
- Extract audio (ffmpeg)
- Speech-to-text (Whisper API via ngrok)
- Extract frames (Scene + Whisper timestamps)
- Caption frames (BLIP API via ngrok)
- Summarize transcript + captions (Qwen API via ngrok)
- Detect scenes & score (keyword + speech + duration)
- Create highlight video (moviepy)
- Return kết quả (summary + highlight URL)

---

6. PIPELINE CHI TIẾT – TỪNG BƯỚC LÀM VIỆC

6.1. Upload File (FastAPI)
File: app.py

- Endpoint /upload nhận file qua UploadFile
- Tạo job_id bằng uuid4
- Lưu file vào data/uploads/{job_id}_{filename}
- Tạo entry trong dict processing_jobs
- Chạy pipeline dưới background task

Lý do thiết kế:
- Không block request chính
- UI có thể polling trạng thái

6.2. Extract Audio (pipeline/extract_audio.py)

- Dùng thư viện ffmpeg
- Đọc video đầu vào, xuất file audio mono (1 kênh) 16kHz
- Output mặc định: audio.wav

Thông số kỹ thuật:
- sample rate: 16000 Hz
- channel: 1 (mono)

Lý do:
- Whisper hoạt động tốt với audio 16kHz mono

6.3. Speech To Text (pipeline/speech_to_text.py)

- Gọi API remote whisper (models/whisper_model.py)
- API endpoint: /transcribe
- Gửi audio file qua form-data
- Nhận JSON bao gồm:
  - text
  - segments (start, end, text)

Tại sao dùng API remote?
- Whisper nặng và chạy tốt trên GPU
- Đẩy lên Colab giúp tiết kiệm tài nguyên server chính

6.4. Extract Frames (pipeline/extract_frames.py)

- Dùng utils.video_utils.extract_intelligent_frames
- Quy trình:
  - Scene detection (scenedetect)
  - Kết hợp timestamp từ whisper segments
  - Merge timestamps gần nhau <2s
  - Trích frame từ video tại timestamp
  - Filter frame:
    - Bỏ frame mờ (blur detection Laplacian var < 100)
    - Bỏ frame tối (gray.mean < 15)

Kết quả:
- Lưu frame vào folder frames/

6.5. Caption Frames (pipeline/caption_frames.py)

- Duyệt từng frame theo thứ tự
- Resize ảnh về 224x224
- Gọi generate_caption từ models/caption_model.py
- Nếu caption mới giống caption trước → bỏ qua (giảm trùng lặp)
- Output: captions.json

Tại sao resize?
- Giảm payload gửi API
- Tăng tốc inference

6.6. Summarize (pipeline/summarize.py)

- Tạo đoạn văn kể chuyện dựa trên transcript + caption
- Pipeline summarize gồm 2 bước:
  - Summarize transcript bằng summarize_transcript
  - Generate story bằng prompt dài và captions

Chi tiết Step 1:
- Gọi generate_summary (summary_model.py)
- Prompt: tóm tắt transcript thành 1 đoạn văn 5–7 câu

Chi tiết Step 2:
- Prompt system yêu cầu “viết truyện ngắn 1 đoạn duy nhất”
- Cấm dùng từ “ảnh”, “frame”, “video”
- Bắt buộc 5–8 câu
- Câu cuối phải là bài học

---

7. MODEL VÀ CÁCH LOAD

7.1. Whisper (Speech-to-Text)

- Model: OpenAI Whisper (base)
- Load trong notebook: whisper.load_model("base")
- Chạy trong Colab GPU
- API endpoint: /transcribe

Trong server Colab:
whisper_model = whisper.load_model("base")

Trong backend app:
response = requests.post(API_URL, files={"file": f})

7.2. BLIP Image Caption

- Model: Salesforce/blip-image-captioning-base
- Load bằng transformers:
  - BlipProcessor
  - BlipForConditionalGeneration

Trong server Colab:
caption_processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
caption_model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base").to(device)

Trong backend app:
- gửi ảnh JPG via API /caption

7.3. Qwen (Text Generation)

- Model base: Qwen/Qwen2.5-3B-Instruct
- Load trong Colab:
tokenizer = AutoTokenizer.from_pretrained(model_id)
summary_model = AutoModelForCausalLM.from_pretrained(
    model_id, torch_dtype=torch.float16, device_map="auto"
)

- (Tuỳ chọn) có thể load LoRA checkpoint
- Sau đó expose API /generate

Trong backend app:
- gửi JSON {text: prompt} tới endpoint /generate
- Nhận result string
- Loại bỏ các token ChatML dư thừa

---

8. PIPELINE HIGHLIGHT VIDEO

- Scene detection
  - detect_scenes_by_voice nếu có segments whisper
  - Fallback sang detect_scenes (scenedetect hình ảnh)
- Score scenes
  - File pipeline/highlight_score.py
  - Tính 3 loại score:
    - speech_score: số từ / 40
    - keyword_score: check từ khóa (smile, laugh, cry…)
    - duration_score: độ dài / 8
  - score = 0.6 * speech + 0.3 * keyword + 0.1 * duration
- Chọn scenes
  - Chọn top scenes sao cho tổng thời lượng ≈ 35% video gốc
  - Nếu quá ngắn: chọn ít nhất 1 cảnh
- Tạo highlight
  - moviepy.VideoFileClip
  - concatenate_videoclips
  - Ghi file highlight.mp4

---

9. CẤU TRÚC FOLDER & FILE QUAN TRỌNG

- app.py: FastAPI backend
- templates/index.html: UI frontend
- static/style.css: style UI
- pipeline/: toàn bộ pipeline xử lý
- models/: wrapper gọi API model
- utils/: hàm tiện ích
- data/uploads: file người dùng
- data/output/{job_id}: output kết quả

---

10. QUY TRÌNH TRIỂN KHAI PRODUCTION (RECOMMENDED)

Option A (nhỏ / demo):
- 1 server FastAPI
- 1 Colab GPU
- ngrok expose model API

Option B (production):
- Backend chạy trên VPS/Cloud
- Model chạy trên GPU server riêng (AWS EC2 GPU, GCP A100)
- Reverse proxy (Nginx)
- Dùng domain cố định + HTTPS

Cấu hình ngrok:
- Ngrok chỉ phù hợp demo
- Production cần reverse proxy hoặc load balancer
- Endpoint hiện tại hardcode:
  - /caption
  - /generate
  - /transcribe

Production best practices:
- Dùng Redis để lưu trạng thái processing_jobs
- Dùng Celery/RQ để xử lý background
- Lưu file trong S3 thay vì local
- Giới hạn kích thước upload
- Logging theo job_id

---

11. CHI TIẾT LUỒNG TRẠNG THÁI (UI)

UI gọi API /status/{job_id} mỗi 2 giây.

Trạng thái có thể là:
- Starting...
- Extracting audio...
- Speech to text...
- Extracting frames...
- Captioning frames...
- Generating summary...
- Detecting voice scenes...
- Scoring scenes...
- Creating highlight video...
- Completed
- Error: <message>

---

12. CHI TIẾT PROMPT ENGINEERING

12.1 Prompt tóm tắt transcript
- Bắt buộc: không suy đoán
- 1 đoạn, 5–7 câu

12.2 Prompt tạo truyện
- Không dùng từ “ảnh”, “video”
- Không dùng markdown
- Câu cuối phải mang bài học

-> Điều này giúp output nhất quán, phù hợp UI.

---

13. GIẢI THÍCH TẠI SAO DÙNG KIẾN TRÚC REMOTE MODEL

- Whisper và BLIP rất nặng
- Server backend không có GPU
- Colab miễn phí, GPU T4 dễ dùng
- API gọi qua HTTP đơn giản

Nhược điểm:
- Ngrok có thể đổi link
- API không ổn định lâu dài
- Production cần server riêng

---

14. HẠN CHẾ HIỆN TẠI

- Không có queue/job persistent
- Không có database lưu lịch sử
- Pipeline chạy tuần tự (không parallel)
- Phụ thuộc API remote
- Không có retry/backoff cho API lỗi

---

15. ĐỀ XUẤT CẢI TIẾN

- Thêm cache caption + transcript
- Thêm GPU local hoặc server inference riêng
- Dùng WebSocket thay polling
- Cho phép user chọn độ dài summary
- Cho phép chọn ngôn ngữ đầu ra

---

16. HƯỚNG DẪN CHẠY LOCAL (CHUẨN)

- Cài Python 3.10+
- Cài FFmpeg
- pip install -r requirements.txt
- Chạy server ngrok (Colab)
- Update API_URL trong:
  - models/caption_model.py
  - models/summary_model.py
  - models/whisper_model.py
- Run uvicorn app:app --host 0.0.0.0 --port 3000
- Mở http://localhost:3000

---

17. THÀNH PHẦN UI

UI trong templates/index.html là 1 page single.
- Upload area
- Progress spinner
- Result sections (summary + highlight)

CSS sử dụng style glassmorphism hiện đại.

---

18. LƯU Ý HIỆU NĂNG

- Video dài > 30 phút sẽ xử lý rất lâu
- Whisper base tốc độ chậm
- Summarize model Qwen 3B cần GPU

---

19. LOGGING & MONITOR

Hiện chỉ dùng print log.
Production nên:
- dùng structlog
- log theo job_id
- log time per step

---

20. KẾT LUẬN

Hệ thống này là một pipeline hoàn chỉnh từ video raw tới bản summary và highlight.
Mỗi bước được thiết kế rõ ràng, tách biệt, dễ thay thế module (ví dụ đổi Whisper sang faster-whisper).

---

21. PHỤ LỤC: DANH SÁCH FILE LIÊN QUAN

- app.py – API chính
- models/whisper_model.py – gọi Whisper API
- models/caption_model.py – gọi BLIP caption API
- models/summary_model.py – gọi Qwen summarize API
- pipeline/extract_audio.py
- pipeline/speech_to_text.py
- pipeline/extract_frames.py
- pipeline/caption_frames.py
- pipeline/summarize.py
- pipeline/transcript_summary.py
- pipeline/scene_detect.py
- pipeline/highlight_score.py
- pipeline/highlight_video.py
- utils/video_utils.py
- utils/io_utils.py
- templates/index.html
- static/style.css

---

22. PHỤ LỤC: MỘT JOB HOÀN CHỈNH

Khi user upload video:
- Output folder: data/output/{job_id}
- Files:
  - audio.wav
  - transcript.txt
  - captions.json
  - summary.txt
  - highlight.mp4

---

23. PHỤ LỤC: TỔNG HỢP CÁC THƯ VIỆN

- fastapi
- uvicorn
- requests
- ffmpeg-python
- moviepy
- openai-whisper
- transformers
- pillow
- scenedetect
- pyngrok

---

24. TỔNG KẾT CHÍNH XÁC

- Hệ thống không chạy model nặng trực tiếp trên backend.
- Hệ thống gọi API inference từ Colab qua ngrok.
- Pipeline đã có UI hoàn chỉnh.
- Highlight được tạo bằng logic score cụ thể.
- Summary viết tiếng Việt, style truyện ngắn 1 đoạn.

---

25. Thành viên:
- Trương Công Trí
- Trần Công Đức