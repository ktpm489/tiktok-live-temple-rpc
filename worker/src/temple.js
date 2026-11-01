import { DurableObject } from 'cloudflare:workers';
import FORTUNES from './fortunes.json';

/**
 * Temple — Durable Object giữ MỘT chánh điện dùng chung cho mọi người xem.
 * Nói cùng giao thức JSON-RPC/WebSocket như server.js nên live.js dùng lại nguyên vẹn:
 *   client -> { method: 'temple.xxx', params }      server -> temple.event / temple.state
 * Công đức tính ở đây (không tin số từ trình duyệt), mỗi kết nối bị giới hạn tốc độ.
 */

// ---- Làm sạch tên / lời khấn (rút gọn từ server.js) ----
const ALLOWED_TEXT_RE = /[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s.,!?_-]/g;
const LETTER_RE = /[a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ]/g;
const BAD_WORDS_RE = /(đá dái|địt|lồn|cặc|đm|vcl|vl|yamate|lừa đảo|telegram)/i;
const DEFAULT_NAME = 'Thí Chủ Hữu Duyên';

function clean(raw, maxLen) {
  const s = String(raw || '').normalize('NFC').replace(ALLOWED_TEXT_RE, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen);
  if (!s || BAD_WORDS_RE.test(s) || (s.match(LETTER_RE) || []).length < 2) return '';
  return s;
}
const cleanName = (n) => clean(n, 26) || DEFAULT_NAME;
const cleanWish = (w) => clean(w, 120);
const clamp = (n, lo, hi, dflt) => Math.max(lo, Math.min(hi, Number(n) || dflt));
const keyOf = (name) => name.toLowerCase().slice(0, 40);

// Lệnh cho phép từ trình duyệt và khoảng cách tối thiểu giữa 2 lần gọi của cùng một kết nối (ms).
// Không cho offerGift/grandCeremony/updateSettings: công đức quà phải đi kèm thanh toán thật.
const METHOD_GAP = {
  'temple.join': 500,
  'temple.burnIncense': 3000,
  'temple.strikeWoodenFish': 120,
  'temple.ringBell': 2000,
  'temple.sendPrayer': 5000,
  'temple.drawFortune': 8000
};

// Bảng vàng theo ngày / tuần tính theo giờ Việt Nam (UTC+7), tuần bắt đầu từ thứ Hai
function periodKeys(now = Date.now()) {
  const d = new Date(now + 7 * 3600 * 1000);
  const day = d.toISOString().slice(0, 10);
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000);
  return { day: `d:${day}`, week: `w:${monday.toISOString().slice(0, 10)}` };
}

const WOOD_BATCH_MS = 600;   // gom tiếng mõ của cả phòng thành 1 sự kiện
const SAVE_GAP_MS = 2000;    // ghi SQLite tối đa mỗi 2 giây
const MAX_DEVOTEES = 600;
const MAX_HALL = 40;         // đạo tràng hiển thị tối đa 40 chỗ quỳ

const SEED = [['Diệu Hạnh', 320], ['Minh Tâm', 260], ['Thiện Đức', 210], ['Huệ An', 175], ['Tịnh Nhã', 140], ['Quảng Trí', 120], ['Chơn Như', 95], ['Pháp Hỷ', 80], ['Nguyên Thanh', 66], ['Tâm Đăng', 52], ['Diệu Liên', 40], ['Trí Hải', 31], ['Phước Lộc', 22], ['Hạnh Nguyện', 15]];

const DEFAULT_COUNTERS = {
  totalIncense: 108,
  totalMerit: 1080,
  woodenFishHits: 360,
  bellRings: 36,
  lanternCount: 18,
  fortuneCount: 12,
  activeIncenseSticks: 9,
  offerings: { lotus: 3, fruit: 2, lamp: 2, dragon: 1 }
};

export class Temple extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.counters = { ...DEFAULT_COUNTERS };
    this.devotees = new Map();
    this.dirtyDevotees = new Set();
    this.countersDirty = false;
    this.lastSave = 0;
    this.recentEvents = [];
    this.pendingWood = null;
    this.lastOnline = -1;
    this.gaps = new WeakMap();
    this.lastFortune = -1;
    this.alarmAt = 0;
    this.daily = new Map();
    this.weekly = new Map();
    this.dirtyPeriod = new Set(); // 'd|key' hoặc 'w|key'
    this.periods = periodKeys();

    ctx.blockConcurrencyWhile(async () => {
      const sql = ctx.storage.sql;
      sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
      sql.exec('CREATE TABLE IF NOT EXISTS devotees (k TEXT PRIMARY KEY, name TEXT NOT NULL, merit INTEGER NOT NULL, incense INTEGER NOT NULL, gifts INTEGER NOT NULL, wish TEXT NOT NULL)');
      sql.exec('CREATE TABLE IF NOT EXISTS period_merit (period TEXT NOT NULL, k TEXT NOT NULL, name TEXT NOT NULL, merit INTEGER NOT NULL, PRIMARY KEY (period, k))');
      sql.exec('DELETE FROM period_merit WHERE period NOT IN (?, ?)', this.periods.day, this.periods.week);
      for (const r of sql.exec('SELECT period, k, name, merit FROM period_merit').toArray()) {
        (r.period === this.periods.day ? this.daily : this.weekly).set(r.k, { name: r.name, merit: r.merit });
      }
      const row = sql.exec("SELECT v FROM meta WHERE k = 'counters'").toArray()[0];
      if (row) this.counters = { ...DEFAULT_COUNTERS, ...JSON.parse(row.v) };
      for (const d of sql.exec('SELECT k, name, merit, incense, gifts, wish FROM devotees').toArray()) {
        this.devotees.set(d.k, { name: d.name, merit: d.merit, incense: d.incense, gifts: d.gifts, wish: d.wish });
      }
      if (this.devotees.size === 0) {
        // Đạo tràng mới mở: vài Phật tử mẫu để chánh điện không trống
        for (const [name, merit] of SEED) this.devotees.set(keyOf(name), { name, merit, incense: Math.round(merit / 10), gifts: 0, wish: '' });
        this.devotees.forEach((_, k) => this.dirtyDevotees.add(k));
        this.countersDirty = true;
      }
    });
  }

  // ---------------------------------------------------------------- kết nối
  async fetch(request) {
    // Chỉ nhận WebSocket từ chính trang này, tránh trang lạ nhúng và bắn lệnh vào chùa
    const origin = request.headers.get('Origin');
    if (origin && new URL(origin).host !== new URL(request.url).host) {
      return new Response('Forbidden origin', { status: 403 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ name: '' });
    server.send(JSON.stringify({ jsonrpc: '2.0', method: 'temple.state', params: this.publicState() }));
    this.scheduleTick(WOOD_BATCH_MS); // báo số người online mới cho mọi người
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > 2048) return;
    let msg;
    try { msg = JSON.parse(message); } catch { return; }
    const method = msg && msg.method;
    const gap = METHOD_GAP[method];
    if (!gap) return;

    const now = Date.now();
    const last = this.gaps.get(ws) || {};
    if (now - (last[method] || 0) < gap) return;
    last[method] = now;
    this.gaps.set(ws, last);

    const params = msg.params && typeof msg.params === 'object' ? msg.params : {};
    const att = ws.deserializeAttachment() || { name: '' };
    if (params.user) {
      const name = cleanName(params.user);
      if (name !== att.name) {
        att.name = name;
        ws.serializeAttachment(att);
        this.scheduleTick(WOOD_BATCH_MS);
      }
    }
    const user = att.name || DEFAULT_NAME;
    const clientId = typeof params.clientId === 'string' ? params.clientId.slice(0, 40) : '';

    switch (method) {
      case 'temple.join':
        this.broadcastState();
        return;
      case 'temple.strikeWoodenFish':
        return this.strikeWoodenFish(user);
      case 'temple.burnIncense':
        return this.emit(this.burnIncense(user, params), clientId);
      case 'temple.ringBell':
        return this.emit(this.ringBell(user, params), clientId);
      case 'temple.sendPrayer':
        return this.emit(this.sendPrayer(user, params), clientId);
      case 'temple.drawFortune':
        return this.emit(this.drawFortune(user, params), clientId);
    }
  }

  async webSocketClose(ws) {
    try { ws.close(1000, 'bye'); } catch {}
    this.scheduleTick(WOOD_BATCH_MS);
  }

  async webSocketError() {
    this.scheduleTick(WOOD_BATCH_MS);
  }

  // ---------------------------------------------------------------- nghi thức
  record(user, merit, incense = 0, gifts = 0, wish = '') {
    const key = keyOf(user);
    const d = this.devotees.get(key) || { name: user, merit: 0, incense: 0, gifts: 0, wish: '' };
    d.name = user;
    d.merit += merit;
    d.incense += incense;
    d.gifts += gifts;
    if (wish) d.wish = wish;
    this.devotees.set(key, d);
    this.dirtyDevotees.add(key);
    this.rollPeriods();
    for (const [scope, map] of [['d', this.daily], ['w', this.weekly]]) {
      const e = map.get(key) || { name: user, merit: 0 };
      e.name = user;
      e.merit += merit;
      map.set(key, e);
      this.dirtyPeriod.add(`${scope}|${key}`);
    }
    this.counters.totalMerit += merit;
    this.countersDirty = true;
    this.scheduleTick(SAVE_GAP_MS);
    return d;
  }

  burnIncense(user, p) {
    const count = clamp(p.count, 1, 3, 3);
    const wish = cleanWish(p.wish) || 'Thành tâm dâng hương bái Phật, cầu bình an cát tường';
    const merit = count * 5;
    this.counters.totalIncense += count;
    this.counters.activeIncenseSticks = Math.min(36, this.counters.activeIncenseSticks + count);
    this.record(user, merit, count, 0, wish);
    return {
      type: 'burnIncense', user, count, merit, wish,
      ttsText: `Nam mô A Di Đà Phật. Cảm tạ thí chủ ${user} đã thành tâm thắp ${count} nén hương thơm. ${wish}.`
    };
  }

  ringBell(user, p) {
    const wish = cleanWish(p.wish) || 'Thỉnh chuông Bát Nhã, phiền não tiêu tan, trí tuệ sáng ngời';
    this.counters.bellRings += 1;
    this.record(user, 10, 0, 0, wish);
    return { type: 'ringBell', user, count: 1, merit: 10, wish, ttsText: '' };
  }

  sendPrayer(user, p) {
    const wish = cleanWish(p.wish) || 'Cầu cho quốc thái dân an, gia đình mạnh khỏe hạnh phúc';
    this.counters.lanternCount += 1;
    this.record(user, 10, 1, 0, wish);
    return {
      type: 'sendPrayer', user, wish, merit: 10,
      ttsText: `Lời cầu nguyện của thí chủ ${user}: ${wish}. Nam mô A Di Đà Phật.`
    };
  }

  drawFortune(user, p) {
    // Không lặp lại quẻ vừa gieo
    let i;
    do { i = Math.floor(Math.random() * FORTUNES.length); } while (FORTUNES.length > 1 && i === this.lastFortune);
    this.lastFortune = i;
    const fortune = FORTUNES[i];
    this.counters.fortuneCount += 1;
    this.record(user, 10, 0, 0, `Xin xăm: Quẻ số ${fortune.number} (${fortune.rank})`);
    return {
      type: 'drawFortune', user, topic: cleanWish(p.topic), fortune, merit: 10,
      ttsText: `Thí chủ ${user} vừa gieo được ${fortune.ttsSummary}`
    };
  }

  // Tiếng mõ của cả phòng được gom lại, phát 1 lần mỗi WOOD_BATCH_MS để không quá tải khi đông người
  strikeWoodenFish(user) {
    this.counters.woodenFishHits += 1;
    this.record(user, 1);
    const w = this.pendingWood || (this.pendingWood = { count: 0, users: new Set(), last: user });
    w.count += 1;
    w.users.add(user);
    w.last = user;
    this.scheduleTick(WOOD_BATCH_MS);
  }

  // ---------------------------------------------------------------- phát tin
  emit(event, clientId) {
    const entry = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      clientId, // để trình duyệt biết đây có phải nghi thức của chính mình (chỉ người xin xăm mới thấy tờ quẻ)
      ...event
    };
    this.recentEvents.unshift(entry);
    this.recentEvents.length = Math.min(this.recentEvents.length, 35);
    this.broadcast({ jsonrpc: '2.0', method: 'temple.event', params: { event: entry, state: this.publicState() } });
  }

  broadcastState() {
    this.broadcast({ jsonrpc: '2.0', method: 'temple.state', params: this.publicState() });
  }

  broadcast(obj) {
    const text = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(text); } catch {}
    }
  }

  // Sang ngày/tuần mới thì bảng tương ứng được làm mới từ đầu
  rollPeriods() {
    const now = periodKeys();
    if (now.day !== this.periods.day) {
      this.daily.clear();
      this.dirtyPeriod = new Set([...this.dirtyPeriod].filter((x) => !x.startsWith('d|')));
    }
    if (now.week !== this.periods.week) {
      this.weekly.clear();
      this.dirtyPeriod = new Set([...this.dirtyPeriod].filter((x) => !x.startsWith('w|')));
    }
    if (now.day !== this.periods.day || now.week !== this.periods.week) {
      this.periods = now;
      this.ctx.storage.sql.exec('DELETE FROM period_merit WHERE period NOT IN (?, ?)', now.day, now.week);
    }
  }

  topOf(map, limit = 5) {
    return [...map.values()].sort((a, b) => b.merit - a.merit).slice(0, limit).map((e, i) => ({ rank: i + 1, name: e.name, merit: e.merit }));
  }

  publicState() {
    this.rollPeriods();
    const sockets = this.ctx.getWebSockets();
    const online = new Map();
    for (const ws of sockets) {
      const name = (ws.deserializeAttachment() || {}).name;
      if (name) online.set(keyOf(name), name);
    }

    // Bảng vàng theo công đức, sau đó thêm người đang online chưa có công đức để họ thấy mình trong đạo tràng
    const ranked = [...this.devotees.entries()].sort((a, b) => b[1].merit - a[1].merit).slice(0, 24);
    const seen = new Set(ranked.map(([k]) => k));
    const hall = ranked.map(([k, d]) => ({ name: d.name, merit: d.merit, incense: d.incense, lastWish: d.wish, key: k, online: online.has(k) }));
    for (const [k, name] of online) {
      if (hall.length >= MAX_HALL) break;
      if (seen.has(k)) continue;
      const d = this.devotees.get(k);
      hall.push({ name, merit: d ? d.merit : 0, incense: d ? d.incense : 0, lastWish: d ? d.wish : '', key: k, online: true });
    }
    const leaderboard = hall.map((d, i) => ({ rank: i + 1, name: d.name, uniqueId: d.key.replace(/\s+/g, ''), avatar: '', merit: d.merit, incense: d.incense, lastWish: d.lastWish, online: d.online }));

    return {
      realtime: true,
      online: sockets.length,
      ...this.counters,
      haloIntensity: Math.min(1, 0.35 + (this.counters.totalMerit % 1000) / 1400),
      leaderboard,
      leaderboards: { today: this.topOf(this.daily), week: this.topOf(this.weekly) },
      recentEvents: this.recentEvents.slice(0, 15),
      settings: { autoSim: false },
      tiktok: { connected: false, connecting: false, username: '', viewerCount: 0 }
    };
  }

  // ---------------------------------------------------------------- nhịp định kỳ (alarm)
  // Đặt alarm nếu chưa có cái nào sắp tới. Không cần await: ghi storage của Durable Object được đảm bảo hoàn tất trước khi trả lời.
  scheduleTick(ms) {
    const now = Date.now();
    if (this.alarmAt > now) return;
    this.alarmAt = now + ms;
    this.ctx.storage.setAlarm(this.alarmAt);
  }

  async alarm() {
    this.alarmAt = 0;
    const online = this.ctx.getWebSockets().length;
    if (this.pendingWood) {
      const w = this.pendingWood;
      this.pendingWood = null;
      this.emit({ type: 'strikeWoodenFish', user: w.last, count: Math.min(w.count, 50), merit: w.count, users: w.users.size, names: [...w.users].slice(0, 6), ttsText: '' }, '');
      this.lastOnline = online;
    } else if (online !== this.lastOnline) {
      this.lastOnline = online;
      this.broadcastState();
    }

    if ((this.countersDirty || this.dirtyDevotees.size || this.dirtyPeriod.size) && Date.now() - this.lastSave >= SAVE_GAP_MS) this.save();
    if (this.countersDirty || this.dirtyDevotees.size || this.dirtyPeriod.size || this.pendingWood) this.scheduleTick(SAVE_GAP_MS);
  }

  save() {
    const sql = this.ctx.storage.sql;
    this.ctx.storage.transactionSync(() => {
      sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('counters', ?)", JSON.stringify(this.counters));
      for (const k of this.dirtyDevotees) {
        const d = this.devotees.get(k);
        if (d) sql.exec('INSERT OR REPLACE INTO devotees (k, name, merit, incense, gifts, wish) VALUES (?, ?, ?, ?, ?, ?)', k, d.name, d.merit, d.incense, d.gifts, d.wish);
      }
      for (const ref of this.dirtyPeriod) {
        const [scope, k] = ref.split('|');
        const e = (scope === 'd' ? this.daily : this.weekly).get(k);
        if (e) sql.exec('INSERT OR REPLACE INTO period_merit (period, k, name, merit) VALUES (?, ?, ?, ?)', scope === 'd' ? this.periods.day : this.periods.week, k, e.name, e.merit);
      }
      if (this.devotees.size > MAX_DEVOTEES) {
        const online = new Set(this.ctx.getWebSockets().map((ws) => keyOf((ws.deserializeAttachment() || {}).name || '')));
        const drop = [...this.devotees.entries()].filter(([k]) => !online.has(k)).sort((a, b) => a[1].merit - b[1].merit).slice(0, this.devotees.size - MAX_DEVOTEES);
        for (const [k] of drop) {
          this.devotees.delete(k);
          sql.exec('DELETE FROM devotees WHERE k = ?', k);
        }
      }
    });
    this.dirtyDevotees.clear();
    this.dirtyPeriod.clear();
    this.countersDirty = false;
    this.lastSave = Date.now();
  }
}
