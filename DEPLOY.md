# Deploy GitHub Pages + Google Sheets

Repo này được thiết kế để:

- frontend chạy trên GitHub Pages
- dữ liệu dùng chung lưu trong Google Sheets
- GitHub Pages gọi Google Sheets thông qua bridge Apps Script

## 1. Cấu hình backend Google Sheets

1. Tạo một Google Sheets mới.
2. Mở **Extensions** → **Apps Script**.
3. Chép 3 file trong thư mục `google-apps-script/` của repo này vào Apps Script project:
   - `Code.gs`
   - `Bridge.html`
   - `appsscript.json`
4. Kiểm tra `ALLOWED_PARENT_ORIGINS` trong `Code.gs`.
   - Mặc định đang để `https://phandungmta.github.io`
   - Nếu GitHub Pages của repo dùng origin khác, đổi lại trước khi publish
5. Deploy dạng **Web app**:
   - Execute as: tài khoản sở hữu file Sheets
   - Who has access: bất kỳ người dùng nào cần mở trang web
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

## 4. Bật GitHub Pages

1. Vào **Settings** → **Pages** của repo.
2. Ở **Build and deployment**, chọn **Deploy from a branch**.
3. Chọn branch `main` và thư mục `/root`.
4. Lưu lại.

GitHub Pages thường có URL dạng:

```text
https://<username>.github.io/<repository>/
```

## 5. Kiểm tra sau deploy

1. Mở trang GitHub Pages trên máy thứ nhất, thêm thử 1 séc.
2. Mở cùng URL trên máy thứ hai.
3. Tải lại trang, kiểm tra dữ liệu đã xuất hiện ở cả:
   - `index.html`
   - `payments.html`
   - `all-days.html`

Nếu banner hiện cảnh báo chưa cấu hình bridge hoặc không kết nối được bridge, kiểm tra lại:

- `bridgeUrl` trong `app-config.js`
- quyền truy cập web app
- `ALLOWED_PARENT_ORIGINS` trong `Code.gs`
