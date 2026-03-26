// game.js — 烟花连通主逻辑 v6

(function () {
  'use strict';

  const COLS = 6;
  const ROWS = 10;

  // ===== 火源颜色表 =====
  // 中国传统节日色彩（喜庆明亮）
  const SOURCE_COLORS = [
    '#cc2222', '#d4872c', '#228b22', '#b8860b', '#cc3388',
    '#1a8a8a', '#cc8800', '#7744aa', '#dd4400', '#448822'
  ];

  // ===== 音频系统 =====
  let audioCtx = null;
  let soundEnabled = true;
  let bgmEnabled = true;
  let bgmPlaying = false;
  let bgmNodes = [];  // 存储背景音乐的所有节点用于停止
  let bgmGain = null; // 背景音乐总音量控制

  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  // ===== 背景音乐系统 — 中国传统节日风格 =====
  // 基于《春节序曲》《金蛇狂舞》《喜洋洋》等传统曲风的五声音阶旋律

  // D大调五声音阶频率表（宫商角徵羽）
  const PENTA = {
    D4: 293.7, E4: 329.6, 'F#4': 370.0, A4: 440.0, B4: 493.9,
    D5: 587.3, E5: 659.3, 'F#5': 740.0, A5: 880.0, B5: 987.8,
    D3: 146.8, A3: 220.0, E3: 164.8, 'F#3': 185.0, B3: 246.9
  };

  // 主旋律 — 春节序曲风格（欢快喜庆）
  // [音名, 时值(拍)] 每拍约200ms
  const MELODY_A = [
    ['D5', 1], ['D5', 0.5], ['E5', 0.5], ['F#5', 1], ['A5', 1],
    ['F#5', 0.5], ['E5', 0.5], ['D5', 1], ['B4', 1],
    ['A4', 1], ['B4', 0.5], ['D5', 0.5], ['A4', 1], ['F#4', 1],
    ['E4', 0.5], ['F#4', 0.5], ['A4', 1], ['D5', 1],
  ];
  // 第二段 — 金蛇狂舞风格（活泼跳跃）
  const MELODY_B = [
    ['A4', 0.5], ['B4', 0.5], ['D5', 0.5], ['E5', 0.5],
    ['F#5', 1], ['E5', 0.5], ['D5', 0.5],
    ['B4', 0.5], ['A4', 0.5], ['F#4', 1],
    ['A4', 0.5], ['D5', 0.5], ['B4', 1], ['A4', 1],
    ['D5', 0.5], ['F#5', 0.5], ['E5', 0.5], ['D5', 0.5],
    ['B4', 1], ['A4', 1], ['D4', 2],
  ];
  // 第三段 — 喜洋洋风格（悠扬流畅）
  const MELODY_C = [
    ['D5', 1.5], ['B4', 0.5], ['A4', 1], ['F#4', 1],
    ['A4', 1], ['B4', 0.5], ['A4', 0.5], ['F#4', 1], ['E4', 1],
    ['D4', 0.5], ['E4', 0.5], ['F#4', 1], ['A4', 1],
    ['B4', 1.5], ['A4', 0.5], ['D5', 2],
  ];

  // 伴奏和弦（低音+五度）
  const BASS_PATTERN = [
    ['D3', 4], ['A3', 4], ['F#3', 4], ['A3', 4],
    ['D3', 4], ['E3', 4], ['F#3', 2], ['A3', 2],
    ['D3', 4], ['B3', 4], ['A3', 4], ['D3', 4],
  ];

  const BEAT_MS = 180; // 每拍毫秒（约BPM 167，欢快节奏）
  const BGM_TARGET_GAIN = 0.15;

  function startBGM() {
    if (!audioCtx || !bgmEnabled || bgmPlaying) return;
    bgmPlaying = true;

    bgmGain = audioCtx.createGain();
    bgmGain.gain.setValueAtTime(0, audioCtx.currentTime);
    bgmGain.gain.linearRampToValueAtTime(BGM_TARGET_GAIN, audioCtx.currentTime + 1.5);
    bgmGain.connect(audioCtx.destination);

    const allMelodies = [MELODY_A, MELODY_B, MELODY_C];
    let melodyIdx = 0;
    let noteIdx = 0;
    let bassIdx = 0;
    let bassRemain = 0;

    // 打击节奏
    function playBeat(accent) {
      if (!bgmPlaying || !audioCtx) return;
      const t = audioCtx.currentTime;
      const bufSize = Math.floor(audioCtx.sampleRate * 0.04);
      const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        d[i] = (Math.random() * 2 - 1) * (1 - i / bufSize) * 0.5;
      }
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(accent ? 0.08 : 0.04, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      // 高通滤波使音色更清脆（像小锣）
      const hp = audioCtx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(accent ? 3000 : 5000, t);
      src.connect(hp);
      hp.connect(g);
      g.connect(bgmGain);
      src.start(t);
    }

    // 旋律音符
    function playMelodyNote(freq, duration) {
      if (!bgmPlaying || !audioCtx) return;
      const t = audioCtx.currentTime;
      const durationSec = duration * BEAT_MS / 1000;

      // 用两个振荡器叠加模拟笛子/二胡音色
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const g = audioCtx.createGain();

      osc1.type = 'triangle'; // 基础音
      osc2.type = 'sine';     // 泛音

      osc1.frequency.setValueAtTime(freq, t);
      // 微弱颤音（传统器乐感）
      osc1.frequency.setValueAtTime(freq, t);
      osc1.frequency.linearRampToValueAtTime(freq * 1.005, t + durationSec * 0.3);
      osc1.frequency.linearRampToValueAtTime(freq * 0.998, t + durationSec * 0.6);
      osc1.frequency.linearRampToValueAtTime(freq, t + durationSec * 0.9);

      osc2.frequency.setValueAtTime(freq * 2, t); // 高八度泛音
      const g2 = audioCtx.createGain();
      g2.gain.setValueAtTime(0.05, t);

      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.02);
      g.gain.setValueAtTime(0.15, t + durationSec * 0.7);
      g.gain.linearRampToValueAtTime(0.001, t + durationSec);

      osc1.connect(g);
      osc2.connect(g2);
      g2.connect(g);
      g.connect(bgmGain);

      osc1.start(t); osc1.stop(t + durationSec + 0.05);
      osc2.start(t); osc2.stop(t + durationSec + 0.05);
    }

    // 低音
    function playBassNote(freq, duration) {
      if (!bgmPlaying || !audioCtx) return;
      const t = audioCtx.currentTime;
      const durationSec = duration * BEAT_MS / 1000;

      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.1, t);
      g.gain.setValueAtTime(0.08, t + durationSec * 0.8);
      g.gain.linearRampToValueAtTime(0.001, t + durationSec);
      osc.connect(g);
      g.connect(bgmGain);
      osc.start(t);
      osc.stop(t + durationSec + 0.05);
    }

    let beatCount = 0;

    function tick() {
      if (!bgmPlaying) return;

      // 打击节奏 — 每拍打一下，强拍重音
      playBeat(beatCount % 4 === 0);

      // 旋律
      const melody = allMelodies[melodyIdx % allMelodies.length];
      const [noteName, beats] = melody[noteIdx];
      const freq = PENTA[noteName];
      if (freq) playMelodyNote(freq, beats);

      // 低音（跨多拍持续）
      if (bassRemain <= 0) {
        const [bassName, bassBeats] = BASS_PATTERN[bassIdx % BASS_PATTERN.length];
        const bassFreq = PENTA[bassName];
        if (bassFreq) playBassNote(bassFreq, bassBeats);
        bassRemain = bassBeats;
        bassIdx++;
      }
      bassRemain--;

      // 推进旋律
      noteIdx++;
      if (noteIdx >= melody.length) {
        noteIdx = 0;
        melodyIdx++;
      }

      beatCount++;
      if (bgmPlaying) {
        const currentBeats = melody[noteIdx % melody.length][1];
        setTimeout(tick, currentBeats * BEAT_MS);
      }
    }

    // 开始播放
    setTimeout(tick, 500);
  }

  function stopBGM() {
    bgmPlaying = false;
    if (bgmGain && audioCtx) {
      const t = audioCtx.currentTime;
      bgmGain.gain.linearRampToValueAtTime(0, t + 1);
    }
    setTimeout(() => {
      bgmNodes.forEach(node => {
        try { node.stop(); } catch (e) {}
      });
      bgmNodes = [];
      bgmGain = null;
    }, 1200);
  }

  function playSound(type) {
    if (!soundEnabled || !audioCtx) return;
    const t = audioCtx.currentTime;

    if (type === 'rotate') {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.connect(g); g.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(1000, t + 0.04);
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.start(t); osc.stop(t + 0.06);
    } else if (type === 'connect') {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.connect(g); g.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(1320, t + 0.12);
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.start(t); osc.stop(t + 0.15);
    } else if (type === 'firework_small') {
      const bufSize = Math.floor(audioCtx.sampleRate * 0.12);
      const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      src.connect(g); g.connect(audioCtx.destination);
      src.start(t);
    } else if (type === 'firework_big') {
      for (let i = 0; i < 4; i++) {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.connect(g); g.connect(audioCtx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300 + i * 250, t + i * 0.12);
        g.gain.setValueAtTime(0.08, t + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.4);
        osc.start(t + i * 0.12); osc.stop(t + i * 0.12 + 0.4);
      }
    } else if (type === 'trail') {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.connect(g); g.connect(audioCtx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.exponentialRampToValueAtTime(400, t + 0.05);
      g.gain.setValueAtTime(0.04, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.start(t); osc.stop(t + 0.06);
    }
  }

  // ===== 状态 =====
  let currentLevel = null;
  let currentLevelIndex = 0;
  let grid = [];
  let sources = [];
  let rockets = [];
  let timeRemaining = 0;
  let timerInterval = null;
  let gameActive = false;
  let totalScore = 0;
  let connectedPaths = {};
  let prevConnectedCount = 0; // 用于检测新连通

  // ===== DOM 引用 =====
  const startScreen = document.getElementById('start-screen');
  const gameScreen = document.getElementById('game-screen');
  const resultScreen = document.getElementById('result-screen');
  const boardEl = document.getElementById('board');
  const sourcesCol = document.getElementById('sources-col');
  const rocketsCol = document.getElementById('rockets-col');
  const levelInfo = document.getElementById('level-info');
  const timerEl = document.getElementById('timer');
  const scoreDisplay = document.getElementById('score-display');
  const soundButton = document.getElementById('btn-sound');
  const bgmButton = document.getElementById('btn-bgm');
  const resultTitle = document.getElementById('result-title');
  const resultDetails = document.getElementById('result-details');
  const resultButtons = document.getElementById('result-buttons');

  function updateAudioButtons() {
    soundButton.textContent = soundEnabled ? '音效 开' : '音效 关';
    bgmButton.textContent = bgmEnabled ? 'BGM 开' : 'BGM 关';
    soundButton.classList.toggle('is-off', !soundEnabled);
    bgmButton.classList.toggle('is-off', !bgmEnabled);
    soundButton.setAttribute('aria-pressed', soundEnabled ? 'true' : 'false');
    bgmButton.setAttribute('aria-pressed', bgmEnabled ? 'true' : 'false');
  }

  // ===== 管道开口方向 =====
  const BASE_OPENINGS = {
    straight: ['top', 'bottom'],
    corner: ['top', 'right'],
    tee: ['top', 'right', 'bottom'],
    cross: ['top', 'right', 'bottom', 'left'],
    bridge: ['top', 'right', 'bottom', 'left']
  };

  const DIRECTION_ROTATE = { top: 'right', right: 'bottom', bottom: 'left', left: 'top' };
  const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  const DIR_DELTA = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };

  function rotateDirection(dir, times) {
    let d = dir;
    for (let i = 0; i < times; i++) d = DIRECTION_ROTATE[d];
    return d;
  }

  function getOpenings(type, rotation) {
    const steps = rotation / 90;
    return BASE_OPENINGS[type].map(d => rotateDirection(d, steps));
  }

  function getExits(type, rotation, enteredFrom) {
    if (type === 'bridge') return [OPPOSITE[enteredFrom]];
    const openings = getOpenings(type, rotation);
    if (!openings.includes(enteredFrom)) return [];
    return openings.filter(d => d !== enteredFrom);
  }

  // ===== SVG 管道绘制 =====
  function createPipeSVG(type) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 40 40');

    const edge = { top: [20, 0], bottom: [20, 40], left: [0, 20], right: [40, 20] };

    if (type === 'straight') {
      addPipeLine(svg, ns, edge.top, edge.bottom, 'v');
    } else if (type === 'corner') {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', 'M20,0 L20,14 Q20,20 26,20 L40,20');
      path.classList.add('pipe-line');
      path.dataset.channel = 'corner';
      svg.appendChild(path);
    } else if (type === 'tee') {
      addPipeLine(svg, ns, edge.top, edge.bottom, 'v');
      addPipeLine(svg, ns, [20, 20], edge.right, 'h');
    } else if (type === 'cross') {
      addPipeLine(svg, ns, edge.top, edge.bottom, 'v');
      addPipeLine(svg, ns, edge.left, edge.right, 'h');
    } else if (type === 'bridge') {
      // 水平线完整穿过
      addPipeLine(svg, ns, edge.left, edge.right, 'h');
      // 竖直线拱起（表示跨越不连通）
      const vPath = document.createElementNS(ns, 'path');
      vPath.setAttribute('d', 'M20,0 L20,12 C12,12 12,28 20,28 L20,40');
      vPath.classList.add('pipe-line');
      vPath.dataset.channel = 'v';
      svg.appendChild(vPath);
    }

    // 中心圆点
    if (type !== 'bridge') {
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', 20);
      dot.setAttribute('cy', 20);
      dot.setAttribute('r', '5');
      dot.setAttribute('fill', 'var(--pipe-color)');
      dot.classList.add('pipe-dot');
      svg.appendChild(dot);
    }

    return svg;
  }

  function addPipeLine(svg, ns, from, to, channel) {
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', from[0]);
    line.setAttribute('y1', from[1]);
    line.setAttribute('x2', to[0]);
    line.setAttribute('y2', to[1]);
    line.classList.add('pipe-line');
    if (channel) line.dataset.channel = channel;
    svg.appendChild(line);
  }

  // ===== 计算格子尺寸 =====
  function calcCellSize() {
    const areaWidth = window.innerWidth - 64 - 16;
    const areaHeight = window.innerHeight - 100 - 60 - 20;
    const cellW = Math.floor((areaWidth - (COLS - 1) * 2 - 4) / COLS);
    const cellH = Math.floor((areaHeight - (ROWS - 1) * 2 - 4) / ROWS);
    return Math.max(44, Math.min(cellW, cellH, 56));
  }

  // ===== 屏幕切换 =====
  function showScreen(screen) {
    [startScreen, gameScreen, resultScreen].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
  }

  // ===== 获取火源索引的颜色 =====
  function getSourceColor(sourceIdx) {
    return SOURCE_COLORS[sourceIdx % SOURCE_COLORS.length];
  }

  // ===== 初始化关卡 =====
  function loadLevel(index) {
    currentLevelIndex = index;
    const lvl = LEVELS[index];
    currentLevel = generateSolvableLevel(lvl.id, lvl.rows, lvl.timeLimit);
    totalScore = 0;
    connectedPaths = {};
    prevConnectedCount = 0;
    // 确保BGM在游戏中持续播放
    if (bgmEnabled && !bgmPlaying && audioCtx) startBGM();

    grid = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        const [type, rotation] = currentLevel.grid[idx];
        grid.push({
          col: c, row: r, type: type, rotation: rotation,
          connected: false, isSpecialTarget: false,
          connectedSources: new Set(), // 哪些火源经过这个格子
          hSourceIdx: -1,  // bridge水平通道的火源索引
          vSourceIdx: -1   // bridge竖直通道的火源索引
        });
      }
    }

    sources = [];
    rockets = [];
    for (let i = 0; i < ROWS; i++) {
      const isSource = currentLevel.sourceRows.includes(i);
      sources.push({ row: i, active: isSource, lit: false, isSpecial: false, litRockets: [] });
      rockets.push({ row: i, active: isSource, lit: false, isSpecial: false });
    }

    if (currentLevel.id >= 3) {
      injectSecretPaths(currentLevel);
    }

    timeRemaining = currentLevel.timeLimit;
    gameActive = true;
    timerEl.style.color = '';

    renderBoard();
    renderSideCols();
    updateTopBar();
    checkConnectivity();
    showScreen(gameScreen);
    startTimer();
  }

  // ===== Phase 3: 秘密路径注入 =====
  function injectSecretPaths(level) {
    const nonSourceRows = [];
    for (let r = 0; r < ROWS; r++) {
      if (!level.sourceRows.includes(r)) nonSourceRows.push(r);
    }
    if (nonSourceRows.length === 0) return;

    const secretCount = Math.min(nonSourceRows.length, 1 + Math.floor(Math.random() * 2));
    const shuffled = nonSourceRows.sort(() => Math.random() - 0.5);

    const pathCells = new Set();
    for (const sr of level.sourceRows) {
      for (let c = 0; c < COLS; c++) pathCells.add(sr * COLS + c);
    }

    for (let i = 0; i < secretCount; i++) {
      const secretRow = shuffled[i];
      rockets[secretRow].isSpecial = true;
      rockets[secretRow].active = true;
      sources[secretRow].active = true;

      for (let c = 0; c < COLS; c++) {
        const idx = secretRow * COLS + c;
        if (pathCells.has(idx)) continue;
        const rand = Math.random();
        if (rand < 0.4) {
          grid[idx].type = 'straight';
          grid[idx].rotation = 0;
        } else if (rand < 0.7) {
          grid[idx].type = 'tee';
          grid[idx].rotation = [0, 180, 270][Math.floor(Math.random() * 3)];
        } else {
          grid[idx].type = 'cross';
          grid[idx].rotation = 0;
        }
      }
    }
  }

  // ===== 渲染棋盘 =====
  function renderBoard() {
    boardEl.innerHTML = '';
    const cellSize = calcCellSize();
    document.documentElement.style.setProperty('--cell-size', cellSize + 'px');
    boardEl.style.gridTemplateColumns = `repeat(${COLS}, ${cellSize}px)`;
    boardEl.style.gridTemplateRows = `repeat(${ROWS}, ${cellSize}px)`;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = grid[r * COLS + c];
        const el = document.createElement('div');
        el.className = 'cell' + (cell.type === 'bridge' ? ' bridge-cell' : '');
        el.dataset.col = c;
        el.dataset.row = r;

        const svg = createPipeSVG(cell.type);
        svg.style.transform = `rotate(${cell.rotation}deg)`;
        el.appendChild(svg);

        el.addEventListener('click', () => onCellClick(cell, el));
        boardEl.appendChild(el);
      }
    }
  }

  // ===== 渲染侧栏（带颜色标记）=====
  function renderSideCols() {
    sourcesCol.innerHTML = '';
    rocketsCol.innerHTML = '';

    for (let r = 0; r < ROWS; r++) {
      const srcEl = document.createElement('div');
      srcEl.className = 'source-icon';
      if (sources[r].active) {
        const si = currentLevel.sourceRows.indexOf(r);
        const color = si >= 0 ? getSourceColor(si) : '#ff4444';
        srcEl.textContent = '\uD83D\uDD25';
        srcEl.id = `source-${r}`;
        srcEl.style.textShadow = `0 0 8px ${color}`;
        // 彩色标记点
        const dot = document.createElement('div');
        dot.className = 'source-color-dot';
        dot.style.background = color;
        srcEl.appendChild(dot);
      }
      sourcesCol.appendChild(srcEl);

      const rktEl = document.createElement('div');
      rktEl.className = 'rocket-icon';
      if (rockets[r].active) {
        const si = currentLevel.sourceRows.indexOf(r);
        const color = si >= 0 ? getSourceColor(si) : '#ffd700';
        rktEl.textContent = '\uD83D\uDE80';
        rktEl.id = `rocket-${r}`;
        rktEl.style.textShadow = `0 0 6px ${color}`;
        if (rockets[r].isSpecial) rktEl.classList.add('special');
        const dot = document.createElement('div');
        dot.className = 'source-color-dot';
        dot.style.background = color;
        rktEl.appendChild(dot);
      }
      rocketsCol.appendChild(rktEl);
    }
  }

  function updateTopBar() {
    levelInfo.textContent = `第 ${currentLevel.id} 关`;
    timerEl.textContent = `${timeRemaining}s`;
    scoreDisplay.textContent = `${totalScore} 分`;
  }

  // ===== 点击旋转（含动画和音效）=====
  function onCellClick(cell, el) {
    if (!gameActive) return;
    cell.rotation = (cell.rotation + 90) % 360;
    const svg = el.querySelector('svg');

    // 立即旋转SVG
    svg.style.transform = `rotate(${cell.rotation}deg)`;

    // 缩放动画
    el.classList.remove('rotating');
    void el.offsetWidth; // 触发reflow以重启动画
    el.classList.add('rotating');

    playSound('rotate');
    checkConnectivity();
  }

  // ===== 连通判定（带火源颜色追踪）=====
  function checkConnectivity() {
    // 重置
    grid.forEach(c => {
      c.connected = false;
      c.connectedSources.clear();
      c.hSourceIdx = -1;
      c.vSourceIdx = -1;
    });
    sources.forEach(s => { s.litRockets = []; });
    connectedPaths = {};

    for (let si = 0; si < currentLevel.sourceRows.length; si++) {
      const r = currentLevel.sourceRows[si];
      if (!sources[r].active) continue;

      const visited = new Set();
      const parent = {};
      const queue = [];

      const startCell = grid[r * COLS + 0];
      const startOpenings = getOpenings(startCell.type, startCell.rotation);
      if (startOpenings.includes('left')) {
        const stateKey = `${0},${r},left`;
        visited.add(stateKey);
        parent[stateKey] = null;
        queue.push({ col: 0, row: r, enteredFrom: 'left' });
        startCell.connected = true;
        startCell.connectedSources.add(si);
        markBridgeChannel(startCell, 'left', si);
      }

      const reachedRockets = [];

      while (queue.length > 0) {
        const cur = queue.shift();
        const curCell = grid[cur.row * COLS + cur.col];
        const curStateKey = `${cur.col},${cur.row},${cur.enteredFrom}`;
        const exits = getExits(curCell.type, curCell.rotation, cur.enteredFrom);

        for (const dir of exits) {
          const [dc, dr] = DIR_DELTA[dir];
          const nc = cur.col + dc;
          const nr = cur.row + dr;

          if (nc === COLS && dir === 'right') {
            if (rockets[cur.row].active) {
              if (!sources[r].litRockets.includes(cur.row)) {
                sources[r].litRockets.push(cur.row);
                reachedRockets.push({ rocketRow: cur.row, lastKey: curStateKey });
              }
            }
            continue;
          }

          if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;

          const neighborCell = grid[nr * COLS + nc];
          const neighborOpenings = getOpenings(neighborCell.type, neighborCell.rotation);
          const neighborEntryDir = OPPOSITE[dir];

          if (!neighborOpenings.includes(neighborEntryDir)) continue;

          const nStateKey = `${nc},${nr},${neighborEntryDir}`;
          if (visited.has(nStateKey)) continue;

          visited.add(nStateKey);
          parent[nStateKey] = curStateKey;
          queue.push({ col: nc, row: nr, enteredFrom: neighborEntryDir });
          neighborCell.connected = true;
          neighborCell.connectedSources.add(si);
          markBridgeChannel(neighborCell, neighborEntryDir, si);
        }
      }

      for (const { rocketRow, lastKey } of reachedRockets) {
        const path = [];
        let k = lastKey;
        while (k !== null) {
          const parts = k.split(',');
          const c = parseInt(parts[0]), ro = parseInt(parts[1]);
          if (path.length === 0 || path[0].col !== c || path[0].row !== ro) {
            path.unshift({ col: c, row: ro });
          }
          k = parent[k];
        }
        connectedPaths[`${r}->${rocketRow}`] = path;
      }
    }

    // 检测新连通并播放音效
    let newCount = 0;
    grid.forEach(c => { if (c.connected) newCount++; });
    if (gameActive && newCount > prevConnectedCount && prevConnectedCount > 0) {
      playSound('connect');
    }
    prevConnectedCount = newCount;

    updateCellVisuals();
  }

  // 记录bridge格子的通道归属
  function markBridgeChannel(cell, enteredFrom, sourceIdx) {
    if (cell.type !== 'bridge') return;
    // 判断实际入口方向对应的通道
    // bridge的通道始终是：水平(left↔right) 和 竖直(top↔bottom)
    // CSS旋转不影响逻辑通道
    if (enteredFrom === 'left' || enteredFrom === 'right') {
      cell.hSourceIdx = sourceIdx;
    } else {
      cell.vSourceIdx = sourceIdx;
    }
  }

  // ===== 更新格子视觉（含火源颜色）=====
  function updateCellVisuals() {
    const cells = boardEl.querySelectorAll('.cell');
    cells.forEach((el, i) => {
      const cell = grid[i];
      const dot = el.querySelector('.pipe-dot');
      const pipeLines = el.querySelectorAll('.pipe-line');

      if (cell.connected) {
        el.classList.add('connected');

        // 获取火源颜色
        const srcIndices = Array.from(cell.connectedSources);
        const primaryColor = srcIndices.length > 0 ? getSourceColor(srcIndices[0]) : '#00e5ff';

        // 设置背景色调
        if (srcIndices.length === 1) {
          el.style.background = hexToRgba(primaryColor, 0.12);
        } else if (srcIndices.length >= 2) {
          const c1 = hexToRgba(getSourceColor(srcIndices[0]), 0.15);
          const c2 = hexToRgba(getSourceColor(srcIndices[1]), 0.15);
          el.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
        }

        // 管道线条颜色
        if (cell.type === 'bridge') {
          // bridge：分别着色两个通道
          pipeLines.forEach(line => {
            const ch = line.dataset.channel;
            // 基础通道：h=水平线，v=竖直弧线
            // CSS旋转后：如果旋转了90°或270°，h和v视觉上互换
            // 但逻辑通道不变，所以颜色对应不变
            const rotSteps = (cell.rotation / 90) % 2; // 0或1
            let logicalCh = ch;
            if (rotSteps === 1) logicalCh = (ch === 'h') ? 'v' : 'h';

            if (logicalCh === 'h' && cell.hSourceIdx >= 0) {
              line.style.stroke = getSourceColor(cell.hSourceIdx);
              line.style.filter = `drop-shadow(0 0 4px ${hexToRgba(getSourceColor(cell.hSourceIdx), 0.5)})`;
            } else if (logicalCh === 'v' && cell.vSourceIdx >= 0) {
              line.style.stroke = getSourceColor(cell.vSourceIdx);
              line.style.filter = `drop-shadow(0 0 4px ${hexToRgba(getSourceColor(cell.vSourceIdx), 0.5)})`;
            } else {
              line.style.stroke = 'var(--pipe-color)';
              line.style.filter = '';
            }
          });
        } else {
          // 普通方块：所有线条用主色
          pipeLines.forEach(line => {
            line.style.stroke = primaryColor;
            line.style.filter = `drop-shadow(0 0 4px ${hexToRgba(primaryColor, 0.5)})`;
          });
          if (dot) {
            dot.setAttribute('fill', primaryColor);
          }
        }
      } else {
        el.classList.remove('connected');
        el.style.background = '';
        pipeLines.forEach(line => {
          line.style.stroke = '';
          line.style.filter = '';
        });
        if (dot) dot.setAttribute('fill', 'var(--pipe-color)');
      }
    });
  }

  // hex颜色转rgba
  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function getCellEl(col, row) {
    return boardEl.querySelector(`.cell[data-col="${col}"][data-row="${row}"]`);
  }

  // ===== 计时器 =====
  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (!gameActive) return;
      timeRemaining--;
      timerEl.textContent = `${timeRemaining}s`;
      if (timeRemaining <= 10) {
        timerEl.style.color = 'var(--source-color)';
      }
      if (timeRemaining <= 0) {
        triggerSettlement();
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  // ===== 结算逻辑 =====
  function triggerSettlement() {
    gameActive = false;
    stopTimer();

    const remainingSeconds = Math.max(0, timeRemaining);
    checkConnectivity();

    const rocketClaims = {};
    for (let r = 0; r < ROWS; r++) {
      if (!sources[r].active) continue;
      for (const rocketRow of sources[r].litRockets) {
        if (!rocketClaims[rocketRow]) rocketClaims[rocketRow] = [];
        rocketClaims[rocketRow].push({
          sourceRow: r,
          totalConnected: sources[r].litRockets.length
        });
      }
    }

    const finalSourceRockets = {};
    for (const [rocketRow, claimants] of Object.entries(rocketClaims)) {
      claimants.sort((a, b) => {
        if (b.totalConnected !== a.totalConnected) return b.totalConnected - a.totalConnected;
        return b.sourceRow - a.sourceRow;
      });
      const winner = claimants[0].sourceRow;
      if (!finalSourceRockets[winner]) finalSourceRockets[winner] = [];
      finalSourceRockets[winner].push(parseInt(rocketRow));
    }

    let fireScore = 0;
    let litCount = 0;
    const scoreLines = [];
    const litRocketSet = new Set();
    const trailPaths = [];

    for (let r = ROWS - 1; r >= 0; r--) {
      if (!sources[r].active) continue;
      const rocketList = finalSourceRockets[r] || [];
      const N = rocketList.length;
      if (N > 0) {
        const pts = N * 100 * N;
        fireScore += pts;
        litCount += N;
        rocketList.forEach(rr => {
          litRocketSet.add(rr);
          const pathKey = `${r}->${rr}`;
          if (connectedPaths[pathKey]) {
            trailPaths.push({ sourceRow: r, rocketRow: rr, path: connectedPaths[pathKey] });
          }
        });
        const bonusText = N > 1 ? ` (${N}×100×${N})` : '';
        scoreLines.push(`火源 第${r + 1}行：连通${N}个火箭 → ${pts}分${bonusText}`);
        sources[r].lit = true;
      } else {
        scoreLines.push(`火源 第${r + 1}行：未连通`);
      }
    }

    const timeBonus = remainingSeconds * currentLevel.id;
    totalScore = fireScore + timeBonus;

    animateFireTrails(trailPaths, litRocketSet, () => {
      const threshold = PASS_THRESHOLDS[currentLevelIndex];
      let passed = false;
      let thresholdText = '';

      if (threshold.type === 'count') {
        passed = litCount > currentLevel.rows * threshold.value;
        thresholdText = `需点燃 > ${Math.floor(currentLevel.rows * threshold.value)} 个火箭（已点燃 ${litCount} 个）`;
      } else {
        const required = Math.ceil(currentLevel.rows * 100 * threshold.multiplier);
        passed = totalScore >= required;
        thresholdText = `需总分 >= ${required}（当前 ${totalScore} 分）`;
      }

      showResult(passed, scoreLines, fireScore, timeBonus, totalScore, thresholdText);
    });
  }

  // ===== 火焰传播动画（含音效）=====
  function animateFireTrails(trailPaths, litRocketSet, callback) {
    if (trailPaths.length === 0) {
      setTimeout(callback, 300);
      return;
    }

    let trailIdx = 0;
    function nextTrail() {
      if (trailIdx >= trailPaths.length) {
        setTimeout(callback, 500);
        return;
      }

      const { sourceRow, rocketRow, path } = trailPaths[trailIdx];
      const si = currentLevel.sourceRows.indexOf(sourceRow);
      const color = si >= 0 ? getSourceColor(si) : '#ff6600';

      const srcEl = document.getElementById(`source-${sourceRow}`);
      if (srcEl) srcEl.classList.add('lit');

      let cellIdx = 0;
      function lightNextCell() {
        if (cellIdx >= path.length) {
          rockets[rocketRow].lit = true;
          const rktEl = document.getElementById(`rocket-${rocketRow}`);
          if (rktEl) {
            rktEl.classList.add('lit');
            spawnSmallFirework(rktEl, color);
            playSound('firework_small');
          }
          trailIdx++;
          setTimeout(nextTrail, 300);
          return;
        }

        const { col, row } = path[cellIdx];
        const cellEl = getCellEl(col, row);
        if (cellEl) {
          cellEl.style.boxShadow = `0 0 16px ${hexToRgba(color, 0.7)}, inset 0 0 8px ${hexToRgba(color, 0.3)}`;
          setTimeout(() => { cellEl.style.boxShadow = ''; }, 400);
          playSound('trail');
        }
        cellIdx++;
        setTimeout(lightNextCell, 50);
      }

      lightNextCell();
    }

    nextTrail();
  }

  // ===== 小烟花 =====
  function spawnSmallFirework(anchor, color) {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const colors = [color || '#ffd700', '#ffffff', lightenColor(color || '#ffd700', 40)];

    for (let i = 0; i < 14; i++) {
      const p = document.createElement('div');
      p.className = 'firework-particle';
      const angle = (Math.PI * 2 * i) / 14 + Math.random() * 0.2;
      const dist = 30 + Math.random() * 50;
      p.style.left = cx + 'px';
      p.style.top = cy + 'px';
      p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
      p.style.background = colors[i % colors.length];
      p.style.animation = 'particle-fly 0.9s ease-out forwards';
      p.style.boxShadow = `0 0 4px ${colors[i % colors.length]}`;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 900);
    }
  }

  // ===== 大烟花 =====
  function spawnBigFirework() {
    playSound('firework_big');
    const allColors = SOURCE_COLORS.slice(0, currentLevel.rows);
    for (let burst = 0; burst < 6; burst++) {
      setTimeout(() => {
        const cx = 50 + Math.random() * (window.innerWidth - 100);
        const cy = 50 + Math.random() * (window.innerHeight * 0.5);
        const burstColor = allColors[burst % allColors.length];
        for (let i = 0; i < 24; i++) {
          const p = document.createElement('div');
          p.className = 'firework-particle';
          const angle = (Math.PI * 2 * i) / 24 + Math.random() * 0.2;
          const dist = 50 + Math.random() * 90;
          p.style.left = cx + 'px';
          p.style.top = cy + 'px';
          p.style.width = '8px';
          p.style.height = '8px';
          p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
          p.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
          p.style.background = i % 2 === 0 ? burstColor : '#fff';
          p.style.boxShadow = `0 0 6px ${burstColor}`;
          p.style.animation = 'particle-fly 1.5s ease-out forwards';
          document.body.appendChild(p);
          setTimeout(() => p.remove(), 1500);
        }
        if (burst > 0) playSound('firework_small');
      }, burst * 400);
    }
  }

  function lightenColor(hex, amount) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    r = Math.min(255, r + amount);
    g = Math.min(255, g + amount);
    b = Math.min(255, b + amount);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  // ===== 显示结算结果 =====
  function showResult(passed, scoreLines, fireScore, timeBonus, total, thresholdText) {
    resultTitle.textContent = passed ? '过关！' : '未过关';
    resultTitle.className = passed ? 'pass' : 'fail';

    let html = scoreLines.join('\n') + '\n';
    html += `\n连通得分：${fireScore} 分`;
    html += `\n时间奖励：${Math.max(0, timeRemaining)}s × 第${currentLevel.id}关 = ${timeBonus} 分`;
    html += `\n<span class="total-line">总分：${total} 分</span>`;
    html += `\n\n${thresholdText}`;

    resultDetails.innerHTML = html;
    resultButtons.innerHTML = '';

    if (passed) {
      spawnBigFirework();
      if (currentLevelIndex < LEVELS.length - 1) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        btn.textContent = '下一关';
        btn.addEventListener('click', () => { showScreen(gameScreen); loadLevel(currentLevelIndex + 1); });
        resultButtons.appendChild(btn);
      } else {
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        btn.textContent = '通关！再来一次';
        btn.addEventListener('click', () => { showScreen(gameScreen); loadLevel(0); });
        resultButtons.appendChild(btn);
      }
    }

    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn';
    retryBtn.textContent = '重玩本关';
    retryBtn.addEventListener('click', () => { showScreen(gameScreen); loadLevel(currentLevelIndex); });
    resultButtons.appendChild(retryBtn);

    showScreen(resultScreen);
  }

  // ===== 事件绑定 =====
  document.getElementById('btn-start').addEventListener('click', () => {
    initAudio();
    if (bgmEnabled) startBGM();
    loadLevel(0);
  });

  document.getElementById('btn-restart').addEventListener('click', () => {
    stopTimer();
    loadLevel(currentLevelIndex);
  });

  document.getElementById('btn-ignite').addEventListener('click', () => {
    if (gameActive) triggerSettlement();
  });

  document.getElementById('btn-menu').addEventListener('click', () => {
    stopTimer();
    stopBGM();
    gameActive = false;
    timerEl.style.color = '';
    showScreen(startScreen);
  });

  soundButton.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    updateAudioButtons();
  });

  bgmButton.addEventListener('click', () => {
    if (!audioCtx) initAudio();
    bgmEnabled = !bgmEnabled;
    if (bgmEnabled) {
      startBGM();
    } else {
      stopBGM();
    }
    updateAudioButtons();
  });

  document.getElementById('game-area').addEventListener('touchmove', (e) => {
    e.preventDefault();
  }, { passive: false });

  updateAudioButtons();

  window.addEventListener('resize', () => {
    if (gameScreen.classList.contains('active') && grid.length > 0) {
      renderBoard();
      checkConnectivity();
    }
  });

})();
