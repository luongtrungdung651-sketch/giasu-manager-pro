# GiaSu Manager Pro

## Mở trong VS Code

1. Mở **thư mục này** trong VS Code (không mở file ZIP).
2. Cài extension **Live Server** nếu chưa có.
3. Mở `index.html` và chọn **Open with Live Server**.
4. Dùng một địa chỉ HTTP, ví dụ `http://127.0.0.1:5500`, thay vì mở trực tiếp bằng `file://` để các ES module trong `js/` hoạt động ổn định.

## Cấu trúc

```text
index.html          # markup, modal và thứ tự nạp script
style.css           # stylesheet hiện tại
js/core/            # state, Supabase, toast, tiện ích, nghiệp vụ học phí chung
js/students/        # thao tác học sinh
js/lessons/         # buổi học và nhật ký
js/calendar/        # lịch dạy
js/group-class/     # lớp nhóm, ghi danh, điểm danh, học phí
js/app/app.js       # application shell / legacy UI logic đã tách khỏi HTML
```

`js/app/app.js` là classic script có chủ ý để tương thích với các handler `onclick` hiện có trong HTML. Khi tách tiếp một tính năng, hãy kiểm tra kỹ thứ tự nạp script và các hàm đang được gọi từ markup.
