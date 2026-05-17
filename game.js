'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
const TILE = 32;          // px per tile
const COLS = 21;
const ROWS = 23;
const FPS  = 60;

const T = { WALL:0, PATH:1, FRUIT:2, POWERUP:3, PSTART:4, ESTART:5 };
const DIR = { NONE:{x:0,y:0}, RIGHT:{x:1,y:0}, LEFT:{x:-1,y:0}, UP:{x:0,y:-1}, DOWN:{x:0,y:1} };

// Tile types for shorthand
const W=T.WALL, P=T.PATH, F=T.FRUIT, U=T.POWERUP, S=T.PSTART, E=T.ESTART;

// 21×23 maze  (row 0 = top)
const MAZE_TEMPLATE = [
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  [W,F,F,F,F,F,W,F,F,F,F,F,F,F,W,F,F,F,F,F,W],
  [W,U,W,W,F,W,W,F,W,W,W,W,W,F,W,W,F,W,W,U,W],
  [W,F,W,W,F,W,W,F,W,W,W,W,W,F,W,W,F,W,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,F,W,F,W,W,P,W,P,W,W,F,W,F,W,W,F,W],
  [W,F,F,F,F,W,F,F,F,P,W,P,F,F,F,W,F,F,F,F,W],
  [W,W,W,W,F,W,W,W,P,P,P,P,P,W,W,W,F,W,W,W,W],
  [P,P,P,W,F,W,P,P,P,E,E,P,P,P,W,P,F,W,P,P,P],
  [W,W,W,W,F,W,W,W,P,E,E,E,P,W,W,W,F,W,W,W,W],
  [W,F,F,F,F,F,F,F,P,P,P,P,P,F,F,F,F,F,F,F,W],
  [W,F,W,W,F,W,F,W,W,P,W,P,W,W,F,W,F,W,W,F,W],
  [W,F,F,W,F,F,F,F,F,F,W,F,F,F,F,F,F,W,F,F,W],
  [W,W,F,W,F,W,W,W,W,F,W,F,W,W,W,W,F,W,F,W,W],
  [W,F,F,F,F,F,F,F,F,F,W,F,F,F,F,F,F,F,F,F,W],
  [W,F,W,W,F,W,W,F,W,W,W,W,W,F,W,W,F,W,W,F,W],
  [W,U,F,F,F,F,F,F,F,F,S,F,F,F,F,F,F,F,F,U,W],
  [W,F,W,F,W,W,F,W,F,W,W,W,F,W,F,W,W,F,W,F,W],
  [W,F,F,F,F,F,F,W,F,F,F,F,F,W,F,F,F,F,F,F,W],
  [W,F,W,W,W,F,W,W,W,F,W,F,W,W,W,F,W,W,W,F,W],
  [W,F,F,F,F,F,F,F,F,F,W,F,F,F,F,F,F,F,F,F,W],
  [W,W,F,W,F,W,F,W,W,F,W,F,W,W,F,W,F,W,F,W,W],
  [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
];

const POWERUP_NAMES = ['', 'x2 Points!', 'Freeze!', 'Enemy Wipe!', 'x5 Points!'];
const POWERUP_COLORS= ['', '#ffe066',   '#66eeff',  '#ff66aa',     '#ff9933'];

// Map each POWERUP tile (row,col) → power-up index 1-4, assigned in reading order
const POWERUP_TILE_MAP = (() => {
  const m = {}; let i = 0;
  for (let r = 0; r < MAZE_TEMPLATE.length; r++)
    for (let c = 0; c < MAZE_TEMPLATE[r].length; c++)
      if (MAZE_TEMPLATE[r][c] === T.POWERUP) m[`${r},${c}`] = (i++ % 4) + 1;
  return m;
})();

// ── Asset Loader ─────────────────────────────────────────────────────────────
async function loadAssets() {
  const images = {};
  const load = (key, src) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { images[key] = img; res(); };
    img.onerror = () => { console.warn('Missing:', src); images[key] = null; res(); };
    img.src = src;
  });
  const tasks = [];
  for (let i = 1; i <= 8; i++) tasks.push(load(`char${i}`, `assets/character/frame_0${i}.png`));
  for (let i = 1; i <= 4; i++) tasks.push(load(`e1_${i}`, `assets/enemy1/frame_0${i}.png`));
  for (let i = 1; i <= 4; i++) tasks.push(load(`e2_${i}`, `assets/enemy2/frame_0${i}.png`));
  for (let i = 1; i <= 9; i++) tasks.push(load(`fruit${i}`, `assets/fruits/0${i}.png`));
  for (let i = 1; i <= 4; i++) tasks.push(load(`pu${i}`, `assets/powerups/0${i}.png`));
  await Promise.all(tasks);
  return images;
}

// ── Utilities ────────────────────────────────────────────────────────────────
function cloneGrid(template) {
  return template.map(row => [...row]);
}

function findTiles(grid, type) {
  const found = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (grid[r][c] === type) found.push({r, c});
  return found;
}

// BFS shortest path direction
function bfsDir(grid, from, to) {
  if (from.r === to.r && from.c === to.c) return DIR.NONE;
  const visited = Array.from({length: ROWS}, () => new Array(COLS).fill(false));
  const prev    = Array.from({length: ROWS}, () => new Array(COLS).fill(null));
  const queue   = [{r: from.r, c: from.c}];
  visited[from.r][from.c] = true;
  const DIRS = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];
  let found = false;
  while (queue.length && !found) {
    const cur = queue.shift();
    for (const d of DIRS) {
      const nr = cur.r + d.y, nc = cur.c + d.x;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (visited[nr][nc]) continue;
      if (grid[nr][nc] === T.WALL) continue;
      visited[nr][nc] = true;
      prev[nr][nc] = {r: cur.r, c: cur.c, d};
      if (nr === to.r && nc === to.c) { found = true; break; }
      queue.push({r: nr, c: nc});
    }
  }
  if (!found) return DIR.NONE;
  // trace back to first step from `from`
  let node = {r: to.r, c: to.c};
  while (prev[node.r][node.c] && !(prev[node.r][node.c].r === from.r && prev[node.r][node.c].c === from.c))
    node = prev[node.r][node.c];
  return prev[node.r][node.c]?.d ?? DIR.NONE;
}

function lerp(a, b, t) { return a + (b - a) * t; }

function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Floating text ────────────────────────────────────────────────────────────
class FloatText {
  constructor(text, x, y, color = '#fff') {
    this.text = text; this.x = x; this.y = y; this.color = color;
    this.life = 1.2; // seconds
    this.age  = 0;
  }
  update(dt) { this.age += dt; this.y -= 28 * dt; }
  get dead() { return this.age >= this.life; }
  draw(ctx) {
    const alpha = Math.max(0, 1 - this.age / this.life);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = this.color;
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 4;
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

// ── Player ───────────────────────────────────────────────────────────────────
class Player {
  constructor(startR, startC) {
    this.startR = startR; this.startC = startC;
    this.reset(true);
  }
  reset(fullReset = false) {
    this.tileR = this.startR; this.tileC = this.startC;
    this.px = this.tileC * TILE + TILE / 2;
    this.py = this.tileR * TILE + TILE / 2;
    this.dir = DIR.NONE;
    this.nextDir = DIR.NONE;
    this.speed = 5;
    this.moving = false;
    this.frameIndex = 0;
    this.frameTimer = 0;
    this.dead = false;
    this.deathTimer = 0;
    if (fullReset) this.lives = 3;
  }
  setDir(d) { this.nextDir = d; }

  update(dt, grid) {
    if (this.dead) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.reset(); // keeps current lives
      return;
    }

    const targetX = this.tileC * TILE + TILE / 2;
    const targetY = this.tileR * TILE + TILE / 2;
    const dx = targetX - this.px, dy = targetY - this.py;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const step = this.speed * TILE * dt;

    if (dist < step + 1) {
      // Snap to tile centre
      this.px = targetX; this.py = targetY;
      // Try to switch to queued direction first
      const tryDir = (d) => {
        if (d === DIR.NONE) return false;
        const nr = this.tileR + d.y, nc = this.tileC + d.x;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return false;
        if (grid[nr][nc] === T.WALL) return false;
        this.dir = d; this.tileR = nr; this.tileC = nc; this.moving = true;
        return true;
      };
      if (!tryDir(this.nextDir)) tryDir(this.dir);
      this.moving = this.dir !== DIR.NONE && !(this.px === this.tileC*TILE+TILE/2 && this.py === this.tileR*TILE+TILE/2);
    } else {
      this.px += (dx / dist) * step;
      this.py += (dy / dist) * step;
      this.moving = true;
    }

    if (this.moving) {
      this.frameTimer += dt;
      if (this.frameTimer >= 1/12) { this.frameTimer = 0; this.frameIndex = (this.frameIndex + 1) % 8; }
    } else {
      this.frameIndex = 0;
    }
  }

  draw(ctx, images, shake) {
    if (this.dead) return;
    const img = images[`char${this.frameIndex + 1}`];
    if (!img) {
      ctx.fillStyle = '#ff0';
      ctx.beginPath();
      ctx.arc(this.px + shake.x, this.py + shake.y, TILE * 0.4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.save();
    ctx.translate(this.px + shake.x, this.py + shake.y);
    // rotate to face direction
    const angle = this.dir === DIR.RIGHT ? 0
                : this.dir === DIR.DOWN  ? Math.PI/2
                : this.dir === DIR.LEFT  ? Math.PI
                : this.dir === DIR.UP    ? -Math.PI/2
                : 0;
    ctx.rotate(angle);
    const s = TILE * 1.1;
    ctx.drawImage(img, -s/2, -s/2, s, s);
    ctx.restore();
  }

  get tilePos() { return {r: this.tileR, c: this.tileC}; }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.deathTimer = 1.5;
    this.lives--;
    this.dir = DIR.NONE; this.nextDir = DIR.NONE;
  }
}

// ── Enemy ────────────────────────────────────────────────────────────────────
class Enemy {
  constructor(startR, startC, type) {
    this.startR = startR; this.startC = startC; this.type = type; // 1 or 2
    this.reset();
  }
  reset() {
    this.tileR = this.startR; this.tileC = this.startC;
    this.px = this.tileC * TILE + TILE / 2;
    this.py = this.tileR * TILE + TILE / 2;
    this.dir = DIR.DOWN;
    this.speed = 3.8;
    this.frameIndex = 0;
    this.frameTimer = 0;
    this.state = 'NORMAL'; // NORMAL | FROZEN | WIPED
    this.stateTimer = 0;
    this.moveCooldown = 0;
  }

  setState(s, duration) {
    this.state = s;
    this.stateTimer = duration;
  }

  update(dt, grid, player, scatter = false) {
    if (this.state === 'WIPED') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) { this.reset(); }
      return;
    }
    if (this.state === 'FROZEN') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) this.state = 'NORMAL';
      return;
    }

    const targetX = this.tileC * TILE + TILE / 2;
    const targetY = this.tileR * TILE + TILE / 2;
    const dx = targetX - this.px, dy = targetY - this.py;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const step = this.speed * TILE * dt;

    if (dist < step + 1) {
      this.px = targetX; this.py = targetY;
      // During grace period enemies scatter (move away from player)
      let target;
      if (scatter) {
        target = {
          r: Math.max(0, Math.min(ROWS-1, 2 * this.tileR - player.tileR)),
          c: Math.max(0, Math.min(COLS-1, 2 * this.tileC - player.tileC)),
        };
      } else if (this.type === 2) {
        target = {
          r: Math.max(0, Math.min(ROWS-1, player.tileR + player.dir.y * 4)),
          c: Math.max(0, Math.min(COLS-1, player.tileC + player.dir.x * 4)),
        };
      } else {
        target = {r: player.tileR, c: player.tileC};
      }
      const d = bfsDir(grid, {r: this.tileR, c: this.tileC}, target);
      if (d !== DIR.NONE) {
        const nr = this.tileR + d.y, nc = this.tileC + d.x;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && grid[nr][nc] !== T.WALL) {
          this.dir = d; this.tileR = nr; this.tileC = nc;
        }
      }
    } else {
      this.px += (dx / dist) * step;
      this.py += (dy / dist) * step;
    }

    this.frameTimer += dt;
    if (this.frameTimer >= 1/8) { this.frameTimer = 0; this.frameIndex = (this.frameIndex + 1) % 4; }
  }

  draw(ctx, images) {
    if (this.state === 'WIPED') return;
    const prefix = this.type === 1 ? 'e1_' : 'e2_';
    const img = images[`${prefix}${this.frameIndex + 1}`];
    const alpha = this.state === 'FROZEN' ? 0.55 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (this.state === 'FROZEN') {
      ctx.filter = 'hue-rotate(180deg) saturate(1.5)';
    }
    if (!img) {
      ctx.fillStyle = this.type === 1 ? '#f66' : '#a66ff5';
      ctx.beginPath();
      ctx.arc(this.px, this.py, TILE * 0.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const s = TILE * 1.15;
      ctx.drawImage(img, this.px - s/2, this.py - s/2, s, s);
    }
    ctx.restore();
  }

  get tilePos() { return {r: this.tileR, c: this.tileC}; }

  collidesWithPlayer(player) {
    if (this.state === 'WIPED') return false;
    const pr = Math.round((player.py - TILE/2) / TILE);
    const pc = Math.round((player.px - TILE/2) / TILE);
    return pr === this.tileR && pc === this.tileC;
  }
}

// ── Game ─────────────────────────────────────────────────────────────────────
class Game {
  constructor(canvas, images) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.images = images;
    this.state  = 'MENU'; // MENU | PLAYING | PAUSED | LEVELCLEAR | GAMEOVER
    this.score  = 0;
    this.level  = 1;
    this.highScore = parseInt(localStorage.getItem('fruitMunchHigh') || '0');
    this.multiplier = 1;
    this.multiplierTimer = 0;
    this.multiplierDuration = 0;
    this.activePowerupIdx = 0;
    this.floatTexts = [];
    this.shake = {x:0, y:0, timer:0};
    this.gracePeriod = 0; // seconds enemies wander before chasing
    this.stars = Array.from({length: 60}, () => ({
      x: Math.random() * COLS * TILE,
      y: Math.random() * ROWS * TILE,
      r: Math.random() * 1.5 + 0.5,
      blink: Math.random() * Math.PI * 2,
    }));

    this._initMaze();
    this._initEntities();
    this._bindInput();
    this._updateHUD();
    this._loop(0);
  }

  _initMaze() {
    this.grid = cloneGrid(MAZE_TEMPLATE);
    // Assign random fruit sprites to FRUIT tiles
    this.fruitSprite = Array.from({length: ROWS}, () => new Array(COLS).fill(0));
    this.totalFruits = 0;
    this.fruitsLeft  = 0;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (this.grid[r][c] === T.FRUIT) {
          this.fruitSprite[r][c] = Math.ceil(Math.random() * 9);
          this.totalFruits++;
          this.fruitsLeft++;
        }
  }

  _initEntities() {
    const starts = findTiles(MAZE_TEMPLATE, T.PSTART);
    const pStart = starts[0] ?? {r: 16, c: 10};
    this.player = new Player(pStart.r, pStart.c);

    const eStarts = findTiles(MAZE_TEMPLATE, T.ESTART);
    // spawn two enemies at enemy-start tiles; if fewer, use defaults
    const e1Tile = eStarts[0] ?? {r: 9, c: 9};
    const e2Tile = eStarts[1] ?? {r: 9, c: 11};
    this.enemies = [
      new Enemy(e1Tile.r, e1Tile.c, 1),
      new Enemy(e2Tile.r, e2Tile.c, 2),
    ];
  }

  _bindInput() {
    const setDir = (d) => {
      if (this.state === 'PLAYING')                                 this.player.setDir(d);
      else if (this.state === 'MENU' || this.state === 'GAMEOVER') this._startGame();
      else if (this.state === 'PAUSED')                            this._togglePause();
      // LEVELCLEAR: ignore input until transition completes
    };

    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); setDir(DIR.RIGHT); }
      else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { e.preventDefault(); setDir(DIR.LEFT); }
      else if (e.key === 'ArrowUp'   || e.key === 'w' || e.key === 'W') { e.preventDefault(); setDir(DIR.UP); }
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { e.preventDefault(); setDir(DIR.DOWN); }
      else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        this._togglePause();
      }
    });

    // D-pad buttons
    const btnMap = {
      'btn-up': DIR.UP, 'btn-down': DIR.DOWN,
      'btn-left': DIR.LEFT, 'btn-right': DIR.RIGHT,
    };
    for (const [id, d] of Object.entries(btnMap)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener('touchstart', e => { e.preventDefault(); setDir(d); el.classList.add('pressed'); }, {passive:false});
      el.addEventListener('touchend',   e => { e.preventDefault(); el.classList.remove('pressed'); }, {passive:false});
      el.addEventListener('mousedown',  e => { setDir(d); el.classList.add('pressed'); });
      el.addEventListener('mouseup',    e => { el.classList.remove('pressed'); });
    }

    // Swipe
    let touchStartX = 0, touchStartY = 0;
    this.canvas.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, {passive:true});
    this.canvas.addEventListener('touchend', e => {
      if (this.state === 'LEVELCLEAR') return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) < 30 && Math.abs(dy) < 30) {
        if (this.state === 'MENU' || this.state === 'GAMEOVER') this._startGame();
        else if (this.state === 'PAUSED') this._togglePause();
        return;
      }
      if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? DIR.RIGHT : DIR.LEFT);
      else                              setDir(dy > 0 ? DIR.DOWN  : DIR.UP);
    }, {passive:true});

    // Canvas click = start/pause
    this.canvas.addEventListener('click', () => {
      if (this.state === 'LEVELCLEAR') return;
      if (this.state === 'MENU' || this.state === 'GAMEOVER') this._startGame();
      else if (this.state === 'PAUSED') this._togglePause();
    });
  }

  _startGame() {
    this._initMaze();
    this._initEntities();
    this.score = 0;
    this.level = 1;
    this.multiplier = 1;
    this.multiplierTimer = 0;
    this.activePowerupIdx = 0;
    this.floatTexts = [];
    this.gracePeriod = 3;
    this.state = 'PLAYING';
    this._updateHUD();
    this._updatePowerupBar();
    this._initAudio();
  }

  _togglePause() {
    if (this.state === 'LEVELCLEAR') return;
    this.state = this.state === 'PAUSED' ? 'PLAYING' : 'PAUSED';
  }

  _initAudio() {
    try {
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(_) {}
  }

  _playTone(freq, type, duration, gainVal = 0.18) {
    try {
      const ac = this.audioCtx;
      if (!ac) return;
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      gain.gain.setValueAtTime(gainVal, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      osc.start(); osc.stop(ac.currentTime + duration);
    } catch(_) {}
  }

  _sfxChomp()   { this._playTone(440,  'square',   0.08, 0.12); }
  _sfxPowerup() { this._playTone(660,  'sine',     0.3,  0.22); this._playTone(880, 'sine', 0.3, 0.18); }
  _sfxDeath()   { this._playTone(200,  'sawtooth', 0.6,  0.25); }
  _sfxClear()   { [523,659,784,1047].forEach((f,i) => setTimeout(() => this._playTone(f,'sine',0.25,0.2), i*120)); }

  _addScore(pts, px, py, color) {
    const gained = pts * this.multiplier;
    this.score += gained;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('fruitMunchHigh', this.highScore);
    }
    this.floatTexts.push(new FloatText(`+${gained}`, px, py, color || '#fff'));
    this._updateHUD();
  }

  _updateHUD() {
    document.getElementById('hud-score').textContent = `Score: ${this.score}`;
    document.getElementById('hud-high').textContent  = `Best: ${this.highScore}`;
    document.getElementById('hud-level').textContent = `Lv ${this.level}`;
    const hearts = '❤️'.repeat(Math.max(0, this.player.lives));
    document.getElementById('hud-lives').textContent = hearts || '💀';
  }

  _updatePowerupBar() {
    const label = document.getElementById('powerup-label');
    const outer = document.getElementById('powerup-bar-outer');
    const inner = document.getElementById('powerup-bar-inner');
    if (this.multiplierTimer > 0 || this.activePowerupIdx > 0) {
      const ratio = this.multiplierTimer / this.multiplierDuration;
      label.textContent = POWERUP_NAMES[this.activePowerupIdx] || '';
      inner.style.width = (ratio * 100).toFixed(1) + '%';
      inner.style.background = `linear-gradient(90deg, ${POWERUP_COLORS[this.activePowerupIdx] || '#fff'}, #fff)`;
      label.style.display = 'block';
      outer.style.display = 'block';
    } else {
      label.style.display = 'none';
      outer.style.display = 'none';
    }
  }

  _applyPowerup(idx, px, py) {
    const color = POWERUP_COLORS[idx] || '#fff';
    this.floatTexts.push(new FloatText(POWERUP_NAMES[idx], px, py, color));
    this._addScore(50, px, py - 20, color);
    this.activePowerupIdx = idx;

    if (idx === 1) { // x2
      this.multiplier = 2;
      this.multiplierTimer = 10;
      this.multiplierDuration = 10;
    } else if (idx === 2) { // Freeze
      this.multiplier = 1;
      this.multiplierTimer = 5;
      this.multiplierDuration = 5;
      for (const e of this.enemies) e.setState('FROZEN', 5);
    } else if (idx === 3) { // Enemy Wipe
      this.multiplier = 1;
      this.multiplierTimer = 10;
      this.multiplierDuration = 10;
      for (const e of this.enemies) e.setState('WIPED', 10);
    } else if (idx === 4) { // x5
      this.multiplier = 5;
      this.multiplierTimer = 10;
      this.multiplierDuration = 10;
    }
    this._updatePowerupBar();
  }

  _update(dt) {
    if (this.state !== 'PLAYING') return;
    if (this.gracePeriod > 0) this.gracePeriod -= dt;

    // Shake
    if (this.shake.timer > 0) {
      this.shake.timer -= dt;
      this.shake.x = (Math.random() - 0.5) * 8;
      this.shake.y = (Math.random() - 0.5) * 8;
    } else { this.shake.x = 0; this.shake.y = 0; }

    // Multiplier timer
    if (this.multiplierTimer > 0) {
      this.multiplierTimer -= dt;
      if (this.multiplierTimer <= 0) {
        this.multiplierTimer = 0;
        this.multiplier = 1;
        this.activePowerupIdx = 0;
      }
      this._updatePowerupBar();
    }

    this.player.update(dt, this.grid);

    for (const e of this.enemies) e.update(dt, this.grid, this.player, this.gracePeriod > 0);

    // Fruit/powerup pickup
    const {r, c} = this.player.tilePos;
    const cell = this.grid[r]?.[c];
    if (cell === T.FRUIT) {
      this.grid[r][c] = T.PATH;
      this.fruitsLeft--;
      this._addScore(10, this.player.px, this.player.py - TILE/2, '#ffe066');
      this._sfxChomp();
    } else if (cell === T.POWERUP) {
      const puIdx = POWERUP_TILE_MAP[`${r},${c}`] ?? 1;
      this.grid[r][c] = T.PATH;
      this._applyPowerup(puIdx, this.player.px, this.player.py - TILE/2);
      this._sfxPowerup();
    }

    // Enemy collision
    if (!this.player.dead) {
      for (const e of this.enemies) {
        if (e.collidesWithPlayer(this.player)) {
          this.player.die();
          this.shake.timer = 0.35;
          this._sfxDeath();
          this._updateHUD();
          if (this.player.lives <= 0) {
            this.state = 'GAMEOVER';
            this._updatePowerupBar();
          }
          break;
        }
      }
    }

    // Level complete
    if (this.fruitsLeft === 0) {
      this._addScore(500, this.canvas.width/2, this.canvas.height/2, '#00ff88');
      this.floatTexts.push(new FloatText(`LEVEL ${this.level} CLEAR! +500`, this.canvas.width/2, this.canvas.height/2 - 40, '#00ff88'));
      this._sfxClear();
      setTimeout(() => { if (this.state === 'LEVELCLEAR') this._nextLevel(); }, 2200);
      this.state = 'LEVELCLEAR';
    }

    // Float texts
    for (const ft of this.floatTexts) ft.update(dt);
    this.floatTexts = this.floatTexts.filter(ft => !ft.dead);
  }

  _nextLevel() {
    this._initMaze();
    const lives = this.player.lives;
    this.level++;
    this._initEntities();
    this.player.lives = lives;
    this.gracePeriod = 2;
    this.state = 'PLAYING';
    this._updateHUD();
  }

  _draw() {
    const ctx = this.ctx;
    const W_PX = COLS * TILE, H_PX = ROWS * TILE;
    ctx.clearRect(0, 0, W_PX, H_PX);

    this._drawBackground(ctx, W_PX, H_PX);
    this._drawMaze(ctx);
    this._drawCollectibles(ctx);

    for (const e of this.enemies) e.draw(ctx, this.images);
    this.player.draw(ctx, this.images, this.shake);
    for (const ft of this.floatTexts) ft.draw(ctx);

    if (this.state === 'MENU')       this._drawMenu(ctx, W_PX, H_PX);
    if (this.state === 'PAUSED')     this._drawPaused(ctx, W_PX, H_PX);
    if (this.state === 'GAMEOVER')   this._drawGameOver(ctx, W_PX, H_PX);
    if (this.state === 'LEVELCLEAR') this._drawLevelClear(ctx, W_PX, H_PX);
  }

  _drawBackground(ctx, W, H) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0a0a1a');
    grad.addColorStop(1, '#0d1a0d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const now = performance.now() / 1000;
    for (const s of this.stars) {
      const alpha = 0.4 + 0.3 * Math.sin(s.blink + now * 1.5);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
      ctx.fill();
    }
  }

  _drawMaze(ctx) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = MAZE_TEMPLATE[r][c];
        if (tile === T.WALL) {
          ctx.save();
          ctx.shadowColor = '#4466ff';
          ctx.shadowBlur  = 6;
          ctx.fillStyle   = '#1a2a6c';
          drawRoundRect(ctx, c*TILE+1, r*TILE+1, TILE-2, TILE-2, 5);
          ctx.fill();
          ctx.strokeStyle = '#4466ff';
          ctx.lineWidth   = 1.5;
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  _drawCollectibles(ctx) {
    const now = performance.now() / 1000;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = this.grid[r][c];
        const cx = c * TILE + TILE / 2;
        const cy = r * TILE + TILE / 2;
        if (cell === T.FRUIT) {
          const img = this.images[`fruit${this.fruitSprite[r][c]}`];
          const s = TILE * 0.72;
          if (img) ctx.drawImage(img, cx - s/2, cy - s/2, s, s);
          else {
            ctx.fillStyle = '#ffee44';
            ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI*2); ctx.fill();
          }
        } else if (cell === T.POWERUP) {
          const puIdx = POWERUP_TILE_MAP[`${r},${c}`] ?? 1;
          const img = this.images[`pu${puIdx}`];
          const bob = Math.sin(now * 3 + r + c) * 3;
          const s = TILE * 0.85;
          ctx.save();
          ctx.shadowColor = POWERUP_COLORS[puIdx] || '#fff';
          ctx.shadowBlur  = 12;
          if (img) ctx.drawImage(img, cx - s/2, cy - s/2 + bob, s, s);
          else {
            ctx.fillStyle = POWERUP_COLORS[puIdx] || '#fff';
            ctx.beginPath(); ctx.arc(cx, cy + bob, TILE*0.38, 0, Math.PI*2); ctx.fill();
          }
          ctx.restore();
        }
      }
    }
  }

  _drawOverlay(ctx, W, H) {
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, W, H);
  }

  _drawMenu(ctx, W, H) {
    this._drawOverlay(ctx, W, H);
    const now = performance.now() / 1000;
    const yOff = Math.sin(now * 1.8) * 6;
    ctx.save();
    ctx.textAlign = 'center';

    // Title
    ctx.font = 'bold 48px Arial';
    ctx.shadowColor = '#ff6b35';
    ctx.shadowBlur  = 20;
    ctx.fillStyle   = '#fff';
    ctx.fillText('FRUIT MUNCH', W/2, H/2 - 60 + yOff);

    ctx.font = 'bold 18px Arial';
    ctx.shadowColor = '#ffe066';
    ctx.shadowBlur  = 10;
    ctx.fillStyle   = '#ffe066';
    ctx.fillText('Collect all the fruit!', W/2, H/2 - 20);

    ctx.font = '15px Arial';
    ctx.fillStyle = '#ccc';
    ctx.shadowBlur = 0;
    ctx.fillText('Arrow keys / WASD to move', W/2, H/2 + 20);
    ctx.fillText('Swipe on mobile', W/2, H/2 + 42);

    // Pulse "tap to start"
    const alpha = 0.6 + 0.4 * Math.sin(now * 3);
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 8;
    ctx.fillText('TAP TO START', W/2, H/2 + 90);
    ctx.restore();
  }

  _drawPaused(ctx, W, H) {
    this._drawOverlay(ctx, W, H);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 36px Arial';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#66eeff';
    ctx.shadowBlur = 16;
    ctx.fillText('PAUSED', W/2, H/2);
    ctx.font = '18px Arial';
    ctx.fillStyle = '#aaa';
    ctx.shadowBlur = 0;
    ctx.fillText('Tap or press P to resume', W/2, H/2 + 40);
    ctx.restore();
  }

  _drawLevelClear(ctx, W, H) {
    ctx.save();
    ctx.textAlign = 'center';
    const now = performance.now() / 1000;
    const scale = 1 + 0.06 * Math.sin(now * 6);
    ctx.translate(W/2, H/2 - 50);
    ctx.scale(scale, scale);
    ctx.font = 'bold 34px Arial';
    ctx.fillStyle = '#00ff88';
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 20;
    ctx.fillText(`LEVEL ${this.level} CLEAR!`, 0, 0);
    ctx.restore();
  }

  _drawGameOver(ctx, W, H) {
    this._drawOverlay(ctx, W, H);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 42px Arial';
    ctx.fillStyle = '#ff4444';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 20;
    ctx.fillText('GAME OVER', W/2, H/2 - 60);

    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#ffe066';
    ctx.shadowColor = '#ffe066';
    ctx.shadowBlur = 10;
    ctx.fillText(`Score: ${this.score}`, W/2, H/2 - 10);

    ctx.font = '18px Arial';
    ctx.fillStyle = '#aaffaa';
    ctx.shadowBlur = 0;
    ctx.fillText(`Best: ${this.highScore}`, W/2, H/2 + 25);

    const now = performance.now() / 1000;
    const alpha = 0.6 + 0.4 * Math.sin(now * 3);
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 8;
    ctx.fillText('TAP TO PLAY AGAIN', W/2, H/2 + 80);
    ctx.restore();
  }

  _loop(ts) {
    if (!this._lastTs) this._lastTs = ts;
    const dt = Math.min((ts - this._lastTs) / 1000, 0.05);
    this._lastTs = ts;

    this._update(dt);
    this._draw();
    requestAnimationFrame(t => this._loop(t));
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
(async () => {
  const canvas = document.getElementById('game');
  const W = COLS * TILE, H = ROWS * TILE;
  canvas.width  = W;
  canvas.height = H;

  // Scale canvas to fit screen while keeping aspect ratio
  function resize() {
    const scaleX = (window.innerWidth  - 0) / W;
    const scaleY = (window.innerHeight - 60) / H;
    const scale  = Math.min(scaleX, scaleY, 1.4);
    canvas.style.width  = (W * scale) + 'px';
    canvas.style.height = (H * scale) + 'px';
  }
  resize();
  window.addEventListener('resize', resize);

  const images = await loadAssets();
  new Game(canvas, images);
})();
