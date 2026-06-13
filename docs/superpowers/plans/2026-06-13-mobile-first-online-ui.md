# Mobile-First Online UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bỏ khu `Nhập JSON` khỏi giao diện, tối ưu layout cho điện thoại, và chuyển frontend sang `cache-first for read / online-ack for write`.

**Architecture:** HTML hiện tại giữ nguyên cấu trúc trang nhưng đổi thứ tự ưu tiên hiển thị trên mobile bằng CSS và chỉnh nhẹ markup. JavaScript tiếp tục dùng `remote-store.js` làm nguồn trạng thái đồng bộ, nhưng quá trình load/save được tách rõ thành đọc cache nhanh và chỉ commit ghi sau khi online xác nhận.

**Tech Stack:** HTML, CSS, browser JavaScript, Google Apps Script bridge, localStorage cache

---

### Task 1: Gỡ khu `Nhập JSON` khỏi giao diện chính

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Xóa riêng khối nhập file JSON và giữ lại các nút điều hướng cần thiết**

```html
<section class="panel">
  <h2>Dữ liệu</h2>
  <div class="button-grid">
    <a class="btn" href="all-days.html">Tổng hợp tất cả ngày</a>
    <a class="btn" href="payments.html">Tiền đã đóng</a>
    <button id="btnClearDate" class="btn danger-light span-2" type="button">Xóa dữ liệu ngày này</button>
  </div>
  <p class="help">Khi bridge Apps Script đã được cấu hình, dữ liệu sẽ lưu chung online trong Google Sheets và xem được từ mọi máy.</p>
</section>
```

- [ ] **Step 2: Giữ nguyên logic import JSON phía JavaScript, không xóa code nền ở bước này**

Run review: kiểm tra `index.html` không còn:

```html
<label class="btn file-btn">
  Nhập JSON
  <input id="importJson" type="file" accept="application/json,.json" />
</label>
```

- [ ] **Step 3: Kiểm tra trang chính vẫn render được sau khi bỏ nút**

Run: mở `index.html` hoặc site live và xác nhận khu `Dữ liệu` chỉ còn 3 thao tác còn lại.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: remove import json entry from main UI"
```

### Task 2: Tối ưu layout mobile cho 3 trang

**Files:**
- Modify: `styles.css`
- Modify: `index.html`
- Modify: `payments.html`
- Modify: `all-days.html`

- [ ] **Step 1: Điều chỉnh header và navigation cho mobile-first**

```css
@media (max-width: 920px) {
  .app-header {
    display: grid;
    gap: 14px;
    padding: 20px 14px 14px;
  }

  .header-actions {
    justify-content: stretch;
    width: 100%;
  }

  .header-actions > * {
    width: 100%;
  }

  .page-nav {
    display: grid;
    grid-template-columns: 1fr;
  }

  .nav-link {
    min-height: 44px;
  }
}
```

- [ ] **Step 2: Đưa layout chính về một cột và ưu tiên khối thao tác trên mobile**

```css
@media (max-width: 920px) {
  .layout,
  .single-layout {
    padding: 0 14px 24px;
  }

  .layout {
    grid-template-columns: 1fr;
  }

  .sidebar,
  .content {
    gap: 12px;
  }

  .panel {
    padding: 16px 14px;
  }
}
```

- [ ] **Step 3: Tăng khả năng chạm và thu gọn bố cục card/bảng trên điện thoại**

```css
@media (max-width: 560px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .button-grid {
    grid-template-columns: 1fr;
  }

  .set-card,
  .section-heading {
    display: grid;
    gap: 10px;
  }

  .set-actions,
  .header-actions {
    justify-content: start;
  }

  .btn,
  .nav-link,
  input[type="text"],
  input[type="number"],
  input[type="date"],
  input[type="datetime-local"],
  select {
    min-height: 44px;
  }

  .toast {
    left: 14px;
    right: 14px;
    bottom: 14px;
    max-width: none;
  }
}
```

- [ ] **Step 4: Kiểm tra markup của `payments.html` và `all-days.html` vẫn tận dụng được CSS mới mà không cần đổi cấu trúc lớn**

Review expectation:

```html
<main class="layout">...</main>
<main class="single-layout">...</main>
```

Hai trang này phải tiếp tục dùng các lớp hiện có để hưởng responsive mới, tránh thêm nhánh HTML riêng cho mobile.

- [ ] **Step 5: Commit**

```bash
git add styles.css index.html payments.html all-days.html
git commit -m "feat: optimize mobile layout across pages"
```

### Task 3: Chuyển load sang cache-first cho cảm giác mở nhanh

**Files:**
- Modify: `remote-store.js`
- Modify: `app.js`
- Modify: `payments.js`
- Modify: `all-days.js`

- [ ] **Step 1: Đảm bảo `loadAppState()` trả được state cache/local ngay để UI render sớm**

```js
// remote-store.js
return {
  state,
  sync: {
    remoteEnabled: hasRemoteBridge(),
    bridgeUrl: config.bridgeUrl,
    bridgeOrigin: getBridgeOrigin(),
    source: core.hasMeaningfulSharedData(cachedShared) ? 'cache' : 'default',
    notice: hasRemoteBridge() ? 'Đang tải dữ liệu online...' : 'Chưa cấu hình bridge Apps Script. Dữ liệu hiện chỉ lưu trên máy này.',
    meta: null
  }
};
```

- [ ] **Step 2: Tách giai đoạn “render nhanh” và “đồng bộ online” trong từng trang**

```js
// app.js / payments.js / all-days.js
const initial = await store.loadAppState();
state = initial.state;
syncInfo = initial.sync;
render();

store.refreshFromRemote?.().then((result) => {
  state = result.state;
  syncInfo = result.sync;
  render();
}).catch((error) => {
  syncInfo = {
    ...syncInfo,
    notice: error instanceof Error ? error.message : 'Không kết nối được lưu trữ online.'
  };
  render();
});
```

- [ ] **Step 3: Nếu không muốn thêm API mới `refreshFromRemote()`, giữ `loadAppState()` hiện tại nhưng cập nhật flow để render cache sớm trước khi chờ remote**

```js
// app.js
state = store.readCachedAppState();
syncInfo = {
  remoteEnabled: store.hasRemoteBridge(),
  source: 'cache',
  notice: 'Đang tải dữ liệu online...',
  meta: null
};
render();

const initial = await store.loadAppState();
state = initial.state;
syncInfo = initial.sync;
render();
```

- [ ] **Step 4: Chọn một trong hai hướng trên, nhưng toàn bộ 3 trang phải dùng cùng một pattern**

Verification target:
- `index.html`, `payments.html`, `all-days.html` đều mở nhanh từ cache.
- Sau đó dữ liệu online mới đè lên nếu tải thành công.

- [ ] **Step 5: Commit**

```bash
git add remote-store.js app.js payments.js all-days.js
git commit -m "feat: render cache first before online sync"
```

### Task 4: Chuyển thao tác lưu sang online-ack save

**Files:**
- Modify: `app.js`
- Modify: `payments.js`
- Modify: `remote-store.js`
- Modify: `styles.css`

- [ ] **Step 1: Thêm trạng thái đang lưu và khóa thao tác lặp**

```js
// app.js / payments.js
isSaving = true;
syncInfo = {
  ...syncInfo,
  notice: 'Đang lưu online...'
};
render();
```

- [ ] **Step 2: Chỉ commit state thành công sau khi remote phản hồi**

```js
try {
  const result = await store.saveSharedState(nextState);
  state = result.state;
  syncInfo = {
    ...result.sync,
    notice: 'Đã lưu online'
  };
  render();
} catch (error) {
  syncInfo = {
    ...syncInfo,
    notice: error instanceof Error ? error.message : 'Không lưu được dữ liệu online.'
  };
  render();
}
```

- [ ] **Step 3: Không reset form hoặc chèn card lịch sử trước khi save thành công**

```js
// app.js
// chỉ reset sau khi saveSharedState thành công
state.selectedLoserIds = [];
state.stake = 0;
state.setNote = '';
```

- [ ] **Step 4: Thêm trạng thái banner riêng cho `busy` để phản hồi tốt trên mobile**

```css
.sync-banner.busy {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
}
```

- [ ] **Step 5: Commit**

```bash
git add app.js payments.js remote-store.js styles.css
git commit -m "feat: require online acknowledgment for saves"
```

### Task 5: Verification

**Files:**
- Modify: `tests/remote-store.test.js`
- Optional Create: `tests/mobile-smoke-notes.md`

- [ ] **Step 1: Thêm test cho hành vi config bridge và trạng thái cache-first nếu có API mới**

```js
test('uses configured bridge url when provided', () => {
  const store = loadRemoteStore({
    appRemoteConfig: { bridgeUrl: 'https://example.com/exec' },
    location: { origin: 'https://a-ten-mauve.vercel.app' }
  });

  assert.equal(store.config.bridgeUrl, 'https://example.com/exec');
});
```

- [ ] **Step 2: Chạy test mức file cho remote store**

Run:

```bash
node --test tests/remote-store.test.js
```

Expected: tất cả test `PASS`.

- [ ] **Step 3: Kiểm tra thủ công trên viewport điện thoại**

Run:

```bash
python -m http.server 4173
```

Expected:
- mở `http://localhost:4173/index.html`,
- dùng DevTools viewport khoảng `390x844`,
- khối nhập séc nằm đầu trang,
- không còn khu `Nhập JSON`,
- bảng dài vẫn dùng được bằng cuộn ngang.

- [ ] **Step 4: Kiểm tra save thất bại không tạo dữ liệu giả**

Manual procedure:
- mở trang khi bridge online lỗi hoặc chặn request,
- bấm `Lưu 1 séc`,
- xác nhận không có card mới được thêm như thể đã lưu thành công,
- form vẫn còn dữ liệu để thử lại.

- [ ] **Step 5: Commit**

```bash
git add tests/remote-store.test.js
git commit -m "test: cover online bridge config behavior"
```
