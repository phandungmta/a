# Sổ thua séc bóng chuyền

Web tĩnh HTML/CSS/JavaScript để ghi người thua từng séc, tổng hợp theo ngày, tổng hợp tất cả các ngày và theo dõi tiền đã đóng / còn lại.

Phiên bản hiện tại đã được chuẩn bị cho mô hình:

- frontend chạy trên Vercel tại `https://a-ten-mauve.vercel.app`
- dữ liệu dùng chung lưu trong Google Sheets
- frontend nói chuyện với Google Sheets qua một bridge Google Apps Script
- mọi máy mở cùng một trang web sẽ thấy cùng một dữ liệu khi bridge đã được cấu hình

## Chức năng

- Không cần nhập tên trận.
- Không cần nhập đội A / đội B.
- Danh sách người chơi được fix cứng trong mã nguồn.
- Chọn người thua rồi bấm **Lưu 1 séc**.
- Mỗi lần lưu được tính là **1 séc**.
- Có thể sửa hoặc xóa từng séc.
- Có trang **Tổng hợp tất cả các ngày**.
- Có trang **Tiền đã đóng / còn lại**.
- Có thể ghi nhiều lần đã đóng cho cùng một người.
- Có thể nhập JSON để khôi phục hoặc thay thế dữ liệu chung.
- Nếu bridge Apps Script chưa cấu hình, web vẫn chạy và lưu tạm trên máy hiện tại.

## Danh sách người chơi mặc định

- Cao cầu
- Dũng
- Duy
- Đông anh
- Đức
- Hà
- Ký
- Quang anh
- Quang em
- Sơn

Danh sách này nằm trong `shared-state.js` ở mảng `DEFAULT_PLAYER_NAMES`.

## Cấu trúc file chính

- `index.html`: trang nhập séc theo ngày.
- `payments.html`: trang tiền đã đóng / còn lại.
- `all-days.html`: trang tổng hợp tất cả các ngày.
- `app.js`: logic trang nhập séc.
- `payments.js`: logic trang công nợ.
- `all-days.js`: logic trang tổng hợp.
- `shared-state.js`: chuẩn hóa state, danh sách người chơi cố định, tách shared state và UI state.
- `remote-store.js`: bridge client giữa frontend và Apps Script.
- `app-config.js`: nơi điền URL bridge Apps Script.
- `google-apps-script/`: backend mẫu cho Google Sheets + Apps Script.

## Cách chạy với dữ liệu dùng chung

1. Tạo một Google Sheets mới.
2. Mở **Extensions** → **Apps Script** trong file Sheets đó.
3. Chép các file trong thư mục `google-apps-script/` vào project Apps Script bound với file Sheets.
4. Deploy Apps Script dạng **Web app** và lấy URL `/exec`.
5. Mở `app-config.js`, điền `bridgeUrl`.
6. Deploy frontend lên Vercel để chạy tại `https://a-ten-mauve.vercel.app`.
7. Mở URL Vercel đó để dùng chung trên mọi máy.

## Nếu chưa cấu hình bridge

- Web vẫn chạy bình thường.
- Dữ liệu chỉ lưu trên máy đang mở bằng `localStorage`.
- Banner đồng bộ sẽ báo rõ rằng chưa dùng lưu trữ online.

## Gợi ý tiếp theo

- Nếu đổi domain frontend khỏi `https://a-ten-mauve.vercel.app`, cần cập nhật `ALLOWED_PARENT_ORIGINS` trong `google-apps-script/Code.gs` rồi deploy lại web app Apps Script.
- Nếu muốn đổi danh sách người chơi, sửa `DEFAULT_PLAYER_NAMES` trong `shared-state.js`.
