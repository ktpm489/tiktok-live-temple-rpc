# Cấu trúc & logic Chánh Điện (Live Online)

Nhánh `func/liveOnline`: phòng realtime (Cloudflare Durable Object `Temple`) + giao diện `public/`. Có 2 chế độ nguồn state: **server realtime** (`worker/src/temple.js`) và **local** (`public/js/local-engine.js`, lưu localStorage). Server TikTok gốc (Bun) chỉ có bảng tổng.

## 1. Bảng vàng "TẤM LÒNG THÀNH" nhiều kỳ

Mục đích: người mới vẫn có cơ hội lên top "Hôm nay".

- Ba bảng: **Hôm nay / Tuần / Tổng** (tab `#lbTabs` trong `index.html`), hiển thị top 4.
- Kỳ tính theo **giờ Việt Nam (UTC+7)**, tuần bắt đầu **thứ Hai**.
  - `periodKeys()` có ở cả `temple.js` (key dạng `d:YYYY-MM-DD`, `w:YYYY-MM-DD`) và `local-engine.js`.
- **Server (`temple.js`)**
  - Map trong RAM `daily`, `weekly`; `dirtyPeriod` (`'d|key'` / `'w|key'`) đánh dấu cần ghi.
  - Bảng SQLite `period_merit (period, k, name, merit)`; khi khởi động xóa kỳ cũ và nạp lại kỳ hiện tại.
  - `addMerit` cộng công đức vào cả `daily` và `weekly`.
  - `rollPeriods()`: sang ngày/tuần mới thì clear map tương ứng, bỏ dirty cũ, xóa dòng SQLite kỳ cũ. Gọi trong `addMerit` và `publicState()`.
  - `save()` ghi `dirtyPeriod` cùng đợt với devotees (tối đa mỗi 2 giây); tick cũng lên lịch lại nếu còn `dirtyPeriod`.
  - `publicState()` trả thêm `leaderboards: { today, week }` (`topOf(map, 5)`); `leaderboard` vẫn là bảng tổng.
- **Local (`local-engine.js`)**: `state.periods { day, week, daily, weekly }`, `rollPeriods()` tự làm mới khi sang kỳ; `getState` trả `leaderboards`.
- **Client (`live.js`)**
  - `renderLeaderboardList()` vẽ theo `lbTab` (lưu `localStorage: temple_lb_tab`, mặc định `today`).
  - Không có `st.leaderboards` (server TikTok gốc) → ẩn tab, dùng bảng tổng.
  - Bảng rỗng → hiện `.lb-empty` "Chưa có ai hôm nay/tuần này".

## 2. Đạo tràng: dựng DOM một lần, chỉ đổi thẻ tên

- **40 ghế** (`HALL_SEAT_COORDS`) được dựng **một lần**; mỗi ghế có sẵn `.seat-badge` (ẩn bằng `hidden`).
- `LABELED_SEAT_ORDER` (18 ghế gần thảm đỏ) là thứ tự gắn thẻ tên.
- `renderCongregationHall(leaderboard)`:
  - Hạng 1-6 ngồi **đệm VIP**; từ hạng 7 ngồi đạo tràng.
  - Người **đang online** (`online: true` từ server) được xếp lên trước.
  - Chỉ cập nhật khi chữ ký tên (`lastHallSig`) đổi → công đức nhích lên không làm dựng lại / mất hoạt cảnh.
  - Lập `seatByName` (tên viết thường → phần tử ghế).
- `renderVipCushions`: cũng chỉ dựng lại khi danh sách tên đổi (`lastVipSig`); lập `vipByName`, mỗi slot có `data-name`.
- Server `publicState()` thêm cờ `online` cho từng mục `leaderboard`.

## 3. Nhân vật làm theo khi hành lễ

- `playSeatAction(name, type)` trong `live.js`: tìm nhân vật của người đó trong `seatByName` hoặc `vipByName`.
  - Hiện bong bóng emoji `.seat-act` (🪵 mõ, 🔔 chuông, 🔥 hương, 🏮 cầu nguyện, 🎋 xăm, 🪷 cúng dường, 🐉 đại lễ; mặc định 🙏) ~1.3 giây.
  - Thêm class `.acting` → viền/phát sáng thẻ tên.
  - `strikeWoodenFish`: animation `act-wood` (nhún 3 lần).
  - Loại khác: lạy qua chuỗi frame `forehead → bowMid → prostrateDeep → bowMid → kneel` (cờ `_bowing` chống chồng).
- Gọi từ handler sự kiện: dùng `ev.names` nếu có, không thì `ev.user`.
- Server: sự kiện `strikeWoodenFish` gom theo `WOOD_BATCH_MS` (600ms) nay kèm `names` (tối đa 6 người) để nhiều người cùng gõ mõ đều có hoạt cảnh.

## 4. Tối ưu tải & hiển thị

- Ảnh nền chánh điện chuyển sang `amitabha_stage.jpg` với `srcset` (`stage_540.jpg` 540w / `amitabha_stage.jpg` 810w), `fetchpriority="high"`, `decoding="async"`; `<link rel="preload">` cho ảnh nền và `devotee.png`.
- Sprite ghế dùng `decoding="async"`; bỏ `animation-delay` inline mỗi ghế.
- CSS `contain: layout style` cho `.hall-seat`, `.vip-devotee-slot`; hỗ trợ `prefers-reduced-motion`.
- `public/.assetsignore` thêm `buddha.png`, `temple_stage_bg.png`, `amitabha_stage.png` (không deploy ảnh gốc nặng); thêm `public/_headers` (cache).

## 5. File liên quan

| File | Thay đổi |
|---|---|
| `worker/src/temple.js` | bảng kỳ, `rollPeriods`, `topOf`, cờ `online`, `names` cho mõ |
| `public/js/local-engine.js` | bảng kỳ cho chế độ local |
| `public/js/live.js` | tab bảng vàng, render ghế một lần, `playSeatAction` |
| `public/css/live.css` | tab, `.lb-empty`, `.seat-act`, `act-wood`, `.acting` |
| `public/index.html` | tab `#lbTabs`, ảnh nền responsive, preload |
