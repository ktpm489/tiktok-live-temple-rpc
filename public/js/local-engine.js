/**
 * TempleLocalEngine — chế độ độc lập (không cần server / TikTok).
 * Có cùng giao diện `call(method, params) -> { event, state }` với JSON-RPC của server.js,
 * nên live.js dùng chung toàn bộ hiệu ứng. Công đức được lưu trong localStorage của trình duyệt.
 */
(function () {
  const STORE_KEY = 'temple_local_state_v1';
  const FORTUNES = window.TEMPLE_FORTUNES || [];

  const DEFAULT_STATE = {
    totalIncense: 108,
    totalMerit: 1080,
    woodenFishHits: 360,
    bellRings: 36,
    lanternCount: 18,
    fortuneCount: 12,
    activeIncenseSticks: 9,
    haloIntensity: 0.45,
    offerings: { lotus: 3, fruit: 2, lamp: 2, dragon: 1 },
    devotees: {},
    recentEvents: [],
    settings: { musicVolume: null, ttsVolume: null, autoSim: false }
  };

  const BAD_WORDS_RE = /(đá dái|địt|lồn|cặc|đm|vcl|vl|yamate|lừa đảo|telegram)/i;
  const ALLOWED_TEXT_RE = /[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s.,!?_-]/g;
  const LETTER_RE = /[a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ]/g;

  function clean(raw, maxLen) {
    const s = String(raw || '')
      .normalize('NFC')
      .replace(ALLOWED_TEXT_RE, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLen);
    if (!s || BAD_WORDS_RE.test(s) || (s.match(LETTER_RE) || []).length < 2) return '';
    return s;
  }
  const cleanName = (n) => clean(n, 26) || 'Thí Chủ Hữu Duyên';
  const cleanWish = (w) => clean(w, 120);

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved) {
        return {
          ...DEFAULT_STATE,
          ...saved,
          offerings: { ...DEFAULT_STATE.offerings, ...(saved.offerings || {}) },
          settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}) }
        };
      }
    } catch (_) {}
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  const state = load();

  // Đạo tràng mới mở chưa có ai: thêm vài Phật tử mẫu để chánh điện không trống
  if (Object.keys(state.devotees).length === 0) {
    const SEED = [['Diệu Hạnh', 320], ['Minh Tâm', 260], ['Thiện Đức', 210], ['Huệ An', 175], ['Tịnh Nhã', 140], ['Quảng Trí', 120], ['Chơn Như', 95], ['Pháp Hỷ', 80], ['Nguyên Thanh', 66], ['Tâm Đăng', 52], ['Diệu Liên', 40], ['Trí Hải', 31], ['Phước Lộc', 22], ['Hạnh Nguyện', 15]];
    for (const [name, merit] of SEED) {
      const key = name.toLowerCase();
      state.devotees[key] = { name, uniqueId: key.replace(/\s+/g, ''), merit, incense: Math.round(merit / 10), gifts: 0, lastWish: '' };
    }
  }
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
      } catch (_) {}
    }, 400);
  }

  function leaderboard(limit = 24) {
    return Object.values(state.devotees)
      .sort((a, b) => b.merit - a.merit)
      .slice(0, limit)
      .map((d, i) => ({ rank: i + 1, name: d.name, uniqueId: d.uniqueId, avatar: '', merit: d.merit, incense: d.incense, lastWish: d.lastWish }));
  }

  function publicState() {
    return {
      totalIncense: state.totalIncense,
      totalMerit: state.totalMerit,
      woodenFishHits: state.woodenFishHits,
      bellRings: state.bellRings,
      lanternCount: state.lanternCount,
      fortuneCount: state.fortuneCount,
      activeIncenseSticks: state.activeIncenseSticks,
      haloIntensity: state.haloIntensity,
      offerings: state.offerings,
      leaderboard: leaderboard(),
      recentEvents: state.recentEvents.slice(0, 15),
      settings: { autoSim: false },
      tiktok: { connected: false, connecting: false, username: '', viewerCount: 0 }
    };
  }

  function record(user, meritDelta, incenseDelta = 0, giftDelta = 0, wish = '') {
    const name = cleanName(user);
    const key = name.toLowerCase().slice(0, 40);
    const dev = state.devotees[key] || (state.devotees[key] = { name, uniqueId: key.replace(/\s+/g, ''), merit: 0, incense: 0, gifts: 0, lastWish: '' });
    dev.name = name;
    dev.merit += meritDelta;
    dev.incense += incenseDelta;
    dev.gifts += giftDelta;
    if (wish) dev.lastWish = wish;
    state.totalMerit += meritDelta;
    state.haloIntensity = Math.min(1, 0.35 + (state.totalMerit % 1000) / 1400);
    return dev;
  }

  function pushEvent(evt) {
    const entry = { id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, timestamp: new Date().toISOString(), ...evt };
    state.recentEvents.unshift(entry);
    state.recentEvents.length = Math.min(state.recentEvents.length, 35);
    return entry;
  }

  function done(event) {
    save();
    return { event, state: publicState() };
  }

  const clamp = (n, lo, hi, dflt) => Math.max(lo, Math.min(hi, Number(n) || dflt));

  // Không lặp lại quẻ vừa gieo để người chơi thấy đủ các quẻ
  let lastFortune = -1;
  function pickFortune() {
    if (FORTUNES.length < 2) return FORTUNES[0] || null;
    let i;
    do { i = Math.floor(Math.random() * FORTUNES.length); } while (i === lastFortune);
    lastFortune = i;
    return FORTUNES[i];
  }

  const methods = {
    'temple.burnIncense'(p) {
      const count = clamp(p.count, 1, 9, 3);
      const wish = cleanWish(p.wish) || 'Thành tâm dâng hương bái Phật, cầu bình an cát tường';
      const merit = count * 5;
      state.totalIncense += count;
      state.activeIncenseSticks = Math.min(36, state.activeIncenseSticks + count);
      const dev = record(p.user, merit, count, 0, wish);
      return done(pushEvent({
        type: 'burnIncense', user: dev.name, count, merit, wish,
        ttsText: `Nam mô A Di Đà Phật. Cảm tạ thí chủ ${dev.name} đã thành tâm thắp ${count} nén hương thơm. ${wish}.`
      }));
    },

    'temple.strikeWoodenFish'(p) {
      const count = clamp(p.count, 1, 50, 1);
      state.woodenFishHits += count;
      const dev = record(p.user, count);
      return done(pushEvent({ type: 'strikeWoodenFish', user: dev.name, count, merit: count, ttsText: '' }));
    },

    'temple.ringBell'(p) {
      const count = clamp(p.count, 1, 9, 1);
      const wish = cleanWish(p.wish) || 'Thỉnh chuông Bát Nhã, phiền não tiêu tan, trí tuệ sáng ngời';
      const merit = count * 10;
      state.bellRings += count;
      const dev = record(p.user, merit, 0, 0, wish);
      return done(pushEvent({
        type: 'ringBell', user: dev.name, count, merit, wish,
        ttsText: p.readTts ? `Thí chủ ${dev.name} thỉnh Đại Hồng Chung cầu nguyện: ${wish}.` : ''
      }));
    },

    'temple.sendPrayer'(p) {
      const wish = cleanWish(p.wish) || 'Cầu cho quốc thái dân an, gia đình mạnh khỏe hạnh phúc';
      state.lanternCount += 1;
      const dev = record(p.user, 10, 1, 0, wish);
      return done(pushEvent({
        type: 'sendPrayer', user: dev.name, wish, merit: 10,
        ttsText: `Lời cầu nguyện của thí chủ ${dev.name}: ${wish}. Nam mô A Di Đà Phật.`
      }));
    },

    'temple.offerGift'(p) {
      const coins = clamp(p.coins, 1, 99999, 10);
      const giftType = ['lotus', 'fruit', 'lamp', 'dragon'].includes(p.giftType) ? p.giftType : 'lotus';
      const labels = { lotus: 'Đài Hoa Sen Vàng', fruit: 'Mâm Ngũ Quả Cát Tường', lamp: 'Đèn Lưu Ly Trí Tuệ', dragon: 'Đại Lễ Kim Long Chầu Phật' };
      const giftName = p.giftName || labels[giftType];
      const merit = Math.max(20, coins * (coins >= 100 ? 50 : coins >= 10 ? 30 : 20));
      state.offerings[giftType] = (state.offerings[giftType] || 0) + 1;
      state.totalIncense += 3;
      state.activeIncenseSticks = Math.min(36, state.activeIncenseSticks + 3);
      const wish = cleanWish(p.wish) || `Dâng cúng ${giftName} lên Tam Bảo`;
      const dev = record(p.user, merit, 3, 1, wish);
      return done(pushEvent({
        type: giftType === 'dragon' ? 'grandCeremony' : 'offerGift',
        user: dev.name, giftType, giftName, coins, merit, wish,
        ttsText: `Công đức vô lượng! Cảm tạ thí chủ ${dev.name} đã phát tâm dâng cúng ${giftName}, tích thêm ${merit} điểm công đức.`
      }));
    },

    'temple.grandCeremony'(p) {
      return methods['temple.offerGift']({ ...p, giftType: 'dragon', coins: Math.max(100, Number(p.coins) || 199), giftName: p.giftName || 'Đại Lễ Hào Quang Vạn Trượng' });
    },

    'temple.drawFortune'(p) {
      const fortune = pickFortune();
      if (!fortune) return { event: null, state: publicState() };
      state.fortuneCount += 1;
      const dev = record(p.user, 10, 0, 0, `Xin xăm: Quẻ số ${fortune.number} (${fortune.rank})`);
      return done(pushEvent({
        type: 'drawFortune', user: dev.name, topic: cleanWish(p.topic), fortune, merit: 10,
        ttsText: `Thí chủ ${dev.name} vừa gieo được ${fortune.ttsSummary}`
      }));
    },

    'temple.join'() {
      return { event: null, state: publicState() };
    },

    'temple.updateSettings'(p) {
      state.settings = { ...state.settings, ...p };
      save();
      return { state: publicState() };
    }
  };

  window.TempleLocalEngine = {
    state: publicState,
    call(method, params = {}) {
      const fn = methods[method];
      return fn ? fn(params) : { event: null, state: publicState() };
    }
  };
})();
