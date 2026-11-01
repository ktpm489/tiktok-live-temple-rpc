/**
 * Live 9:16 Client Controller — Chánh Điện Đức Phật A Di Đà & Đạo Tràng Phật Tử Quỳ Lễ
 * - Hiển thị 6 Đệm Quỳ VIP (Top 6 Bảng Vàng Công Đức)
 * - Hiển thị 40 Phật Tử mặc áo lam quỳ hai bên thảm đỏ + thẻ tên người xem
 * - Hiệu ứng người xem bước dọc thảm đỏ lên trước Lư Hương Đồng dâng hương
 * - Giọng đọc ZeroTTS (Mai Chi) + Pháp khí Web Audio
 * - Chế độ độc lập (không server/TikTok): TempleLocalEngine xử lý nghi thức ngay trong trình duyệt
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  if (params.get('obs') === '1') {
    document.body.classList.add('obs-mode');
  }

  // 1. Tự động co giãn khung 1080x1920 vừa khít Stage Wrapper (9:16)
  const stageWrapper = document.getElementById('stageWrapper');
  const stage9x16 = document.getElementById('stage9x16');

  function fitStage() {
    if (!stageWrapper || !stage9x16) return;
    const rect = stageWrapper.getBoundingClientRect();
    const scale = rect.width / 1080;
    stage9x16.style.transform = `scale(${scale})`;
  }
  window.addEventListener('resize', fitStage);
  fitStage();

  // 2. Khởi tạo Particle Engine & Audio Engine (ZeroTTS Mai Chi)
  const canvas = document.getElementById('templeCanvas');
  const particles = new window.TempleParticleEngine(canvas);
  const audio = new window.TempleAudioEngine();

  function unlockAudioOnce() {
    audio.ensureContext();
    const btnUnlock = document.getElementById('btnUnlockAudio');
    if (btnUnlock) {
      btnUnlock.textContent = '✅ Âm Thanh Chùa Đã Sẵn Sàng';
      btnUnlock.classList.remove('gold');
      btnUnlock.classList.add('active-toggle');
    }
  }
  window.addEventListener('pointerdown', unlockAudioOnce, { once: true });

  // 3. Vẽ các nén nhang đang cháy trong Lư Hương Đỉnh Đồng (x=540, y=895)
  const incenseHolder = document.getElementById('incenseSticksHolder');
  let renderedStickCount = 0;

  function renderIncenseSticks(count) {
    const target = Math.max(3, Math.min(27, Number(count) || 9));
    if (target === renderedStickCount && incenseHolder.children.length > 0) return;
    renderedStickCount = target;
    incenseHolder.innerHTML = '';

    const tips = [];
    for (let i = 0; i < target; i++) {
      const stick = document.createElement('div');
      stick.className = 'incense-stick';

      const spread = target === 1 ? 0 : (i / (target - 1) - 0.5) * 2;
      const leftPx = 65 + spread * 28 + Math.sin(i * 2.1) * 2;
      const angleDeg = spread * 12 + Math.cos(i * 1.5) * 1.5;
      const heightPx = 76 + (i % 3) * 6;

      stick.style.left = `${leftPx}px`;
      stick.style.height = `${heightPx}px`;
      stick.style.transform = `rotate(${angleDeg}deg)`;

      const ember = document.createElement('div');
      ember.className = 'incense-ember';
      ember.style.animationDelay = `${(i * 0.15) % 1.1}s`;
      stick.appendChild(ember);
      incenseHolder.appendChild(stick);

      const rad = (angleDeg * Math.PI) / 180;
      const tipX = 540 + (leftPx - 65) + Math.sin(rad) * heightPx;
      const tipY = 895 - Math.cos(rad) * heightPx;
      tips.push({ x: tipX, y: tipY });
    }
    particles.setIncenseTips(tips);
  }

  // 4. Dựng Hàng 6 Đệm Quỳ VIP (Top 6 Thí Chủ trên bục gỗ y=1188)
  const VIP_CUSHION_COORDS = [
    { x: 140, y: 1188, rank: 1 },
    { x: 268, y: 1188, rank: 2 },
    { x: 392, y: 1188, rank: 3 },
    { x: 688, y: 1188, rank: 4 },
    { x: 812, y: 1188, rank: 5 },
    { x: 940, y: 1188, rank: 6 }
  ];

  // Phần tử VIP / chỗ ngồi theo tên (viết thường) để hoạt cảnh nhắm đúng nhân vật của người đang hành lễ
  const vipByName = new Map();
  let lastVipSig = '';

  function renderVipCushions(leaderboard = []) {
    const layer = document.getElementById('vipCushionsLayer');
    if (!layer) return;

    // Chỉ dựng lại khi danh sách tên đổi, để không làm mất hoạt cảnh đang chạy mỗi lần công đức nhích lên
    const sig = leaderboard.slice(0, VIP_CUSHION_COORDS.length).map((d) => d.name).join('|');
    if (sig === lastVipSig && layer.children.length > 0) return;
    lastVipSig = sig;

    layer.innerHTML = VIP_CUSHION_COORDS.map((slot, idx) => {
      const dev = leaderboard[idx];
      if (!dev) return '';
      return `
        <div class="vip-devotee-slot" data-name="${escapeHtml(String(dev.name).toLowerCase())}" style="left: ${slot.x}px; top: ${slot.y}px; z-index: ${12 + idx};">
          <img src="/assets/devotee.png" alt="VIP Devotee" class="devotee-sprite" />
          <div class="vip-rank-pill">
            <span class="vip-rank-num">${slot.rank}</span>
            <span class="vip-rank-name">${escapeHtml(shortenName(dev.name, 12))}</span>
          </div>
        </div>
      `;
    }).join('');

    vipByName.clear();
    layer.querySelectorAll('.vip-devotee-slot').forEach((el) => vipByName.set(el.dataset.name, el));
  }

  // 5. Dựng Đạo Tràng 40 Phật Tử Quỳ Lễ Hai Bên Thảm Đỏ (5 Hàng x 4 Cột mỗi bên)
  const congregationHall = document.getElementById('congregationHall');
  const HALL_SEAT_COORDS = [];

  (function buildHallGrid() {
    const rows = 5;
    const colsPerSide = 4;
    for (let r = 0; r < rows; r++) {
      const progress = r / (rows - 1); // 0 (xa) -> 1 (gần)
      const y = Math.round(1290 + progress * 355); // 1290 -> 1645
      const scale = +(0.76 + progress * 0.28).toFixed(2);

      // Cánh trái thảm đỏ
      const leftInnerX = Math.round(335 - progress * 48); // mép thảm mở rộng dần
      const leftOuterX = 48;
      for (let c = 0; c < colsPerSide; c++) {
        const t = c / (colsPerSide - 1);
        const x = Math.round(leftOuterX + t * (leftInnerX - leftOuterX));
        HALL_SEAT_COORDS.push({ side: 'L', row: r, col: c, x, y, scale });
      }

      // Cánh phải thảm đỏ
      const rightInnerX = Math.round(745 + progress * 48);
      const rightOuterX = 1032;
      for (let c = 0; c < colsPerSide; c++) {
        const t = c / (colsPerSide - 1);
        const x = Math.round(rightInnerX + t * (rightOuterX - rightInnerX));
        HALL_SEAT_COORDS.push({ side: 'R', row: r, col: c, x, y, scale });
      }
    }
  })();

  // 40 chỗ ngồi chỉ dựng DOM một lần; sau đó chỉ đổi thẻ tên (nhẹ máy, không làm mất hoạt cảnh)
  // Những ghế gần thảm đỏ dễ nhìn nhất được gắn thẻ tên trước
  const LABELED_SEAT_ORDER = [3, 4, 11, 12, 19, 20, 27, 28, 35, 36, 2, 5, 10, 13, 18, 21, 26, 29];
  const seatByName = new Map();
  let seatEls = [];
  let lastHallSig = '';

  if (congregationHall) {
    congregationHall.innerHTML = HALL_SEAT_COORDS.map((seat, idx) => `
      <div class="hall-seat" style="left: ${seat.x}px; top: ${seat.y}px; z-index: ${20 + seat.row * 2}; transform: translate(-50%, -100%) scale(${seat.scale});">
        <img src="/assets/devotee.png" alt="Phật tử" class="devotee-sprite" decoding="async" />
        <div class="seat-badge" hidden>
          <span class="seat-avatar"></span>
          <span class="seat-username"></span>
        </div>
      </div>
    `).join('');
    seatEls = [...congregationHall.children];
  }

  function renderCongregationHall(leaderboard = []) {
    if (!seatEls.length) return;
    // Hạng 1-6 ngồi đệm VIP; từ hạng 7 trở đi ngồi đạo tràng, người đang online được xếp lên trước
    const hallViewers = leaderboard.slice(6).sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
    const shown = hallViewers.slice(0, LABELED_SEAT_ORDER.length);
    const sig = shown.map((d) => d.name).join('|');
    if (sig === lastHallSig) return;
    lastHallSig = sig;

    seatByName.clear();
    LABELED_SEAT_ORDER.forEach((seatIdx, i) => {
      const el = seatEls[seatIdx];
      if (!el) return;
      const badge = el.querySelector('.seat-badge');
      const viewer = shown[i];
      badge.hidden = !viewer;
      if (!viewer) return;
      const av = badge.querySelector('.seat-avatar');
      if (viewer.avatar) {
        av.innerHTML = `<img src="${escapeHtml(viewer.avatar)}" alt="" />`;
      } else {
        av.textContent = String(viewer.name || 'P').charAt(0).toUpperCase();
      }
      badge.querySelector('.seat-username').textContent = shortenName(viewer.name, 11);
      seatByName.set(String(viewer.name).toLowerCase(), el);
    });
  }

  // Preload toàn bộ 8 frame nhân vật vào bộ nhớ để chuyển frame mượt 0ms
  const SPRITE_FRAMES = {
    walk1: '/assets/devotee_walk.png',
    walk2: '/assets/devotee_walk_2.png',
    kneelDown: '/assets/devotee_kneel_down.png',
    kneel: '/assets/devotee.png',
    forehead: '/assets/devotee_bow.png',
    bowMid: '/assets/devotee_bow_mid.png',
    prostrate: '/assets/devotee_prostrate.png',
    prostrateDeep: '/assets/devotee_prostrate_deep.png'
  };
  Object.values(SPRITE_FRAMES).forEach((url) => {
    const img = new Image();
    img.src = url;
  });

  function pulseHallBowing() {
    if (!congregationHall) return;
    const seats = congregationHall.querySelectorAll('.hall-seat');
    seats.forEach((el, i) => {
      if (i % 4 !== 0) return;
      const img = el.querySelector('.devotee-sprite');
      if (!img) return;
      const delay = (i % 4) * 80;
      setTimeout(() => { img.src = SPRITE_FRAMES.forehead; }, delay);
      setTimeout(() => { img.src = SPRITE_FRAMES.bowMid; }, delay + 140);
      setTimeout(() => { img.src = SPRITE_FRAMES.prostrateDeep; }, delay + 300);
      setTimeout(() => { img.src = SPRITE_FRAMES.bowMid; }, delay + 620);
      setTimeout(() => { img.src = SPRITE_FRAMES.kneel; }, delay + 780);
    });
  }

  // Người nào hành lễ thì chính nhân vật của người đó ngồi trong đạo tràng làm theo (gõ mõ, lạy...)
  const SEAT_ACTION_ICON = { strikeWoodenFish: '🪵', ringBell: '🔔', burnIncense: '🔥', sendPrayer: '🏮', drawFortune: '🎋', offerGift: '🪷', grandCeremony: '🐉' };

  function playSeatAction(name, type) {
    const key = String(name || '').toLowerCase();
    const el = seatByName.get(key) || vipByName.get(key);
    const img = el && el.querySelector('.devotee-sprite');
    if (!img) return false;

    const bubble = document.createElement('span');
    bubble.className = 'seat-act';
    bubble.textContent = SEAT_ACTION_ICON[type] || '🙏';
    el.appendChild(bubble);
    setTimeout(() => bubble.remove(), 1300);
    el.classList.add('acting');
    clearTimeout(el._actTimer);
    el._actTimer = setTimeout(() => el.classList.remove('acting'), 1300);

    if (type === 'strikeWoodenFish') {
      img.classList.remove('act-wood');
      void img.offsetWidth;
      img.classList.add('act-wood');
    } else if (!img._bowing) {
      img._bowing = true;
      const steps = [[0, 'forehead'], [150, 'bowMid'], [300, 'prostrateDeep'], [650, 'bowMid'], [800, 'kneel']];
      steps.forEach(([t, pose]) => setTimeout(() => { img.src = SPRITE_FRAMES[pose]; }, t));
      setTimeout(() => { img._bowing = false; }, 850);
    }
    return true;
  }

  let prostrationTimers = [];
  function clearProstrationTimers() {
    while (prostrationTimers.length > 0) {
      clearTimeout(prostrationTimers.pop());
    }
  }

  // Chuyển đổi tức thời giữa 8 khung hình đã giải mã sẵn trên GPU (KHÔNG BAO GIỜ BỊ MẤT HÌNH)
  function setCentralPose(poseKey) {
    const stack = document.getElementById('centralSpriteStack');
    if (!stack) return;
    const frames = stack.querySelectorAll('.pose-frame');
    frames.forEach((img) => {
      img.classList.toggle('active', img.getAttribute('data-pose') === poseKey);
    });
  }

  function schedulePose(ms, poseKey) {
    prostrationTimers.push(
      setTimeout(() => {
        setCentralPose(poseKey);
      }, ms)
    );
  }

  // Chuỗi 8 khung hình Đảnh lễ Tam Bái mượt mà (Hạ gối -> Chắp tay ngực -> Đưa lên trán -> Nghiêng 45° -> Chống tay -> Lạy sát đất -> Ngẩng lên)
  function playThreeBowsSequence(startDelayMs = 0) {
    schedulePose(startDelayMs, 'kneelDown');
    schedulePose(startDelayMs + 160, 'kneel');

    const bowOffsets = [startDelayMs + 320, startDelayMs + 1820, startDelayMs + 3320];
    bowOffsets.forEach((t0) => {
      schedulePose(t0, 'forehead');            // 1. Chắp tay đưa lên trán
      schedulePose(t0 + 170, 'bowMid');        // 2. Cúi gập lưng 45°
      schedulePose(t0 + 330, 'prostrate');     // 3. Vươn hai tay chống xuống đệm
      schedulePose(t0 + 490, 'prostrateDeep'); // 4. Lạy sát đất (Ngũ thể đầu địa)
      schedulePose(t0 + 860, 'prostrate');     // 5. Bắt đầu nâng đầu lên
      schedulePose(t0 + 1020, 'bowMid');       // 6. Nâng lưng lên góc 45°
      schedulePose(t0 + 1180, 'kneel');        // 7. Ngồi quỳ thẳng lưng
    });

    schedulePose(startDelayMs + 4800, 'forehead');
    schedulePose(startDelayMs + 5350, 'kneel');
  }

  // Hiệu ứng thí chủ ĐỨNG ĐI BỘ từng bước dọc thảm đỏ rồi Hạ gối Quỳ Đảnh Lễ (trên cùng 1 nhân vật, không bao giờ mất hình)
  function animateWalkerOnCarpet(user, avatar, actionLabel, wish) {
    const centralEl = document.getElementById('centralWorshipper');
    if (!centralEl) return;

    clearProstrationTimers();
    updateCentralWorshipper(user, avatar, actionLabel, wish, false);

    // Khởi động bước đi từ cuối thảm đỏ lên chính điện
    centralEl.classList.remove('walking-up');
    void centralEl.offsetWidth;
    centralEl.classList.add('walking-up');

    setCentralPose('walk1');
    for (let step = 1; step <= 10; step++) {
      schedulePose(step * 185, step % 2 === 0 ? 'walk1' : 'walk2');
    }

    // Khi bước tới trước Lư Hương (2.05s): dừng bước, hạ gối quỳ xuống đệm và bắt đầu Đảnh lễ 3 lạy
    prostrationTimers.push(
      setTimeout(() => {
        centralEl.classList.remove('walking-up');
      }, 2100)
    );
    playThreeBowsSequence(2050);
  }

  function updateCentralWorshipper(user, avatar, actionLabel, wish, doThreeBows = true) {
    const nameEl = document.getElementById('centralName');
    const actEl = document.getElementById('centralAction');
    const wishEl = document.getElementById('centralWishBubble');
    const avatarEl = document.getElementById('centralAvatar');
    const beam = document.getElementById('sacredLightBeam');

    if (nameEl) nameEl.textContent = user || 'Thí Chủ Hữu Duyên';
    if (actEl) actEl.textContent = actionLabel || '✨ Dâng hương cầu an';
    if (wishEl) wishEl.textContent = `“${wish || 'Nam Mô A Di Đà Phật, cầu bình an cát tường'}”`;

    if (avatarEl) {
      if (avatar) {
        avatarEl.innerHTML = `<img src="${escapeHtml(avatar)}" alt="" />`;
      } else {
        avatarEl.textContent = String(user || '🙏').trim().charAt(0).toUpperCase();
      }
    }

    if (doThreeBows) {
      clearProstrationTimers();
      const centralEl = document.getElementById('centralWorshipper');
      if (centralEl) centralEl.classList.remove('walking-up');
      playThreeBowsSequence(0);
    }
    if (beam) {
      beam.classList.add('intense');
      setTimeout(() => beam.classList.remove('intense'), 4500);
    }

    const haloSys = document.getElementById('buddhaHaloSystem');
    const lotusHand = document.getElementById('lotusHandHalo');
    if (haloSys) {
      haloSys.classList.add('flare');
      setTimeout(() => haloSys.classList.remove('flare'), 3600);
    }
    if (lotusHand) {
      lotusHand.classList.add('flare');
      setTimeout(() => lotusHand.classList.remove('flare'), 3600);
    }
    particles.spawnBellWave(540, 260, 2);

    // Cập nhật dòng thông báo dưới thanh HUD
    const hudName = document.getElementById('devoteeNameLine');
    const hudAct = document.getElementById('devoteeActionTag');
    if (hudName) hudName.textContent = user || 'Thí Chủ';
    if (hudAct) hudAct.textContent = actionLabel || 'Dâng hương';
  }

  // 6. Cập nhật toàn bộ giao diện theo State từ Server
  let hasInitializedRealLeader = false;

  function updateUIState(st) {
    if (!st) return;
    if (st.realtime) enterRealtime();
    const onlineEl = document.getElementById('statOnline');
    if (onlineEl && typeof st.online === 'number') {
      onlineEl.textContent = st.online;
      onlineEl.parentElement.hidden = false;
    }

    document.getElementById('statIncense').textContent = Number(st.totalIncense || 0).toLocaleString('vi-VN');
    document.getElementById('statMerit').textContent = Number(st.totalMerit || 0).toLocaleString('vi-VN');
    document.getElementById('statWoodenFish').textContent = Number(st.woodenFishHits || 0).toLocaleString('vi-VN');

    renderIncenseSticks(st.activeIncenseSticks || 9);

    const lb = Array.isArray(st.leaderboard) ? st.leaderboard : [];
    renderVipCushions(lb);
    renderCongregationHall(lb);

    // Đồng bộ tên Chủ Lễ mặc định theo người dẫn đầu thực tế nếu chưa có sự kiện mới
    if (!hasInitializedRealLeader && lb.length > 0) {
      hasInitializedRealLeader = true;
      const topDev = lb[0];
      updateCentralWorshipper(
        topDev.name,
        topDev.avatar,
        `✨ Công đức: ${Number(topDev.merit).toLocaleString('vi-VN')} CĐ`,
        topDev.lastWish || 'Nam Mô A Di Đà Phật, cầu bình an cát tường',
        false
      );
    }

    // Bảng TẤM LÒNG THÀNH ở góc dưới phải (Top 4) theo tab Hôm nay / Tuần / Tổng
    lastBoards = { all: lb, today: st.leaderboards?.today, week: st.leaderboards?.week };
    document.getElementById('lbTabs').hidden = !st.leaderboards; // server TikTok gốc chỉ có bảng tổng
    renderLeaderboardList();

    // Trạng thái kết nối TikTok Live
    const liveDot = document.getElementById('liveDot');
    const liveText = document.getElementById('liveStatusText');
    if (st.tiktok?.connected) {
      liveDot.classList.add('connected');
      liveText.textContent = `LIVE @${st.tiktok.username} • ${st.tiktok.viewerCount || 0} mắt`;
    } else if (st.tiktok?.connecting) {
      liveDot.classList.remove('connected');
      liveText.textContent = `Đang kết nối @${st.tiktok.username}...`;
    } else {
      liveDot.classList.remove('connected');
      liveText.textContent = st.settings?.autoSim
        ? 'CHÙA LINH ỨNG • TỰ ĐỘNG GIẢ LẬP ĐÔNG NGƯỜI'
        : 'CHÙA LINH ỨNG • ĐỨC PHẬT A DI ĐÀ';
    }

    const btnAutoSim = document.getElementById('btnToggleAutoSim');
    if (btnAutoSim && st.settings) {
      btnAutoSim.textContent = st.settings.autoSim
        ? '🤖 Tự động Giả lập Người Xem: ĐANG BẬT'
        : '🤖 Tự động Giả lập Người Xem: TẮT';
      btnAutoSim.classList.toggle('active-toggle', Boolean(st.settings.autoSim));
    }
    if (st.settings) {
      if (typeof st.settings.musicVolume === 'number') {
        audio.setMusicVolume(st.settings.musicVolume);
        const sMus = document.getElementById('sliderMusicVol');
        const vMus = document.getElementById('valMusicVol');
        const pct = Math.round(st.settings.musicVolume * 100);
        if (sMus) sMus.value = String(pct);
        if (vMus) vMus.textContent = `${pct}%`;
      }
      if (typeof st.settings.ttsVolume === 'number') {
        audio.setTtsVolume(st.settings.ttsVolume);
        const sTts = document.getElementById('sliderTtsVol');
        const vTts = document.getElementById('valTtsVol');
        const pct = Math.round(st.settings.ttsVolume * 100);
        if (sTts) sTts.value = String(pct);
        if (vTts) vTts.textContent = `${pct}%`;
      }
    }


    const feed = document.getElementById('eventFeed');
    if (feed && Array.isArray(st.recentEvents)) {
      feed.innerHTML = st.recentEvents
        .slice(0, 8)
        .map((ev) => `<div class="event-feed-item">${formatEventSummary(ev)}</div>`)
        .join('');
    }
  }

  // Bảng vàng nhiều kỳ: người mới vẫn có cơ hội lên top "Hôm nay"
  let lastBoards = {};
  let lbTab = 'today';
  try { lbTab = localStorage.getItem('temple_lb_tab') || 'today'; } catch (_) {}

  function renderLeaderboardList() {
    const lbList = document.getElementById('leaderboardList');
    if (!lbList) return;
    const tab = lastBoards.today || lastBoards.week ? lbTab : 'all';
    document.querySelectorAll('#lbTabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const items = (lastBoards[tab] || []).slice(0, 4);
    if (items.length === 0) {
      lbList.innerHTML = `<div class="lb-empty">Chưa có ai ${tab === 'week' ? 'tuần này' : 'hôm nay'}.<br>Hãy là người đầu tiên 🙏</div>`;
      return;
    }
    lbList.innerHTML = items
      .map((item, i) => `
        <div class="leader-item">
          <span class="leader-rank">${item.rank || i + 1}</span>
          <span class="leader-name">${escapeHtml(shortenName(item.name, 14))}</span>
          <span class="leader-merit">${Number(item.merit).toLocaleString('vi-VN')}</span>
        </div>
      `)
      .join('');
  }

  document.getElementById('lbTabs')?.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    lbTab = b.dataset.tab;
    try { localStorage.setItem('temple_lb_tab', lbTab); } catch (_) {}
    renderLeaderboardList();
  });

  function formatEventSummary(ev) {
    switch (ev.type) {
      case 'burnIncense':
        return `🔥 <strong>${escapeHtml(ev.user)}</strong> dâng ${ev.count} nén nhang (+${ev.merit} CĐ)`;
      case 'strikeWoodenFish':
        return `🪵 <strong>${escapeHtml(ev.user)}</strong> gõ mõ ${ev.count} nhịp (+${ev.merit} CĐ)`;
      case 'ringBell':
        return `🔔 <strong>${escapeHtml(ev.user)}</strong> thỉnh Đại Hồng Chung (+${ev.merit} CĐ)`;
      case 'sendPrayer':
        return `🏮 <strong>${escapeHtml(ev.user)}</strong> cầu phúc: “${escapeHtml(ev.wish)}”`;
      case 'offerGift':
      case 'grandCeremony':
        return `🪷 <strong>${escapeHtml(ev.user)}</strong> dâng <em>${escapeHtml(ev.giftName)}</em> (+${ev.merit} CĐ)`;
      case 'drawFortune':
        return `🎋 <strong>${escapeHtml(ev.user)}</strong> gieo được Quẻ số ${ev.fortune?.number} (${ev.fortune?.rank})`;
      default:
        return `✨ <strong>${escapeHtml(ev.user || 'Thí chủ')}</strong> tương tác`;
    }
  }

  // 7. Xử lý hiệu ứng khi có Nghi Thức mới
  let fortuneTimer = null;
  let grandTimer = null;

  function triggerRitualVisuals(ev) {
    if (!ev) return;

    // Phòng realtime: chỉ người thực hiện mới nghe lời đọc / thấy tờ quẻ, người khác chỉ thấy hiệu ứng chung
    const mine = !realtime || !ev.clientId || ev.clientId === clientId;

    // Nhân vật trong đạo tràng làm theo (sự kiện gõ mõ gom có thể có nhiều người)
    (ev.names && ev.names.length ? ev.names : [ev.user]).forEach((n) => playSeatAction(n, ev.type));

    if (ev.ttsText && ev.type !== 'drawFortune' && mine) {
      audio.enqueueTts(ev.ttsText, { voice: ev.ttsVoice || 'maichi' });
    }

    switch (ev.type) {
      case 'burnIncense': {
        audio.playIncenseChime();
        particles.spawnIncenseBurst(540, 895);
        particles.spawnFloatingMerit(`+${ev.merit} Công Đức`, 540, 860, '#ffe082');
        animateWalkerOnCarpet(ev.user, ev.avatar, `🔥 Dâng ${ev.count} nén hương (+${ev.merit} CĐ)`, ev.wish);
        break;
      }

      case 'strikeWoodenFish': {
        // Sự kiện gom nhiều nhịp của cả phòng: gõ tối đa 4 tiếng nối nhau
        for (let i = 0; i < Math.min(ev.count || 1, 4); i++) setTimeout(() => audio.playWoodenFish(), i * 110);
        pulseHallBowing();
        particles.spawnFloatingMerit(`+${ev.merit} Công Đức`, 890, 935, '#ffd54f');
        break;
      }

      case 'ringBell': {
        audio.playTempleBell(1.0);
        pulseHallBowing();
        particles.spawnBellWave(540, 510, 4);
        particles.spawnFloatingMerit(`+${ev.merit} Công Đức`, 190, 935, '#fff3b0');
        updateCentralWorshipper(ev.user, ev.avatar, `🔔 Thỉnh Đại Hồng Chung (+${ev.merit} CĐ)`, ev.wish);
        break;
      }

      case 'sendPrayer': {
        audio.playIncenseChime();
        spawnSkyLantern(ev.user, ev.wish);
        particles.spawnFloatingMerit(`+${ev.merit} Công Đức`, 540, 920, '#ffb74d');
        animateWalkerOnCarpet(ev.user, ev.avatar, `🏮 Cầu phúc (+${ev.merit} CĐ)`, ev.wish);
        break;
      }

      case 'offerGift': {
        audio.playIncenseChime();
        audio.playTempleBell(0.85);
        particles.spawnIncenseBurst(540, 895);
        particles.spawnFloatingMerit(`+${ev.merit} Công Đức`, 540, 840, '#fff3b0');
        animateWalkerOnCarpet(ev.user, ev.avatar, `🪷 Dâng ${ev.giftName} (+${ev.merit} CĐ)`, ev.wish);
        break;
      }

      case 'grandCeremony': {
        audio.playTempleBell(1.2);
        setTimeout(() => audio.playTempleBell(1.1), 900);
        particles.spawnGrandCeremonyRain();
        pulseHallBowing();
        showGrandCeremonyBanner(ev.user, ev.giftName, ev.merit);
        animateWalkerOnCarpet(ev.user, ev.avatar, `🐉 ${ev.giftName} (+${ev.merit} CĐ)`, ev.wish);
        break;
      }

      case 'drawFortune': {
        if (!mine) {
          showToast(`🎋 ${ev.user} vừa gieo được Quẻ số ${ev.fortune?.number} (${ev.fortune?.rank})`);
          break;
        }
        audio.playFortuneShake();
        const shakeStart = performance.now();
        shakeFortuneTube(ev.fortune?.number);
        updateCentralWorshipper(
          ev.user,
          ev.avatar,
          `🎋 Đang xin xăm...`,
          `Thí chủ ${ev.user} đang thành tâm xin quẻ...`,
          false
        );
        // Tờ Quẻ chỉ hiện sau khi ống xăm lắc xong và đúng lúc giọng đọc bắt đầu vang lên
        audio.enqueueTts(ev.ttsText || '', {
          voice: ev.ttsVoice || 'maichi',
          onStart: () => {
            const wait = Math.max(0, FORTUNE_SHAKE_MS - (performance.now() - shakeStart));
            setTimeout(() => {
              audio.playIncenseChime();
              showFortuneModal(ev.user, ev.fortune);
              updateCentralWorshipper(
                ev.user,
                ev.avatar,
                `🎋 Quẻ số ${ev.fortune?.number} (${ev.fortune?.rank})`,
                ev.fortune?.meaning || '',
                true
              );
            }, wait);
          },
          onEnd: () => {
            clearTimeout(fortuneTimer);
            fortuneTimer = setTimeout(() => {
              document.getElementById('fortuneModal')?.classList.remove('visible');
              fortuneBusy = false;
            }, 6000);
          }
        });
        break;
      }
    }
  }

  // Lắc ống xăm rồi một que xăm rơi ra mang số quẻ
  const FORTUNE_SHAKE_MS = 1500;
  let fortuneBusy = false;

  function shakeFortuneTube(number) {
    const tube = document.getElementById('fortuneCylinder');
    const stick = document.getElementById('fortuneStick');
    if (tube) {
      tube.classList.remove('shaking');
      void tube.offsetWidth;
      tube.classList.add('shaking');
      setTimeout(() => tube.classList.remove('shaking'), FORTUNE_SHAKE_MS);
    }
    if (stick) {
      document.getElementById('fortuneStickNum').textContent = number || '';
      stick.classList.remove('drop');
      void stick.offsetWidth;
      stick.classList.add('drop');
    }
  }

  function requestFortune() {
    if (fortuneBusy) return;
    fortuneBusy = true;
    // Nhả khóa nếu vì lý do nào đó không nhận được sự kiện (mất kết nối...)
    setTimeout(() => { fortuneBusy = false; }, 45000);
    const { user, wish } = getFormInput();
    callRpc('temple.drawFortune', { user, topic: wish });
  }

  function spawnSkyLantern(user, wish) {
    const layer = document.getElementById('skyLanternsLayer');
    if (!layer) return;
    const lantern = document.createElement('div');
    lantern.className = 'sky-lantern';
    const leftPos = 80 + Math.floor(Math.random() * 640);
    lantern.style.left = `${leftPos}px`;
    lantern.innerHTML = `
      <div class="sky-lantern-user">🙏 ${escapeHtml(user)}</div>
      <div class="sky-lantern-wish">“${escapeHtml(wish)}”</div>
    `;
    layer.appendChild(lantern);
    setTimeout(() => {
      lantern.remove();
    }, 10600);
  }

  function showFortuneModal(user, fortune) {
    if (!fortune) return;
    const modal = document.getElementById('fortuneModal');
    document.getElementById('fortuneRankBadge').textContent = fortune.rank.toUpperCase();
    document.getElementById('fortuneTitle').textContent = `Quẻ Số ${fortune.number} — ${fortune.title}`;
    document.getElementById('fortuneDevotee').textContent = `Thí chủ cầu quẻ: ${user}`;
    document.getElementById('fortunePoem').textContent = fortune.poem;
    document.getElementById('fortuneMeaning').textContent = `Lời bàn: ${fortune.meaning}`;

    modal.classList.add('visible');
    clearTimeout(fortuneTimer);
    fortuneTimer = setTimeout(closeFortuneModal, 30000);
  }

  function closeFortuneModal() {
    clearTimeout(fortuneTimer);
    document.getElementById('fortuneModal')?.classList.remove('visible');
    fortuneBusy = false;
  }

  document.getElementById('fortuneModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'fortuneModal') closeFortuneModal();
  });
  document.getElementById('fortuneClose')?.addEventListener('click', closeFortuneModal);
  document.getElementById('fortuneAgain')?.addEventListener('click', () => {
    closeFortuneModal();
    setTimeout(requestFortune, 250);
  });

  function showGrandCeremonyBanner(user, giftName, merit) {
    const banner = document.getElementById('grandCeremonyBanner');
    document.getElementById('grandTitle').textContent = `🐉 ${giftName.toUpperCase()} 🐉`;
    document.getElementById('grandSub').textContent = `Đại Thí Chủ ${user} • Công Đức Vô Lượng (+${merit} CĐ)`;
    banner.classList.add('visible');
    clearTimeout(grandTimer);
    grandTimer = setTimeout(() => {
      banner.classList.remove('visible');
    }, 6800);
  }

  // 8. Kết nối JSON-RPC 2.0 WebSocket & Gửi Lệnh RPC
  let ws = null;
  let rpcId = 1;
  let wsEverOpened = false;
  let wsFailures = 0;
  let standalone = params.get('standalone') === '1' || window.location.protocol === 'file:';

  // Chế độ độc lập: không có server (ví dụ chạy trên Cloudflare Pages) → mọi nghi thức xử lý cục bộ
  function showWelcomeGate() {
    const gate = document.getElementById('welcomeGate');
    if (!gate || document.body.classList.contains('obs-mode')) return;
    try {
      const saved = localStorage.getItem('temple_name');
      if (saved) document.getElementById('welcomeName').value = saved;
    } catch (_) {}
    gate.hidden = false;
  }

  function enterStandalone() {
    if (document.body.classList.contains('standalone') || !window.TempleLocalEngine) return;
    standalone = true;
    audio.standalone = true;
    document.body.classList.add('standalone');
    updateUIState(window.TempleLocalEngine.state());
    showWelcomeGate();
  }

  // Phòng realtime (Durable Object): nhiều người cùng thấy nghi thức của nhau
  const clientId = Math.random().toString(36).slice(2, 12);
  let realtime = false;

  function enterRealtime() {
    if (realtime) return;
    realtime = true;
    audio.standalone = true; // không có ZeroTTS, đọc bằng giọng trình duyệt
    document.body.classList.add('realtime');
    showWelcomeGate();
  }

  function connectWebSocket() {
    if (standalone) {
      enterStandalone();
      return;
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${window.location.host}/ws`);

    ws.onopen = () => {
      wsEverOpened = true;
      wsFailures = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.method === 'temple.state') {
          updateUIState(msg.params);
        } else if (msg.method === 'temple.event') {
          if (msg.params?.state) updateUIState(msg.params.state);
          if (msg.params?.event) triggerRitualVisuals(msg.params.event);
        } else if (msg.method === 'tts.play') {
          if (msg.params?.url) {
            audio.enqueueTts(msg.params.text || 'Nam mô A Di Đà Phật', {
              voice: msg.params.voice || 'maichi',
              url: msg.params.url
            });
          }
        }
      } catch (_) {}
    };

    ws.onclose = () => {
      wsFailures += 1;
      // Chưa từng kết nối được → không có server, chuyển sang chế độ độc lập ngay
      if (!wsEverOpened) {
        standalone = true;
        enterStandalone();
        return;
      }
      setTimeout(connectWebSocket, 2000);
    };
  }
  connectWebSocket();

  function applyRpcResult(result) {
    if (result?.state) updateUIState(result.state);
    if (result?.event) triggerRitualVisuals(result.event);
  }

  async function callRpc(method, params = {}) {
    audio.ensureContext();
    if (standalone) {
      enterStandalone();
      return applyRpcResult(window.TempleLocalEngine.call(method, params));
    }
    const payload = {
      jsonrpc: '2.0',
      id: rpcId++,
      method,
      params
    };
    if (ws && ws.readyState === WebSocket.OPEN) {
      payload.params = { ...params, clientId };
      ws.send(JSON.stringify(payload));
      return;
    }
    try {
      const res = await fetch('/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      applyRpcResult(data?.result);
      return data;
    } catch (_) {
      // Không có server nhận lệnh → xử lý cục bộ
      standalone = true;
      enterStandalone();
      return applyRpcResult(window.TempleLocalEngine.call(method, params));
    }
  }

  function getFormInput() {
    const user = document.getElementById('inputDevoteeName')?.value.trim() || 'Quỳnh_Finn';
    const wish =
      document.getElementById('inputDevoteeWish')?.value.trim() ||
      'Cầu cho gia đình bình an, tài lộc hanh thông';
    return { user, wish };
  }

  // Gắn sự kiện tương tác trực tiếp trên màn hình 9:16 & Thanh HUD dưới đáy
  document.getElementById('incenseBurnerZone')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.burnIncense', { user, count: 3, wish });
  });

  document.getElementById('cardIncense')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.burnIncense', { user, count: 3, wish });
  });

  document.getElementById('cardBlessing')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.sendPrayer', { user, wish });
  });

  // Gõ mõ: chạm 1 lần = 1 tiếng, giữ ngón tay/chuột = gõ liên tục như tụng kinh
  function bindWoodenFish(el) {
    if (!el) return;
    let holdDelay = null;
    let holdTimer = null;
    const hit = () => {
      const { user } = getFormInput();
      callRpc('temple.strikeWoodenFish', { user, count: 1 });
      el.classList.remove('tapped');
      void el.offsetWidth;
      el.classList.add('tapped');
    };
    const stop = () => {
      clearTimeout(holdDelay);
      clearInterval(holdTimer);
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      hit();
      stop();
      holdDelay = setTimeout(() => {
        holdTimer = setInterval(hit, 480);
      }, 420);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => el.addEventListener(t, stop));
  }
  bindWoodenFish(document.getElementById('woodenFishStation'));
  bindWoodenFish(document.getElementById('cardWoodfish'));

  function ringBellNow() {
    const { user, wish } = getFormInput();
    // Chế độ độc lập: chuông có thể thỉnh liên tục nên không đọc lời nguyện mỗi lần
    callRpc('temple.ringBell', { user, count: 1, wish, readTts: !standalone });
    const el = document.getElementById('bellStation');
    el.classList.remove('ringing');
    void el.offsetWidth;
    el.classList.add('ringing');
  }
  document.getElementById('bellStation')?.addEventListener('click', ringBellNow);
  document.getElementById('cardBell')?.addEventListener('click', ringBellNow);

  document.getElementById('fortuneCylinder')?.addEventListener('click', requestFortune);
  document.getElementById('cardFortune')?.addEventListener('click', requestFortune);

  // Các nút trên Quick RPC Dock bên phải
  document.getElementById('btnRpcIncense')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.burnIncense', { user, count: 3, wish });
  });

  document.getElementById('btnRpcLantern')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.sendPrayer', { user, wish });
  });

  document.getElementById('btnRpcWoodenFish')?.addEventListener('click', () => {
    const { user } = getFormInput();
    callRpc('temple.strikeWoodenFish', { user, count: 5 });
  });

  document.getElementById('btnRpcBell')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.ringBell', { user, count: 1, wish, readTts: true });
  });

  document.getElementById('btnRpcFortune')?.addEventListener('click', requestFortune);

  document.getElementById('btnRpcGiftLotus')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.offerGift', {
      user,
      giftType: 'lotus',
      coins: 20,
      giftName: 'Đài Hoa Sen Vàng',
      wish
    });
  });

  document.getElementById('btnRpcGrandCeremony')?.addEventListener('click', () => {
    const { user, wish } = getFormInput();
    callRpc('temple.grandCeremony', {
      user,
      coins: 299,
      giftName: 'Đại Lễ Kim Long Chầu Phật',
      wish
    });
  });

  document.getElementById('btnConnectTikTok')?.addEventListener('click', () => {
    const username = document.getElementById('inputTikTokUser')?.value.trim();
    if (!username) return;
    callRpc('live.connect', { username });
  });

  let autoSimState = false;
  document.getElementById('btnToggleAutoSim')?.addEventListener('click', () => {
    autoSimState = !autoSimState;
    callRpc('live.setAutoSim', { enabled: autoSimState });
  });

  document.getElementById('btnToggleTts')?.addEventListener('click', (e) => {
    audio.ttsEnabled = !audio.ttsEnabled;
    const btn = e.currentTarget;
    btn.textContent = `🎙️ Giọng Đọc: ${audio.ttsEnabled ? 'BẬT' : 'TẮT'}`;
    btn.classList.toggle('active-toggle', audio.ttsEnabled);
  });

  document.getElementById('btnToggleMusic')?.addEventListener('click', (e) => {
    audio.bgMusicEnabled = !audio.bgMusicEnabled;
    if (audio.bgMusicEnabled) {
      audio.startZenAmbience();
    } else {
      audio.stopZenAmbience();
    }
    const btn = e.currentTarget;
    btn.textContent = `🎵 Nhạc Nền: ${audio.bgMusicEnabled ? 'BẬT' : 'TẮT'}`;
    btn.classList.toggle('active-toggle', audio.bgMusicEnabled);
  });

  // Khởi tạo và gắn sự kiện thanh trượt chỉnh âm lượng Nhạc nền & Giọng đọc
  const sliderMusicVol = document.getElementById('sliderMusicVol');
  const valMusicVol = document.getElementById('valMusicVol');
  if (sliderMusicVol && valMusicVol) {
    const initMusPct = Math.round(audio.bgBaseVolume * 100);
    sliderMusicVol.value = String(initMusPct);
    valMusicVol.textContent = `${initMusPct}%`;
    sliderMusicVol.addEventListener('input', (e) => {
      const pct = Number(e.target.value);
      valMusicVol.textContent = `${pct}%`;
      audio.ensureContext();
      audio.setMusicVolume(pct / 100);
    });
    sliderMusicVol.addEventListener('change', (e) => {
      const pct = Number(e.target.value);
      callRpc('temple.updateSettings', { musicVolume: +(pct / 100).toFixed(2) });
    });
  }

  const sliderTtsVol = document.getElementById('sliderTtsVol');
  const valTtsVol = document.getElementById('valTtsVol');
  if (sliderTtsVol && valTtsVol) {
    const initTtsPct = Math.round(audio.ttsVolume * 100);
    sliderTtsVol.value = String(initTtsPct);
    valTtsVol.textContent = `${initTtsPct}%`;
    sliderTtsVol.addEventListener('input', (e) => {
      const pct = Number(e.target.value);
      valTtsVol.textContent = `${pct}%`;
      audio.setTtsVolume(pct / 100);
    });
    sliderTtsVol.addEventListener('change', (e) => {
      const pct = Number(e.target.value);
      callRpc('temple.updateSettings', { ttsVolume: +(pct / 100).toFixed(2) });
    });
  }

  // Cổng vào chánh điện (chế độ độc lập): lưu pháp danh, mở âm thanh nhờ thao tác người dùng
  document.getElementById('welcomeForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('welcomeName').value.trim().replace(/\s+/g, ' ');
    if (!name) return;
    try { localStorage.setItem('temple_name', name); } catch (_) {}
    document.getElementById('inputDevoteeName').value = name;
    document.getElementById('welcomeGate').hidden = true;
    audio.ensureContext();
    callRpc('temple.join', { user: name });
    callRpc('temple.burnIncense', { user: name, count: 3, wish: getFormInput().wish });
  });

  // Tên đã lưu cũng áp dụng cho bảng điều khiển
  try {
    const savedName = localStorage.getItem('temple_name');
    if (savedName) document.getElementById('inputDevoteeName').value = savedName;
  } catch (_) {}

  document.getElementById('dockToggle')?.addEventListener('click', () => {
    document.body.classList.toggle('dock-open');
  });

  function shortenName(name, maxLen = 13) {
    const str = String(name || '');
    return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
