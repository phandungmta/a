# Shared Online Storage Design

## Goal

Biến app HTML tĩnh hiện có thành bản có thể chạy trên GitHub Pages nhưng dùng chung dữ liệu giữa nhiều máy.

## Architecture

- Frontend vẫn là HTML/CSS/JavaScript tĩnh.
- Dữ liệu nghiệp vụ dùng chung gồm `players`, `sets`, `payments`.
- Trạng thái giao diện cục bộ gồm `currentDate`, `stake`, `selectedLoserIds`.
- Frontend nói chuyện với một Google Apps Script web app qua `iframe` ẩn + `postMessage`.
- Apps Script dùng `google.script.run` để đọc/ghi Google Sheets bound spreadsheet.

## Storage Model

- Sheet `Players`: danh sách người chơi hiện hành và người chơi đã bị vô hiệu nhưng còn xuất hiện trong dữ liệu cũ.
- Sheet `Sets`: toàn bộ séc đã lưu.
- Sheet `Payments`: toàn bộ khoản đã đóng.
- Sheet `Meta`: metadata đơn giản như schema version và thời gian cập nhật.

## Frontend Data Flow

1. Khi tải trang, frontend đọc UI state trong `localStorage`.
2. Nếu có `bridgeUrl`, frontend gọi Apps Script để lấy shared state mới nhất.
3. Nếu remote rỗng nhưng máy hiện tại có dữ liệu cũ, frontend seed dữ liệu cũ lên remote.
4. Nếu remote lỗi, frontend fallback sang cache cục bộ và báo trạng thái rõ trên banner.
5. Mọi thao tác thêm/sửa/xóa shared state đều phải commit qua remote trước khi xem là hoàn tất.

## Error Handling

- Nếu bridge chưa cấu hình: chạy local-only, có banner cảnh báo.
- Nếu bridge không phản hồi: dùng cache local và báo lỗi.
- Nếu save remote thất bại: rollback state trong bộ nhớ.

## Verification

- Kiểm tra parse và test cho lớp state dùng chung.
- Kiểm tra 3 trang đều nạp cùng một nguồn dữ liệu.
- Kiểm tra tài liệu triển khai đủ để cấu hình Apps Script + GitHub Pages.
