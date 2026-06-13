# Mobile-First Online UI Design

## Goal

Làm giao diện phù hợp hơn với điện thoại, bỏ riêng khu vực `Nhập JSON` khỏi giao diện, và cải thiện cảm giác tải trang bằng cách hiển thị cache thật nhanh nhưng chỉ xác nhận thao tác ghi khi lưu trữ online phản hồi thành công.

## Scope

- Giữ nguyên kiến trúc static HTML/CSS/JavaScript hiện tại.
- Không bỏ logic import JSON trong code nền, chỉ bỏ điểm vào trên giao diện.
- Không chuyển sang chế độ lưu offline trước rồi đồng bộ sau.
- Không thay đổi backend lưu trữ ngoài những gì cần để hỗ trợ xác nhận trạng thái online rõ hơn.

## Recommended Approach

### 1. Cache-first for read, online-only for write

- Khi mở trang, app đọc cache/local state để render thật nhanh.
- Song song, app tải shared state từ bridge Apps Script.
- Khi dữ liệu online về thành công, UI cập nhật lại từ state online mới nhất.
- Nếu online lỗi, người dùng vẫn xem được cache nhưng phải thấy rõ là trạng thái hiện tại chưa được xác nhận với lưu trữ online.

### 2. Online-ack save flow

- Người dùng vẫn có thể thao tác chọn người thua, nhập stake, ghi chú ngay khi trang đã render.
- Khi bấm `Lưu 1 séc`, UI chuyển sang trạng thái `đang lưu online`.
- Chỉ khi bridge online trả về thành công thì:
  - lịch sử séc mới cập nhật,
  - tổng hợp mới cập nhật,
  - form mới được reset,
  - toast thành công mới hiển thị.
- Nếu online lỗi:
  - dữ liệu form đang nhập phải được giữ nguyên để thử lại,
  - không được thêm bản ghi giả vào lịch sử,
  - banner/toast phải báo lỗi rõ ràng.

## Mobile UI Design

### Index page

- Khối nhập séc là phần ưu tiên số 1 trên điện thoại:
  - `Ngày đang xem`
  - `Hôm nay`
  - `stake`
  - `ghi chú`
  - danh sách người thua
  - nút `Lưu 1 séc`
- Bỏ hẳn panel `Nhập JSON` khỏi giao diện.
- Panel phụ chỉ giữ các nút điều hướng và thao tác thật cần:
  - `Tổng hợp tất cả ngày`
  - `Tiền đã đóng`
  - `Xóa dữ liệu ngày này`
- `summary-grid` chuyển thành 1 cột trên mobile.
- `set-card` đổi sang layout dọc để nút sửa/xóa không ép ngang.

### Payments page

- Form ghi tiền đã đóng lên đầu, full-width.
- Bảng công nợ vẫn giữ, nhưng ưu tiên khả năng cuộn ngang và chạm dễ trên điện thoại.
- Lịch sử thanh toán để phía dưới cùng.

### All-days page

- Card tóm tắt lên đầu.
- Các bảng/tổng hợp giữ trong vùng cuộn ngang nếu nội dung rộng.
- Không cố ép bảng nhiều cột vào một viewport hẹp.

## Shared CSS Direction

- Header đổi sang stack layout trên điện thoại.
- `page-nav` wrap nhiều dòng, tăng vùng bấm.
- `header-actions` full-width trên màn hình nhỏ.
- Nút, input, select có chiều cao lớn hơn và khoảng chạm dễ hơn.
- `toast` và `sync-banner` co theo chiều ngang màn hình, không che nội dung chính quá nhiều.
- Khoảng đệm ngang giảm hợp lý để tận dụng không gian điện thoại.

## Sync States

Banner đồng bộ nên có các trạng thái riêng:

- `Đang tải dữ liệu online...`
- `Đang dùng bản cache, đang kết nối lưu trữ online...`
- `Đang lưu online...`
- `Đã lưu online`
- `Không kết nối được lưu trữ online`

Các trạng thái này phải nhất quán giữa `index.html`, `payments.html`, và `all-days.html`.

## Data Flow Changes

### Initial load

1. Đọc UI state local.
2. Đọc cache shared state local và render nhanh.
3. Gọi `loadAppState()` để tải online.
4. Nếu online thành công, thay state hiện tại bằng state online và cập nhật banner.
5. Nếu online thất bại, giữ cache đang hiển thị và báo cảnh báo.

### Save action

1. Snapshot state hiện tại để có thể rollback UI nếu cần.
2. Khóa hành động save lặp.
3. Gửi state shared mới lên remote.
4. Nếu remote trả về thành công, commit state mới vào UI.
5. Nếu remote lỗi, giữ nguyên form đang thao tác và khôi phục phần state hiển thị chưa được xác nhận.

## Files Expected To Change

- `index.html`
- `payments.html`
- `all-days.html`
- `styles.css`
- `app.js`
- `payments.js`
- `all-days.js`
- `remote-store.js`

## Verification

- Mở trang chính trên viewport điện thoại, kiểm tra khối nhập séc xuất hiện đầu tiên và không có khu `Nhập JSON`.
- Kiểm tra `payments.html` và `all-days.html` vẫn đọc được trên điện thoại.
- Kiểm tra tải lần đầu vẫn render nhanh từ cache.
- Kiểm tra thao tác lưu chỉ cập nhật UI thành công sau khi remote phản hồi thành công.
- Kiểm tra khi remote lỗi, UI không tạo bản ghi “ảo” đã lưu.

## Non-Goals

- Không thiết kế lại toàn bộ nhận diện hình ảnh.
- Không thêm backend mới ngoài Apps Script hiện có.
- Không triển khai hàng đợi offline để gửi lại sau.
