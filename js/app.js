// ChunkFlow US — Main Application Controller
(function () {
  const SRS = window.ChunkFlowSRS;
  const Visuals = window.ChunkFlowVisuals;

  let currentView = 'today'; // 'today' | 'flashcards' | 'practice' | 'roadmap'

  // Flashcard Studio State
  let deckMode = 'today-unit'; // 'today-unit' | 'due' | 'starred' | 'stage-1'..'stage-7' | 'level-A1'..'level-B2' | 'custom-unit'
  let customDeckUnitId = null;
  let activeDeck = [];
  let cardIndex = 0;
  let isFlipped = false;

  // Practice Lab State
  let practiceMode = 'puzzle'; // 'puzzle' | 'cloze' | 'typing'
  let practiceDeck = [];
  let practiceIndex = 0;
  let puzzleSelected = [];
  let puzzlePool = [];
  let practiceFeedback = null; // { ok: boolean, message: string }

  // Roadmap Filter State
  let roadmapLevelFilter = 'ALL'; // 'ALL' | 'A1' | 'A2' | 'B1' | 'B2' | 'CUSTOM' | 'ERRORS'
  let roadmapSearchQuery = '';

  function escapeHTML(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(msg) {
    const el = document.getElementById('toastNotice');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => {
      el.classList.remove('visible');
    }, 2800);
  }

  function getActiveUnit() {
    const st = SRS.getState();
    const units = window.ROADMAP_UNITS || [];
    return units.find(u => u.id === st.activeUnitId) || units[0];
  }

  function renderMemoryMeterHTML(stage = 0) {
    let bars = '';
    for (let i = 1; i <= 6; i++) {
      bars += `<span class="meter-bar ${i <= stage ? 'filled' : ''}"></span>`;
    }
    return `<span class="memory-meter" title="Độ ngấm chu kỳ 1-3-5-7-14-30 (${stage}/6)">${bars}</span>`;
  }

  function stageLabelText(stage = 0) {
    const map = {
      0: 'Chưa học',
      1: 'Mốc Ngày 1',
      2: 'Mốc Ngày 3',
      3: 'Mốc Ngày 5',
      4: 'Mốc Ngày 7',
      5: 'Mốc Ngày 14',
      6: 'Mốc Ngày 30',
      7: 'Đã thuộc lòng 🏆'
    };
    return map[stage] || 'Chưa học';
  }

  function nextStagePreview(stage = 0) {
    const nextMap = {
      0: 'Lên Mốc Ngày 1',
      1: 'Lên Mốc Ngày 3',
      2: 'Lên Mốc Ngày 5',
      3: 'Lên Mốc Ngày 7',
      4: 'Lên Mốc Ngày 14',
      5: 'Lên Mốc Ngày 30',
      6: 'Đạt Mastered 🏆',
      7: 'Giữ Mastered 🏆'
    };
    return nextMap[stage] || 'Lên Mốc Ngày 1';
  }

  // Update Header Navigation Badges & Streak
  function updateHeaderUI() {
    const st = SRS.getState();
    const dueCount = SRS.getDueChunks().length;

    const streakEl = document.getElementById('headerStreak');
    if (streakEl) streakEl.textContent = `${st.streak || 1} ngày`;

    const dueBadge = document.getElementById('navDueBadge');
    if (dueBadge) {
      if (dueCount > 0) {
        dueBadge.textContent = dueCount;
        dueBadge.style.display = 'inline-block';
      } else {
        dueBadge.style.display = 'none';
      }
    }

    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === currentView);
    });
  }

  function switchView(viewName, opts = {}) {
    currentView = viewName;
    if (viewName === 'flashcards') {
      if (opts.deckMode) deckMode = opts.deckMode;
      if (opts.unitId) customDeckUnitId = opts.unitId;
      buildFlashcardDeck();
    } else if (viewName === 'practice') {
      if (opts.practiceMode) practiceMode = opts.practiceMode;
      buildPracticeSession(opts.chunks || null);
    }
    updateHeaderUI();
    renderWorkspace();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // =========================================================
  // VIEW 1: 🏠 BÀN HỌC HÔM NAY (6 CỤM/NGÀY & CHU KỲ 1-3-5-7-14-30)
  // =========================================================
  function renderTodayView() {
    const st = SRS.getState();
    const unit = getActiveUnit();
    const units = window.ROADMAP_UNITS || [];
    const dueCards = SRS.getDueChunks();
    const stages = SRS.getStageBreakdown();

    const allLearnedCount = Object.values(st.cards || {}).filter(c => c.stage >= 1).length;
    const masteredCount = Object.values(st.cards || {}).filter(c => c.stage >= 7).length;
    const unitLearnedCount = (unit?.chunks || []).filter(c => (st.cards[c.id]?.stage || 0) >= 1).length;

    const stageBoxesHTML = Object.values(stages).map(s => `
      <div class="srs-stage-box ${s.dueCount > 0 ? 'has-due' : ''}" onclick="window.App.openStageDeck(${s.stage})" title="${escapeHTML(s.desc)}">
        <div class="srs-stage-day">${escapeHTML(s.label)}</div>
        <div class="srs-stage-count">${s.cards.length}</div>
        <div class="srs-stage-meta">cụm đang ở mốc này</div>
        ${s.dueCount > 0 ? `<span class="due-pill">Cần ôn: ${s.dueCount}</span>` : ''}
      </div>
    `).join('');

    const antiOverwhelmHTML = dueCards.length > 8 ? `
      <div class="anti-overwhelm-bar">
        <div>
          <strong>🛡️ Chế độ Chống Ngợp (Smart Batching):</strong>
          <span>Hôm nay bạn có <b>${dueCards.length} thẻ</b> đến hạn ôn. Bạn có thể chia nhỏ ôn trước 6 thẻ (2 phút) hoặc rải đều lịch ôn sang các ngày kế tiếp để không bị quá tải!</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" onclick="window.App.startFlashcardDeck('due-batch')">⚡ Ôn gói nhỏ 6 thẻ trước</button>
          <button class="btn btn-secondary btn-sm" onclick="window.App.rescheduleOverdue()">📅 Giãn lịch ôn thông minh</button>
        </div>
      </div>
    ` : '';

    const todayChunksHTML = (unit?.chunks || []).map((c, idx) => {
      const cardSt = st.cards[c.id] || { stage: 0 };
      return `
        <article class="chunk-item-card">
          <div>
            <div class="chunk-top-row">
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="level-tag level-${c.level}">${c.level} • Cụm #${idx + 1}/6</span>
                <span style="font-size:12px;color:var(--text-muted);font-weight:600;">${escapeHTML(stageLabelText(cardSt.stage))}</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                ${renderMemoryMeterHTML(cardSt.stage)}
                <button class="btn btn-ghost btn-sm" onclick="window.App.speak('${escapeHTML(c.chunk)}', 0.96)" title="Nghe phát âm chuẩn Anh-Mỹ">🔊 US</button>
              </div>
            </div>
            <div class="chunk-phrase">${Visuals.formatChunkAnatomyHTML(c.chunk)}</div>
            <div class="chunk-ipa">${escapeHTML(c.ipa)}</div>
            <div class="chunk-meaning">${escapeHTML(c.meaning)}</div>
          </div>
          <div>
            <div class="chunk-example">“${escapeHTML(c.example)}”</div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;">
              <span style="font-size:12px;color:var(--text-muted);">${c.sceneIcon || '🖼️'} Có thẻ hình ảnh mặt sau</span>
              <button class="btn btn-secondary btn-sm" onclick="window.App.openSingleCardInStudio('${c.id}')">🃏 Lật thẻ này</button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    return `
      <section class="hero-banner">
        <div>
          <div class="hero-eyebrow">🇺🇸 CHUẨN TIẾNG ANH – MỸ (AMERICAN ENGLISH) • LỘ TRÌNH A1 → B2</div>
          <h1 class="hero-title">Học Cụm Từ Dài • Nhớ Nhanh Với Flashcard Hình Ảnh</h1>
          <p class="hero-subtitle">Công thức cá nhân hóa của bạn: <b>6 cụm dài/ngày</b> + <b>Hình ảnh trực quan ở mặt sau Flashcard</b> + <b>Chu kỳ lặp lại 1 – 3 – 5 – 7 – 14 – 30 ngày</b>.</p>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${dueCards.length > 0
            ? `<button class="btn btn-primary" onclick="window.App.startFlashcardDeck('due')">⏰ Ôn ngay ${dueCards.length} thẻ tới hạn hôm nay</button>`
            : `<button class="btn btn-primary" onclick="window.App.startFlashcardDeck('today-unit')">🃏 Học Flashcard 6 cụm hôm nay</button>`
          }
          <button class="btn btn-secondary" onclick="window.App.openAddChunkDialog()">➕ Tự thêm cụm từ mới</button>
        </div>
      </section>

      <section class="kpi-grid">
        <div class="kpi-card">
          <div>
            <div class="kpi-label">Gói 6 cụm hôm nay</div>
            <div class="kpi-value">${unitLearnedCount} / 6 cụm</div>
            <div class="kpi-sub">${escapeHTML(unit?.title || 'Ngày 1')} (${unit?.level || 'A1'})</div>
          </div>
          <div class="kpi-icon">🎯</div>
        </div>
        <div class="kpi-card">
          <div>
            <div class="kpi-label">Thẻ tới hạn ôn (1-3-5-7)</div>
            <div class="kpi-value" style="color:${dueCards.length > 0 ? 'var(--accent-rose)' : 'var(--brand-primary)'}">${dueCards.length} thẻ</div>
            <div class="kpi-sub">${dueCards.length > 0 ? 'Cần ôn để không đứt mạch nhớ' : 'Tuyệt vời! Đã sạch thẻ tồn'}</div>
          </div>
          <div class="kpi-icon">⏱️</div>
        </div>
        <div class="kpi-card">
          <div>
            <div class="kpi-label">Cụm đang trong chu kỳ nhớ</div>
            <div class="kpi-value">${allLearnedCount} cụm</div>
            <div class="kpi-sub">Đã thuộc lòng (Mastered): <b>${masteredCount}</b></div>
          </div>
          <div class="kpi-icon">🧠</div>
        </div>
        <div class="kpi-card">
          <div>
            <div class="kpi-label">Bảo vệ tiến độ (Zero-Login)</div>
            <div class="kpi-value" style="font-size:16px;">${SRS.isDiskLinked() ? '🟢 Đang đồng bộ ổ đĩa' : ' Tự động lưu trên máy'}</div>
            <div class="kpi-sub">
              <button class="btn btn-ghost btn-sm" style="padding:2px 6px;" onclick="window.App.linkDiskFile()">💾 Liên kết file ổ đĩa</button>
              •
              <button class="btn btn-ghost btn-sm" style="padding:2px 6px;" onclick="window.App.exportBackup()">Xuất file</button>
            </div>
          </div>
          <div class="kpi-icon">🛡️</div>
        </div>
      </section>

      <section class="section-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">🔄 Radar Chu Kỳ Lặp Lại 1 – 3 – 5 – 7 – 14 – 30 Ngày</h2>
            <p style="margin:4px 0 0;font-size:13.5px;color:var(--text-secondary);">Bấm vào bất kỳ mốc ngày nào để mở bộ thẻ Flashcard đang nằm ở mốc đó.</p>
          </div>
          ${dueCards.length > 0 ? `<button class="btn btn-primary btn-sm" onclick="window.App.startFlashcardDeck('due')">Ôn ${dueCards.length} thẻ đến hạn →</button>` : ''}
        </div>
        ${antiOverwhelmHTML}
        <div class="srs-pipeline">
          ${stageBoxesHTML}
        </div>
      </section>

      <section class="section-card">
        <div class="section-header">
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span class="level-tag level-${unit?.level || 'A1'}">Chặng ${unit?.level || 'A1'}</span>
              <h2 class="section-title">${escapeHTML(unit?.title || 'Ngày 1')}</h2>
            </div>
            <p style="margin:4px 0 0;font-size:13.5px;color:var(--text-secondary);">${escapeHTML(unit?.goal || '')}</p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" onclick="window.App.stepUnit(-1)" ${unit?.unitNumber <= 1 ? 'disabled' : ''}>← Ngày trước</button>
            <span style="font-size:13px;font-weight:700;color:var(--text-secondary);">Ngày ${unit?.unitNumber || 1} / ${units.length}</span>
            <button class="btn btn-secondary btn-sm" onclick="window.App.stepUnit(1)" ${unit?.unitNumber >= units.length ? 'disabled' : ''}>Ngày tiếp →</button>
            <button class="btn btn-primary btn-sm" onclick="window.App.startFlashcardDeck('today-unit')">🃏 Học Flashcard 6 cụm này</button>
            <button class="btn btn-secondary btn-sm" onclick="window.App.startPracticeForCurrentUnit()">⚡ Luyện ghép & điền 6 cụm</button>
          </div>
        </div>

        <div class="chunk-grid">
          ${todayChunksHTML}
        </div>
      </section>
    `;
  }

  // =========================================================
  // VIEW 2: 🃏 PHÒNG FLASHCARD HÌNH ẢNH 3D (VISUAL DUAL-CODING)
  // =========================================================
  function buildFlashcardDeck() {
    const st = SRS.getState();
    const all = SRS.getAllChunks();
    const unit = getActiveUnit();

    if (deckMode === 'today-unit') {
      activeDeck = [...(unit?.chunks || [])];
    } else if (deckMode === 'custom-unit' && customDeckUnitId) {
      const targetU = (window.ROADMAP_UNITS || []).find(u => u.id === customDeckUnitId);
      activeDeck = targetU ? [...targetU.chunks] : [...(unit?.chunks || [])];
    } else if (deckMode === 'due') {
      activeDeck = SRS.getDueChunks();
      if (!activeDeck.length) activeDeck = [...(unit?.chunks || [])];
    } else if (deckMode === 'due-batch') {
      activeDeck = SRS.getDueChunks().slice(0, 6);
      if (!activeDeck.length) activeDeck = [...(unit?.chunks || [])];
    } else if (deckMode === 'starred') {
      const errIds = new Set(Object.keys(st.errorLog || {}));
      activeDeck = all.filter(c => st.cards[c.id]?.starred || errIds.has(c.id));
    } else if (deckMode.startsWith('stage-')) {
      const stageNum = Number(deckMode.replace('stage-', ''));
      activeDeck = all.filter(c => (st.cards[c.id]?.stage || 0) === stageNum);
    } else if (deckMode.startsWith('level-')) {
      const lvl = deckMode.replace('level-', '');
      activeDeck = all.filter(c => c.level === lvl).slice(0, 30);
    } else {
      activeDeck = [...(unit?.chunks || [])];
    }

    cardIndex = 0;
    isFlipped = false;
  }

  function renderFlashcardsView() {
    if (!activeDeck || activeDeck.length === 0) {
      return `
        <div class="flashcard-studio-wrap">
          <div class="section-card" style="text-align:center;padding:48px 24px;">
            <div style="font-size:44px;margin-bottom:12px;">🎉</div>
            <h2 style="margin:0 0 8px;">Không có thẻ nào trong bộ lọc này!</h2>
            <p style="color:var(--text-secondary);margin:0 0 20px;">Bạn có thể chuyển sang học gói 6 cụm mới của hôm nay hoặc chọn theo chặng A1–B2.</p>
            <button class="btn btn-primary" onclick="window.App.startFlashcardDeck('today-unit')">🃏 Mở 6 Cụm Hôm Nay</button>
          </div>
        </div>
      `;
    }

    const card = activeDeck[Math.min(cardIndex, activeDeck.length - 1)];
    const st = SRS.getState();
    const cardState = st.cards[card.id] || { stage: 0, mySentence: '', customImage: '', starred: false };
    const dueCount = SRS.getDueChunks().length;
    const displayPhoto = cardState.customImage || card.photoUrl;

    const slotsHTML = (card.slots || []).map(slot => {
      const sampleCombined = card.chunk
        .replace(/doing something/i, slot)
        .replace(/for something/i, 'for ' + slot)
        .replace(/something/i, slot)
        .replace(/someone/i, slot);
      return `<button class="slot-chip" onclick="event.stopPropagation(); window.App.speak('${escapeHTML(sampleCombined)}', 0.95)" title="Bấm để nghe ghép thử cụm với '${escapeHTML(slot)}'">🔊 + ${escapeHTML(slot)}</button>`;
    }).join('');

    const examplesHTML = (card.examples || [{ en: card.example, tag: 'Câu ví dụ' }]).map(ex => `
      <div class="example-row">
        <div>
          <span class="example-tag">${escapeHTML(ex.tag || 'Ngữ cảnh Anh-Mỹ')}</span>
          <div>“${escapeHTML(ex.en)}”</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); window.App.speak('${escapeHTML(ex.en)}', 0.96)" title="Nghe câu này">🔊</button>
      </div>
    `).join('');

    return `
      <div class="flashcard-studio-wrap">
        <div class="studio-toolbar">
          <div class="mode-chips">
            <button class="chip-btn ${deckMode === 'today-unit' ? 'active' : ''}" onclick="window.App.startFlashcardDeck('today-unit')">📦 6 Cụm Hôm Nay</button>
            <button class="chip-btn ${deckMode === 'due' ? 'active' : ''}" onclick="window.App.startFlashcardDeck('due')">⏰ Tới hạn ôn (${dueCount})</button>
            <button class="chip-btn ${deckMode === 'starred' ? 'active' : ''}" onclick="window.App.startFlashcardDeck('starred')">⭐ Cụm hay quên</button>
            <button class="chip-btn ${deckMode === 'level-A1' ? 'active' : ''}" onclick="window.App.startFlashcardDeck('level-A1')">A1</button>
            <button class="chip-btn ${deckMode === 'level-A2' ? 'active' : ''}" onclick="window.App.startFlashcardDeck('level-A2')">A2</button>
            <button class="chip-btn ${deckMode === 'level-B1' ? 'active' : ''}" onclick="window.App.startFlashcardDeck('level-B1')">B1</button>
            <button class="chip-btn ${deckMode === 'level-B2' ? 'active' : ''}" onclick="window.App.startFlashcardDeck('level-B2')">B2</button>
          </div>
          <div style="font-size:13.5px;font-weight:700;color:var(--text-secondary);">
            Thẻ ${cardIndex + 1} / ${activeDeck.length}
          </div>
        </div>

        <div class="flashcard-stage">
          <div class="flashcard-3d ${isFlipped ? 'is-flipped' : ''}" id="flashcard3D">
            <!-- MẶT TRƯỚC (FRONT) -->
            <div class="card-face card-front" onclick="window.App.flipCard()">
              <div class="chunk-top-row">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <span class="level-tag level-${card.level}">Trình độ ${card.level}</span>
                  <span style="font-size:12.5px;font-weight:700;color:var(--text-secondary);">${escapeHTML(card.topic)}</span>
                </div>
                <div style="display:flex;align-items:center;gap:10px;">
                  <span style="font-size:12px;font-weight:700;color:var(--brand-primary);">${escapeHTML(stageLabelText(cardState.stage))}</span>
                  ${renderMemoryMeterHTML(cardState.stage)}
                  <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); window.App.toggleStar('${card.id}')" title="Đánh dấu cụm cần chú ý">
                    ${cardState.starred ? '⭐' : '☆'}
                  </button>
                </div>
              </div>

              <div class="front-center">
                <div class="front-chunk-text">${Visuals.formatChunkAnatomyHTML(card.chunk)}</div>
                <div class="front-ipa">${escapeHTML(card.ipa)}</div>

                <div class="audio-controls" onclick="event.stopPropagation()">
                  <button class="btn btn-primary btn-sm" onclick="window.App.speak('${escapeHTML(card.chunk)}', 0.96)">🔊 Giọng Mỹ chuẩn (1.0x)</button>
                  <button class="btn btn-secondary btn-sm" onclick="window.App.speak('${escapeHTML(card.chunk)}', 0.72)">🐢 Đọc chậm rõ âm (0.75x)</button>
                </div>

                <div>
                  <div class="formula-pill-box">
                    🧩 Khung cấu trúc: <b>${escapeHTML(card.formula || card.chunk)}</b>
                  </div>
                </div>
              </div>

              <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border-subtle);padding-top:14px;font-size:13px;color:var(--text-muted);">
                <span>💡 Nhẩm nghĩa & đặt thử 1 câu trước khi lật thẻ</span>
                <span style="font-weight:700;color:var(--brand-primary);">Bấm vào thẻ hoặc ấn Space để xem Hình ảnh mặt sau ↻</span>
              </div>
            </div>

            <!-- MẶT SAU (BACK — VISUAL DUAL-CODING MEMORY CARD) -->
            <div class="card-face card-back">
              <div>
                <div class="chunk-top-row" style="margin-bottom:10px;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span class="level-tag level-${card.level}">${card.level}</span>
                    <strong style="font-size:16px;">${escapeHTML(card.chunk)}</strong>
                    <button class="btn btn-ghost btn-sm" onclick="window.App.speak('${escapeHTML(card.chunk)}', 0.96)">🔊</button>
                  </div>
                  <button class="btn btn-secondary btn-sm" onclick="window.App.flipCard()">↺ Lật lại mặt trước</button>
                </div>

                <!-- HÌNH ẢNH GHI NHỚ TRỰC QUAN Ở MẶT SAU -->
                <div class="visual-memory-box" id="visualMemoryBox">
                  ${displayPhoto ? `
                    <img
                      class="visual-memory-img"
                      src="${escapeHTML(displayPhoto)}"
                      alt="${escapeHTML(card.chunk)}"
                      onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
                    >
                    <div style="display:none;width:100%;height:100%;">${Visuals.generateInstantSceneSVG(card)}</div>
                  ` : Visuals.generateInstantSceneSVG(card)}

                  <div class="visual-actions-overlay">
                    <button class="visual-btn" onclick="window.App.cycleCardPhoto('${card.id}')" title="Đổi hình minh họa khác">🖼️ Đổi ảnh</button>
                    <button class="visual-btn" onclick="window.App.promptCustomImage('${card.id}')" title="Dán link ảnh hoặc bấm Ctrl+V">📋 Dán ảnh (Ctrl+V)</button>
                    <label class="visual-btn" style="cursor:pointer;" title="Tải ảnh từ máy tính của bạn">
                      📁 Chọn ảnh máy
                      <input type="file" accept="image/*" style="display:none;" onchange="window.App.uploadCardImage(event, '${card.id}')">
                    </label>
                  </div>

                  <div class="visual-caption-bar">
                    <span>${card.sceneIcon || '🖼️'} ${escapeHTML(card.sceneCaption || 'Hình ảnh liên tưởng ngữ cảnh')}</span>
                    <span style="opacity:0.85;">Dual-Coding Visual Memory</span>
                  </div>
                </div>

                <div class="back-meaning-banner">
                  <div>
                    <div style="font-size:11.5px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">Nghĩa tiếng Việt & Phản xạ</div>
                    <h3 class="back-meaning-title">${escapeHTML(card.meaning)}</h3>
                  </div>
                  <div style="font-size:12.5px;color:var(--text-secondary);max-width:340px;">
                    💡 ${escapeHTML(card.memoryTip || '')}
                  </div>
                </div>

                <!-- KHUNG THAY THẾ CHỐNG HỌC VẸT -->
                <div style="margin-bottom:6px;font-size:12px;font-weight:700;color:var(--text-secondary);">
                  🔄 Bấm thử các cụm thay thế (Chống học vẹt 1 câu):
                </div>
                <div class="slot-chips-row">
                  ${slotsHTML}
                </div>

                <!-- 3 NGỮ CẢNH CÂU ĐA DẠNG -->
                <div class="examples-stack">
                  ${examplesHTML}
                </div>

                <!-- CÂU VÍ DỤ CỦA RIÊNG TÔI -->
                <div class="personal-sentence-box">
                  <div style="font-size:12px;font-weight:700;color:var(--text-secondary);">
                    ✍️ Câu ví dụ gắn với chính bạn (Giúp nhớ lâu gấp 3 lần khi ôn mốc Ngày 3, 5, 7):
                  </div>
                  <div class="personal-input-row">
                    <input
                      type="text"
                      id="mySentenceInput"
                      class="text-input"
                      placeholder="Viết 1 câu thật của bạn có dùng cụm '${escapeHTML(card.chunk)}'..."
                      value="${escapeHTML(cardState.mySentence || '')}"
                      onkeydown="if(event.key==='Enter'){window.App.saveMySentence('${card.id}')}"
                    >
                    <button class="btn btn-secondary btn-sm" onclick="window.App.saveMySentence('${card.id}')">Lưu câu</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 3 NÚT ĐÁNH GIÁ CHU KỲ LẶP LẠI 1 - 3 - 5 - 7 - 14 - 30 -->
        <div class="srs-rating-grid">
          <button class="rate-btn rate-forgot" onclick="window.App.rateCurrentCard('forgot')">
            <span class="rate-title">🔴 Quên / Còn lúng túng (Phím 1)</span>
            <span class="rate-sub">Quay về Mốc Ngày 1 • Đưa vào Sổ tay hay quên</span>
          </button>
          <button class="rate-btn rate-hesitant" onclick="window.App.rateCurrentCard('hesitant')">
            <span class="rate-title">🟡 Nhớ mang máng (Phím 2)</span>
            <span class="rate-sub">Giữ mốc hiện tại • Ngày mai nhắc lại</span>
          </button>
          <button class="rate-btn rate-easy" onclick="window.App.rateCurrentCard('easy')">
            <span class="rate-title">🟢 Nhớ bật ra ngay! (Phím 3)</span>
            <span class="rate-sub">${escapeHTML(nextStagePreview(cardState.stage))} (Chu kỳ 1-3-5-7-14-30)</span>
          </button>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;">
          <button class="btn btn-secondary btn-sm" onclick="window.App.moveCard(-1)">← Thẻ trước</button>
          <button class="btn btn-ghost btn-sm" onclick="window.App.switchView('practice', { chunks: activeDeck })">⚡ Chuyển bộ thẻ này sang Phòng Luyện Nhớ Nhanh →</button>
          <button class="btn btn-secondary btn-sm" onclick="window.App.moveCard(1)">Thẻ tiếp theo →</button>
        </div>
      </div>
    `;
  }

  // =========================================================
  // VIEW 3: ⚡ PHÒNG LUYỆN NHỚ NHANH (ACTIVE RECALL CHO CỤM DÀI)
  // =========================================================
  function buildPracticeSession(customChunks = null) {
    const unit = getActiveUnit();
    const due = SRS.getDueChunks();
    if (customChunks && customChunks.length) {
      practiceDeck = [...customChunks];
    } else if (due.length >= 4) {
      practiceDeck = due.slice(0, 6);
    } else {
      practiceDeck = [...(unit?.chunks || [])];
    }
    practiceIndex = 0;
    preparePracticeQuestion();
  }

  function preparePracticeQuestion() {
    practiceFeedback = null;
    if (!practiceDeck.length) return;
    const item = practiceDeck[Math.min(practiceIndex, practiceDeck.length - 1)];
    // Split long chunk into word tokens for Chunk Puzzle
    const words = item.chunk.trim().split(/\s+/);
    puzzleSelected = [];
    puzzlePool = words
      .map((w, idx) => ({ id: idx, word: w }))
      .sort(() => Math.random() - 0.5);
  }

  function renderPracticeView() {
    if (!practiceDeck.length) buildPracticeSession();
    const item = practiceDeck[Math.min(practiceIndex, practiceDeck.length - 1)];
    const st = SRS.getState();
    const cardState = st.cards[item.id] || { stage: 0 };
    const displayPhoto = cardState.customImage || item.photoUrl;

    // Cloze sentence: mask the chunk keywords inside the primary example
    const words = item.chunk.replace(/\b(something|someone|doing)\b/gi, '').trim().split(/\s+/).filter(Boolean);
    let maskedExample = item.example;
    words.forEach(w => {
      if (w.length > 2) {
        const reg = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*\\b`, 'i');
        maskedExample = maskedExample.replace(reg, '_____');
      }
    });

    // Distractor options for Cloze mode
    const otherChunks = (SRS.getAllChunks() || [])
      .filter(c => c.id !== item.id && c.level === item.level)
      .slice(0, 15)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    const clozeChoices = [item, ...otherChunks].sort((a, b) => a.id.localeCompare(b.id));

    let bodyHTML = '';
    if (practiceMode === 'puzzle') {
      const assembled = puzzleSelected.map((tok, i) => `
        <button class="puzzle-token" onclick="window.App.unpickPuzzleWord(${i})">${escapeHTML(tok.word)}</button>
      `).join('');

      const bank = puzzlePool.map((tok, i) => `
        <button class="puzzle-token ${puzzleSelected.some(s => s.id === tok.id) ? 'used' : ''}" onclick="window.App.pickPuzzleWord(${i})">
          ${escapeHTML(tok.word)}
        </button>
      `).join('');

      bodyHTML = `
        <div style="text-align:center;margin-bottom:14px;">
          <div style="font-size:12.5px;font-weight:700;color:var(--brand-primary);text-transform:uppercase;">🧩 Ghép các từ bên dưới thành cụm từ dài hoàn chỉnh</div>
          <h3 style="font-size:22px;margin:6px 0;">“${escapeHTML(item.meaning)}”</h3>
          <div style="font-size:13px;color:var(--text-secondary);">Khung gợi ý: ${escapeHTML(item.formula || '')}</div>
        </div>

        <div class="puzzle-word-bank" style="border:2px dashed var(--brand-primary);justify-content:center;align-items:center;">
          ${assembled || '<span style="color:var(--text-muted);font-size:13.5px;">Bấm chọn từng từ bên dưới theo đúng thứ tự của cụm từ...</span>'}
        </div>

        <div class="puzzle-word-bank" style="justify-content:center;">
          ${bank}
        </div>
      `;
    } else if (practiceMode === 'cloze') {
      bodyHTML = `
        <div style="text-align:center;margin-bottom:18px;">
          <div style="font-size:12.5px;font-weight:700;color:var(--brand-primary);text-transform:uppercase;">✍️ Chọn cụm từ dài phù hợp với ngữ cảnh và nghĩa</div>
          <h3 style="font-size:20px;margin:8px 0;">Nghĩa cần diễn đạt: “${escapeHTML(item.meaning)}”</h3>
          <div class="chunk-example" style="display:inline-block;font-size:16px;margin-top:8px;">
            “${escapeHTML(maskedExample)}”
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;">
          ${clozeChoices.map(choice => `
            <button class="btn btn-secondary" style="padding:14px;justify-content:flex-start;font-size:15px;" onclick="window.App.checkClozeChoice('${choice.id}')">
              🎯 ${escapeHTML(choice.chunk)}
            </button>
          `).join('')}
        </div>
      `;
    } else {
      // Visual Active Typing Recall
      bodyHTML = `
        <div style="text-align:center;margin-bottom:16px;">
          <div style="font-size:12.5px;font-weight:700;color:var(--brand-primary);text-transform:uppercase;">🎯 Nhìn Hình Ảnh & Nghĩa → Gõ lại cả cụm từ dài</div>
          <h3 style="font-size:22px;margin:6px 0;">“${escapeHTML(item.meaning)}”</h3>
          <div style="font-size:13px;color:var(--text-muted);">Phiên âm gợi ý: ${escapeHTML(item.ipa)}</div>
        </div>

        <div style="display:flex;gap:10px;max-width:520px;margin:0 auto 12px;">
          <input
            type="text"
            id="typingRecallInput"
            class="text-input"
            style="font-size:16px;font-weight:700;"
            placeholder="Gõ cụm tiếng Anh tại đây..."
            onkeydown="if(event.key==='Enter'){window.App.checkTypingRecall()}"
          >
          <button class="btn btn-primary" onclick="window.App.checkTypingRecall()">Kiểm tra</button>
          <button class="btn btn-secondary" onclick="window.App.giveTypingHint()">💡 Gợi ý</button>
        </div>
      `;
    }

    return `
      <div class="flashcard-studio-wrap">
        <div class="studio-toolbar">
          <div class="mode-chips">
            <button class="chip-btn ${practiceMode === 'puzzle' ? 'active' : ''}" onclick="window.App.setPracticeMode('puzzle')">🧩 1. Ghép mảnh cụm dài</button>
            <button class="chip-btn ${practiceMode === 'cloze' ? 'active' : ''}" onclick="window.App.setPracticeMode('cloze')">✍️ 2. Điền cụm vào câu</button>
            <button class="chip-btn ${practiceMode === 'typing' ? 'active' : ''}" onclick="window.App.setPracticeMode('typing')">🎯 3. Nhìn hình gõ cụm</button>
          </div>
          <span style="font-size:13.5px;font-weight:700;color:var(--text-secondary);">Câu ${practiceIndex + 1} / ${practiceDeck.length}</span>
        </div>

        <div class="section-card">
          <div class="visual-memory-box" style="height:165px;">
            <img
              class="visual-memory-img"
              src="${escapeHTML(displayPhoto)}"
              alt="${escapeHTML(item.meaning)}"
              onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
            >
            <div style="display:none;width:100%;height:100%;">${Visuals.generateInstantSceneSVG(item)}</div>
            <div class="visual-caption-bar">
              <span>${item.sceneIcon || '🖼️'} ${escapeHTML(item.sceneCaption || item.topic)}</span>
              <span class="level-tag level-${item.level}">${item.level} • ${escapeHTML(stageLabelText(cardState.stage))}</span>
            </div>
          </div>

          ${bodyHTML}

          ${practiceFeedback ? `
            <div style="margin-top:16px;padding:14px 18px;border-radius:14px;background:${practiceFeedback.ok ? 'var(--accent-emerald-soft)' : 'var(--accent-rose-soft)'};color:${practiceFeedback.ok ? 'var(--accent-emerald)' : 'var(--accent-rose)'};display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
              <div>
                <strong>${practiceFeedback.ok ? '🎉 Chính xác!' : '💡 Xem lại cụm chuẩn:'}</strong>
                <span> ${escapeHTML(practiceFeedback.message)}</span>
              </div>
              <button class="btn btn-primary btn-sm" onclick="window.App.nextPracticeItem()">Câu tiếp theo →</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // =========================================================
  // VIEW 4: 🗺️ LỘ TRÌNH A1–B2 & KHO CÁ NHÂN (ROADMAP & MY CHUNKS)
  // =========================================================
  function renderRoadmapView() {
    const st = SRS.getState();
    const units = window.ROADMAP_UNITS || [];
    const allChunks = SRS.getAllChunks();

    // Calculate progress per CEFR level
    const levels = ['A1', 'A2', 'B1', 'B2'].map(lvl => {
      const lvlChunks = allChunks.filter(c => c.level === lvl);
      const learned = lvlChunks.filter(c => (st.cards[c.id]?.stage || 0) >= 1).length;
      const pct = lvlChunks.length ? Math.round((learned / lvlChunks.length) * 100) : 0;
      return { lvl, total: lvlChunks.length, learned, pct };
    });

    const levelCardsHTML = levels.map(l => `
      <div class="kpi-card" style="cursor:pointer;border-color:${roadmapLevelFilter === l.lvl ? 'var(--brand-primary)' : 'var(--border-subtle)'}" onclick="window.App.setRoadmapFilter('${l.lvl}')">
        <div style="width:100%;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span class="level-tag level-${l.lvl}">Chặng ${l.lvl}</span>
            <span style="font-size:13px;font-weight:800;">${l.pct}%</span>
          </div>
          <div style="font-size:15px;font-weight:800;margin-bottom:6px;">${l.learned} / ${l.total} cụm từ</div>
          <div style="height:7px;background:var(--bg-subtle);border-radius:999px;overflow:hidden;">
            <div style="height:100%;width:${l.pct}%;background:var(--brand-primary);"></div>
          </div>
        </div>
      </div>
    `).join('');

    let contentHTML = '';
    const q = roadmapSearchQuery.trim().toLowerCase();

    if (q || roadmapLevelFilter === 'CUSTOM' || roadmapLevelFilter === 'ERRORS') {
      let filteredChunks = allChunks;
      if (roadmapLevelFilter === 'CUSTOM') {
        filteredChunks = (st.customChunks || []);
      } else if (roadmapLevelFilter === 'ERRORS') {
        const errIds = new Set(Object.keys(st.errorLog || {}));
        filteredChunks = allChunks.filter(c => errIds.has(c.id) || st.cards[c.id]?.starred);
      } else if (['A1', 'A2', 'B1', 'B2'].includes(roadmapLevelFilter)) {
        filteredChunks = allChunks.filter(c => c.level === roadmapLevelFilter);
      }

      if (q) {
        filteredChunks = filteredChunks.filter(c =>
          c.chunk.toLowerCase().includes(q) ||
          c.meaning.toLowerCase().includes(q) ||
          (c.topic || '').toLowerCase().includes(q)
        );
      }

      contentHTML = `
        <div class="chunk-grid">
          ${filteredChunks.slice(0, 60).map(c => {
            const cardSt = st.cards[c.id] || { stage: 0 };
            return `
              <article class="chunk-item-card">
                <div>
                  <div class="chunk-top-row">
                    <span class="level-tag level-${c.level}">${c.level} • ${escapeHTML(stageLabelText(cardSt.stage))}</span>
                    <button class="btn btn-ghost btn-sm" onclick="window.App.speak('${escapeHTML(c.chunk)}', 0.96)">🔊 US</button>
                  </div>
                  <div class="chunk-phrase">${Visuals.formatChunkAnatomyHTML(c.chunk)}</div>
                  <div class="chunk-ipa">${escapeHTML(c.ipa)}</div>
                  <div class="chunk-meaning">${escapeHTML(c.meaning)}</div>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
                  ${renderMemoryMeterHTML(cardSt.stage)}
                  <button class="btn btn-secondary btn-sm" onclick="window.App.openSingleCardInStudio('${c.id}')">🃏 Mở thẻ Flashcard</button>
                </div>
              </article>
            `;
          }).join('') || '<p style="color:var(--text-secondary);">Chưa có cụm từ nào khớp với bộ lọc này.</p>'}
        </div>
      `;
    } else {
      const visibleUnits = roadmapLevelFilter === 'ALL'
        ? units
        : units.filter(u => u.level === roadmapLevelFilter);

      contentHTML = `
        <div class="chunk-grid">
          ${visibleUnits.map(u => {
            const learnedInU = u.chunks.filter(c => (st.cards[c.id]?.stage || 0) >= 1).length;
            const isCurrent = st.activeUnitId === u.id;
            return `
              <article class="chunk-item-card" style="border-color:${isCurrent ? 'var(--brand-primary)' : 'var(--border-subtle)'}">
                <div>
                  <div class="chunk-top-row">
                    <span class="level-tag level-${u.level}">Chặng ${u.level}</span>
                    <span style="font-size:12.5px;font-weight:700;color:var(--brand-primary);">${learnedInU}/6 cụm đã học</span>
                  </div>
                  <h3 style="font-size:16.5px;font-weight:800;margin:8px 0 4px;">${escapeHTML(u.title)}</h3>
                  <p style="font-size:13px;color:var(--text-secondary);margin:0 0 10px;">${escapeHTML(u.goal)}</p>
                  <div style="display:flex;flex-wrap:wrap;gap:6px;">
                    ${u.chunks.map(c => `<span style="font-size:12px;background:var(--bg-subtle);padding:3px 8px;border-radius:6px;font-weight:600;">${escapeHTML(c.chunk)}</span>`).join('')}
                  </div>
                </div>
                <div style="display:flex;gap:8px;margin-top:12px;">
                  <button class="btn ${isCurrent ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="window.App.selectUnitForToday('${u.id}')">
                    ${isCurrent ? '✓ Đang là Gói Hôm Nay' : '📌 Chọn làm Gói Hôm Nay'}
                  </button>
                  <button class="btn btn-ghost btn-sm" onclick="window.App.openUnitFlashcards('${u.id}')">🃏 Lật 6 thẻ</button>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      `;
    }

    return `
      <section class="section-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">🗺️ Bản Đồ Lộ Trình A1 → B2 (${allChunks.length} Cụm Từ Dài Chuẩn Anh – Mỹ)</h2>
            <p style="margin:4px 0 0;font-size:13.5px;color:var(--text-secondary);">Chia sẵn thành <b>${units.length} gói 6 cụm/ngày</b> từ cơ bản đến nâng cao + Kho cụm từ cá nhân của riêng bạn.</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" onclick="window.App.openAddChunkDialog()">➕ Thêm cụm từ của riêng tôi</button>
            <button class="btn btn-secondary btn-sm" onclick="window.App.exportBackup()">📥 Xuất file Backup</button>
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
              📤 Nhập file Backup
              <input type="file" accept=".json" style="display:none;" onchange="window.App.importBackupFile(event)">
            </label>
          </div>
        </div>

        <div class="kpi-grid" style="margin-bottom:18px;">
          ${levelCardsHTML}
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
          <div class="mode-chips">
            <button class="chip-btn ${roadmapLevelFilter === 'ALL' ? 'active' : ''}" onclick="window.App.setRoadmapFilter('ALL')">Tất cả (${units.length} ngày)</button>
            <button class="chip-btn ${roadmapLevelFilter === 'A1' ? 'active' : ''}" onclick="window.App.setRoadmapFilter('A1')">🌱 A1</button>
            <button class="chip-btn ${roadmapLevelFilter === 'A2' ? 'active' : ''}" onclick="window.App.setRoadmapFilter('A2')">🌿 A2</button>
            <button class="chip-btn ${roadmapLevelFilter === 'B1' ? 'active' : ''}" onclick="window.App.setRoadmapFilter('B1')">🌳 B1</button>
            <button class="chip-btn ${roadmapLevelFilter === 'B2' ? 'active' : ''}" onclick="window.App.setRoadmapFilter('B2')">🌲 B2</button>
            <button class="chip-btn ${roadmapLevelFilter === 'CUSTOM' ? 'active' : ''}" onclick="window.App.setRoadmapFilter('CUSTOM')">✨ Cụm tôi tự thêm (${(st.customChunks || []).length})</button>
            <button class="chip-btn ${roadmapLevelFilter === 'ERRORS' ? 'active' : ''}" onclick="window.App.setRoadmapFilter('ERRORS')">📕 Sổ tay cụm hay quên</button>
          </div>
          <div style="min-width:260px;flex:1;max-width:340px;">
            <input
              type="search"
              class="text-input"
              placeholder="🔍 Tìm nhanh cụm từ hoặc nghĩa tiếng Việt..."
              value="${escapeHTML(roadmapSearchQuery)}"
              oninput="window.App.searchRoadmap(this.value)"
            >
          </div>
        </div>

        ${contentHTML}
      </section>
    `;
  }

  function renderWorkspace() {
    const container = document.getElementById('workspaceMain');
    if (!container) return;

    if (currentView === 'today') {
      container.innerHTML = renderTodayView();
    } else if (currentView === 'flashcards') {
      container.innerHTML = renderFlashcardsView();
    } else if (currentView === 'practice') {
      container.innerHTML = renderPracticeView();
    } else if (currentView === 'roadmap') {
      container.innerHTML = renderRoadmapView();
    }
  }

  // =========================================================
  // EVENT HANDLERS & PUBLIC ACTIONS
  // =========================================================
  window.App = {
    switchView,
    speak: (text, rate = 0.96) => Visuals.speakAmerican(text, rate),

    stepUnit: (delta) => {
      const units = window.ROADMAP_UNITS || [];
      const cur = getActiveUnit();
      const idx = units.findIndex(u => u.id === cur.id);
      const next = units[Math.max(0, Math.min(units.length - 1, idx + delta))];
      if (next) {
        SRS.setActiveUnit(next.id);
        renderWorkspace();
      }
    },

    selectUnitForToday: (unitId) => {
      SRS.setActiveUnit(unitId);
      showToast('Đã chọn gói 6 cụm này làm bài học Hôm nay!');
      switchView('today');
    },

    openUnitFlashcards: (unitId) => {
      customDeckUnitId = unitId;
      switchView('flashcards', { deckMode: 'custom-unit', unitId });
    },

    startFlashcardDeck: (mode) => {
      deckMode = mode;
      buildFlashcardDeck();
      currentView = 'flashcards';
      updateHeaderUI();
      renderWorkspace();
    },

    openStageDeck: (stageNum) => {
      const stages = SRS.getStageBreakdown();
      if (!stages[stageNum] || stages[stageNum].cards.length === 0) {
        showToast(`Hiện chưa có thẻ nào ở ${stageLabelText(stageNum)}. Hãy lật thẻ và đánh giá để nạp vào chu kỳ!`);
        return;
      }
      deckMode = `stage-${stageNum}`;
      buildFlashcardDeck();
      currentView = 'flashcards';
      updateHeaderUI();
      renderWorkspace();
    },

    openSingleCardInStudio: (chunkId) => {
      const c = SRS.getChunkById(chunkId);
      if (!c) return;
      const unit = (window.ROADMAP_UNITS || []).find(u => u.id === c.unitId);
      if (unit) {
        activeDeck = [...unit.chunks];
        cardIndex = Math.max(0, activeDeck.findIndex(x => x.id === chunkId));
      } else {
        activeDeck = [c];
        cardIndex = 0;
      }
      isFlipped = false;
      currentView = 'flashcards';
      updateHeaderUI();
      renderWorkspace();
    },

    flipCard: () => {
      isFlipped = !isFlipped;
      const cardEl = document.getElementById('flashcard3D');
      if (cardEl) {
        cardEl.classList.toggle('is-flipped', isFlipped);
      } else {
        renderWorkspace();
      }
      if (isFlipped && activeDeck[cardIndex]) {
        Visuals.speakAmerican(activeDeck[cardIndex].chunk, 0.96);
      }
    },

    moveCard: (delta) => {
      if (!activeDeck.length) return;
      cardIndex = (cardIndex + delta + activeDeck.length) % activeDeck.length;
      isFlipped = false;
      renderWorkspace();
    },

    rateCurrentCard: (rating) => {
      if (!activeDeck.length) return;
      const card = activeDeck[cardIndex];
      const updated = SRS.rateChunk(card.id, rating);

      const msgMap = {
        forgot: `🔴 Đã đưa "${card.chunk}" về Mốc Ngày 1 & Sổ tay hay quên`,
        hesitant: `🟡 Đã hẹn ngày mai nhắc lại "${card.chunk}" (${stageLabelText(updated.stage)})`,
        easy: `🟢 Tuyệt vời! "${card.chunk}" đã lên ${stageLabelText(updated.stage)}`
      };
      showToast(msgMap[rating] || 'Đã lưu tiến độ thẻ!');

      if (cardIndex < activeDeck.length - 1) {
        cardIndex++;
        isFlipped = false;
        renderWorkspace();
      } else {
        isFlipped = false;
        showToast('🎉 Bạn đã hoàn thành lượt thẻ này! Hãy luyện ghép cụm để khóa trí nhớ.');
        updateHeaderUI();
        renderWorkspace();
      }
    },

    toggleStar: (chunkId) => {
      const starred = SRS.toggleStarChunk(chunkId);
      showToast(starred ? '⭐ Đã đánh dấu vào Cụm cần chú ý' : 'Đã bỏ đánh dấu');
      renderWorkspace();
    },

    saveMySentence: (chunkId) => {
      const input = document.getElementById('mySentenceInput');
      if (!input) return;
      SRS.savePersonalSentence(chunkId, input.value);
      showToast('✍️ Đã lưu câu ví dụ cá nhân vào mặt sau thẻ!');
    },

    cycleCardPhoto: (chunkId) => {
      const c = SRS.getChunkById(chunkId);
      const st = SRS.getCardState(chunkId);
      const currentUrl = st?.customImage || c?.photoUrl || '';
      const nextUrl = Visuals.getNextGalleryPhoto(currentUrl);
      SRS.saveCustomImage(chunkId, nextUrl);
      showToast('🖼️ Đã đổi hình ảnh minh họa mặt sau!');
      renderWorkspace();
    },

    promptCustomImage: (chunkId) => {
      const url = window.prompt('Dán đường link ảnh (URL) bạn muốn đặt cho mặt sau thẻ này (hoặc đóng cửa sổ này rồi nhấn Ctrl+V để dán ảnh từ Clipboard):');
      if (url && url.trim()) {
        SRS.saveCustomImage(chunkId, url.trim());
        showToast('🖼️ Đã cập nhật hình ảnh cá nhân cho thẻ!');
        renderWorkspace();
      }
    },

    uploadCardImage: async (event, chunkId) => {
      const file = event.target?.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await Visuals.fileToDataURL(file);
        SRS.saveCustomImage(chunkId, dataUrl);
        showToast('📁 Đã tải và lưu ảnh riêng vào mặt sau thẻ!');
        renderWorkspace();
      } catch (e) {
        showToast('Không thể đọc file ảnh này.');
      }
    },

    // Practice Lab Handlers
    startPracticeForCurrentUnit: () => {
      const unit = getActiveUnit();
      switchView('practice', { chunks: unit?.chunks || [] });
    },

    setPracticeMode: (mode) => {
      practiceMode = mode;
      preparePracticeQuestion();
      renderWorkspace();
    },

    pickPuzzleWord: (poolIdx) => {
      const tok = puzzlePool[poolIdx];
      if (!tok || puzzleSelected.some(s => s.id === tok.id)) return;
      puzzleSelected.push(tok);

      const item = practiceDeck[practiceIndex];
      const targetWords = item.chunk.trim().split(/\s+/);
      if (puzzleSelected.length === targetWords.length) {
        const userPhrase = puzzleSelected.map(x => x.word).join(' ');
        const isCorrect = userPhrase.toLowerCase() === item.chunk.trim().toLowerCase();
        if (isCorrect) {
          Visuals.speakAmerican(item.chunk, 0.96);
          SRS.rateChunk(item.id, 'easy');
          practiceFeedback = { ok: true, message: `"${item.chunk}" — Đã tự động cập nhật vào chu kỳ 1-3-5-7!` };
        } else {
          SRS.rateChunk(item.id, 'forgot');
          practiceFeedback = { ok: false, message: `Đáp án đúng là: "${item.chunk}"` };
        }
      }
      renderWorkspace();
    },

    unpickPuzzleWord: (selIdx) => {
      puzzleSelected.splice(selIdx, 1);
      practiceFeedback = null;
      renderWorkspace();
    },

    checkClozeChoice: (chosenId) => {
      const item = practiceDeck[practiceIndex];
      if (chosenId === item.id) {
        Visuals.speakAmerican(item.example, 0.96);
        SRS.rateChunk(item.id, 'easy');
        practiceFeedback = { ok: true, message: `"${item.chunk}" (${item.meaning}) — Đã cộng tiến độ 1-3-5-7!` };
      } else {
        SRS.rateChunk(item.id, 'forgot');
        practiceFeedback = { ok: false, message: `Cụm đúng phải là "${item.chunk}" (${item.meaning}).` };
      }
      renderWorkspace();
    },

    checkTypingRecall: () => {
      const input = document.getElementById('typingRecallInput');
      if (!input) return;
      const item = practiceDeck[practiceIndex];
      const cleanUser = input.value.trim().toLowerCase().replace(/\s+/g, ' ');
      const cleanTarget = item.chunk.trim().toLowerCase().replace(/\s+/g, ' ');

      if (cleanUser === cleanTarget) {
        Visuals.speakAmerican(item.chunk, 0.96);
        SRS.rateChunk(item.id, 'easy');
        practiceFeedback = { ok: true, message: `Xuất sắc! "${item.chunk}" đã được thăng hạng trong chu kỳ 1-3-5-7-14-30.` };
      } else {
        practiceFeedback = { ok: false, message: `Cụm chuẩn là: "${item.chunk}"` };
      }
      renderWorkspace();
    },

    giveTypingHint: () => {
      const input = document.getElementById('typingRecallInput');
      const item = practiceDeck[practiceIndex];
      if (!input || !item) return;
      const words = item.chunk.split(/\s+/);
      input.value = words.slice(0, Math.ceil(words.length / 2)).join(' ') + ' ';
      input.focus();
    },

    nextPracticeItem: () => {
      practiceIndex = (practiceIndex + 1) % practiceDeck.length;
      preparePracticeQuestion();
      renderWorkspace();
    },

    // Roadmap & Custom Chunk Dialog Handlers
    setRoadmapFilter: (lvl) => {
      roadmapLevelFilter = lvl;
      renderWorkspace();
    },

    searchRoadmap: (val) => {
      roadmapSearchQuery = val;
      renderWorkspace();
    },

    rescheduleOverdue: () => {
      const moved = SRS.smartRescheduleOverdue(8);
      showToast(`📅 Đã giãn lịch thông minh ${moved} thẻ sang các ngày tới!`);
      updateHeaderUI();
      renderWorkspace();
    },

    openAddChunkDialog: () => {
      const dlg = document.getElementById('addChunkDialog');
      if (dlg && typeof dlg.showModal === 'function') {
        dlg.showModal();
      }
    },

    submitNewChunk: (event) => {
      event.preventDefault();
      const chunk = document.getElementById('newChunkPhrase')?.value;
      const meaning = document.getElementById('newChunkMeaning')?.value;
      const level = document.getElementById('newChunkLevel')?.value || 'B1';
      const example = document.getElementById('newChunkExample')?.value;
      const customImage = document.getElementById('newChunkImage')?.value;

      const created = SRS.addCustomChunk({ chunk, meaning, level, example, customImage });
      if (created) {
        document.getElementById('addChunkForm')?.reset();
        document.getElementById('addChunkDialog')?.close();
        showToast(`✨ Đã thêm "${created.chunk}" vào Mốc Ngày 1!`);
        updateHeaderUI();
        renderWorkspace();
      }
    },

    linkDiskFile: async () => {
      const res = await SRS.connectLocalDiskFile();
      if (res) {
        showToast(res.mode === 'live-sync'
          ? `🟢 Đã liên kết tự động lưu vào file ${res.name}!`
          : `📥 Đã tải file sao lưu ${res.name}`);
        renderWorkspace();
      }
    },

    exportBackup: () => {
      SRS.exportBackupJSON();
      showToast('📥 Đã xuất file sao lưu tiến độ học!');
    },

    importBackupFile: (event) => {
      const file = event.target?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        try {
          SRS.importBackupJSON(e.target.result);
          showToast('🎉 Đã khôi phục toàn bộ tiến độ học 1-3-5-7 thành công!');
          updateHeaderUI();
          renderWorkspace();
        } catch (err) {
          showToast('File sao lưu không hợp lệ.');
        }
      };
      reader.readAsText(file);
    },

    // Two-state color-scheme toggle compliant with modern-web-guidance `dark-mode-toggle`
    toggleColorScheme: () => {
      const meta = document.querySelector('meta[name="color-scheme"]');
      if (!meta) return;
      const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const stored = localStorage.getItem('color-scheme');
      const currentRenderedDark = stored ? stored === 'dark' : sysDark;
      const target = currentRenderedDark ? 'light' : 'dark';
      const sysScheme = sysDark ? 'dark' : 'light';

      if (target === sysScheme) {
        localStorage.removeItem('color-scheme');
        meta.content = 'light dark';
      } else {
        localStorage.setItem('color-scheme', target);
        meta.content = target;
      }
    }
  };

  // Global keyboard shortcuts & Ctrl+V image pasting for Flashcards
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    if (currentView === 'flashcards') {
      if (e.code === 'Space') {
        e.preventDefault();
        window.App.flipCard();
      } else if (e.key === '1') {
        window.App.rateCurrentCard('forgot');
      } else if (e.key === '2') {
        window.App.rateCurrentCard('hesitant');
      } else if (e.key === '3') {
        window.App.rateCurrentCard('easy');
      } else if (e.key === 'ArrowRight') {
        window.App.moveCard(1);
      } else if (e.key === 'ArrowLeft') {
        window.App.moveCard(-1);
      }
    }
  });

  window.addEventListener('paste', async (e) => {
    if (currentView !== 'flashcards' || !activeDeck[cardIndex]) return;
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const dataUrl = await Visuals.fileToDataURL(file);
          SRS.saveCustomImage(activeDeck[cardIndex].id, dataUrl);
          showToast('📋 Đã dán ảnh trực tiếp vào mặt sau thẻ Flashcard!');
          renderWorkspace();
        }
      }
    }
  });

  // Sync color-scheme across tabs per `dark-mode-toggle` guidance
  window.addEventListener('storage', (e) => {
    if (e.key === 'color-scheme') {
      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) meta.content = e.newValue ?? 'light dark';
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    // Fallback for browsers without <dialog closedby="any"> support per `light-dismiss-a-dialog`
    document.querySelectorAll('dialog[closedby="any"]').forEach(dialog => {
      if (!('closedBy' in HTMLDialogElement.prototype)) {
        dialog.addEventListener('click', (event) => {
          if (event.target !== dialog) return;
          const rect = dialog.getBoundingClientRect();
          const isDialogContent = (
            rect.top <= event.clientY &&
            event.clientY <= rect.top + rect.height &&
            rect.left <= event.clientX &&
            event.clientX <= rect.left + rect.width
          );
          if (isDialogContent) return;
          dialog.close();
        });
      }
    });

    buildFlashcardDeck();
    updateHeaderUI();
    renderWorkspace();
  });
})();
