// ChunkFlow SRS Engine — 1–3–5–7–14–30 Spaced Repetition & Zero-Login Local Persistence
(function () {
  const STORAGE_KEY = 'chunkflow_us_state_v1';
  const SRS_INTERVALS = [1, 3, 5, 7, 14, 30]; // Stage 1..6 -> Stage 7 = Mastered

  let fileHandle = null;
  let simulatedDayOffset = 0; // Allows user to test +1d, +3d, +5d, +7d review cycles live!

  function nowMs() {
    return Date.now() + simulatedDayOffset * 86400000;
  }

  function todayISO() {
    const d = new Date(nowMs());
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function endOfTodayMs() {
    const d = new Date(nowMs());
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }

  function defaultState() {
    return {
      version: 1,
      activeUnitId: 'u1',
      dailyGoal: 6,
      streak: 1,
      lastStudyDate: todayISO(),
      xp: 0,
      cards: {},
      customChunks: [],
      errorLog: {},
      dailyHistory: {},
      completedUnits: {}
    };
  }

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return { ...defaultState(), ...parsed };
    } catch (e) {
      console.warn('Could not read localStorage state, using default:', e);
      return defaultState();
    }
  }

  async function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('localStorage save warning:', e);
    }
    if (fileHandle) {
      try {
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(state, null, 2));
        await writable.close();
      } catch (err) {
        console.warn('Direct disk sync paused:', err);
      }
    }
  }

  function touchStudyDay(type = 'review', count = 1) {
    const today = todayISO();
    if (state.lastStudyDate !== today) {
      const prev = new Date(state.lastStudyDate + 'T00:00:00');
      const cur = new Date(today + 'T00:00:00');
      const diffDays = Math.round((cur - prev) / 86400000);
      if (diffDays === 1) {
        state.streak = (state.streak || 0) + 1;
      } else if (diffDays > 1) {
        state.streak = 1;
      }
      state.lastStudyDate = today;
    } else if (!state.streak) {
      state.streak = 1;
    }

    state.dailyHistory[today] = state.dailyHistory[today] || { learned: 0, reviewed: 0 };
    if (type === 'learn') state.dailyHistory[today].learned += count;
    if (type === 'review') state.dailyHistory[today].reviewed += count;
  }

  function getAllChunks() {
    const base = window.ALL_CHUNKS || [];
    const custom = (state.customChunks || []).map(c => ({ ...c, isCustom: true }));
    return [...custom, ...base];
  }

  function getChunkById(id) {
    return getAllChunks().find(c => c.id === id) || null;
  }

  function getCardState(chunkId) {
    return state.cards[chunkId] || null;
  }

  function ensureCardState(chunkId) {
    if (!state.cards[chunkId]) {
      state.cards[chunkId] = {
        stage: 0, // 0 = New, 1=1d, 2=3d, 3=5d, 4=7d, 5=14d, 6=30d, 7=Mastered
        intervalDays: 0,
        dueAt: 0,
        lastReviewedAt: 0,
        lastStageAdvanceDate: '',
        lastRating: null,
        reviewCount: 0,
        practicedCount: 0,
        wrongCount: 0,
        starred: false,
        mySentence: '',
        customImage: ''
      };
    }
    return state.cards[chunkId];
  }

  // Rate a flashcard according to the 1-3-5-7-14-30 cycle.
  // Prevents premature multi-stage skipping within the same day unless forceAdvance is true or the card is currently due!
  function rateChunk(chunkId, rating, options = {}) {
    const card = ensureCardState(chunkId);
    const chunkObj = getChunkById(chunkId);
    const now = nowMs();
    const today = todayISO();
    const cutoff = endOfTodayMs();
    const isFirstLearn = card.stage === 0;
    const isCurrentlyDue = card.stage >= 1 && card.stage < 7 && card.dueAt <= cutoff;

    card.lastReviewedAt = now;
    card.reviewCount = (card.reviewCount || 0) + 1;
    card.lastRating = rating;
    if (options.fromPractice) {
      card.practicedCount = (card.practicedCount || 0) + 1;
    }

    if (rating === 'forgot') {
      card.stage = 1;
      card.intervalDays = SRS_INTERVALS[0]; // Back to Day 1
      card.wrongCount = (card.wrongCount || 0) + 1;
      card.dueAt = now + SRS_INTERVALS[0] * 86400000;
      card.lastStageAdvanceDate = today;
      if (chunkObj) {
        state.errorLog[chunkId] = {
          chunkId,
          chunk: chunkObj.chunk,
          meaning: chunkObj.meaning,
          level: chunkObj.level,
          wrongCount: card.wrongCount,
          updatedAt: now
        };
      }
      state.xp = (state.xp || 0) + 5;
    } else if (rating === 'hesitant') {
      if (card.stage === 0) {
        card.stage = 1;
        card.lastStageAdvanceDate = today;
      }
      card.intervalDays = SRS_INTERVALS[Math.min(card.stage - 1, SRS_INTERVALS.length - 1)];
      card.dueAt = now + 86400000; // Review tomorrow
      state.xp = (state.xp || 0) + 10;
    } else {
      // 'easy' -> Advance stage ONLY if new (0 -> 1), currently due today, or explicitly forced
      const canAdvanceStage = isFirstLearn || isCurrentlyDue || options.forceAdvance || (card.lastStageAdvanceDate !== today);

      if (canAdvanceStage) {
        card.stage = Math.min(7, (card.stage || 0) + 1);
        card.lastStageAdvanceDate = today;
        if (card.stage >= 7) {
          card.intervalDays = 60;
          card.dueAt = now + 60 * 86400000;
        } else {
          const days = SRS_INTERVALS[card.stage - 1] || 1;
          card.intervalDays = days;
          card.dueAt = now + days * 86400000;
        }
      }
      if (state.errorLog[chunkId] && card.stage >= 3) {
        delete state.errorLog[chunkId];
      }
      state.xp = (state.xp || 0) + (canAdvanceStage ? 15 : 5);
    }

    touchStudyDay(isFirstLearn ? 'learn' : 'review', 1);
    saveState();
    return card;
  }

  function savePersonalSentence(chunkId, sentence) {
    const card = ensureCardState(chunkId);
    card.mySentence = String(sentence || '').trim();
    saveState();
    return card;
  }

  function saveCustomImage(chunkId, imageUrlOrData) {
    const card = ensureCardState(chunkId);
    card.customImage = String(imageUrlOrData || '').trim();
    saveState();
    return card;
  }

  function toggleStarChunk(chunkId) {
    const card = ensureCardState(chunkId);
    card.starred = !card.starred;
    saveState();
    return card.starred;
  }

  function getDueChunks() {
    const cutoff = endOfTodayMs();
    return getAllChunks().filter(c => {
      const st = state.cards[c.id];
      return st && st.stage >= 1 && st.stage < 7 && st.dueAt <= cutoff;
    }).sort((a, b) => {
      const ca = state.cards[a.id];
      const cb = state.cards[b.id];
      return (ca.dueAt || 0) - (cb.dueAt || 0);
    });
  }

  function formatDaysUntilDue(dueAt) {
    if (!dueAt) return 'Chưa có lịch';
    const cutoff = endOfTodayMs();
    if (dueAt <= cutoff) return 'Đến hạn hôm nay';
    const diffDays = Math.max(1, Math.ceil((dueAt - nowMs()) / 86400000));
    return diffDays === 1 ? 'Ôn vào ngày mai' : `Ôn sau ${diffDays} ngày`;
  }

  function getStageBreakdown() {
    const stages = {
      1: { stage: 1, days: 1, label: 'Mốc Ngày 1', desc: 'Mới nạp • Ôn lại sau 1 ngày', cards: [], dueCount: 0 },
      2: { stage: 2, days: 3, label: 'Mốc Ngày 3', desc: 'Gợi nhớ lần 1 • Ôn sau 3 ngày', cards: [], dueCount: 0 },
      3: { stage: 3, days: 5, label: 'Mốc Ngày 5', desc: 'Gợi nhớ lần 2 • Ôn sau 5 ngày', cards: [], dueCount: 0 },
      4: { stage: 4, days: 7, label: 'Mốc Ngày 7', desc: 'Trí nhớ trung hạn • Ôn sau 7 ngày', cards: [], dueCount: 0 },
      5: { stage: 5, days: 14, label: 'Mốc Ngày 14', desc: 'Trí nhớ sâu • Ôn sau 14 ngày', cards: [], dueCount: 0 },
      6: { stage: 6, days: 30, label: 'Mốc Ngày 30', desc: 'Trước ngưỡng thuộc lòng • 30 ngày', cards: [], dueCount: 0 },
      7: { stage: 7, days: 60, label: 'Đã Thuộc Lòng 🏆', desc: 'Mastered • Phản xạ tự nhiên', cards: [], dueCount: 0 }
    };

    const cutoff = endOfTodayMs();

    getAllChunks().forEach(c => {
      const st = state.cards[c.id];
      if (st && st.stage >= 1 && stages[st.stage]) {
        stages[st.stage].cards.push(c);
        if (st.stage < 7 && st.dueAt <= cutoff) {
          stages[st.stage].dueCount++;
        }
      }
    });

    return stages;
  }

  function smartRescheduleOverdue(maxPerDay = 8) {
    const due = getDueChunks();
    if (due.length <= maxPerDay) return 0;

    const now = nowMs();
    let moved = 0;
    due.forEach((chunk, index) => {
      if (index >= maxPerDay) {
        const dayOffset = Math.floor(index / maxPerDay);
        const card = state.cards[chunk.id];
        if (card) {
          card.dueAt = now + dayOffset * 86400000;
          moved++;
        }
      }
    });
    saveState();
    return moved;
  }

  function addCustomChunk({ chunk, meaning, level = 'B1', topic = 'CỤM TỪ CÁ NHÂN', example = '', formula = '', customImage = '', mySentence = '' }) {
    const cleanChunk = String(chunk || '').trim();
    if (!cleanChunk) return null;

    const id = 'custom_' + Date.now();
    const dict = window.IPA_DICT || {};
    const words = cleanChunk.toLowerCase().replace(/[.,?!()"'’]/g, '').split(/\s+/).filter(Boolean);
    const ipa = '/' + words.map(w => dict[w] || w).join(' ') + '/';

    const themes = window.SCENE_THEMES || [];
    const scene = themes[1] || {
      key: 'personal',
      label: 'Cụm từ cá nhân',
      icon: '✨',
      accent: '#0d9488',
      bgGradient: 'linear-gradient(135deg, #ccfbf1 0%, #e0f2fe 100%)',
      photoUrl: 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?auto=format&fit=crop&w=700&q=80',
      caption: 'Kho cụm từ cá nhân hóa của riêng bạn'
    };

    const ex1 = example || `I often use "${cleanChunk}" in my daily conversations.`;
    const newItem = {
      id,
      unitId: 'custom',
      unitNumber: 0,
      level,
      topic,
      topicGoal: 'Cụm từ do chính bạn thêm vào để học theo chu kỳ 1–3–5–7–14–30',
      chunk: cleanChunk,
      meaning: String(meaning || '').trim() || 'Cụm từ cá nhân',
      ipa,
      formula: String(formula || '').trim() || cleanChunk,
      slots: ['in my daily routine', 'at work', 'in real conversations'],
      example: ex1,
      examples: [
        { en: ex1, tag: 'Câu ví dụ chính' },
        { en: mySentence || `Let me try using "${cleanChunk}" in a real situation today.`, tag: 'Ứng dụng cá nhân' }
      ],
      memoryTip: 'Cụm từ cá nhân do bạn tự nạp — ưu tiên ôn tập theo mốc 1–3–5–7–14–30 ngày.',
      sceneKey: scene.key,
      sceneLabel: scene.label,
      sceneIcon: '✨',
      sceneAccent: scene.accent,
      sceneBg: scene.bgGradient,
      photoUrl: customImage || scene.photoUrl,
      sceneCaption: 'Cụm từ cá nhân hóa của riêng bạn',
      isCustom: true
    };

    state.customChunks = [newItem, ...(state.customChunks || [])];
    const card = ensureCardState(id);
    card.stage = 1;
    card.intervalDays = 1;
    card.dueAt = nowMs() + 86400000;
    card.lastReviewedAt = nowMs();
    card.lastStageAdvanceDate = todayISO();
    if (mySentence) card.mySentence = mySentence;
    if (customImage) card.customImage = customImage;

    touchStudyDay('learn', 1);
    saveState();
    return newItem;
  }

  async function connectLocalDiskFile() {
    if (!window.showSaveFilePicker) {
      exportBackupJSON();
      return { mode: 'download', name: 'chunkflow-backup.json' };
    }
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: 'chunkflow-progress.json',
        types: [{
          description: 'ChunkFlow Learning Progress JSON',
          accept: { 'application/json': ['.json'] }
        }]
      });
      await saveState();
      return { mode: 'live-sync', name: fileHandle.name };
    } catch (err) {
      if (err.name !== 'AbortError') console.warn(err);
      return null;
    }
  }

  function exportBackupJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chunkflow-progress-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importBackupJSON(jsonString) {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object') throw new Error('File sao lưu không hợp lệ.');
    state = { ...defaultState(), ...parsed };
    saveState();
    return state;
  }

  window.ChunkFlowSRS = {
    SRS_INTERVALS,
    getState: () => state,
    saveState,
    getAllChunks,
    getChunkById,
    getCardState,
    ensureCardState,
    rateChunk,
    savePersonalSentence,
    saveCustomImage,
    toggleStarChunk,
    getDueChunks,
    formatDaysUntilDue,
    getStageBreakdown,
    smartRescheduleOverdue,
    addCustomChunk,
    connectLocalDiskFile,
    exportBackupJSON,
    importBackupJSON,
    isDiskLinked: () => !!fileHandle,
    getSimulatedDayOffset: () => simulatedDayOffset,
    setSimulatedDayOffset: (days) => {
      simulatedDayOffset = Math.max(0, Number(days) || 0);
      return simulatedDayOffset;
    },
    setActiveUnit: (unitId) => {
      state.activeUnitId = unitId;
      saveState();
    },
    markUnitCompleted: (unitId) => {
      state.completedUnits[unitId] = nowMs();
      saveState();
    }
  };
})();
