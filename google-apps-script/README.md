# Google Apps Script Bridge

Thư mục này chứa backend để web GitHub Pages lưu dữ liệu dùng chung vào Google Sheets.

## Cấu trúc

- `Code.gs`: đọc/ghi toàn bộ state vào các sheet `Meta`, `Players`, `Sets`, `Payments`
- `Bridge.html`: cầu nối `postMessage` giữa GitHub Pages và Apps Script
- `appsscript.json`: manifest tối thiểu

## Cách dùng

1. Tạo một Google Sheets mới.
2. Mở **Extensions** → **Apps Script**.
3. Dán nội dung `Code.gs`, `Bridge.html`, `appsscript.json` từ thư mục này vào project Apps Script bound với file Sheets đó.
4. Deploy dạng **Web app**.
5. Lấy URL `/exec` của web app, dán vào `app-config.js` trong repo frontend rồi push lại lên GitHub Pages.

## Lưu ý

- `ALLOWED_PARENT_ORIGINS` trong `Code.gs` đang để mặc định cho origin GitHub Pages `https://phandungmta.github.io`.
- Nếu deploy dưới origin khác, cần sửa mảng này trước khi publish lại web app.
