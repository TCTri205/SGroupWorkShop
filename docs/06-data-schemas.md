# Data Schemas & Mock Definitions

Tài liệu này định nghĩa cấu trúc dữ liệu chính xác của các tệp nguồn (Resources) và lược đồ đầu vào (Input Schemas) cho các công cụ (Tools) trong SGroup MCP Server. Mọi truy vấn, mã hóa và phản hồi đều phải tuân thủ nghiêm ngặt các định dạng tại đây nhằm đảm bảo tính toàn vẹn của logic.

## 1. Cấu trúc dữ liệu nội bộ (JSON Resources)

Dữ liệu tri thức nội bộ hiện được lưu trữ trong `data/ai-team.json` và `data/sgroup.json`. Cả hai tệp đều tuân theo chung một cấu trúc chuẩn: một Mảng (Array) chứa các Đối tượng (Object) đại diện cho các bản ghi tri thức.

### Knowledge Record Schema

| Trường dữ liệu | Kiểu dữ liệu | Bắt buộc | Trích xuất mẫu | Ý nghĩa & Ứng dụng |
| --- | --- | --- | --- | --- |
| `domain` | `string` | Có | `"ai-team"` | Phân loại phân hệ tri thức, hữu ích cho việc lọc nhánh dữ liệu. |
| `title` | `string` | Có | `"AI Chatbot Module"` | Tiêu đề của bản ghi (Headline). |
| `summary` | `string` | Có | `"Module chatbot đa-agent..."` | Kéo ra ngắn gọn mô tả sơ lược nội dung. |
| `keywords` | `string[]` | Có | `["chatbot", "agent"]` | **Quan trọng**: Danh sách từ khóa được thuật toán `search_sgroup_knowledge` sử dụng chủ yếu để đối sánh và chấm điểm token trùng khớp. |
| `content` | `string` | Có | `"Module chatbot đa-agent gồm..."`| Nội dung chi tiết sẽ được đẩy thẳng vào prompt để cấp context cho LLM. |
| `sourceType` | `string` | Có | `"static"` | Xác định dạng nguồn (`"static"`: tự biên soạn, `"official"`: thông tin công khai). |
| `sourceUrl` | `string` | Không | `"https://sgroup.vn"` | Link dẫn để người dùng click kiểm chứng (chỉ có khi `sourceType` là official). |
| `module` | `string` | Không | `"chatbot"` | Định danh kỹ thuật riêng cho nội bộ hệ thống. |

## 2. Lược đồ công cụ (Tools JSON Schema)

Khi khởi tạo Server bằng `@modelcontextprotocol/sdk`, các công cụ ở mảng `tools` cần một Object `inputSchema` khắt khe theo format JSON Schema. Dưới đây là bộ khung chuẩn:

### 2.1 `search_sgroup_knowledge`
Dùng để truy vấn dữ liệu từ hai tệp JSON trên.
```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Nội dung hoặc từ khóa cần tìm kiếm trong tri thức nội bộ"
    }
  },
  "required": ["query"]
}
```

### 2.2 `get_weather`
```json
{
  "type": "object",
  "properties": {
    "location": {
      "type": "string",
      "description": "Tên hoặc tọa độ của thành phố, quốc gia cần hỏi thời tiết"
    }
  },
  "required": ["location"]
}
```

### 2.3 `get_news`
```json
{
  "type": "object",
  "properties": {
    "category": {
      "type": "string",
      "description": "Chủ đề lĩnh vực tin tức (VD: công nghệ, kinh tế, đời sống)",
      "enum": ["cong-nghe", "kinh-te", "the-thao", "doi-song", "tong-hop"]
    }
  },
  "required": []
}
```

### 2.4 `search_it_knowledge`
```json
{
  "type": "object",
  "properties": {
    "topic": {
      "type": "string",
      "description": "Chủ đề IT hoặc từ khóa lập trình cần tra cứu"
    }
  },
  "required": ["topic"]
}
```

## 3. Mock Data Format (Dữ liệu trả về giả lập)

Trong giai đoạn đầu khi các Provider Adapters tại `src/lib/providers.mjs` chưa gắn API Keys thực tế, hệ thống sẽ sử dụng mock (giả lập). Hàm thực thi nên trả về một chuỗi Markdown cố định theo format dưới đây trước khi bọc vào chuẩn MCP:

### 3.1 Template `get_weather`
```markdown
Thời tiết hiện tại ở **{location}**:
- 🌤 Trạng thái: Trời nhiều mây, có mưa rào rải rác.
- 🌡 Nhiệt độ: 25°C - 28°C
- 💧 Độ ẩm: 80%

*(Lưu ý: Dữ liệu hiện đang ở trạng thái Mock/Giả lập cho mục đích phát triển)*
```

### 3.2 Template `get_news`
```markdown
Dưới đây là các tin tức mới nhất về chủ đề **{category}**:

1. **Tin tức sự kiện 1**: Đánh giá chi tiết thông số và các thông tin liên quan đến sự kiện. [Đọc thêm](https://news.example.com/1)
2. **Tin tức sự kiện 2**: Bài phân tích chuyên sâu từ các chuyên gia hàng đầu. [Đọc thêm](https://news.example.com/2)
3. **Tin tức sự kiện 3**: Cập nhật xu hướng và những thay đổi mới. [Đọc thêm](https://news.example.com/3)

*(Lưu ý: Dữ liệu hiện đang ở trạng thái Mock/Giả lập cho mục đích phát triển)*
```

### Đóng gói kết quả về Client
Các chuỗi kết quả (bao gồm cả nội dung từ file JSON) đều sẽ được đẩy vào `TextContent` và đóng gói thành Response Object chuẩn như sau theo spec của MCP:
```json
{
  "content": [
    {
      "type": "text",
      "text": "<Chuỗi Mock Data / Markdown phía trên>"
    }
  ],
  "isError": false
}
```
