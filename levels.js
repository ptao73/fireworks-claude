// levels.js — 关卡生成

// 管道方向工具函数（与game.js一致，用于关卡生成验证）
const _DIR_ROT = { top: 'right', right: 'bottom', bottom: 'left', left: 'top' };
const _OPP = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const _BASE = {
  straight: ['top', 'bottom'],
  corner: ['top', 'right'],
  tee: ['top', 'right', 'bottom'],
  cross: ['top', 'right', 'bottom', 'left'],
  bridge: ['top', 'right', 'bottom', 'left']
};

function _getOpenings(type, rotation) {
  const steps = rotation / 90;
  return _BASE[type].map(d => {
    let r = d;
    for (let i = 0; i < steps; i++) r = _DIR_ROT[r];
    return r;
  });
}

// 根据需要的开口方向，找到最简单的方块类型和旋转
function _findTileForOpenings(neededSet) {
  const needed = Array.from(neededSet);
  for (const type of ['straight', 'corner', 'tee', 'cross']) {
    for (const rot of [0, 90, 180, 270]) {
      const openings = _getOpenings(type, rot);
      if (needed.every(d => openings.includes(d))) {
        return [type, rot];
      }
    }
  }
  return ['cross', 0];
}

// 根据入口和出口方向确定方块
function _tileForDirs(entryDir, exitDir) {
  if (_OPP[entryDir] === exitDir) {
    return (entryDir === 'left' || entryDir === 'right')
      ? ['straight', 90] : ['straight', 0];
  }
  const cornerMap = {
    'top,right': 0, 'right,top': 0,
    'right,bottom': 90, 'bottom,right': 90,
    'bottom,left': 180, 'left,bottom': 180,
    'left,top': 270, 'top,left': 270
  };
  const rot = cornerMap[`${entryDir},${exitDir}`];
  return ['corner', rot !== undefined ? rot : 0];
}

function _ensureCrossTile(grid, preferredIndices) {
  const hasBridge = grid.some(cell => cell && cell[0] === 'bridge');
  const hasCross = grid.some(cell => cell && cell[0] === 'cross');
  if (!hasBridge || hasCross) return;

  for (const idx of preferredIndices) {
    if (grid[idx] && grid[idx][0] !== 'bridge') {
      grid[idx] = ['cross', 0];
      return;
    }
  }

  for (const type of ['tee', 'straight', 'corner']) {
    const idx = grid.findIndex(cell => cell && cell[0] === type);
    if (idx !== -1) {
      grid[idx] = ['cross', 0];
      return;
    }
  }
}

/**
 * 生成有解关卡
 * 每条路径至少4次转弯（U型迂回），保证每个火箭可达
 * 路径交叉处使用bridge方块
 */
function generateSolvableLevel(id, rows, timeLimit) {
  const COLS = 6;
  const GRID_ROWS = 10;

  // 火源行
  const sourceRows = [];
  const spacing = GRID_ROWS / rows;
  for (let i = 0; i < rows; i++) {
    sourceRows.push(Math.floor(i * spacing + spacing / 2));
  }

  // 为每个火源分配迂回行
  // 当所有行都是火源（rows=10）时，允许迂回到其他火源行（路径交叉用bridge/tee处理）
  const detourRows = [];
  const usedDetour = new Set();
  for (let si = 0; si < sourceRows.length; si++) {
    const r = sourceRows[si];
    // 候选迂回行：优先选未被占用的相邻行
    const candidates = [];
    for (const offset of [1, -1, 2, -2, 3, -3, 4, -4]) {
      const dr = r + offset;
      if (dr >= 0 && dr < GRID_ROWS && !usedDetour.has(dr) && dr !== r) {
        candidates.push(dr);
      }
    }
    let chosen;
    if (candidates.length > 0) {
      chosen = candidates[0];
    } else {
      // 所有行都被占用——允许复用，但选一个距离最远的以减少冲突
      const allRows = [];
      for (let dr = 0; dr < GRID_ROWS; dr++) {
        if (dr !== r) allRows.push(dr);
      }
      allRows.sort((a, b) => Math.abs(b - r) - Math.abs(a - r));
      chosen = allRows[si % allRows.length]; // 用si索引分散选择
    }
    detourRows.push(chosen);
    usedDetour.add(chosen);
  }

  // 转弯列对——交替使用不同列对来减少冲突
  const colPairOptions = [[1, 4], [2, 3], [1, 3], [2, 4]];

  // 生成每条路径（U型迂回：右→竖→右→竖→右，共4个转弯）
  const allPaths = [];
  for (let si = 0; si < sourceRows.length; si++) {
    const r = sourceRows[si];
    const dr = detourRows[si];
    const [tc1, tc2] = colPairOptions[si % colPairOptions.length];
    const vs = dr > r ? 1 : -1; // 竖直方向

    const path = [];
    // 段1：(0,r) → (tc1,r) 水平向右
    for (let c = 0; c <= tc1; c++) path.push({ col: c, row: r });
    // 段2：(tc1, r±1) → (tc1, dr) 竖直
    for (let row = r + vs; ; row += vs) {
      path.push({ col: tc1, row: row });
      if (row === dr) break;
    }
    // 段3：(tc1+1, dr) → (tc2, dr) 水平向右
    for (let c = tc1 + 1; c <= tc2; c++) path.push({ col: c, row: dr });
    // 段4：(tc2, dr∓1) → (tc2, r) 竖直返回
    for (let row = dr - vs; ; row -= vs) {
      path.push({ col: tc2, row: row });
      if (row === r) break;
    }
    // 段5：(tc2+1, r) → (5, r) 水平向右
    for (let c = tc2 + 1; c < COLS; c++) path.push({ col: c, row: r });

    allPaths.push(path);
  }

  // 构建每个格子的路径使用记录
  // key "col,row" → [{entryDir, exitDir, pathIdx}]
  const cellMap = {};
  for (let pi = 0; pi < allPaths.length; pi++) {
    const path = allPaths[pi];
    for (let si = 0; si < path.length; si++) {
      const { col, row } = path[si];
      const key = `${col},${row}`;

      let entryDir, exitDir;
      if (si === 0) {
        entryDir = 'left';
      } else {
        const p = path[si - 1];
        entryDir = p.col < col ? 'left' : p.col > col ? 'right' : p.row < row ? 'top' : 'bottom';
      }
      if (si === path.length - 1) {
        exitDir = 'right';
      } else {
        const n = path[si + 1];
        exitDir = n.col > col ? 'right' : n.col < col ? 'left' : n.row > row ? 'bottom' : 'top';
      }

      if (!cellMap[key]) cellMap[key] = [];
      cellMap[key].push({ entryDir, exitDir, pathIdx: pi });
    }
  }

  // 为路径上的格子确定方块类型
  const grid = new Array(COLS * GRID_ROWS).fill(null);

  for (const [key, entries] of Object.entries(cellMap)) {
    const [c, r] = key.split(',').map(Number);
    const idx = r * COLS + c;

    if (entries.length === 1) {
      // 单路径经过
      grid[idx] = _tileForDirs(entries[0].entryDir, entries[0].exitDir);
    } else {
      // 多路径经过——判断是否为纯直交叉（用bridge）还是连通交叉
      const allStraightThrough = entries.every(e => _OPP[e.entryDir] === e.exitDir);
      const axes = new Set(entries.map(e =>
        (e.entryDir === 'left' || e.entryDir === 'right') ? 'h' : 'v'
      ));
      const isPerpendicular = axes.size === 2; // 有水平也有竖直

      if (allStraightThrough && isPerpendicular) {
        // 两条直线垂直交叉 → bridge（立交桥）
        grid[idx] = ['bridge', 0];
      } else {
        // 收集所有需要的开口方向，找最小方块
        const neededDirs = new Set();
        entries.forEach(e => { neededDirs.add(e.entryDir); neededDirs.add(e.exitDir); });
        grid[idx] = _findTileForOpenings(neededDirs);
      }
    }
  }

  // ===== 一火多连：在相邻火源路径之间插入分支连接 =====
  // 在最后一列(col=5)附近，用tee方块将相邻火源行连通
  // 这样玩家旋转正确时，一个火源可以连通多个火箭
  const branchCol = 5; // 最后一列，靠近火箭出口
  for (let si = 0; si < sourceRows.length - 1; si++) {
    if (Math.random() < 0.5) continue; // 50%概率创建分支
    const r1 = sourceRows[si];
    const r2 = sourceRows[si + 1];
    if (Math.abs(r2 - r1) > 3) continue; // 距离太远则跳过

    const branchKey1 = `${branchCol},${r1}`;
    const branchKey2 = `${branchCol},${r2}`;
    const idx1 = r1 * COLS + branchCol;
    const idx2 = r2 * COLS + branchCol;

    // 将火源行最后一格升级为tee（朝向相邻行方向有开口）
    if (grid[idx1]) {
      const existingOpenings = new Set(_getOpenings(grid[idx1][0], grid[idx1][1]));
      existingOpenings.add('left');
      existingOpenings.add('right');
      existingOpenings.add(r2 > r1 ? 'bottom' : 'top');
      grid[idx1] = _findTileForOpenings(existingOpenings);
    }
    if (grid[idx2]) {
      const existingOpenings = new Set(_getOpenings(grid[idx2][0], grid[idx2][1]));
      existingOpenings.add('left');
      existingOpenings.add('right');
      existingOpenings.add(r1 > r2 ? 'bottom' : 'top');
      grid[idx2] = _findTileForOpenings(existingOpenings);
    }

    // 在两行之间的格子放直通管道（竖直方向）
    const minR = Math.min(r1, r2);
    const maxR = Math.max(r1, r2);
    for (let mr = minR + 1; mr < maxR; mr++) {
      const midIdx = mr * COLS + branchCol;
      if (!grid[midIdx] || !cellMap[`${branchCol},${mr}`]) {
        // 空格子放竖直直通
        grid[midIdx] = ['straight', 0];
      } else {
        // 已有路径经过，升级为cross或tee
        const existingOpenings = new Set(_getOpenings(grid[midIdx][0], grid[midIdx][1]));
        existingOpenings.add('top');
        existingOpenings.add('bottom');
        grid[midIdx] = _findTileForOpenings(existingOpenings);
      }
    }
  }

  // 填充空白格子（随机4种普通方块）
  const types = ['straight', 'corner', 'tee', 'cross'];
  const rots = [0, 90, 180, 270];
  const randomFillIndices = [];
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === null) {
      randomFillIndices.push(i);
      grid[i] = [types[Math.floor(Math.random() * types.length)], rots[Math.floor(Math.random() * 4)]];
    }
  }

  // bridge 引入后，仍然保证关卡里保留至少一个 cross，避免第五种方块把 cross 完全挤掉。
  _ensureCrossTile(grid, randomFillIndices);

  // 打乱旋转角度（bridge和cross不打乱，分支连接的tee也保留正确朝向但有概率打乱）
  for (let i = 0; i < grid.length; i++) {
    const [type] = grid[i];
    if (type === 'bridge' || type === 'cross') continue;
    if (Math.random() < 0.75) {
      grid[i] = [grid[i][0], rots[Math.floor(Math.random() * 4)]];
    }
  }

  return { id, timeLimit, rows, sourceRows, grid };
}

// 关卡参数配置
const LEVELS = [
  { id: 1, rows: 3, timeLimit: 60 },
  { id: 2, rows: 4, timeLimit: 120 },
  { id: 3, rows: 5, timeLimit: 180 },
  { id: 4, rows: 6, timeLimit: 240 },
  { id: 5, rows: 6, timeLimit: 300 },
  { id: 6, rows: 7, timeLimit: 360 },
  { id: 7, rows: 8, timeLimit: 420 },
  { id: 8, rows: 8, timeLimit: 480 },
  { id: 9, rows: 9, timeLimit: 540 },
  { id: 10, rows: 10, timeLimit: 600 },
];

// 过关门槛
const PASS_THRESHOLDS = [
  { type: 'count', value: 0.6 },
  { type: 'count', value: 0.6 },
  { type: 'score', multiplier: 1.3 },
  { type: 'score', multiplier: 1.3 },
  { type: 'score', multiplier: 1.3 },
  { type: 'score', multiplier: 1.3 },
  { type: 'score', multiplier: 1.3 },
  { type: 'score', multiplier: 1.3 },
  { type: 'score', multiplier: 1.3 },
  { type: 'score', multiplier: 1.3 },
];
