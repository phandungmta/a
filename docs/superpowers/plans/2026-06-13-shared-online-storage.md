# Shared Online Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tách local UI state khỏi shared data và thêm bridge Google Apps Script để dữ liệu dùng chung giữa nhiều máy khi chạy trên Vercel `https://a-ten-mauve.vercel.app`.

**Architecture:** Frontend giữ dạng static site và gọi bridge Apps Script bằng `iframe` ẩn + `postMessage`. Apps Script ghi toàn bộ shared state vào Google Sheets bound spreadsheet.

**Tech Stack:** HTML, CSS, browser JavaScript, Google Apps Script, Google Sheets

---

### Task 1: Tạo lớp state dùng chung

**Files:**
- Create: `shared-state.js`
- Test: `tests/shared-state.test.js`

- [ ] Tạo các hàm chuẩn hóa `players`, `sets`, `payments`.
- [ ] Tách `shared state` khỏi `UI state`.
- [ ] Giữ danh sách người chơi mặc định ở một nơi duy nhất.
- [ ] Viết test cho inject người chơi mặc định và chuẩn hóa state.

### Task 2: Tạo bridge client phía frontend

**Files:**
- Create: `remote-store.js`
- Create: `app-config.js`

- [ ] Tạo bridge client dùng `iframe` ẩn.
- [ ] Thêm cơ chế load remote, fallback cache, seed dữ liệu cũ nếu remote trống.
- [ ] Thêm cơ chế save shared state và rollback khi lỗi.

### Task 3: Nối lại các trang hiện có

**Files:**
- Modify: `index.html`
- Modify: `payments.html`
- Modify: `all-days.html`
- Modify: `app.js`
- Modify: `payments.js`
- Modify: `all-days.js`
- Modify: `styles.css`

- [ ] Nạp `shared-state.js`, `remote-store.js`, `app-config.js`.
- [ ] Thêm banner đồng bộ.
- [ ] Chuyển toàn bộ thao tác thêm/sửa/xóa sang commit dùng chung.
- [ ] Giữ state giao diện trong localStorage.

### Task 4: Thêm backend Apps Script mẫu

**Files:**
- Create: `google-apps-script/Code.gs`
- Create: `google-apps-script/Bridge.html`
- Create: `google-apps-script/appsscript.json`
- Create: `google-apps-script/README.md`

- [ ] Tạo web app trả về bridge HTML có thể nhúng vào iframe.
- [ ] Tạo hàm `getState` và `saveState`.
- [ ] Đọc/ghi các sheet `Meta`, `Players`, `Sets`, `Payments`.

### Task 5: Cập nhật tài liệu và kiểm tra

**Files:**
- Modify: `README.md`
- Modify: `DEPLOY.md`

- [ ] Viết lại hướng dẫn setup Vercel + Apps Script.
- [ ] Chạy test cục bộ cho lớp state.
- [ ] Parse các file JavaScript để bắt lỗi cú pháp trước khi kết thúc.
