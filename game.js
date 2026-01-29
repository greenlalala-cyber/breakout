(() => {
  'use strict';

  // ========= DOM =========
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });

  const elScore = document.getElementById('score');
  const elLives = document.getElementById('lives');
  const elLevel = document.getElementById('level');

  // NEW UI: merged audio button
  const btnAudio = document.getElementById('btnAudio');
  const audioState = document.getElementById('audioState');

  const powerupRateInput = document.getElementById('powerupRate');
  const btnPause = document.getElementById('btnPause');
  const btnRestart = document.getElementById('btnRestart');

  const overlayClear = document.getElementById('overlayClear');
  const overlayGameOver = document.getElementById('overlayGameOver');

  // Mobile buttons
  const mLeft = document.getElementById('mLeft');
  const mRight = document.getElementById('mRight');
  const mLaunch = document.getElementById('mLaunch');
  const mLaser = document.getElementById('mLaser');
  const mFaster = document.getElementById('mFaster');
  const mSlower = document.getElementById('mSlower');

  // ========= Utilities =========
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, t) => a + (b - a) * t;

  function now() { return performance.now(); }

  // ========= Resize (robust) =========
  const stageWrap = document.getElementById('stageWrap');
  let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  function resizeCanvas() {
    const r = stageWrap.getBoundingClientRect();
    const w = Math.max(320, Math.floor(r.width));
    const h = Math.max(320, Math.floor(r.height));
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const bw = Math.floor(w * dpr);
    const bh = Math.floor(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
  }
  window.addEventListener('resize', resizeCanvas, { passive: true });
  resizeCanvas();
  requestAnimationFrame(resizeCanvas);
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => resizeCanvas()).observe(stageWrap);
  }

  // ========= Audio (BGM + SFX) =========
  let audioCtx = null;
  let masterGain = null;
  let bgmGain = null;
  let sfxGain = null;

  // NOTE: keep both vars, but now toggled together by one button
  let audioEnabled = true;
  let bgmEnabled = true;
  let bgmRunning = false;

  // Powerups
  let powerupDropRate = 0.40; // default 40%
  const POWERUP_WEIGHTS = [
    { type: 'long', w: 30 },
    { type: 'multi', w: 40 },
    { type: 'life', w: 10 },
    { type: 'slow', w: 20 },
  ];
  let powerups = []; // {x,y,vy,type}
  let longTimer = 0;
  let slowTimer = 0;
  let slowFactor = 1;
  let basePaddleW = 0;
  let lastWallSfxAt = -1e9;
  const WALL_SFX_COOLDOWN = 55; // ms

  // simple step sequencer
  let bgmTimer = null;
  let bgmStep = 0;
  const BPM = 112;
  const stepMs = (60_000 / BPM) / 2; // 8th notes
  const scale = [0, 2, 4, 7, 9]; // major pentatonic
  const baseNote = 60; // C4

  function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  function ensureAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.65;
    masterGain.connect(audioCtx.destination);

    bgmGain = audioCtx.createGain();
    bgmGain.gain.value = 0.45;
    bgmGain.connect(masterGain);

    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = 0.85;
    sfxGain.connect(masterGain);
  }

  function playTone(freq, dur, type = 'sine', gain = 0.15) {
    if (!audioEnabled) return;
    ensureAudio();
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(sfxGain);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noiseHit(dur = 0.08, gain = 0.25) {
    if (!audioEnabled) return;
    ensureAudio();
    const t0 = audioCtx.currentTime;
    const bufferSize = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(g);
    g.connect(sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ---- SFX (keep existing) ----
  function sfxBrick() { playTone(midiToFreq(72 + scale[(Math.random() * scale.length) | 0]), 0.06, 'triangle', 0.12); }
  function sfxPaddle() { playTone(midiToFreq(55), 0.05, 'square', 0.08); }
  function sfxLoseLife() { playTone(midiToFreq(43), 0.12, 'sawtooth', 0.16); noiseHit(0.12, 0.12); }
  function sfxLaser() { playTone(midiToFreq(84), 0.05, 'square', 0.10); }
  function sfxClear() { playTone(midiToFreq(79), 0.18, 'triangle', 0.18); playTone(midiToFreq(86), 0.14, 'sine', 0.12); }
  function sfxGameOver() { playTone(midiToFreq(40), 0.22, 'sawtooth', 0.22); }
  function sfxWall() {
    // crisp 'ting' different from brick
    playTone(midiToFreq(96), 0.045, 'triangle', 0.10);
    playTone(midiToFreq(108), 0.030, 'sine', 0.06);
  }

  // multi-ball immediate special SFX (only for multi)
  function sfxMulti() {
    if (!audioEnabled) return;
    ensureAudio();
    playTone(midiToFreq(88), 0.06, 'sine', 0.10);
    playTone(midiToFreq(95), 0.06, 'triangle', 0.10);
    playTone(midiToFreq(102), 0.08, 'sine', 0.08);
    noiseHit(0.06, 0.06);
  }

  function startBGM() {
    if (!audioEnabled) return;
    if (!bgmEnabled) return;
    ensureAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (bgmRunning) return;
    bgmRunning = true;
    bgmStep = 0;

    const chordRoots = [0, 5, 7, 9]; // C F G Am
    bgmTimer = setInterval(() => {
      // IMPORTANT: also stop producing if bgm was toggled off
      if (!bgmRunning || !audioEnabled || !bgmEnabled || !audioCtx) return;

      const t0 = audioCtx.currentTime;
      // soft kick (noise + sine)
      if (bgmStep % 4 === 0) {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(110, t0);
        o.frequency.exponentialRampToValueAtTime(55, t0 + 0.09);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.10);
        o.connect(g); g.connect(bgmGain);
        o.start(t0); o.stop(t0 + 0.12);
      }

      // chord pad
      if (bgmStep % 8 === 0) {
        const root = baseNote + chordRoots[((bgmStep / 8) | 0) % chordRoots.length];
        const notes = [root, root + 4, root + 7];
        for (const n of notes) {
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(midiToFreq(n), t0);
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.045, t0 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
          o.connect(g); g.connect(bgmGain);
          o.start(t0); o.stop(t0 + 0.50);
        }
      }

      // melody
      const rootIdx = ((bgmStep / 8) | 0) % chordRoots.length;
      const chordRoot = baseNote + chordRoots[rootIdx];
      const pick = scale[(Math.random() * scale.length) | 0];
      const octave = (Math.random() < 0.5) ? 12 : 24;
      const mel = chordRoot + pick + octave;
      {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(midiToFreq(mel), t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
        o.connect(g); g.connect(bgmGain);
        o.start(t0); o.stop(t0 + 0.20);
      }

      bgmStep++;
    }, stepMs);
  }

  function stopBGM() {
    bgmRunning = false;
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
  }

  // NEW: merged toggle (sound + bgm together)
  function setAllAudioEnabled(on) {
    audioEnabled = on;
    bgmEnabled = on;
    if (audioState) audioState.textContent = on ? '開' : '關';

    // requirement: off => music fully off
    if (!on) stopBGM();
    else userGestureAudioStart();
  }

  // Always allow user gesture to start audio (not once-only)
  function userGestureAudioStart() {
    if (!audioEnabled) return;
    ensureAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (bgmEnabled) startBGM();
  }
  window.addEventListener('pointerdown', userGestureAudioStart, { passive: true });
  window.addEventListener('keydown', userGestureAudioStart);

  // Bind merged audio button
  if (btnAudio) {
    btnAudio.addEventListener('click', () => {
      // if either is off, treat as off
      const on = !(audioEnabled && bgmEnabled);
      setAllAudioEnabled(on);
    });
  }

  // Powerup drop rate input (percent)
  if (powerupRateInput) {
    const v = Number(powerupRateInput.value);
    if (!Number.isNaN(v)) powerupDropRate = clamp(v / 100, 0, 1);
    const sync = () => {
      const n = Number(powerupRateInput.value);
      if (!Number.isNaN(n)) powerupDropRate = clamp(n / 100, 0, 1);
    };
    powerupRateInput.addEventListener('change', sync);
    powerupRateInput.addEventListener('input', sync);
  }

  // Init audio state label
  if (audioState) audioState.textContent = (audioEnabled && bgmEnabled) ? '開' : '關';

  // ========= Input =========
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    keys.add(e.key.toLowerCase());
    if (['arrowleft','arrowright',' ','p','s','a','d'].includes(e.key.toLowerCase())) e.preventDefault();
  }, { passive: false });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  let touchDrag = null; // {id, offsetX}
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    touchDrag = { id: e.pointerId, x: e.clientX };
    // If waiting overlays:
    if (state === 'CLEAR') advanceLevel();
    if (state === 'GAMEOVER') restartGame();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!touchDrag || e.pointerId !== touchDrag.id) return;
    // map clientX to world
    const rect = canvas.getBoundingClientRect();
    const t = (e.clientX - rect.left) / rect.width;
    paddle.x = clamp(t * W, paddle.w * 0.5, W - paddle.w * 0.5);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (touchDrag && e.pointerId === touchDrag.id) touchDrag = null;
  });

  // Mobile buttons
  const hold = { left:false, right:false };
  const pressHold = (btn, flag) => {
    const down = () => { hold[flag] = true; userGestureAudioStart(); };
    const up = () => { hold[flag] = false; };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  };
  pressHold(mLeft, 'left');
  pressHold(mRight, 'right');

  mLaunch.addEventListener('click', () => { userGestureAudioStart(); launchBall(); });
  mLaser.addEventListener('click', () => { userGestureAudioStart(); tryShootLaser(); });
  mFaster.addEventListener('click', () => { speedBias = clamp(speedBias + 0.08, -0.2, 0.6); });
  mSlower.addEventListener('click', () => { speedBias = clamp(speedBias - 0.08, -0.2, 0.6); });

  // ========= Game constants =========
  let W = 1280, H = 720; // world units = canvas pixels / dpr
  function syncWorldSize() {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    if (w !== W || h !== H) { W = w; H = h; }
  }

  // ========= Game state =========
  let state = 'PLAY'; // PLAY, CLEAR, GAMEOVER, PAUSE
  let paused = false;

  let score = 0;
  let lives = 3;
  let level = 1;

  // speed increases during a life, resets on death or clear
  const baseBallSpeed = 420;
  let speedRamp = 0; // grows over time during a life
  let speedBias = 0; // manual +/-

  // Paddle
  const paddle = { x: 0, y: 0, w: 160, h: 18, speed: 980 };
  const paddleBaseSpeed = 980;

  // Balls
  let balls = []; // each: {x,y,r,vx,vy,stuck}

  // Laser
  const lasers = [];
  let laserCooldownMs = 850; // lowered fire rate
  let lastLaserAt = -1e9;

  // Bricks
  let bricks = []; // {x,y,w,h,hp,maxHp,color,kind}
  let remainingBreakable = 0;

  // Particles
  let particles = []; // {x,y,vx,vy,life,ttl,kind,rot,vr,size,color}

  // ========= UI =========
  function updateHUD() {
    elScore.textContent = String(score);
    elLives.textContent = String(lives);
    elLevel.textContent = String(level);
  }
  updateHUD();

  function showOverlayClear(on) {
    overlayClear.style.display = on ? 'flex' : 'none';
    overlayClear.setAttribute('aria-hidden', on ? 'false' : 'true');
  }
  function showOverlayGameOver(on) {
    overlayGameOver.style.display = on ? 'flex' : 'none';
    overlayGameOver.setAttribute('aria-hidden', on ? 'false' : 'true');
  }

  overlayClear.addEventListener('pointerdown', (e) => { e.preventDefault(); advanceLevel(); });
  overlayGameOver.addEventListener('pointerdown', (e) => { e.preventDefault(); restartGame(); });

  // ========= Powerups =========
  function pickPowerupType() {
    let total = 0;
    for (const it of POWERUP_WEIGHTS) total += it.w;
    let r = Math.random() * total;
    for (const it of POWERUP_WEIGHTS) {
      r -= it.w;
      if (r <= 0) return it.type;
    }
    return 'multi';
  }

  // NEW RULE:
  // - multi: immediate effect + special SFX
  // - others: spawn physical drop, apply on catch
  function spawnPowerup(x, y) {
    if (Math.random() > powerupDropRate) return;
    const type = pickPowerupType();

    if (type === 'multi') {
      // immediate
      sfxMulti();
      applyPowerup('multi');
      return;
    }

    // physical drop for others
    powerups.push({ x, y, vy: 240, type });
  }

  function applyPowerup(type) {
    if (type === 'long') {
      longTimer = 14.0;
      // paddle width handled by timer in update()
    } else if (type === 'multi') {
      // add 2 balls with slight angle differences
      if (!balls || balls.length === 0) return;
      const src = balls[0];
      if (src.stuck) return;
      const sp = Math.max(360, Math.hypot(src.vx, src.vy) || 420);
      const baseAng = Math.atan2(src.vy, src.vx);
      const angles = [-0.45, 0.45];
      for (const a of angles) {
        balls.push({
          x: src.x,
          y: src.y,
          r: src.r,
          vx: Math.cos(baseAng + a) * sp,
          vy: Math.sin(baseAng + a) * sp,
          stuck: false
        });
      }
    } else if (type === 'life') {
      lives += 1;
      updateHUD();
    } else if (type === 'slow') {
      slowTimer = 12.0;
      slowFactor = 0.75;
    }
  }

  function powerupLabel(type) {
    if (type === 'long') return '長';
    if (type === 'multi') return '多';
    if (type === 'life') return '+1';
    return '慢';
  }

  // ========= Level design =========
  // Happy levels: first 3, then every 2-3 levels (alternating pattern)
  function isHappyLevel(n) {
    if (n <= 3) return true;
    const t = n - 4;
    let k = 0;
    let pos = 1;
    while (pos < t + 1 && k < 50) {
      pos += (k % 2 === 0) ? 2 : 3;
      k++;
    }
    const happySet = new Set();
    pos = 1;
    for (let i = 0; i < 40; i++) {
      happySet.add(4 + pos);
      pos += (i % 2 === 0) ? 2 : 3;
    }
    return happySet.has(n);
  }

  // center bricks mask horizontally (keep shapes, always centered)
  function centerMaskHoriz(mask, cols, rows) {
    let minX = 1e9, maxX = -1e9;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (mask[y][x]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
      }
    }
    if (maxX < minX) return; // empty
    const width = maxX - minX + 1;
    const targetStart = Math.floor((cols - width) / 2);
    const shift = targetStart - minX;
    if (shift === 0) return;

    const out = Array.from({ length: rows }, () => Array(cols).fill(0));
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const v = mask[y][x];
        if (!v) continue;
        const nx = x + shift;
        if (nx >= 0 && nx < cols) out[y][nx] = v;
      }
    }
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) mask[y][x] = out[y][x];
    }
  }

  // Build a grid mask and convert to bricks.
  function buildBricksForLevel(n) {
    // Requirements:
    // - Brick width based on 14-grid of screen width (avoid too wide)
    // - Max 12 bricks horizontally
    // - rows max 15
    const topMargin = 64;
    const rows = 15;
    const cols = 12;
    const baseCols = 14; // width reference
    const bw = Math.floor(W / baseCols); // 1 brick = 1/14 of screen width
    const bh = 24;

    const gridW = bw * cols;
    const startX = Math.floor((W - gridW) / 2);
    const startY = topMargin;

    // mask[y][x] -> 0 empty, 1 normal, 2 hard
    const mask = Array.from({ length: rows }, () => Array(cols).fill(0));

    const happy = isHappyLevel(n);
    const styleIdx = (n - 1) % 4;

    const cx = (cols - 1) / 2;

    // ---- scaling helpers (works for rows=15) ----
    const R = rows;
    const C = cols;
    const yBottom = R - 1;

    // visually nice landmarks
    const yA = Math.floor(R * 0.17);
    const yB = Math.floor(R * 0.33);
    const yC = Math.floor(R * 0.50);
    const yD = Math.floor(R * 0.67);
    const yE = Math.floor(R * 0.83);

    if (happy) {
      // Happy patterns (scaled to 12 cols)
      if (styleIdx === 0) {
        // Arch ceiling + center tunnel (keeps concept)
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const dx = (x - cx) / (cols / 2);
            const arch = Math.max(0, 1 - dx * dx);
            const height = Math.floor(2 + arch * (rows - 2)); // 2..rows
            if (y < height) mask[y][x] = 1;
          }
        }
        const tunnelHalf = 2;
        const tunnelStart = Math.max(3, yB); // scale with rows
        for (let y = tunnelStart; y < rows; y++) {
          for (let x = Math.floor(cx) - tunnelHalf; x <= Math.floor(cx) + tunnelHalf; x++) {
            if (x >= 0 && x < cols) mask[y][x] = 0;
          }
        }
        // small hard core
        for (let y = yA; y <= yA + 1; y++) {
          for (let x = Math.floor(cx) - 1; x <= Math.floor(cx); x++) mask[y][x] = 2;
        }

      } else if (styleIdx === 1) {
        // Twin wings + pockets
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const leftWing = x <= Math.floor(cx) - 2;
            const rightWing = x >= Math.ceil(cx) + 2;
            if (!(leftWing || rightWing)) continue;

            const wingX = leftWing ? x : (cols - 1 - x);

            const wingHeightTop = yE; // grows with rows
            const falloff = Math.max(1, Math.floor(C / 6)); // cols=12 -> 2
            const height = clamp(wingHeightTop - Math.floor(wingX / falloff), yA, R);

            if (y < height) mask[y][x] = 1;
          }
        }

        // pockets at mid height
        const pockets = [{ cx: 2, cy: yC }, { cx: cols - 3, cy: yC }];
        for (const p of pockets) {
          for (let y = p.cy - 1; y <= p.cy + 2; y++) {
            for (let x = p.cx - 1; x <= p.cx + 1; x++) {
              if (y >= 0 && y < rows && x >= 0 && x < cols) mask[y][x] = 0;
            }
          }
        }

        // bridge across center gap
        for (let x = Math.floor(cx) - 1; x <= Math.ceil(cx) + 1; x++) mask[yA][x] = 1;

      } else if (styleIdx === 2) {
        // U-bowl (bottom follows rows)
        const bottomTop = yD;
        const bottomBot = Math.max(bottomTop + 2, yBottom - 2);

        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const edge = (x <= 1) || (x >= cols - 2);
            const bottom = (y >= bottomTop && y <= bottomBot);

            if (edge && y <= bottomBot) mask[y][x] = 1;
            if (bottom && (x >= 2 && x <= cols - 3)) mask[y][x] = 1;
          }
        }

        // center notch
        for (let y = bottomTop; y <= bottomBot; y++) {
          for (let x = Math.floor(cx) - 1; x <= Math.floor(cx) + 1; x++) mask[y][x] = 0;
        }

        // hard core
        for (let y = yA; y <= yA + 1; y++) {
          for (let x = Math.floor(cx) - 1; x <= Math.floor(cx); x++) mask[y][x] = 2;
        }

      } else {
        // Frame maze
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            if (y === 0 || y === 1 || y === rows - 1) mask[y][x] = 1;
            if (x === 0 || x === 1 || x === cols - 1 || x === cols - 2) mask[y][x] = 1;
          }
        }

        const bar1 = yB;
        const bar2 = yD;
        const core = Math.floor((bar1 + bar2) / 2);

        for (let x = 3; x <= cols - 4; x++) mask[bar1][x] = 1;
        for (let x = 3; x <= cols - 4; x++) mask[bar2][x] = 1;

        // hard center
        for (let x = Math.floor(cx) - 1; x <= Math.floor(cx); x++) mask[core][x] = 2;
      }

    } else {
      // Non-happy: keep varied shapes (scaled)
      const k = (n - 1) % 6;

      if (k === 0) {
        // slope cap scales with rows
        const cap = yE + 1;
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          if (y + x * 0.45 < cap) mask[y][x] = 1;
        }

      } else if (k === 1) {
        // checker cap scales
        const cap = yE + 1;
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          if ((x + y) % 2 === 0 && y < cap) mask[y][x] = 1;
        }

      } else if (k === 2) {
        // two bands (scaled)
        const band1 = yA;
        const band2Start = yC;
        const band2End = Math.min(R, yC + 2);
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          if (y < band1 || (y >= band2Start && y < band2End)) {
            mask[y][x] = (Math.random() < 0.10) ? 2 : 1;
          }
        }

      } else if (k === 3) {
        // diamond (scaled)
        const cy = R * 0.30;
        const maxD = Math.floor(R * 0.55);
        const minD = Math.floor(maxD * 0.50);
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          const d = Math.abs(x - cx) + Math.abs(y - cy);
          if (d <= maxD && d >= minD) mask[y][x] = 1;
        }

      } else if (k === 4) {
        // random cloud (scaled threshold)
        const seed = (n * 9973) >>> 0;
        let s = seed;
        const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
        const denseY = Math.max(4, yD); // upper dense region
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          const p = (y < denseY) ? 0.55 : 0.2;
          if (rnd() < p) mask[y][x] = (rnd() < 0.10) ? 2 : 1;
        }
        for (let y = 0; y < rows; y++) { mask[y][Math.floor(cx)] = 0; }

      } else {
        // wave (scaled)
        const base = Math.floor(R * 0.55);
        const amp  = Math.floor(R * 0.30);
        for (let y = 0; y < rows; y++) {
          const wave = base + Math.floor(amp * Math.sin((y + n) * 0.7));
          for (let x = 0; x < cols; x++) {
            if (y < wave + 2) mask[y][x] = 1;
          }
        }
      }

      // keep most single-hit: small hard ratio
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        if (mask[y][x] === 1 && Math.random() < 0.06) mask[y][x] = 2;
      }
    }

    // always center mask (prevents big blank on one side)
    centerMaskHoriz(mask, cols, rows);

    // Convert mask to bricks
    bricks = [];
    remainingBreakable = 0;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cell = mask[y][x];
        if (!cell) continue;

        const hp = (cell === 2) ? 2 : 1; // majority single-hit
        const hue = ((x / cols) * 300 + (y / rows) * 60 + n * 13) % 360;
        const color = `hsl(${hue} 85% ${cell === 2 ? 62 : 55}%)`;

        bricks.push({
          x: startX + x * bw + 2,
          y: startY + y * bh + 2,
          w: bw - 4,
          h: bh - 6,
          hp, maxHp: hp,
          color,
          kind: (cell === 2) ? 'hard' : 'normal'
        });
        remainingBreakable++;
      }
    }
  }

  // ========= Setup / Reset =========
  function resetPaddleBallPositions() {
    paddle.w = clamp(W * 0.15, 120, 220);
    paddle.h = clamp(H * 0.02, 14, 20);
    paddle.x = W * 0.5;
    paddle.y = H - 64;

    const r = clamp(Math.min(W, H) * 0.012, 7, 10);

    balls = [{
      r,
      x: paddle.x,
      y: paddle.y - paddle.h * 0.5 - r - 2,
      vx: 0,
      vy: 0,
      stuck: true
    }];

    basePaddleW = paddle.w;

    slowFactor = 1;
    slowTimer = 0;
    longTimer = 0;

    lasers.length = 0;
    powerups.length = 0;
    lastLaserAt = -1e9;

    speedRamp = 0;
    speedBias = clamp(speedBias, -0.2, 0.6);
  }

  function startLevel(n) {
    level = n;
    buildBricksForLevel(level);
    resetPaddleBallPositions();
    state = 'PLAY';
    paused = false;
    showOverlayClear(false);
    showOverlayGameOver(false);
    updateHUD();
  }

  function restartGame() {
    score = 0;
    lives = 3;
    startLevel(1);
    updateHUD();
    if (audioEnabled && bgmEnabled) startBGM();
  }

  // ========= Launch / Pause / Overlays =========
  function launchBall() {
    if (state !== 'PLAY') return;
    if (!balls.length) return;
    if (!balls[0].stuck) return;
    balls[0].stuck = false;
    const angle = rand(-0.65, -2.49); // upward random
    const sp = baseBallSpeed;
    balls[0].vx = Math.cos(angle) * sp;
    balls[0].vy = Math.sin(angle) * sp;
  }

  // Single binding (avoid double-trigger)
  btnPause.addEventListener('click', () => {
    userGestureAudioStart();
    paused = !paused;
  });
  btnRestart.addEventListener('click', () => { userGestureAudioStart(); restartGame(); });

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'p') {
      paused = !paused;
    } else if (k === ' ') {
      if (state === 'CLEAR') advanceLevel();
      else if (state === 'GAMEOVER') restartGame();
      else launchBall();
    } else if (k === 's') {
      tryShootLaser();
    } else if (state === 'CLEAR' || state === 'GAMEOVER') {
      if (state === 'CLEAR') advanceLevel();
      if (state === 'GAMEOVER') restartGame();
    }
  });

  function enterClear() {
    state = 'CLEAR';
    paused = true;
    showOverlayClear(true);
    sfxClear();
    spawnClearFX();
  }

  function advanceLevel() {
    showOverlayClear(false);
    paused = false;
    state = 'PLAY';
    startLevel(level + 1);
  }

  function enterGameOver() {
    state = 'GAMEOVER';
    paused = true;
    showOverlayGameOver(true);
    sfxGameOver();
    stopBGM();
  }

  // ========= Laser =========
  function tryShootLaser() {
    if (state !== 'PLAY' || paused) return;
    if (!balls.length || balls[0].stuck) return; // only after start
    const t = now();
    if (t - lastLaserAt < laserCooldownMs) return;
    lastLaserAt = t;

    const y = paddle.y - paddle.h * 0.5 - 6;
    lasers.push({ x: paddle.x - paddle.w * 0.38, y, vx: 0, vy: -1200, r: 3, life: 1.2 });
    lasers.push({ x: paddle.x + paddle.w * 0.38, y, vx: 0, vy: -1200, r: 3, life: 1.2 });
    sfxLaser();
  }

  // ========= Collision helpers =========
  function circleRectCollision(cx, cy, cr, rx, ry, rw, rh) {
    const closestX = clamp(cx, rx, rx + rw);
    const closestY = clamp(cy, ry, ry + rh);
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx * dx + dy * dy) <= cr * cr;
  }

  function resolveBallRect(ball, rect) {
    const bx = ball.x, by = ball.y;
    const rx = rect.x, ry = rect.y, rw = rect.w, rh = rect.h;

    const cx = clamp(bx, rx, rx + rw);
    const cy = clamp(by, ry, ry + rh);
    const dx = bx - cx;
    const dy = by - cy;

    if (Math.abs(dx) > Math.abs(dy)) {
      ball.vx *= -1;
      ball.x += Math.sign(dx || ball.vx) * 2;
    } else {
      ball.vy *= -1;
      ball.y += Math.sign(dy || ball.vy) * 2;
    }
  }

  // ========= FX =========
  function spawnParticles(x, y, count = 18) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(120, 720);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.35, 0.85),
        ttl: 0,
        kind: 'dot',
        rot: rand(0, Math.PI * 2),
        vr: rand(-9, 9),
        size: rand(2, 5),
        color: `hsla(${rand(0,360)} 90% 60% / 0.95)`
      });
    }
  }

  function spawnStarBurst(x, y, count = 22) {
    for (let i = 0; i < count; i++) {
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const sp = rand(260, 980);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.55, 1.05),
        ttl: 0,
        kind: 'star',
        rot: rand(0, Math.PI * 2),
        vr: rand(-10, 10),
        size: rand(6, 12),
        color: `hsla(${rand(0,360)} 95% 62% / 0.98)`
      });
    }
  }

  function spawnClearFX() {
    spawnParticles(W * 0.5, H * 0.45, 60);
    spawnStarBurst(W * 0.5, H * 0.62, 50);
  }

  // ========= Game loop =========
  let lastT = now();

  function step() {
    syncWorldSize();

    paddle.y = H - 64;
    if (balls.length && balls[0].stuck) {
      balls[0].x = paddle.x;
      balls[0].y = paddle.y - paddle.h * 0.5 - balls[0].r - 2;
    }

    const t = now();
    let dt = (t - lastT) / 1000;
    lastT = t;
    dt = Math.min(0.033, Math.max(0.0, dt));

    if (!paused && state === 'PLAY') update(dt);
    draw();

    requestAnimationFrame(step);
  }

  function update(dt) {
    // Paddle speed sync with ball speed
    const speedScale = clamp((1 + speedRamp + speedBias) * slowFactor, 0.65, 2.2);
    paddle.speed = paddleBaseSpeed * speedScale;

    // Paddle movement
    let dir = 0;
    if (keys.has('arrowleft') || keys.has('a') || hold.left) dir -= 1;
    if (keys.has('arrowright') || keys.has('d') || hold.right) dir += 1;

    paddle.x += dir * paddle.speed * dt;
    paddle.x = clamp(paddle.x, paddle.w * 0.5, W - paddle.w * 0.5);

    // Laser key
    if (keys.has('s')) tryShootLaser();

    // Paddle width effects (long paddle)
    if (longTimer > 0) {
      longTimer = Math.max(0, longTimer - dt);
      paddle.w = clamp(basePaddleW * 1.35, 120, W * 0.35);
    } else {
      paddle.w = basePaddleW;
    }

    // Slow timer
    if (slowTimer > 0) {
      slowTimer = Math.max(0, slowTimer - dt);
      if (slowTimer === 0) slowFactor = 1;
    }

    // Balls safety
    if (!balls.length) {
      balls = [{ r: clamp(Math.min(W, H) * 0.012, 7, 10), x: paddle.x, y: paddle.y - paddle.h, vx: 0, vy: 0, stuck: true }];
    }

    // Speed ramp increases per-life, reset on death/clear
    speedRamp = clamp(speedRamp + dt * 0.045, 0, 0.65);

    for (let bi = balls.length - 1; bi >= 0; bi--) {
      const ball = balls[bi];

      if (ball.stuck) {
        ball.x = paddle.x;
        ball.y = paddle.y - paddle.h * 0.5 - ball.r - 2;
        continue;
      }

      const spMul = (1 + speedRamp + speedBias) * slowFactor;
      const maxSp = baseBallSpeed * (1.75 + speedBias);

      const sp = Math.hypot(ball.vx, ball.vy) || baseBallSpeed;
      const target = clamp(baseBallSpeed * spMul, baseBallSpeed * 0.65, maxSp);
      ball.vx *= target / sp;
      ball.vy *= target / sp;

      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // Walls + wall SFX (cooldown)
      const tms = now();
      let hitWall = false;
      if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx *= -1; hitWall = true; }
      if (ball.x + ball.r > W) { ball.x = W - ball.r; ball.vx *= -1; hitWall = true; }
      if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy *= -1; hitWall = true; }
      if (hitWall && (tms - lastWallSfxAt) > WALL_SFX_COOLDOWN) {
        lastWallSfxAt = tms;
        if (audioEnabled) sfxWall();
      }

      // Paddle collision
      const px = paddle.x - paddle.w * 0.5;
      const py = paddle.y - paddle.h * 0.5;
      if (circleRectCollision(ball.x, ball.y, ball.r, px, py, paddle.w, paddle.h) && ball.vy > 0) {
        const hit = (ball.x - paddle.x) / (paddle.w * 0.5);
        const angle = lerp(-Math.PI * 0.82, -Math.PI * 0.18, (hit + 1) * 0.5);
        const sp2 = Math.hypot(ball.vx, ball.vy);
        ball.vx = Math.cos(angle) * sp2;
        ball.vy = Math.sin(angle) * sp2;
        ball.y = py - ball.r - 1;
        sfxPaddle();
      }

      // Brick collisions
      for (let i = bricks.length - 1; i >= 0; i--) {
        const b = bricks[i];
        if (b.hp <= 0) continue;
        if (circleRectCollision(ball.x, ball.y, ball.r, b.x, b.y, b.w, b.h)) {
          resolveBallRect(ball, b);
          b.hp -= 1;
          score += (b.kind === 'hard') ? 18 : 10;
          sfxBrick();
          spawnParticles(ball.x, ball.y, b.kind === 'hard' ? 12 : 8);
          if (b.hp <= 0) {
            remainingBreakable--;
            spawnParticles(b.x + b.w/2, b.y + b.h/2, 12);
            spawnPowerup(b.x + b.w/2, b.y + b.h/2);
          }
          break;
        }
      }

      // Lose ball
      if (ball.y - ball.r > H + 20) {
        balls.splice(bi, 1);
      }
    }

    // If all balls lost => lose life, reset ball & speed
    if (balls.length === 0) {
      lives--;
      updateHUD();
      sfxLoseLife();

      speedRamp = 0; // reset on death
      lasers.length = 0;
      longTimer = 0;
      slowTimer = 0;
      slowFactor = 1;

      resetPaddleBallPositions();

      if (lives <= 0) {
        enterGameOver();
      }
    }

    // Clear
    if (remainingBreakable <= 0) {
      speedRamp = 0; // reset on clear
      enterClear();
    }

    // Powerups update (physical only: long/life/slow)
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.y += p.vy * dt;
      const px = paddle.x - paddle.w * 0.5;
      const py = paddle.y - paddle.h * 0.5;
      if (p.x >= px && p.x <= px + paddle.w && p.y >= py && p.y <= py + paddle.h + 26) {
        applyPowerup(p.type);
        powerups.splice(i, 1);
        continue;
      }
      if (p.y > H + 40) powerups.splice(i, 1);
    }

    // Lasers update
    for (let i = lasers.length - 1; i >= 0; i--) {
      const l = lasers[i];
      l.y += l.vy * dt;
      l.life -= dt;
      if (l.life <= 0 || l.y < -40) { lasers.splice(i, 1); continue; }

      // laser hits bricks
      for (let j = bricks.length - 1; j >= 0; j--) {
        const b = bricks[j];
        if (b.hp <= 0) continue;
        if (l.x >= b.x && l.x <= b.x + b.w && l.y >= b.y && l.y <= b.y + b.h) {
          b.hp -= 1;
          score += 8;
          spawnParticles(l.x, l.y, 10);
          noiseHit(0.05, 0.10);
          if (b.hp <= 0) remainingBreakable--;
          lasers.splice(i, 1);
          break;
        }
      }
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.ttl += dt;
      if (p.ttl > p.life) { particles.splice(i, 1); continue; }
      p.vy += 880 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  // ========= Render =========
  function drawRoundedRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawStar(x, y, outerR, innerR, points) {
    const step = Math.PI / points;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = (i % 2 === 0) ? outerR : innerR;
      const a = i * step - Math.PI / 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function draw() {
    syncWorldSize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W*0.3, H*0.25, 10, W*0.5, H*0.6, Math.max(W,H));
    g.addColorStop(0, 'rgba(255,255,255,0.06)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);

    // Bricks
    for (const b of bricks) {
      if (b.hp <= 0) continue;
      const hpT = b.hp / b.maxHp;
      ctx.fillStyle = b.color;
      drawRoundedRect(b.x, b.y, b.w, b.h, 6);
      ctx.fill();

      // glossy
      ctx.fillStyle = `rgba(255,255,255,${0.18 * hpT})`;
      drawRoundedRect(b.x+2, b.y+2, b.w-4, Math.max(4, (b.h-6)*0.42), 6);
      ctx.fill();

      if (b.kind === 'hard') {
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1;
        drawRoundedRect(b.x+1, b.y+1, b.w-2, b.h-2, 6);
        ctx.stroke();
      }
    }

    // Lasers
    for (const l of lasers) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillRect(l.x - 1, l.y - 18, 2, 18);
      ctx.fillStyle = 'rgba(0,220,255,0.55)';
      ctx.fillRect(l.x - 3, l.y - 14, 6, 14);
    }

    // Powerups (physical ones only)
    for (const p of powerups) {
      ctx.save();
      ctx.translate(p.x, p.y);
      let col = 'rgba(255,209,102,0.95)';
      if (p.type === 'life') col = 'rgba(255,84,112,0.95)';
      if (p.type === 'slow') col = 'rgba(160,230,120,0.95)';
      ctx.fillStyle = col;
      drawRoundedRect(-14, -10, 28, 20, 9);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.font = '900 12px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(powerupLabel(p.type), 0, 1);
      ctx.restore();
    }

    // Paddle
    const px = paddle.x - paddle.w * 0.5;
    const py = paddle.y - paddle.h * 0.5;
    const pg = ctx.createLinearGradient(px, py, px, py + paddle.h);
    pg.addColorStop(0, 'rgba(255,255,255,0.25)');
    pg.addColorStop(1, 'rgba(255,255,255,0.05)');
    ctx.fillStyle = 'rgba(120, 190, 255, 0.35)';
    drawRoundedRect(px, py, paddle.w, paddle.h, 10);
    ctx.fill();
    ctx.fillStyle = pg;
    drawRoundedRect(px, py, paddle.w, paddle.h, 10);
    ctx.fill();

    // Balls
    for (const ball of balls) {
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.beginPath();
      ctx.arc(ball.x + ball.r*0.25, ball.y + ball.r*0.25, ball.r*0.75, 0, Math.PI * 2);
      ctx.fill();
    }

    // Particles
    for (const p of particles) {
      const t = 1 - p.ttl / p.life;
      ctx.globalAlpha = Math.max(0, t);
      ctx.fillStyle = p.color;

      if (p.kind === 'dot') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        drawStar(0, 0, p.size, p.size * 0.5, 5);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // paused label
    if (paused && state === 'PLAY') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `900 ${Math.floor(Math.min(W,H)*0.045)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText('暫停', W*0.5, H*0.52);
    }
  }

  // ========= Control buttons mapping =========
  mLaunch.addEventListener('click', () => {
    if (state === 'CLEAR') advanceLevel();
    else if (state === 'GAMEOVER') restartGame();
    else launchBall();
  });

  // ========= Start =========
  function updateHUDSafe() { updateHUD(); }
  updateHUDSafe();

  // Start at level 1
  startLevel(1);

  requestAnimationFrame(step);
})();
