// ChunkFlow Visual Dual-Coding & American English (en-US) Speech Studio
(function () {
  const PREP_WORDS = new Set([
    'for', 'to', 'with', 'on', 'in', 'at', 'of', 'from', 'by', 'about',
    'into', 'onto', 'up', 'down', 'off', 'out', 'over', 'through', 'around',
    'between', 'ahead', 'back', 'away', 'along'
  ]);

  const SLOT_WORDS = new Set([
    'something', 'someone', 'somebody', 'somewhere'
  ]);

  function formatChunkAnatomyHTML(chunkText) {
    const text = String(chunkText || '');
    const tokens = text.split(/(\s+)/);
    return tokens.map(tok => {
      if (/^\s+$/.test(tok)) return tok;
      const clean = tok.toLowerCase().replace(/[.,?!()"'’]/g, '');
      if (SLOT_WORDS.has(clean)) {
        return `<span class="chunk-tok tok-slot">${tok}</span>`;
      }
      if (PREP_WORDS.has(clean)) {
        return `<span class="chunk-tok tok-prep">${tok}</span>`;
      }
      return `<span class="chunk-tok tok-core">${tok}</span>`;
    }).join('');
  }

  function generateInstantSceneSVG(chunkObj) {
    const icon = chunkObj?.sceneIcon || '✨';
    const label = (chunkObj?.sceneLabel || 'American English Chunk').replace(/[<>&"]/g, '');
    const accent = chunkObj?.sceneAccent || '#0d9488';
    const chunkText = (chunkObj?.chunk || '').replace(/[<>&"]/g, '');
    const meaningText = (chunkObj?.meaning || '').replace(/[<>&"]/g, '');

    return `
      <svg class="scene-vector-svg" viewBox="0 0 480 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${chunkText}">
        <defs>
          <linearGradient id="bgGrad_${chunkObj?.id || '0'}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${accent}" stop-opacity="0.22"/>
            <stop offset="100%" stop-color="#4f46e5" stop-opacity="0.16"/>
          </linearGradient>
        </defs>
        <rect width="480" height="210" rx="16" fill="url(#bgGrad_${chunkObj?.id || '0'})"/>
        <circle cx="410" cy="48" r="56" fill="${accent}" fill-opacity="0.12"/>
        <circle cx="72" cy="165" r="68" fill="#6366f1" fill-opacity="0.10"/>
        <rect x="20" y="18" width="210" height="28" rx="14" fill="${accent}" fill-opacity="0.18"/>
        <text x="34" y="37" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700" fill="${accent}">${icon} ${label}</text>
        <text x="240" y="102" text-anchor="middle" font-size="44">${icon}</text>
        <text x="240" y="142" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="17" font-weight="800" fill="currentColor">${chunkText}</text>
        <text x="240" y="168" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="${accent}">${meaningText}</text>
      </svg>
    `;
  }

  function getGalleryList() {
    return window.PHOTO_VARIATIONS || [
      'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=700&q=80',
      'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?auto=format&fit=crop&w=700&q=80',
      'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=700&q=80',
      'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=700&q=80',
      'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=700&q=80',
      'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=700&q=80',
      'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=700&q=80',
      'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=700&q=80',
      'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=700&q=80',
      'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=700&q=80'
    ];
  }

  function getNextGalleryPhoto(currentUrl) {
    const list = getGalleryList();
    const idx = list.indexOf(currentUrl);
    return list[(idx + 1) % list.length];
  }

  let cachedUSVoice = null;

  function pickAmericanVoice() {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;

    const preferred = voices.find(v =>
      /en[-_]US/i.test(v.lang) && /(Natural|Google|Aria|Jenny|Guy|Samantha|Alex)/i.test(v.name)
    ) || voices.find(v => /en[-_]US/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang));

    cachedUSVoice = preferred || null;
    return cachedUSVoice;
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = pickAmericanVoice;
    pickAmericanVoice();
  }

  function speakAmerican(text, rate = 0.96) {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const clean = String(text || '').replace(/\[|\]/g, '');
      const utter = new SpeechSynthesisUtterance(clean);
      utter.lang = 'en-US';
      utter.rate = rate;
      const voice = cachedUSVoice || pickAmericanVoice();
      if (voice) utter.voice = voice;
      window.speechSynthesis.speak(utter);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  }

  function fileToDataURL(file, maxWidth = 680) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxWidth / (img.width || maxWidth));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  window.ChunkFlowVisuals = {
    formatChunkAnatomyHTML,
    generateInstantSceneSVG,
    getNextGalleryPhoto,
    speakAmerican,
    fileToDataURL
  };
})();
