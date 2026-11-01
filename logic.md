# Logic hiện tại — Chùa Linh Ứng Online

Tài liệu mô tả cách hệ thống chạy sau khi thêm chế độ độc lập (không cần TikTok/server).

## 1. Hai chế độ chạy

| | Chế độ server (gốc) | Chế độ độc lập (mới) |
|---|---|---|
| Ai xử lý nghi thức | `server.js` (Bun + Express + WebSocket) | `public/js/local-engine.js` ngay trong trình duyệt |
| Nguồn sự kiện | Bình luận/tim/quà/follow TikTok, hoặc bảng điều khiển | Người chơi bấm nút trên màn hình |
| Lưu công đức | `data/merit-state.json` | `localStorage` (khóa `temple_local_state_v1`) |
| Giọng đọc | ZeroTTS qua `/api/tts` (Python) | Giọng tiếng Việt của trình duyệt (`speechSynthesis`) |
| Host | `bun run server.js` | Bất kỳ static host (Cloudflare Pages, `python3 -m http.server -d public`) |

Phần hiển thị (`live.js`, `particles.js`, `audio.js`, CSS) dùng chung cho cả hai chế độ.

## 2. Cấu trúc file

```
public/
  index.html          Khung 9:16 (1080x1920), HUD, nút nghi lễ, cổng vào, tờ quẻ, bảng điều khiển
  css/live.css        Toàn bộ giao diện
  js/fortunes.js      Bộ 10 quẻ xăm (window.TEMPLE_FORTUNES), sao từ FORTUNE_DECK của server.js
  js/local-engine.js  Engine nghi thức chạy cục bộ (window.TempleLocalEngine)
  js/audio.js         TempleAudioEngine: nhạc nền, mõ, chuông, hàng đợi giọng đọc
  js/particles.js     Canvas hiệu ứng: khói hương, cánh sen, sóng chuông
  js/live.js          Điều phối: nhận sự kiện -> hiệu ứng, gắn nút, chọn chế độ
server.js             Server TikTok + JSON-RPC (chỉ dùng ở chế độ server)
```

Thứ tự nạp script: `fortunes.js` → `local-engine.js` → `audio.js` → `particles.js` → `live.js`.

## 3. Chọn chế độ (`live.js`, phần WebSocket)

1. Trang mở WebSocket tới `/ws` của chính host.
2. Nếu `?standalone=1` hoặc mở bằng `file://` thì vào chế độ độc lập ngay, không thử kết nối.
3. Nếu kết nối thất bại **ngay lần đầu và chưa từng mở được** (ví dụ trên Cloudflare Pages) thì gọi `enterStandalone()`. Nếu từng kết nối được rồi thì chỉ thử lại sau mỗi 2 giây, không chuyển chế độ.
4. `enterStandalone()`:
   - thêm class `standalone` vào `<body>` (ẩn các phần `.tiktok-only`),
   - đặt `audio.standalone = true` (không gọi `/api/tts`),
   - vẽ trạng thái ban đầu từ `TempleLocalEngine.state()`,
   - hiện cổng nhập pháp danh `#welcomeGate` (trừ khi `?obs=1`).

## 4. Luồng một nghi thức

```
Bấm nút ──► callRpc(method, params)
              │
              ├─ chế độ độc lập: TempleLocalEngine.call() ──► { event, state }
              ├─ có WebSocket mở: gửi JSON-RPC, server phát lại temple.event cho mọi client
              └─ không có WS: POST /rpc; nếu lỗi thì rơi về engine cục bộ
                                   │
                                   ▼
              applyRpcResult ─► updateUIState(state)   (số liệu, nhang, bảng vàng, đạo tràng)
                             └► triggerRitualVisuals(event)  (âm thanh + hiệu ứng theo event.type)
```

Các method dùng chung với server: `temple.burnIncense`, `strikeWoodenFish`, `ringBell`, `sendPrayer`, `offerGift`, `grandCeremony`, `drawFortune`, `updateSettings`.

### Điểm công đức (cả server lẫn engine cục bộ)

| Nghi thức | Công đức | Ghi chú |
|---|---|---|
| Thắp hương | `count × 5` (mặc định 3 nén = 15) | tăng số nén đang cháy, tối đa 36 |
| Gõ mõ | `count` (1 nhịp = 1) | tăng `woodenFishHits` |
| Thỉnh chuông | `count × 10` | tăng `bellRings` |
| Hoa đăng (cầu phúc) | 10 | tăng `lanternCount` |
| Xin xăm | 10 | tăng `fortuneCount` |
| Dâng quà | `max(20, coins × hệ số)` | hệ số 20 (<10 coin), 30 (≥10), 50 (≥100) |

Mỗi nghi thức ghi công đức cho một "thí chủ" (khóa là tên viết thường), cộng vào `totalMerit`, và thêm một bản ghi vào `recentEvents` (giữ tối đa 35).

### Làm sạch dữ liệu

Tên (tối đa 26 ký tự) và lời khấn (tối đa 120) được chuẩn hóa Unicode, bỏ ký tự lạ, chặn từ phản cảm và chuỗi ít hơn 2 chữ cái. Tên không hợp lệ thành `Thí Chủ Hữu Duyên`. Engine cục bộ có bộ lọc rút gọn so với `server.js`.

## 5. Hiệu ứng theo loại sự kiện (`triggerRitualVisuals`)

- `burnIncense`: chuông ngọc, khói hương, chữ `+CĐ` bay lên, nhân vật bước trên thảm đỏ.
- `strikeWoodenFish`: tiếng mõ, đạo tràng vái nhẹ, chữ `+CĐ`.
- `ringBell`: tiếng đại hồng chung, sóng âm, đạo tràng vái, nút chuông lắc.
- `sendPrayer`: hoa đăng bay lên mang tên và lời khấn.
- `offerGift` / `grandCeremony`: chuông + hoa rơi; đại lễ có banner Kim Long.
- `drawFortune`: xem mục 6.

Nếu `event.ttsText` có nội dung (trừ xin xăm) thì đưa vào hàng đợi giọng đọc.

## 6. Xin xăm

1. Bấm nút → `requestFortune()`. Cờ `fortuneBusy` chặn bấm chồng khi đang xin (tự nhả sau 45 giây phòng mất sự kiện).
2. Engine chọn một quẻ ngẫu nhiên, **không trùng quẻ vừa gieo** (`pickFortune`), cộng 10 công đức.
3. Giao diện phát tiếng lắc, ống xăm rung và que xăm rơi ra mang số quẻ (`FORTUNE_SHAKE_MS = 1500`).
4. Nội dung đọc được đưa vào hàng đợi TTS. Khi giọng đọc **bắt đầu** (`onStart`), tờ quẻ mới hiện, nhưng không sớm hơn 1,5 giây sau lúc lắc. Không có giọng đọc thì `onStart` chạy ngay và vẫn chờ đủ 1,5 giây.
5. Khi đọc xong (`onEnd`) tờ quẻ tự đóng sau 6 giây; còn không có `onEnd` thì tự đóng sau 30 giây. Người chơi có thể bấm "Tạ ơn, đóng lại", bấm nền, hoặc "Xin quẻ khác".

## 7. Gõ mõ và thỉnh chuông

- **Gõ mõ** (`bindWoodenFish`): `pointerdown` gõ 1 nhịp. Giữ hơn 420 ms thì lặp mỗi 480 ms cho đến khi thả/rời nút/hủy. Gắn cho cả nút trên bàn thờ và nút ở thanh đáy.
- **Thỉnh chuông** (`ringBellNow`): gọi `temple.ringBell`, nút lắc. Ở chế độ độc lập đặt `readTts: false` để không đọc lời nguyện mỗi lần bấm.

## 8. Âm thanh (`audio.js`)

- **Nhạc nền**: `/assets/music/music1.mp3` lặp vô hạn, mặc định 65%. Thiếu file thì chuyển sang nhạc tổng hợp bằng Web Audio. Tự hạ âm khi có giọng đọc (ducking, còn 35% âm lượng nền, tối thiểu 0,08).
- **Mõ, chuông, chuông ngọc, lắc xăm**: tổng hợp bằng Web Audio, không dùng file.
- **Giọng đọc** (`enqueueTts`): hàng đợi tối đa 6 mục, phát tuần tự, quá 6 thì bỏ mục cũ nhất (vẫn gọi `onStart`/`onEnd` của nó). Thứ tự thử:
  1. URL có sẵn từ server, hoặc gọi `/api/tts` (ZeroTTS) — bỏ qua ở chế độ độc lập;
  2. giọng tiếng Việt của trình duyệt (`speakBrowser`, ưu tiên giọng Natural/Online/Google);
  3. không có giọng nào: chỉ hiện chữ, gọi `onStart` ngay và `onEnd` sau 5,5 giây.
- Trình duyệt chặn tự phát âm thanh, nên `AudioContext` chỉ được mở sau thao tác đầu tiên (bấm "Vào Chánh Điện" hoặc bất kỳ cú chạm nào).
- Âm lượng nhạc và giọng đọc lưu ở `localStorage` (`temple_music_vol`, `temple_tts_vol`).

## 9. Bảng vàng và đạo tràng

`updateUIState` nhận `leaderboard` đã sắp theo công đức giảm dần:
- Top 6 ngồi trên 6 đệm quỳ VIP phía trước bàn thờ;
- tối đa 40 Phật tử quỳ hai bên thảm đỏ;
- Top 4 hiện ở bảng "Tấm lòng thành" góc dưới phải.

Lần đầu mở ở chế độ độc lập chưa có ai, engine nạp sẵn 14 Phật tử mẫu (Diệu Hạnh, Minh Tâm...) để chánh điện không trống. Tên người chơi được thêm vào và cạnh tranh công đức như mọi người khác.

## 10. Bố cục và responsive

- Sân khấu là khung logic 1080×1920, `fitStage()` co bằng `transform: scale()` theo chiều rộng wrapper.
- Wrapper cao `min(96vh, (100vw − 24px) × 16/9)`, nên luôn đúng tỉ lệ 9:16 trên cả màn hình rộng lẫn điện thoại.
- Bảng điều khiển (`.quick-dock`) ẩn mặc định; class `dock-open` trên `<body>` hiện nó. Bảng luôn ẩn lúc đầu ở mọi kích thước màn hình; bấm ⚙️ để bật/tắt. Dưới 900px nó thành ngăn kéo phủ toàn màn hình.
- `?obs=1` bỏ viền, ẩn bảng điều khiển, nút ⚙️ và cổng vào, dùng làm Browser Source cho OBS/TikTok Live Studio.

## 11. Lưu trữ phía trình duyệt

| Khóa `localStorage` | Nội dung |
|---|---|
| `temple_local_state_v1` | Trạng thái chùa (công đức, nhật ký, Phật tử) của chế độ độc lập |
| `temple_name` | Pháp danh đã nhập |
| `temple_music_vol`, `temple_tts_vol` | Âm lượng nhạc nền, giọng đọc |

Xóa dữ liệu trình duyệt là đặt lại toàn bộ công đức.

## 12. Hạn chế đã biết

- Chế độ độc lập chỉ có một người chơi thật; công đức không chia sẻ giữa các thiết bị hay người xem.
- Bộ quẻ chỉ có 10 quẻ (README gốc ghi 18); thêm quẻ bằng cách sửa `fortunes.js` và `FORTUNE_DECK` trong `server.js` cho đồng bộ.
- Các nút "Tự động giả lập" và TikTok trong bảng điều khiển bị ẩn ở chế độ độc lập vì chỉ server mới xử lý.
- Hàng đợi giọng đọc tuần tự: tờ quẻ có thể hiện chậm nếu trước đó còn lời đọc dài chưa xong.
