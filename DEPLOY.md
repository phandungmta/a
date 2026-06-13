# Deploy Vercel + Google Sheets

Repo này được thiết kế để:

- frontend chạy trên Vercel tại `https://a-ten-mauve.vercel.app`
- dữ liệu dùng chung lưu trong Google Sheets
- frontend gọi Google Sheets thông qua bridge Apps Script

## 1. Cấu hình backend Google Sheets

1. Tạo một Google Sheets mới.
2. Mở **Extensions** → **Apps Script**.
3. Chép 3 file trong thư mục `google-apps-script/` của repo này vào Apps Script project:
   - `Code.gs`
   - `Bridge.html`
   - `appsscript.json`
4. Kiểm tra `ALLOWED_PARENT_ORIGINS` trong `Code.gs`.
   - Mặc định đang để `https://a-ten-mauve.vercel.app`
   - Nếu frontend chạy ở origin khác, đổi lại trước khi publish
5. Deploy dạng **Web app**:
   - Execute as: tài khoản sở hữu file Sheets
   - Who has access: **Anyone**
6. Lưu URL `/exec` sau khi deploy.

## 2. Cấu hình frontend

Mở `app-config.js` và điền URL bridge:

```js
window.APP_REMOTE_CONFIG = {
  bridgeUrl: 'https://script.google.com/macros/s/PASTE_YOUR_DEPLOYMENT_ID/exec'
};
```

## 3. Đưa code lên GitHub

1. Tạo repository trên GitHub.
2. Push toàn bộ repo này lên branch `main`.

Các file tối thiểu cần có:

- `index.html`
- `payments.html`
- `all-days.html`
- `styles.css`
- `shared-state.js`
- `remote-store.js`
- `app-config.js`
- `app.js`
- `payments.js`
- `all-days.js`

## 4. Deploy lên Vercel

1. Import repo vào Vercel.
2. Deploy branch `main`.
3. Xác nhận production URL là `https://a-ten-mauve.vercel.app`.
4. Nếu đổi sang domain khác, cập nhật lại `ALLOWED_PARENT_ORIGINS` trong `google-apps-script/Code.gs` rồi redeploy Apps Script.

## 5. Kiểm tra sau deploy

1. Mở `https://a-ten-mauve.vercel.app` trên máy thứ nhất, thêm thử 1 séc.
2. Mở cùng URL trên máy thứ hai.
3. Tải lại trang, kiểm tra dữ liệu đã xuất hiện ở cả:
   - `index.html`
   - `payments.html`
   - `all-days.html`

Nếu banner hiện cảnh báo chưa cấu hình bridge hoặc không kết nối được bridge, kiểm tra lại:

- `bridgeUrl` trong `app-config.js`
- quyền truy cập web app
- `ALLOWED_PARENT_ORIGINS` trong `Code.gs`
- web app Apps Script có mở trực tiếp được mà không bị chuyển sang trang đăng nhập Google
