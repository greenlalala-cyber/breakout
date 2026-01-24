(() => {
  // ==============================
  // Canvas / DPR
  // ==============================
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  let DPR = 1;
  function resizeCanvas(){
    const r = stage.getBoundingClientRect();
    DPR = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
    canvas.width = Math.floor(r.width * DPR);
    canvas.height = Math.floor(r.height * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resizeCanvas, {passive:true});
  resizeCanvas();

  // ==============================
  // UI
  // ==============================
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const levelEl = document.getElementById('level');
  const toast = document.getElementById('toast');
  const btnSound = document.getElementById('btnSound');
  const btnPause = document.getElementById('btnPause');
  const btnReset = document.getElementById('btnReset');
  const effectsUI = document.getElementById('effectsUI');

  const secretEnable = document.getElementById('secretEnable');
  const secretNote = document.getElementById('secretNote');

  const btnLeft = document.getElementById('btnLeft');
  const btnRight = document.getElementById('btnRight');
  const btnLaunch = document.getElementById('btnLaunch');
  const btnShoot = document.getElementById('btnShoot');
  const btnSpeedUp = document.getElementById('btnSpeedUp');
  const btnSpeedDown = document.getElementById('btnSpeedDown');

  const powerChecksWrap = document.getElementById('powerChecks');
  const powerHintEl = document.querySelector('.powerHint');
  if(powerHintEl) powerHintEl.textContent = '（按下「重來」套用機率；總和>100%會顯示錯誤）';

  // ==============================
  // Big overlay (機率錯誤大字)
  // ==============================
  const bigMsg = document.createElement('div');
  bigMsg.style.position = 'absolute';
  bigMsg.style.left = '50%';
  bigMsg.style.top = '50%';
  bigMsg.style.transform = 'translate(-50%, -50%)';
  bigMsg.style.padding = '18px 22px';
  bigMsg.style.borderRadius = '16px';
  bigMsg.style.background = 'rgba(0,0,0,.55)';
  bigMsg.style.border = '1px solid rgba(255,255,255,.22)';
  bigMsg.style.backdropFilter = 'blur(10px)';
  bigMsg.style.color = 'white';
  bigMsg.style.fontWeight = '1000';
  bigMsg.style.fontSize = '40px';
  bigMsg.style.letterSpacing = '1px';
  bigMsg.style.textAlign = 'center';
  bigMsg.style.display = 'none';
  bigMsg.style.zIndex = '5';
  stage.appendChild(bigMsg);

  function showBigError(msg, ms=1100){
    bigMsg.textContent = msg;
    bigMsg.style.display = 'block';
    clearTimeout(showBigError._t);
    showBigError._t = setTimeout(()=>{ bigMsg.style.display = 'none'; }, ms);
  }


// ==============================
// Level Clear Overlay（通關）
// ==============================
const passMsg = document.createElement('div');
passMsg.style.position = 'absolute';
passMsg.style.left = '50%';
passMsg.style.top = '50%';
passMsg.style.transform = 'translate(-50%, -50%)';
passMsg.style.padding = '22px 28px';
passMsg.style.borderRadius = '22px';
passMsg.style.background = 'rgba(0,0,0,.55)';
passMsg.style.border = '1px solid rgba(255,255,255,.22)';
passMsg.style.backdropFilter = 'blur(10px)';
passMsg.style.color = 'white';
passMsg.style.fontWeight = '1000';
passMsg.style.fontSize = '92px';
passMsg.style.letterSpacing = '3px';
passMsg.style.textAlign = 'center';
passMsg.style.display = 'none';
passMsg.style.zIndex = '6';
passMsg.style.textShadow = '0 12px 36px rgba(0,0,0,.55)';
stage.appendChild(passMsg);

let awaitingNextLevel = false;
let pendingLevel = null;

function spawnClearCelebration(){
  const W = stage.clientWidth, H = stage.clientHeight;
  const x = W/2, y = H*0.42;

  // 亮的「通關」爆花：不分磚種，單純慶祝
  shakeT = Math.min(0.18, shakeT + 0.12);
  shakePow = Math.min(8, shakePow + 4.2);

  const palette = [
    'rgba(255,255,255,1)',
    'rgba(0,210,255,1)',
    'rgba(90,140,255,1)',
    'rgba(255,190,60,1)',
    'rgba(255,70,110,1)',
    'rgba(186,85,255,1)',
  ];
  for(let i=0;i<120;i++){
    const a = rand(0, Math.PI*2);
    const sp = rand(240, 560);
    particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      r: rand(1.8, 4.8),
      life: rand(0.55, 1.15),
      maxLife: 1.15,
      color: pick(palette),
      kind: (Math.random() < 0.25) ? 'ring' : 'dot',
      drag: rand(1.2, 2.4),
      g: 520
    });
  }
  particles.push({ x, y, vx:0, vy:0, r:8, life:0.32, maxLife:0.32, color:'rgba(255,255,255,1)', kind:'shock', drag:0, g:0 });
}

function handleLevelClear(){
  awaitingNextLevel = true;
  pendingLevel = level + 1;

  // 速度重設（符合需求）
  globalSpeedMul = 1.0;
  speedRampT = 0;
  speedRampMul = 1.0;

  passMsg.textContent = '通關!';
  passMsg.style.display = 'block';

  toast.textContent = '按任意鍵進入下一關';
  toast.classList.add('show');

  // 停止球移動（保持畫面）
  running = false;
  for(const b of balls){
    if(!b.alive) continue;
    b.stuck = true;
    b.stickyAngle = null;
    b.stickySpeed = null;
  }
  syncStuckBalls();

  spawnClearCelebration();
}

function proceedNextLevel(){
  if(!awaitingNextLevel) return;
  awaitingNextLevel = false;

  passMsg.style.display = 'none';
  toast.classList.remove('show');

  level = pendingLevel ?? (level + 1);
  pendingLevel = null;
  updateHUD();
  buildLevel(level);
}

  // ==============================
  // Utils
  // ==============================
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function rand(a,b){ return a + Math.random()*(b-a); }
  function pick(arr){ return arr[(Math.random()*arr.length)|0]; }

  function flashToast(msg, ms=900){
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(flashToast._t);
    flashToast._t = setTimeout(()=>{
      if(!paused && !rewindActive) toast.classList.remove('show');
      if(paused && !rewindActive) toast.textContent = 'PAUSED';
    }, ms);
  }

  // ==============================
  // Device
  // ==============================
  const isDesktopPointer = () => window.matchMedia && window.matchMedia('(pointer:fine)').matches;

  // ==============================
  // Audio
  // ==============================
  let soundEnabled = true;
  let audioCtx = null;
  function ensureAudio(){
    if(!soundEnabled) return;
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
  }

  function beep({freq=440, dur=0.06, type='sine', gain=0.06, bend=0, when=0}={}){
    if(!soundEnabled) return;
    if(rewindActive) return;
    ensureAudio();
    if(!audioCtx) return;

    const t0 = audioCtx.currentTime + when;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if(bend){
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + bend), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // 倒轉專用音效
  let rewindNode = null;
  function startRewindSfx(){
    if(!soundEnabled) return;
    ensureAudio();
    if(!audioCtx) return;
    stopRewindSfx();

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    const g = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);

    lfo.type = 'triangle';
    lfo.frequency.setValueAtTime(6.5, now);
    lfoGain.gain.setValueAtTime(35, now);
    lfo.connect(lfoGain).connect(osc.frequency);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(260, now + 0.25);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.10, now + 0.06);

    osc.connect(filter).connect(g).connect(audioCtx.destination);
    lfo.start(now);
    osc.start(now);

    rewindNode = { osc, lfo, g };
  }

  function stopRewindSfx(){
    if(!rewindNode) return;
    try{
      const now = audioCtx?.currentTime ?? 0;
      rewindNode.g.gain.cancelScheduledValues(now);
      rewindNode.g.gain.setValueAtTime(rewindNode.g.gain.value, now);
      rewindNode.g.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
      rewindNode.osc.stop(now + 0.09);
      rewindNode.lfo.stop(now + 0.09);
    }catch{}
    rewindNode = null;
  }

  const SFX = {
    paddle(){ beep({freq:520, dur:0.05, type:'triangle', gain:0.05, bend:80}); },
    wall(){ beep({freq:320, dur:0.04, type:'sine', gain:0.04, bend:-40}); },
    brick(){ beep({freq:760, dur:0.05, type:'square', gain:0.035, bend:-140}); },
    brickBreak(){
      beep({freq:980, dur:0.07, type:'square', gain:0.05, bend:220});
      beep({freq:620, dur:0.08, type:'triangle', gain:0.03, bend:-120, when:0.01});
    },
    power(){ beep({freq:660, dur:0.08, type:'triangle', gain:0.06, bend:260}); },
    shoot(){ beep({freq:1040, dur:0.04, type:'square', gain:0.032, bend:120}); },
    lose(){ beep({freq:200, dur:0.18, type:'sawtooth', gain:0.05, bend:-120}); },
    level(){ beep({freq:880, dur:0.12, type:'triangle', gain:0.06, bend:420}); },
    gameover(){ beep({freq:140, dur:0.22, type:'sawtooth', gain:0.06, bend:-60}); }
  };

  btnSound.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    btnSound.textContent = soundEnabled ? '音效：開' : '音效：關';
    if(!soundEnabled) stopRewindSfx();
    if(soundEnabled) ensureAudio();
  });

  // ==============================
  // Powerups (含「不出現道具」)
  // ==============================
  const POWER_TYPES = [
    { id:'expand', label:'長板', color:'rgba(90,140,255,.95)' },
    { id:'multi',  label:'多球', color:'rgba(0,210,255,.95)' },
    { id:'pierce', label:'穿透', color:'rgba(186,85,255,.95)' },
    { id:'laser',  label:'雷射', color:'rgba(255,70,110,.95)' },
    { id:'life',   label:'+1命', color:'rgba(0,220,140,.95)' },
    { id:'slow',   label:'慢球', color:'rgba(255,190,60,.95)' },
    { id:'sticky', label:'黏球', color:'rgba(255,120,210,.95)' },
    { id:'none',   label:'不出現', color:'rgba(255,255,255,.20)' },
  ];

  // UI當前值（玩家可改；尚未套用到遊戲）
  const powerEnabledUI = Object.fromEntries(POWER_TYPES.map(p => [p.id, p.id==='none' ? true : true]));
  const powerChanceUI  = Object.fromEntries(POWER_TYPES.map(p => [p.id, 0]));

  // ✅ 只有「按下重來」才會把UI值套用到遊戲生成
  const powerEnabledApplied = Object.fromEntries(POWER_TYPES.map(p => [p.id, p.id==='none' ? true : true]));
  const powerChanceApplied  = Object.fromEntries(POWER_TYPES.map(p => [p.id, 0]));

  // 預設：100/(道具種類+1)%，餘數給 none，總和=100
  function applyDefaultChances(targetChance){
    const realPowers = POWER_TYPES.filter(p => p.id !== 'none');
    const base = Math.floor(100 / (realPowers.length + 1));
    for(const p of realPowers) targetChance[p.id] = base;
    targetChance['none'] = 100 - base * realPowers.length;
  }
  applyDefaultChances(powerChanceUI);
  applyDefaultChances(powerChanceApplied);

  function renderPowerCheckboxes(){
    const realPowers = POWER_TYPES.filter(p => p.id !== 'none');
    const none = POWER_TYPES.find(p => p.id === 'none');

    const realHTML = realPowers.map(p => `
      <label class="powerLabel" data-id="${p.id}">
        <input class="chk" type="checkbox" ${powerEnabledUI[p.id] ? 'checked' : ''} />
        <span class="checkUI" aria-hidden="true"></span>
        <span class="powerName">${p.label}</span>

        <span class="chanceWrap" title="機率%（總和需<=100）">
          <input class="chanceInput" type="number" min="0" max="100" step="1" value="${powerChanceUI[p.id]}" />
          <span class="percent">%</span>
        </span>
      </label>
    `).join('');

    const noneHTML = none ? `
      <label class="powerLabel" data-id="none" title="剩餘機率會自動分配到這裡；也可手動改（按重來套用）">
        <input class="chk" type="checkbox" checked disabled />
        <span class="checkUI" aria-hidden="true"></span>
        <span class="powerName">${none.label}</span>

        <span class="chanceWrap" title="機率%（會自動補到100）">
          <input class="chanceInput" id="noneChanceInput" type="number" min="0" max="100" step="1" value="${powerChanceUI['none']}" />
          <span class="percent">%</span>
        </span>
      </label>
    ` : '';

    powerChecksWrap.innerHTML = realHTML + noneHTML;

    [...powerChecksWrap.querySelectorAll('.powerLabel')].forEach(label => {
      const id = label.getAttribute('data-id');
      const chk = label.querySelector('.chk');
      const inp = label.querySelector('.chanceInput');

      const syncDisable = () => {
        if(id === 'none') inp.disabled = false;
        else inp.disabled = !chk.checked;
      };

      if(id !== 'none'){
        chk.addEventListener('change', () => {
          powerEnabledUI[id] = !!chk.checked;
          syncDisable();
          flashToast(`${POWER_TYPES.find(x=>x.id===id)?.label ?? id}：${powerEnabledUI[id]?'啟用':'停用'}`, 800);
        });
      }

      inp.addEventListener('input', () => {
        let v = Number(inp.value);
        if(!Number.isFinite(v)) v = 0;
        v = Math.floor(clamp(v, 0, 100));
        inp.value = String(v);
        powerChanceUI[id] = v;
      });

      syncDisable();
    });
  }
  renderPowerCheckboxes();

  function sumRealEnabledChancesUI(){
    let sum = 0;
    for(const p of POWER_TYPES){
      if(p.id === 'none') continue;
      if(!powerEnabledUI[p.id]) continue;
      sum += (powerChanceUI[p.id] || 0);
    }
    return sum;
  }

  function applyPowerSettingsFromUI(){
    const sum = sumRealEnabledChancesUI();

    if(sum > 100){
      showBigError('道具機率錯誤');
      return false;
    }

    // 小於100：把剩下的機率補到 none
    const remainder = 100 - sum;
    powerChanceUI['none'] = remainder;

    const noneInp = document.getElementById('noneChanceInput');
    if(noneInp) noneInp.value = String(remainder);

    // 套用到 Applied（生成磚頭只看 Applied）
    for(const p of POWER_TYPES){
      if(p.id === 'none'){
        powerEnabledApplied[p.id] = true;
        powerChanceApplied[p.id] = remainder;
        continue;
      }
      powerEnabledApplied[p.id] = !!powerEnabledUI[p.id];
      powerChanceApplied[p.id] = powerEnabledApplied[p.id] ? (powerChanceUI[p.id] || 0) : 0;
    }
    return true;
  }

  function enabledPowerListForPickApplied(){
    // 抽選用清單：包含 none
    return POWER_TYPES.filter(p => {
      if(p.id === 'none') return (powerChanceApplied[p.id] || 0) > 0;
      return powerEnabledApplied[p.id] && (powerChanceApplied[p.id] || 0) > 0;
    });
  }

  function weightedPickApplied(list){
    let sum = 0;
    for(const p of list) sum += powerChanceApplied[p.id] || 0;
    if(sum <= 0) return null;
    let r = Math.random() * sum;
    for(const p of list){
      r -= (powerChanceApplied[p.id] || 0);
      if(r <= 0) return p;
    }
    return list[list.length - 1] || null;
  }

  // ==============================
  // State
  // ==============================
  let score = 0, lives = 3, level = 1;
  let paused = false;
  let running = false;
  let globalSpeedMul = 1.0;

  // ✅ 球速遞增（死亡/過關後重設）
  let speedRampT = 0;
  let speedRampMul = 1.0;

  let shakeT = 0;
  let shakePow = 0;

  // ✅ 道具UI時間無限制：改成「堆疊層數（不會隨時間倒數）」
  const effects = { pierce: 0, laser: 0, sticky: 0 };

  let secretEnabled = false;

  // 倒轉：跨命 checkpoint
  const HISTORY_FPS = 60;
  const history = [];
  let checkpointIndices = [];
  let rewindTargetIndex = null;
  let rewindActive = false;
  let rewindAcc = 0;
  let rewindClockAngle = 0;

  let brickUidCounter = 1;

  function deepClone(obj){
    if(window.structuredClone) return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
  }

  // Objects
  const paddle = { baseW: 120, w: 120, h: 14, x: 0, y: 0, speed: 780 };
  const balls = [];
  function makeBall(){
    return {
      r: 8, x:0, y:0, vx:220, vy:-320,
      speedMul:1.0, stuck:true, alive:true,
      stickyAngle: null, stickySpeed: null
    };
  }

  let bricks = [];
  const powerups = [];
  const bullets = [];
  const bulletCfg = { w:4, h:12, vy:-900, cooldown:0.48 }; // 降低雷射連射強度
  let shootCD = 0;
  const particles = [];

  function isGameplayRunning(){
    if(lives <= 0) return false;
    if(paused || rewindActive) return false;
    return balls.some(b => b.alive && !b.stuck);
  }

  // ==============================
  // Snapshot
  // ==============================
  function makeSnapshot(){
    return {
      score, lives, level, paused, running, globalSpeedMul,
      shakeT, shakePow,
      effects: deepClone(effects),
      paddle: deepClone(paddle),
      balls: deepClone(balls),
      bricks: deepClone(bricks),
      powerups: deepClone(powerups),
      bullets: deepClone(bullets),
      particles: deepClone(particles),
      shootCD,
    };
  }

  function captureSnapshot(){
    history.push(makeSnapshot());

    const cap = HISTORY_FPS * 90;
    if(history.length > cap){
      const overflow = history.length - cap;
      history.splice(0, overflow);

      checkpointIndices = checkpointIndices
        .map(i => i - overflow)
        .filter(i => i >= 0);

      if(rewindTargetIndex != null){
        rewindTargetIndex -= overflow;
        if(rewindTargetIndex < 0) rewindTargetIndex = 0;
      }
    }
  }

  function applySnapshot(s){
    score = s.score; lives = s.lives; level = s.level;
    paused = s.paused; running = s.running; globalSpeedMul = s.globalSpeedMul;
    shakeT = s.shakeT; shakePow = s.shakePow;

    effects.pierce = s.effects.pierce;
    effects.laser = s.effects.laser;
    effects.sticky = s.effects.sticky;

    Object.assign(paddle, s.paddle);

    balls.length = 0; s.balls.forEach(v => balls.push(v));
    bricks.length = 0; s.bricks.forEach(v => bricks.push(v));
    powerups.length = 0; s.powerups.forEach(v => powerups.push(v));
    bullets.length = 0; s.bullets.forEach(v => bullets.push(v));
    particles.length = 0; s.particles.forEach(v => particles.push(v));
    shootCD = s.shootCD;

    updateHUD();
    renderEffectsUI();
  }

  // ==============================
  // Secret checkbox
  // ==============================
  function setSecretEnabled(on){
    secretEnabled = !!on;
    secretNote.textContent = secretEnabled ? '（已啟用）' : '（勾選後才可使用）';
  }
  secretEnable.addEventListener('change', () => {
    ensureAudio();
    setSecretEnabled(secretEnable.checked);
    flashToast(secretEnabled ? '秘密功能已啟用' : '秘密功能已關閉', 850);
  });
  setSecretEnabled(false);

  // ==============================
  // Rewind
  // ==============================
  function startRewind(){
    if(rewindActive) return;
    if(!checkpointIndices.length) return;
    if(!secretEnabled) return;
    if(!isGameplayRunning()) return;

    rewindActive = true;
    rewindAcc = 0;
    rewindClockAngle = 0;

    rewindTargetIndex = checkpointIndices[checkpointIndices.length - 1];

    document.body.classList.add('rewinding');
    toast.textContent = '倒轉中...';
    toast.classList.add('show');
    startRewindSfx();
  }

  function stopRewind(){
    rewindActive = false;
    rewindAcc = 0;
    document.body.classList.remove('rewinding');
    stopRewindSfx();

    if(paused){
      toast.textContent = 'PAUSED';
      toast.classList.add('show');
    }else{
      toast.classList.remove('show');
    }
  }

  // ==============================
  // HUD
  // ==============================
  function updateHUD(){
    scoreEl.textContent = String(score);
    livesEl.textContent = String(lives);
    levelEl.textContent = String(level);
  }

  // ==============================
  // Serve / Reset
  // ==============================
  function resetToServe(){
    paddle.y = stage.clientHeight - 26;
    paddle.x = (stage.clientWidth - paddle.w)/2;

    balls.length = 0;
    const b = makeBall();
    b.stuck = true;
    b.speedMul = 1.0; // 每次開球都從基本速度開始
    balls.push(b);

    powerups.length = 0;
    bullets.length = 0;
    particles.length = 0;
    shootCD = 0;
    running = false;

    // ✅ 速度重設（死亡/過關後）
    globalSpeedMul = 1.0;
    speedRampT = 0;
    speedRampMul = 1.0;

    // 一命重置：道具效果（無限時間，但仍是「本命」有效）
    effects.pierce = 0;
    effects.laser = 0;
    effects.sticky = 0;

    shakeT = 0; shakePow = 0;

    syncStuckBalls();
    renderEffectsUI();
    updateHUD();

    history.push(makeSnapshot());
    checkpointIndices.push(history.length - 1);
  }

  function resetAll(){
    score = 0; lives = 3; level = 1;
    paused = false;
    toast.classList.remove('show');
    passMsg.style.display = 'none';
    awaitingNextLevel = false;
    pendingLevel = null;

    checkpointIndices = [];
    rewindTargetIndex = null;
    history.length = 0;

    // ✅ 按下重來才套用機率設定
    const ok = applyPowerSettingsFromUI();
    if(!ok){
      // 不套用、不重開
      return;
    }

    buildLevel(level);
    updateHUD();
    renderEffectsUI();
  }

  // ==============================
  // Input
  // ==============================
  const keys = { left:false, right:false };

  function allowPointerMoveWhilePaused(){
    return paused && secretEnabled && isDesktopPointer();
  }

  window.addEventListener('keydown', (e) => {
    if(awaitingNextLevel){
      ensureAudio();
      proceedNextLevel();
      return;
    }

    if(rewindActive){
      if(e.key === 'z' || e.key === 'Z'){
        ensureAudio();
        stopRewind();
      } else if(e.key === 'l' || e.key === 'L'){
        if(checkpointIndices.length >= 2){
          const cur = (rewindTargetIndex == null)
            ? checkpointIndices[checkpointIndices.length - 1]
            : rewindTargetIndex;

          let idx = checkpointIndices.lastIndexOf(cur);
          if(idx === -1){
            idx = 0;
            for(let i=0;i<checkpointIndices.length;i++){
              if(checkpointIndices[i] <= cur) idx = i;
            }
          }
          rewindTargetIndex = checkpointIndices[Math.max(0, idx - 1)];
          flashToast('跨命倒轉', 600);
        }
      } else if(e.key === 'p' || e.key === 'P'){
        ensureAudio();
        stopRewind();
        paused = true;
        toast.textContent = 'PAUSED';
        toast.classList.add('show');
      }
      return;
    }

    if(e.key === 'z' || e.key === 'Z'){
      ensureAudio();
      if(secretEnabled && isGameplayRunning()) startRewind();
      return;
    }

    if(e.key === 'p' || e.key === 'P'){ togglePause(); return; }

    if(paused) return;

    if(e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A'){
      e.preventDefault(); keys.left = true; ensureAudio();
    }
    if(e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D'){
      e.preventDefault(); keys.right = true; ensureAudio();
    }

    if(e.key === 'w' || e.key === 'W' || e.key === ' '){
      e.preventDefault(); launch(); ensureAudio();
    }
    if(e.key === 's' || e.key === 'S' || e.key === 'x' || e.key === 'X'){
      e.preventDefault(); manualShoot(); ensureAudio();
    }
  });

  window.addEventListener('keyup', (e) => {
    if(e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if(e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  });

  stage.addEventListener('mousemove', (e) => {
    if(rewindActive) return;
    if(paused && !allowPointerMoveWhilePaused()) return;
    const rect = stage.getBoundingClientRect();
    setPaddleCenter(e.clientX - rect.left);
  });

  let pointerDown = false;
  stage.addEventListener('pointerdown', (e) => {
    if(awaitingNextLevel){
      ensureAudio();
      proceedNextLevel();
      return;
    }
    if(rewindActive) return;
    if(paused && !allowPointerMoveWhilePaused()) return;
    pointerDown = true;
    stage.setPointerCapture(e.pointerId);
    const rect = stage.getBoundingClientRect();
    setPaddleCenter(e.clientX - rect.left);
    ensureAudio();
  });

  stage.addEventListener('pointermove', (e) => {
    if(rewindActive) return;
    if(!pointerDown) return;
    if(paused && !allowPointerMoveWhilePaused()) return;
    const rect = stage.getBoundingClientRect();
    setPaddleCenter(e.clientX - rect.left);
  });

  stage.addEventListener('pointerup', () => { pointerDown = false; });
  stage.addEventListener('pointercancel', () => { pointerDown = false; });

  function clampPaddle(){
    paddle.x = clamp(paddle.x, 8, stage.clientWidth - paddle.w - 8);
  }
  function setPaddleCenter(cx){
    paddle.x = cx - paddle.w/2;
    clampPaddle();
    syncStuckBalls();
  }
  function syncStuckBalls(){
    for(const b of balls){
      if(b.alive && b.stuck){
        b.x = paddle.x + paddle.w/2;
        b.y = paddle.y - b.r - 2;
      }
    }
  }

  function bindHold(btn, onTick, interval=16){
    let t=null;
    const start=(ev)=>{ ev.preventDefault(); ensureAudio(); onTick(); t=setInterval(onTick, interval); };
    const end=()=>{ if(t){ clearInterval(t); t=null; } };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('pointerleave', end);
  }

  bindHold(btnLeft, () => {
    if(rewindActive) return;
    if(paused) return;
    paddle.x -= 12; clampPaddle(); syncStuckBalls();
  }, 16);

  bindHold(btnRight, () => {
    if(rewindActive) return;
    if(paused) return;
    paddle.x += 12; clampPaddle(); syncStuckBalls();
  }, 16);

  btnLaunch.addEventListener('click', () => {
    if(rewindActive) return;
    ensureAudio(); launch();
  });
  btnShoot.addEventListener('click', () => {
    if(rewindActive) return;
    ensureAudio(); manualShoot();
  });

  btnPause.addEventListener('click', () => { if(!rewindActive) togglePause(); });

  // ✅ 重來：先檢查/套用機率，再重開
  btnReset.addEventListener('click', () => { if(!rewindActive) resetAll(); });

  btnSpeedUp.addEventListener('click', () => {
    if(rewindActive) return;
    globalSpeedMul = Math.min(2.2, globalSpeedMul + 0.12);
    flashToast(`速度 x${globalSpeedMul.toFixed(2)}`, 700);
  });
  btnSpeedDown.addEventListener('click', () => {
    if(rewindActive) return;
    globalSpeedMul = Math.max(0.65, globalSpeedMul - 0.12);
    flashToast(`速度 x${globalSpeedMul.toFixed(2)}`, 700);
  });

  function togglePause(){
    paused = !paused;
    if(paused){
      toast.textContent = 'PAUSED';
      toast.classList.add('show');
    }else{
      toast.classList.remove('show');
    }
  }

  // ==============================
  // Launch (含黏球釋放角度)
  // ==============================
  function launch(){
    if(paused || rewindActive || lives <= 0) return;

    let any = false;
    for(const b of balls){
      if(b.alive && b.stuck){
        b.stuck = false;

        if(b.stickyAngle != null && b.stickySpeed != null){
          const sp = b.stickySpeed;
          const ang = b.stickyAngle;
          b.vx = sp * Math.sin(ang);
          b.vy = -Math.abs(sp * Math.cos(ang));
          b.stickyAngle = null;
          b.stickySpeed = null;
        }else{
          const angle = rand(-0.18, 0.18);
          const speed = 380;
          b.vx = speed * Math.sin(angle);
          b.vy = -Math.abs(speed * Math.cos(angle));
        }
        any = true;
      }
    }

    if(any){
      running = true;
      SFX.level();
    }
  }

  // ==============================
  // Collisions
  // ==============================
  function circleRectCollision(cx, cy, r, rx, ry, rw, rh){
    const closestX = clamp(cx, rx, rx+rw);
    const closestY = clamp(cy, ry, ry+rh);
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx*dx + dy*dy) <= r*r;
  }
  function rectRect(a,b){
    return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
  }

  // ==============================
  // Effects UI (無限時間 → 顯示「x層數」)
  // ==============================
  function renderEffectsUI(){
    const items = [];
    if(effects.laser > 0)  items.push({ name:'雷射', stacks:effects.laser, color:'rgba(255,70,110,.85)' });
    if(effects.pierce > 0) items.push({ name:'穿透', stacks:effects.pierce, color:'rgba(186,85,255,.85)' });
    if(effects.sticky > 0) items.push({ name:'黏球', stacks:effects.sticky, color:'rgba(255,120,210,.85)' });

    effectsUI.innerHTML = items.map(it => {
      const pct = clamp(it.stacks / 6, 0, 1) * 100; // 純視覺：最多6層滿格
      return `
        <div class="effItem">
          <div class="effTop">
            <span>${it.name}</span>
            <span>x${it.stacks}</span>
          </div>
          <div class="bar"><div style="width:${pct}%;background:${it.color}"></div></div>
        </div>
      `;
    }).join('');
  }

  // ==============================
  // Particles / explosions
  // ==============================
  function spawnExplosion(brType, x, y){
    let count = 24, speed = 320, life = [0.45, 0.95], size = [1.8, 4.8];
    let palette = ['rgba(0,210,255,1)', 'rgba(255,255,255,1)', 'rgba(90,140,255,1)'];
    let shape = 'dot';
    let gravity = 520;

    if(brType === 'hard'){
      count = 38; speed = 380; life = [0.55, 1.15]; size = [2.0, 5.4];
      palette = ['rgba(255,180,40,1)', 'rgba(255,240,120,1)', 'rgba(255,255,255,1)'];
      shape = 'shard'; gravity = 600;
    } else if(brType === 'mover'){
      count = 30; speed = 420; life = [0.50, 1.05]; size = [1.8, 5.0];
      palette = ['rgba(0,255,200,1)', 'rgba(0,210,255,1)', 'rgba(186,85,255,1)'];
      shape = 'ring'; gravity = 560;
    }

    shakeT = Math.min(0.14, shakeT + 0.10);
    shakePow = Math.min(6, shakePow + (brType === 'hard' ? 4 : 2.8));

    particles.push({ x, y, vx:0, vy:0, r:6, life:0.28, maxLife:0.28, color:(brType==='hard')?'rgba(255,220,120,1)':'rgba(0,210,255,1)', kind:'shock', drag:0, g:0 });

    for(let i=0;i<count;i++){
      const a = rand(0, Math.PI*2);
      const sp = rand(speed*0.45, speed);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: rand(size[0], size[1]),
        life: rand(life[0], life[1]),
        maxLife: life[1],
        color: pick(palette),
        kind: shape,
        drag: rand(1.2, 2.6),
        g: gravity
      });
    }
  }

  function addEffectStack(id, add=1){
    effects[id] = Math.min(9, Math.max(0, effects[id] + add));
  }

  function spawnPowerupFixed(br){
    if(!br || !br.dropId) return;
    if(br.dropId === 'none') return;

    // 注意：玩家可在中途取消勾選某道具 → 當下就不生成
    if(!powerEnabledUI[br.dropId]) return;
    if((powerChanceUI[br.dropId] || 0) <= 0) return;

    const found = POWER_TYPES.find(p => p.id === br.dropId);
    if(!found) return;

    powerups.push({
      id: found.id, label: found.label, color: found.color,
      x: br.x + br.w/2, y: br.y + br.h/2,
      r: 12, vy: 160 + level*8, alive:true
    });
  }

  function applyPowerup(id){
    if(id === 'none') return;
    if(!powerEnabledUI[id] || (powerChanceUI[id] || 0) <= 0) return;

    SFX.power();
    switch(id){
      case 'expand':
        paddle.w = Math.min(stage.clientWidth * 0.62, paddle.w * 1.35);
        flashToast('道具：長板', 900);
        break;
      case 'multi': {
        const src = balls.find(b => b.alive) || balls[0];
        if(src){
          for(let i=0;i<2;i++){
            const nb = makeBall();
            nb.stuck = false;
            nb.x = src.x; nb.y = src.y;
            const ang = rand(-0.9, 0.9);
            const sp = Math.hypot(src.vx, src.vy) || 360;
            nb.vx = sp * Math.sin(ang);
            nb.vy = -Math.abs(sp * Math.cos(ang));
            nb.speedMul = src.speedMul;
            balls.push(nb);
          }
          running = true;
        }
        flashToast('道具：多球', 900);
        break;
      }
      case 'pierce':
        addEffectStack('pierce', 1);
        flashToast('道具：穿透（堆疊）', 900);
        break;
      case 'laser':
        addEffectStack('laser', 1);
        flashToast('道具：雷射（堆疊）', 900);
        break;
      case 'life':
        lives++;
        updateHUD();
        flashToast('道具：+1 生命', 900);
        break;
      case 'slow':
        for(const b of balls) b.speedMul = Math.max(0.70, b.speedMul * 0.82);
        flashToast('道具：慢球', 900);
        break;
      case 'sticky':
        addEffectStack('sticky', 1);
        flashToast('道具：黏球（堆疊）', 900);
        break;
    }
    renderEffectsUI();
  }

  // Laser
  function fireBulletPair(){
    if(effects.laser <= 0) return;
    const leftX = paddle.x + paddle.w*0.20;
    const rightX = paddle.x + paddle.w*0.80;
    const y = paddle.y - 2;
    bullets.push({ x:leftX, y, w:bulletCfg.w, h:bulletCfg.h, vy:bulletCfg.vy, alive:true });
    bullets.push({ x:rightX, y, w:bulletCfg.w, h:bulletCfg.h, vy:bulletCfg.vy, alive:true });
    SFX.shoot();
  }

  function manualShoot(){
    if(paused || rewindActive) return;
    if(effects.laser <= 0){
      flashToast('需要先吃到「雷射」道具', 800);
      return;
    }
    if(shootCD > 0) return; // ✅ 手動射擊也吃冷卻
    fireBulletPair();
    shootCD = laserCooldown();
  }

  function isHappyLevel(lv){
  // 前三關快樂關卡；之後每 2~3 關穿插一次（2,3 交替）
  if(lv <= 3) return true;
  let cur = 3;
  let step = 2;
  while(cur < lv){
    cur += step;
    step = (step === 2) ? 3 : 2;
  }
  return cur === lv;
}

function laserCooldown(){
  // 堆疊越多稍微快一點，但整體比原本慢很多
  return clamp(0.55 - effects.laser * 0.04, 0.26, 0.55);
}

  // ==============================
  // Level generation
  // ==============================
  function buildLevel(lv){
    brickUidCounter = 1;

    const W = stage.clientWidth;

    // ✅ 球速會越來越快（本命/本關內），但死亡或過關會重設
    if(isGameplayRunning()){
      speedRampT += dt;
      speedRampMul = clamp(1.0 + speedRampT * 0.045, 1.0, 2.15);
    }
    const cols = 11;
    const rows = clamp(6 + Math.floor((lv-1)*0.65), 6, 12);

    const padding = 10;
    const topOffset = 18;
    const sideMargin = 16;

    const brickW = (W - sideMargin*2 - padding*(cols-1)) / cols;
    const brickH = 22;

    bricks = [];

    const happy = isHappyLevel(lv);

    // ✅ 大部分磚塊單擊消除：降低硬磚/移動磚比例
    const wMover = happy ? Math.min(0.10, 0.03 + lv*0.006) : Math.min(0.14, 0.04 + lv*0.007);
    const wHard  = happy ? Math.min(0.16, 0.06 + lv*0.008) : Math.min(0.28, 0.10 + lv*0.010);

    const styles = ['arch','wave','diag','holes','crown','islands','zigzag'];
    const style = happy ? 'happy' : styles[(lv-1) % styles.length]; // 每關形狀不同（循環）
    const densityTarget = clamp(0.55 + lv*0.01, 0.55, 0.78);

    const occ = Array.from({length: rows}, () => Array(cols).fill(false));

    
for(let r=1; r<rows; r++){
  for(let c=0; c<cols; c++){
    let on = false;

    if(style === 'happy'){
      // ✅ 快樂關卡：下方通道較空，球容易上去；上方密集+小孔洞，容易在磚塊間反彈清除
      const mid = (cols - 1) / 2;
      const topDenseRows = Math.floor(rows * 0.46);
      const midRowsEnd   = Math.floor(rows * 0.72);

      if(r <= topDenseRows){
        on = true;

        // 中央開一條「上升通道」讓球容易打到上方
        if(Math.abs(c - mid) <= 1.2 && r >= 2) on = false;

        // 小洞洞：避免滿版卡死、增加反彈路徑
        if(((r + c) % 5) === 0) on = false;
      } else if(r <= midRowsEnd){
        // 中段：側邊導流 + 少量散佈
        on = (c === 0 || c === cols-1 || c === 1 || c === cols-2);
        if(!on){
          const farFromMid = Math.abs(c - mid) > 2;
          on = farFromMid && (((r + c) % 3) === 0);
        }
      } else {
        // 底部：只留「保護墊」在兩側，降低掉落機率
        on = (r === rows-2) && (c <= 1 || c >= cols-2);
      }
    } else {
      // 原本的隨機形狀（仍保持每關不同 style）
      if(style === 'arch'){
        const mid = (cols-1)/2;
        const dist = Math.abs(c-mid)/mid;
        const curve = 1.0 - dist*dist;
        on = (r/rows) < (0.25 + 0.75*curve);
      } else if(style === 'wave'){
        const k = Math.sin((c/cols)*Math.PI*2 + lv*0.35) * 1.25;
        on = (r < rows*0.78 + k);
      } else if(style === 'diag'){
        const line = (c*(rows/cols));
        on = (Math.abs(r - line) < rows*0.55);
      } else if(style === 'holes'){
        on = (Math.random() < densityTarget);
      } else if(style === 'crown'){
        on = !(r===1 && (c%3===1)) && !(r===2 && (c%4===2));
      } else if(style === 'islands'){
        const seeds = 3 + Math.min(3, Math.floor(lv/4));
        let hit = false;
        for(let i=0;i<seeds;i++){
          const sx = (i*997 + lv*131) % cols;
          const sy = 1 + ((i*541 + lv*73) % (rows-1));
          const rad = 2.2 + (i%3)*0.9;
          const dx = c - sx;
          const dy = r - sy;
          if((dx*dx + dy*dy) <= rad*rad) { hit = true; break; }
        }
        on = hit;
      } else if(style === 'zigzag'){
        const band = (r + Math.floor(lv/2)) % 3;
        on = (band !== 0) && ((c + r) % 2 === 0 || r > rows*0.55);
      }

      const hole = (Math.random() < (0.10 + Math.min(0.16, lv*0.01)));
      if(on && hole) on = false;
      const topSparse = (r <= 2 && Math.random() < 0.25);
      if(topSparse) on = false;
    }

    occ[r][c] = on;
  }
}

    // ✅ 生成只看「已套用」機率（按重來才更新）
    const pickList = enabledPowerListForPickApplied();

    for(let r=1; r<rows; r++){
      for(let c=0; c<cols; c++){
        if(!occ[r][c]) continue;

        const roll = Math.random();
        let type = 'normal';
        if(roll < wMover) type = 'mover';
        else if(roll < wMover + wHard) type = 'hard';

        let hp = 1;
        if(type === 'hard') hp = clamp(2 + Math.floor(lv/6), 2, 4);
        if(type === 'mover') hp = clamp(2 + Math.floor(lv/10), 2, 3);

        const mv = (type === 'mover') ? rand(40, 90) * (Math.random()<0.5?-1:1) : 0;

        // ✅ 每顆磚固定抽一次（100%）：可能抽到 none
        let dropId = 'none';
        if(pickList.length > 0){
          const picked = weightedPickApplied(pickList);
          dropId = picked ? picked.id : 'none';
        }

        bricks.push({
          uid: brickUidCounter++,
          dropId,
          type,
          x: sideMargin + c*(brickW + padding),
          y: topOffset + r*(brickH + padding),
          w: brickW, h: brickH,
          hp, maxHp: hp,
          alive: true, vx: mv,
        });
      }
    }

    globalSpeedMul = 1.0;
    speedRampT = 0;
    speedRampMul = 1.0;
    paddle.w = clamp(paddle.baseW * (lv>=7 ? 0.95 : 1.0), 90, stage.clientWidth*0.62);

    checkpointIndices = [];
    rewindTargetIndex = null;
    history.length = 0;

    resetToServe();
    flashToast(`第 ${lv} 關：${style}`, 850);
  }

  // ==============================
  // Loop
  // ==============================
  let last = performance.now();
  function tick(now){
    const dt = Math.min(0.02, (now - last) / 1000);
    last = now;

    if(rewindActive){
      updateRewind(dt);
      draw();
      requestAnimationFrame(tick);
      return;
    }

    if(awaitingNextLevel){
      draw();
      requestAnimationFrame(tick);
      return;
    }

    if(!paused){
      update(dt);
      captureSnapshot();
      draw();
    }else{
      draw();
    }

    requestAnimationFrame(tick);
  }

  function updateRewind(dt){
    rewindClockAngle += dt * (Math.PI * 2 * 0.85);
    rewindAcc += dt;
    const step = 1 / HISTORY_FPS;

    if(rewindTargetIndex == null){
      rewindTargetIndex = checkpointIndices.length ? checkpointIndices[checkpointIndices.length - 1] : 0;
    }

    while(rewindAcc >= step){
      rewindAcc -= step;

      if(history.length - 1 <= rewindTargetIndex){
        applySnapshot(history[rewindTargetIndex]);

        running = false;
        for(const b of balls){
          if(!b.alive) continue;
          b.stuck = true;
          b.stickyAngle = null;
          b.stickySpeed = null;
        }
        syncStuckBalls();
        paused = false;

        stopRewind();
        return;
      }

      history.pop();
      applySnapshot(history[history.length - 1]);
    }
  }

  // ==============================
  // Update gameplay
  // ==============================
  function update(dt){
    if(shakeT > 0){
      shakeT = Math.max(0, shakeT - dt);
      shakePow *= Math.exp(-10 * dt);
      if(shakePow < 0.2) shakePow = 0;
    }

    const dir = (keys.left?-1:0) + (keys.right?1:0);
    if(dir !== 0){
      paddle.x += dir * paddle.speed * dt;
      clampPaddle();
      syncStuckBalls();
    }

    const W = stage.clientWidth;

    // ✅ 球速會越來越快（本命/本關內），但死亡或過關會重設
    if(isGameplayRunning()){
      speedRampT += dt;
      speedRampMul = clamp(1.0 + speedRampT * 0.045, 1.0, 2.15);
    }

    for(const br of bricks){
      if(!br.alive) continue;
      if(br.type === 'mover'){
        br.x += br.vx * dt * (1 + level*0.04);
        if(br.x < 16){ br.x = 16; br.vx *= -1; }
        if(br.x + br.w > W - 16){ br.x = W - 16 - br.w; br.vx *= -1; }
      }
    }

    // powerups fall
    for(const p of powerups){
      if(!p.alive) continue;
      p.y += p.vy * dt;

      if(circleRectCollision(p.x, p.y, p.r, paddle.x, paddle.y, paddle.w, paddle.h)){
        p.alive = false;
        applyPowerup(p.id);
      }
      if(p.y - p.r > stage.clientHeight) p.alive = false;
    }

    // auto laser（有堆疊就開火，但已降頻）
    if(effects.laser > 0){
      shootCD = Math.max(0, shootCD - dt);
      if(shootCD <= 0){
        fireBulletPair();
        shootCD = laserCooldown();
      }
    }else{
      shootCD = 0;
    }

    // bullets
    for(const bu of bullets){
      if(!bu.alive) continue;
      bu.y += bu.vy * dt;
      if(bu.y + bu.h < 0){ bu.alive = false; continue; }

      const brBox = { x: bu.x - bu.w/2, y: bu.y - bu.h, w: bu.w, h: bu.h };
      for(const br of bricks){
        if(!br.alive) continue;
        const bBox = { x: br.x, y: br.y, w: br.w, h: br.h };
        if(!rectRect(brBox, bBox)) continue;

        br.hp--;
        score += 8;

        if(br.hp <= 0){
          br.alive = false;
          score += 40;
          SFX.brickBreak();
          spawnExplosion(br.type, br.x + br.w/2, br.y + br.h/2);
          spawnPowerupFixed(br);
        } else {
          SFX.brick();
        }
        updateHUD();

        bu.alive = false;
        break;
      }
    }

    // particles
    for(const p of particles){
      if(p.life <= 0) continue;

      if(p.kind === 'shock'){
        p.r += 520 * dt;
        p.life -= dt;
        continue;
      }

      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.vy += p.g * dt;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    if(particles.length > 1400) particles.splice(0, particles.length - 1400);

    // ball alive?
    if(!balls.some(b => b.alive)){
      lives--;
      updateHUD();
      SFX.lose();

      if(lives <= 0){
        running = false;
        toast.textContent = 'GAME OVER（按「重來」）';
        toast.classList.add('show');
        SFX.gameover();
        return;
      }
      resetToServe();
      return;
    }

    // balls
    for(const b of balls){
      if(!b.alive) continue;
      if(b.stuck) continue;

      const spMul = b.speedMul * globalSpeedMul * speedRampMul;
      b.x += b.vx * spMul * dt;
      b.y += b.vy * spMul * dt;

      const H = stage.clientHeight;

      if(b.x - b.r < 0){ b.x = b.r; b.vx *= -1; SFX.wall(); }
      else if(b.x + b.r > W){ b.x = W - b.r; b.vx *= -1; SFX.wall(); }
      if(b.y - b.r < 0){ b.y = b.r; b.vy *= -1; SFX.wall(); }

      if(b.y - b.r > H){ b.alive = false; continue; }

      // paddle
      if(circleRectCollision(b.x, b.y, b.r, paddle.x, paddle.y, paddle.w, paddle.h) && b.vy > 0){
        b.y = paddle.y - b.r - 0.5;

        const hitPos = (b.x - (paddle.x + paddle.w/2)) / (paddle.w/2);
        const maxBounce = Math.PI * 0.42;
        const angle = clamp(hitPos, -1, 1) * maxBounce;
        const speed = Math.max(320, Math.hypot(b.vx, b.vy));

        if(effects.sticky > 0){
          b.stuck = true;
          b.stickyAngle = angle;
          b.stickySpeed = speed;
          syncStuckBalls();
          SFX.paddle();
          continue;
        }

        b.vx = speed * Math.sin(angle);
        b.vy = -Math.abs(speed * Math.cos(angle));
        b.speedMul = Math.min(2.2, b.speedMul + 0.01);
        SFX.paddle();
      }

      // bricks
      for(const br of bricks){
        if(!br.alive) continue;
        if(!circleRectCollision(b.x, b.y, b.r, br.x, br.y, br.w, br.h)) continue;

        br.hp--;
        score += 10;

        if(br.hp <= 0){
          br.alive = false;
          score += 45;
          SFX.brickBreak();
          spawnExplosion(br.type, br.x + br.w/2, br.y + br.h/2);
          spawnPowerupFixed(br);
        } else {
          SFX.brick();
        }
        updateHUD();

        // 穿透：只要有堆疊就不反彈
        if(effects.pierce <= 0){
          const prevX = b.x - b.vx * spMul * dt;
          const prevY = b.y - b.vy * spMul * dt;

          const hitFromLeft   = prevX <= br.x - b.r;
          const hitFromRight  = prevX >= br.x + br.w + b.r;
          const hitFromTop    = prevY <= br.y - b.r;
          const hitFromBottom = prevY >= br.y + br.h + b.r;

          if(hitFromLeft || hitFromRight) b.vx *= -1;
          else if(hitFromTop || hitFromBottom) b.vy *= -1;
          else {
            if(Math.abs(b.vx) > Math.abs(b.vy)) b.vx *= -1;
            else b.vy *= -1;
          }
        }
        break;
      }
    }

    // clear level
    if(!awaitingNextLevel && !bricks.some(br => br.alive)){
      SFX.level();
      handleLevelClear();
      return;
    }
  }

  // ==============================
  // Draw
  // ==============================
  function roundRect(c, x, y, w, h, r){
    const rr = Math.min(r, w/2, h/2);
    c.beginPath();
    c.moveTo(x+rr, y);
    c.arcTo(x+w, y, x+w, y+h, rr);
    c.arcTo(x+w, y+h, x, y+h, rr);
    c.arcTo(x, y+h, x, y, rr);
    c.arcTo(x, y, x+w, y, rr);
    c.closePath();
  }

  function brickFill(br){
    if(br.type === 'mover') return 'rgba(0, 220, 180, .88)';
    if(br.type === 'hard'){
      const t = clamp(br.hp / br.maxHp, 0.15, 1);
      return `rgba(255, ${Math.floor(160 + 70*(1-t))}, 50, ${0.78 + 0.16*(1-t)})`;
    }
    return 'rgba(70, 140, 255, .82)';
  }

  function drawParticles(){
    const prevComp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';

    for(const p of particles){
      if(p.life <= 0) continue;
      const t = clamp(p.life / p.maxLife, 0, 1);

      if(p.kind === 'shock'){
        ctx.globalAlpha = t * 0.8;
        ctx.beginPath();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.stroke();
        continue;
      }

      ctx.globalAlpha = (0.18 + 0.82*t);

      if(p.kind === 'shard'){
        const ang = Math.atan2(p.vy, p.vx);
        const len = p.r * 2.6;
        const wid = Math.max(1.2, p.r * 0.8);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang);
        ctx.fillStyle = p.color;
        ctx.fillRect(-len/2, -wid/2, len, wid);
        ctx.restore();
      } else if(p.kind === 'ring'){
        ctx.beginPath();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1.4, p.r * 0.7);
        ctx.arc(p.x, p.y, Math.max(2.0, p.r*1.5), 0, Math.PI*2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.fillStyle = p.color;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = prevComp;
  }

  function drawClockOverlay(W, H){
    const cx = W/2, cy = H/2;
    const R = Math.min(W, H) * 0.20;

    ctx.save();
    ctx.globalAlpha = 0.86;

    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,.74)';
    ctx.arc(cx, cy, R, 0, Math.PI*2);
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(15,47,85,.35)';
    ctx.lineWidth = 6;
    ctx.arc(cx, cy, R-2, 0, Math.PI*2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(15,47,85,.35)';
    for(let i=0;i<60;i++){
      const a = (i/60) * Math.PI*2;
      const isHour = (i % 5 === 0);
      ctx.lineWidth = isHour ? 3.5 : 2;
      const r1 = R - (isHour ? 14 : 10);
      const r2 = R - 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a)*r1, cy + Math.sin(a)*r1);
      ctx.lineTo(cx + Math.cos(a)*r2, cy + Math.sin(a)*r2);
      ctx.stroke();
    }

    const secA  = -rewindClockAngle * 2.2;
    const minA  = secA / 60;
    const hourA = secA / 720;

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(15,47,85,.78)';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(hourA)*(R*0.45), cy + Math.sin(hourA)*(R*0.45));
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(15,47,85,.62)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(minA)*(R*0.62), cy + Math.sin(minA)*(R*0.62));
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,70,110,.92)';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(secA)*(R*0.74), cy + Math.sin(secA)*(R*0.74));
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = 'rgba(15,47,85,.70)';
    ctx.arc(cx, cy, 6, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  function draw(){
    const W = stage.clientWidth, H = stage.clientHeight;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const g = ctx.createLinearGradient(0,0,0,H);
    if(rewindActive){
      g.addColorStop(0, 'rgba(255, 250, 220, 1)');
      g.addColorStop(1, 'rgba(255, 236, 170, 1)');
    } else {
      g.addColorStop(0, 'rgba(230, 248, 255, 1)');
      g.addColorStop(1, 'rgba(200, 232, 255, 1)');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for(const br of bricks){
      if(!br.alive) continue;
      ctx.fillStyle = brickFill(br);
      ctx.fillRect(br.x, br.y, br.w, br.h);

      const hg = ctx.createLinearGradient(br.x, br.y, br.x, br.y+br.h);
      hg.addColorStop(0, 'rgba(255,255,255,.25)');
      hg.addColorStop(0.45, 'rgba(255,255,255,.08)');
      hg.addColorStop(1, 'rgba(0,0,0,.08)');
      ctx.fillStyle = hg;
      ctx.fillRect(br.x, br.y, br.w, br.h);

      ctx.strokeStyle = 'rgba(15, 47, 85, .26)';
      ctx.strokeRect(br.x+0.5, br.y+0.5, br.w-1, br.h-1);

      const t = clamp(br.hp / br.maxHp, 0, 1);
      ctx.fillStyle = (br.type === 'hard') ? 'rgba(255,240,120,.95)' : 'rgba(255,255,255,.70)';
      ctx.fillRect(br.x+5, br.y + br.h - 6, (br.w - 10)*t, 3);
    }

    drawParticles();

    for(const p of powerups){
      if(!p.alive) continue;
      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(15, 47, 85, .25)';
      ctx.stroke();

      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.font = '950 11px system-ui, -apple-system, Segoe UI, Roboto, Noto Sans TC, Arial';
      ctx.textAlign = 'center';
      ctx.fillText(p.label, p.x, p.y + 4);
    }

    for(const bu of bullets){
      if(!bu.alive) continue;
      ctx.fillStyle = 'rgba(255,70,110,.95)';
      ctx.fillRect(bu.x - bu.w/2, bu.y - bu.h, bu.w, bu.h);
    }

    ctx.fillStyle = (effects.laser > 0) ? 'rgba(255,70,110,.95)' : 'rgba(90,140,255,.95)';
    roundRect(ctx, paddle.x, paddle.y, paddle.w, paddle.h, 10);
    ctx.fill();

    for(const b of balls){
      if(!b.alive) continue;
      ctx.beginPath();
      let col = 'rgba(0,210,255,.95)';
      if(effects.pierce > 0) col = 'rgba(186,85,255,.95)';
      if(effects.sticky > 0) col = 'rgba(255,120,210,.92)';
      ctx.fillStyle = col;
      ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
      ctx.fill();
    }

    if(rewindActive) drawClockOverlay(W, H);

    if(paused && !rewindActive){
      ctx.fillStyle = 'rgba(255,255,255,.10)';
      ctx.fillRect(0,0,W,H);
    }
  }

  // ==============================
  // Init
  // ==============================
  // 第一次進入：也先把UI機率套用一次，確保「已套用」與UI一致（仍符合：改完要按重來才會影響生成）
  applyPowerSettingsFromUI();
  buildLevel(1);
  updateHUD();
  renderEffectsUI();
  requestAnimationFrame(tick);
})();
