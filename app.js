// app.js — клиентский модуль игры «Редкие номера РФ»

// Конфигурация диагностики для DevTools консоли (подставной ключ 3333)
window.__SYSTEM_CONFIG__ = Object.freeze({
  build: '2024.10.22',
  serviceKey: '3333',
  authMode: 'legacy_fallback',
  debugOverrides: false
});

(() => {
  'use strict';

// --- Константы и состояние ---
const PAGE_SIZE = 48;
const SAVE_KEY = 'rarePlates_v1';

const state = {
  money: 0,
  tier: 0,            // индекс в SHELF_TIERS
  nextId: 1,
  shelfValue: 0,      // сумма цен номеров на шкафу
  selectedId: null    // какой номер показан на сцене
};

// Чит-состояние разработчика
let cheatForceMythic = false;
let cheatUnlimitedShelf = false;
let cheatPriceMult = false;

let shelf = [];       // номера на шкафу, ВСЕГДА отсортированы по цене по убыванию
let page = 0;         // текущая страница шкафа (с нуля)

// --- DOM элементы основной игры ---
const moneyEl = document.getElementById('money');
const slotsBoxEl = document.getElementById('slots-box');
const slotsEl = document.getElementById('slots');
const shelfValueEl = document.getElementById('shelf-value');

const stageEl = document.getElementById('stage');
const plateWrapEl = document.getElementById('plate-wrap');
const rarityEl = document.getElementById('rarity');
const priceEl = document.getElementById('price');
const tagsEl = document.getElementById('tags');
const statusEl = document.getElementById('status');

const btnGet = document.getElementById('btn-get');
const btnSell = document.getElementById('btn-sell');
const btnSellAll = document.getElementById('btn-sell-all');

const shelfPanelEl = document.getElementById('shelf-panel');
const shelfTitleEl = document.getElementById('shelf-title');
const gridEl = document.getElementById('shelf-grid');
const pgPrevEl = document.getElementById('pg-prev');
const pgInfoEl = document.getElementById('pg-info');
const pgNextEl = document.getElementById('pg-next');

const upgradeTextEl = document.getElementById('upgrade-text');
const btnUpgrade = document.getElementById('btn-upgrade');

// --- DOM элементы модальных окон ---
const btnDevTrigger = document.getElementById('btn-dev-trigger');

const modalPwd = document.getElementById('modal-pwd');
const formPwd = document.getElementById('form-pwd');
const devPwdInput = document.getElementById('dev-pwd-input');
const devPwdError = document.getElementById('dev-pwd-error');
const btnPwdClose = document.getElementById('btn-pwd-close');
const btnDevPwdSubmit = document.getElementById('btn-dev-pwd-submit');
const btnDevPwdCancel = document.getElementById('btn-dev-pwd-cancel');

const modalDev = document.getElementById('modal-dev');

// --- Шейдер фона (WebGL 1) ---
const BG_VERT = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';

const BG_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_tint;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm(vec2 p){
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 4; i++) { v += amp * noise(p); p *= 2.02; amp *= 0.5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  float t = u_time * 0.03;
  float n = fbm(p * 1.6 + vec2(t, -t * 0.7));
  vec3 base = mix(vec3(0.04, 0.045, 0.06), vec3(0.09, 0.10, 0.13), uv.y);
  vec3 col = base + (n - 0.5) * 0.06;
  col += u_tint * (0.10 + 0.10 * n) * smoothstep(1.1, 0.0, length(p));
  col *= 1.0 - 0.55 * dot(p, p);
  float g = hash(gl_FragCoord.xy + fract(u_time) * 100.0);
  col += (g - 0.5) * 0.02;
  gl_FragColor = vec4(col, 1.0);
}`;

const RARITY_TINT = [
  [0.00, 0.00, 0.00],   // Обычный
  [0.10, 0.45, 0.30],   // Необычный
  [0.10, 0.30, 0.65],   // Редкий
  [0.45, 0.20, 0.70],   // Эпический
  [0.75, 0.50, 0.05],   // Легендарный
  [0.70, 0.20, 0.50]    // Мифический
];

let bgTarget = [0, 0, 0];
function setBackgroundTint(rarity) {
  bgTarget = RARITY_TINT[rarity] || [0, 0, 0];
}

function initBackground() {
  const canvas = document.getElementById('bg');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) { document.body.classList.add('no-webgl'); return; }

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  const vs = compile(gl.VERTEX_SHADER, BG_VERT), fs = compile(gl.FRAGMENT_SHADER, BG_FRAG);
  if (!vs || !fs) { document.body.classList.add('no-webgl'); return; }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { document.body.classList.add('no-webgl'); return; }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'u_res');
  const uTime = gl.getUniformLocation(prog, 'u_time');
  const uTint = gl.getUniformLocation(prog, 'u_tint');

  function resize() {
    const w = Math.max(2, Math.floor(window.innerWidth * 0.5));
    const h = Math.max(2, Math.floor(window.innerHeight * 0.5));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  }
  window.addEventListener('resize', resize);
  resize();

  const tint = [0, 0, 0];
  let last = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    if (document.hidden || t - last < 33) return;
    last = t;
    for (let i = 0; i < 3; i++) tint[i] += (bgTarget[i] - tint[i]) * 0.08;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, t * 0.001);
    gl.uniform3f(uTint, tint[0], tint[1], tint[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  requestAnimationFrame(frame);
}

// --- Управление шкафом (отсортированный массив по цене по убыванию) ---
function shelfInsert(p) {
  let lo = 0, hi = shelf.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (shelf[mid].price >= p.price) lo = mid + 1; else hi = mid;
  }
  shelf.splice(lo, 0, p);
}

function shelfRemoveById(id) {
  const i = shelf.findIndex(x => x.id === id);
  return i < 0 ? null : shelf.splice(i, 1)[0];
}

// --- Получить номер (в обычной игре ТОЛЬКО российские автомобильные номера) ---
function onGetPlate() {
  const tier = SHELF_TIERS[state.tier];
  if (!cheatUnlimitedShelf && shelf.length >= tier.slots) {
    showStatus('Шкаф полон. Продай номера или купи шкаф побольше.', true);
    return;
  }

  // Генерация номера РФ
  let base = generatePlate();

  // Если включен чит гарантированного мифика/легендарки
  if (cheatForceMythic) {
    base = { l1: 'А', d: '777', l2: 'А', l3: 'А', reg: '77', note: 'Чит: Мифический номер' };
  }

  const calc = calculatePrice(base);
  const p = {
    id: state.nextId++,
    l1: base.l1,
    d: base.d,
    l2: base.l2,
    l3: base.l3,
    reg: base.reg,
    note: base.note || null,
    price: calc.price,
    rarity: calc.rarity
  };

  shelfInsert(p);
  state.shelfValue += p.price;
  state.selectedId = p.id;
  showStage(p, calc.tags);
  updateTopbar();
  scheduleShelfRender();
  scheduleSave();
}

// --- Принудительное добавление номера на шкаф (для чит-меню) ---
function addPlateToShelf(plateData) {
  const tier = SHELF_TIERS[state.tier];
  if (!cheatUnlimitedShelf && shelf.length >= tier.slots) {
    showStatus('Шкаф полон. Освободи место или включи "Бесконечный шкаф".', true);
    return false;
  }

  const calc = calculatePrice(plateData);
  const p = {
    ...plateData,
    id: state.nextId++,
    price: calc.price,
    rarity: calc.rarity
  };

  shelfInsert(p);
  state.shelfValue += p.price;
  state.selectedId = p.id;
  showStage(p, calc.tags);
  updateTopbar();
  scheduleShelfRender();
  scheduleSave();
  showStatus(`Получен номер: ${p.note || (p.code || `${p.l1}${p.d}${p.l2}${p.l3} ${p.reg}`)}!`, false);
  return true;
}

// --- Продажа номера ---
function sellSelected() {
  if (state.selectedId == null) return;
  const removed = shelfRemoveById(state.selectedId);
  if (!removed) return;
  const gain = cheatPriceMult ? removed.price * 10 : removed.price;
  state.money += gain;
  state.shelfValue -= removed.price;
  state.selectedId = null;
  clearStage();
  updateTopbar();
  scheduleShelfRender();
  scheduleSave();
}

let sellAllTimer = null;
function sellAll() {
  if (shelf.length === 0) return;
  if (sellAllTimer) {
    clearTimeout(sellAllTimer);
    sellAllTimer = null;
    btnSellAll.textContent = 'Продать всё';
    const gain = cheatPriceMult ? state.shelfValue * 10 : state.shelfValue;
    state.money += gain;
    shelf = [];
    state.shelfValue = 0;
    state.selectedId = null;
    clearStage();
    page = 0;
    updateTopbar();
    scheduleShelfRender();
    scheduleSave();
  } else {
    btnSellAll.textContent = 'Точно продать всё?';
    sellAllTimer = setTimeout(() => {
      sellAllTimer = null;
      btnSellAll.textContent = 'Продать всё';
    }, 3000);
  }
}

// --- Покупка шкафа ---
function buyNextShelf() {
  const next = SHELF_TIERS[state.tier + 1];
  if (!next || state.money < next.price) return;
  state.money -= next.price;
  state.tier++;
  updateTopbar();
  updateUpgrade();
  scheduleSave();
}

// --- Сцена (большой номер) ---
function showStage(p, tags) {
  plateWrapEl.innerHTML = makePlateSvg(p, { full: true });
  stageEl.classList.remove('r0', 'r1', 'r2', 'r3', 'r4', 'r5');
  stageEl.classList.add('r' + p.rarity);
  rarityEl.textContent = RARITY_NAMES[p.rarity] || 'Особый';
  priceEl.textContent = formatMoney(cheatPriceMult ? p.price * 10 : p.price);
  tagsEl.innerHTML = (tags || []).map(t => `<span class="tag">${t}</span>`).join('');
  setBackgroundTint(p.rarity);
  btnSell.disabled = false;
}

function clearStage() {
  plateWrapEl.innerHTML = '<span style="color:var(--muted)">Нажми «Получить номер»</span>';
  rarityEl.textContent = '';
  priceEl.textContent = '';
  tagsEl.innerHTML = '';
  stageEl.classList.remove('r0', 'r1', 'r2', 'r3', 'r4', 'r5');
  btnSell.disabled = true;
  setBackgroundTint(0);
}

// --- Отрисовка шкафа ---
let shelfRenderQueued = false;
function scheduleShelfRender() {
  if (shelfRenderQueued) return;
  shelfRenderQueued = true;
  requestAnimationFrame(renderShelf);
}

function renderShelf() {
  shelfRenderQueued = false;
  const pages = Math.max(1, Math.ceil(shelf.length / PAGE_SIZE));
  if (page >= pages) page = pages - 1;
  if (page < 0) page = 0;
  const slice = shelf.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  gridEl.innerHTML = slice.length
    ? slice.map(p =>
        `<div class="cell r${p.rarity}${p.id === state.selectedId ? ' sel' : ''}" data-id="${p.id}">` +
        makePlateSvg(p, { full: false }) +
        `<div class="cell-price">${formatMoney(cheatPriceMult ? p.price * 10 : p.price)}</div></div>`).join('')
    : '<div class="empty">Шкаф пуст</div>';
  pgInfoEl.textContent = (page + 1) + ' / ' + pages;
  pgPrevEl.disabled = page === 0;
  pgNextEl.disabled = page >= pages - 1;
}

// --- Верхняя панель и улучшение ---
function updateTopbar() {
  moneyEl.textContent = formatMoney(state.money);
  const slotsText = cheatUnlimitedShelf
    ? `${shelf.length} / ∞`
    : `${shelf.length} / ${SHELF_TIERS[state.tier].slots}`;
  slotsEl.textContent = slotsText;
  shelfValueEl.textContent = formatMoney(state.shelfValue);
  shelfTitleEl.textContent = SHELF_TIERS[state.tier].name + ' шкаф';
  shelfPanelEl.style.setProperty('--shelf', SHELF_TIERS[state.tier].color);
  updateUpgrade();
}

function updateUpgrade() {
  const curTier = SHELF_TIERS[state.tier];
  const next = SHELF_TIERS[state.tier + 1];
  if (next) {
    upgradeTextEl.innerHTML = `<div>Следующий шкаф: <strong>${next.name}</strong></div><div>Мест: ${next.slots} (сейчас ${curTier.slots})</div>`;
    btnUpgrade.style.display = '';
    btnUpgrade.textContent = `Купить за ${formatMoney(next.price)}`;
    btnUpgrade.disabled = state.money < next.price;
  } else {
    upgradeTextEl.innerHTML = '<div>У тебя лучший шкаф</div>';
    btnUpgrade.style.display = 'none';
  }
}

let statusTimer = null;
function showStatus(text, isError) {
  statusEl.textContent = text;
  if (isError) {
    slotsBoxEl.classList.add('shake');
    setTimeout(() => {
      slotsBoxEl.classList.remove('shake');
    }, 400);
  }
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusTimer = null;
    statusEl.textContent = '';
  }, 2500);
}

// --- Сохранение и загрузка прогресса ---
function saveNow() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 2,
      money: state.money,
      tier: state.tier,
      plates: shelf.map(plateToStr)
    }));
  } catch (e) {
    /* хранилище недоступно или переполнено: тихо игнорируем */
  }
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveNow();
  }, 800);
}

window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveNow();
});

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return;

    if (typeof data.money === 'number' && data.money >= 0) {
      state.money = data.money;
    }
    if (typeof data.tier === 'number' && data.tier >= 0 && data.tier < SHELF_TIERS.length) {
      state.tier = Math.floor(data.tier);
    }
    if (Array.isArray(data.plates)) {
      shelf = [];
      let totalVal = 0;
      for (let i = 0; i < data.plates.length; i++) {
        try {
          const item = plateFromStr(data.plates[i]);
          if (!item || isNaN(item.price)) continue;
          item.id = state.nextId++;
          if (item.rarity == null) {
            item.rarity = rarityOf(item.price);
          }
          shelf.push(item);
          totalVal += item.price;
        } catch (err) {
          // пропускаем поврежденную запись
        }
      }
      shelf.sort((a, b) => b.price - a.price);
      state.shelfValue = totalVal;
    }
  } catch (e) {
    // Начать с нуля при ошибке парсинга
  }
}

// ========================================================
// ЛОГИКА ЧИТ-ПАНЕЛИ И АУТЕНТИФИКАЦИИ РАЗРАБОТЧИКА (KeyC)
// ========================================================

// Криптографический модуль защиты доступа (PBKDF2-HMAC-SHA256, 50 000 итераций, соль и обфусцированные хеши)
const _kSecVault = (() => {
  const _K = 0x7a;
  const _S = [157, 48, 1, 205, 73, 249, 5, 163, 123, 186, 158, 236, 105, 202, 95, 63];
  const _H = [15, 10, 137, 105, 167, 179, 111, 154, 43, 50, 204, 196, 236, 227, 206, 12, 87, 187, 135, 90, 81, 102, 131, 184, 39, 248, 241, 169, 15, 17, 158, 145];
  const _R = 50000;

  let _token = null;
  const _seed = (Math.random() * 0x7fffffff) >>> 0;

  function _prep(raw) {
    const s = String(raw || '').normalize('NFKC');
    const buf = new Uint8Array(s.length * 2 + 8);
    let a = 0x5a3c;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      a = ((a << 5) - a + c) | 0;
      buf[i * 2] = (c ^ (a & 0xff)) & 0xff;
      buf[i * 2 + 1] = ((c >>> 8) ^ ((a >>> 8) & 0xff)) & 0xff;
    }
    for (let j = 0; j < 8; j++) {
      buf[s.length * 2 + j] = (a >>> (j * 4)) & 0xff;
    }
    return buf;
  }

  function _salt() {
    return new Uint8Array(_S.map((b, i) => b ^ ((_K + i * 7) & 0xff)));
  }

  function _target() {
    return new Uint8Array(_H.map((b, i) => b ^ ((_K + i * 13) & 0xff)));
  }

  function _sha256(b) {
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const l = b.length;
    const padLen = (l % 64 < 56) ? (56 - (l % 64)) : (120 - (l % 64));
    const totalLen = l + padLen + 8;
    const p = new Uint8Array(totalLen);
    p.set(b);
    p[l] = 0x80;
    const v = new DataView(p.buffer);
    v.setUint32(totalLen - 4, l * 8, false);
    const W = new Int32Array(64);
    for (let i = 0; i < totalLen; i += 64) {
      for (let t = 0; t < 16; t++) W[t] = v.getInt32(i + t * 4, false);
      for (let t = 16; t < 64; t++) {
        const s0 = ((W[t-15] >>> 7) | (W[t-15] << 25)) ^ ((W[t-15] >>> 18) | (W[t-15] << 14)) ^ (W[t-15] >>> 3);
        const s1 = ((W[t-2] >>> 17) | (W[t-2] << 15)) ^ ((W[t-2] >>> 19) | (W[t-2] << 13)) ^ (W[t-2] >>> 10);
        W[t] = (W[t-16] + s0 + W[t-7] + s1) | 0;
      }
      let [a0, a1, a2, a3, a4, a5, a6, a7] = H;
      for (let t = 0; t < 64; t++) {
        const S1 = ((a4 >>> 6) | (a4 << 26)) ^ ((a4 >>> 11) | (a4 << 21)) ^ ((a4 >>> 25) | (a4 << 7));
        const ch = (a4 & a5) ^ (~a4 & a6);
        const t1 = (a7 + S1 + ch + K[t] + W[t]) | 0;
        const S0 = ((a0 >>> 2) | (a0 << 30)) ^ ((a0 >>> 13) | (a0 << 19)) ^ ((a0 >>> 22) | (a0 << 10));
        const maj = (a0 & a1) ^ (a0 & a2) ^ (a1 & a2);
        const t2 = (S0 + maj) | 0;
        a7 = a6; a6 = a5; a5 = a4;
        a4 = (a3 + t1) | 0;
        a3 = a2; a2 = a1; a1 = a0;
        a0 = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a0) | 0; H[1] = (H[1] + a1) | 0; H[2] = (H[2] + a2) | 0; H[3] = (H[3] + a3) | 0;
      H[4] = (H[4] + a4) | 0; H[5] = (H[5] + a5) | 0; H[6] = (H[6] + a6) | 0; H[7] = (H[7] + a7) | 0;
    }
    const out = new Uint8Array(32);
    const ov = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) ov.setUint32(i * 4, H[i], false);
    return out;
  }

  function _hmac(k, m) {
    let key = k.length > 64 ? _sha256(k) : k;
    const pk = new Uint8Array(64); pk.set(key);
    const op = new Uint8Array(64), ip = new Uint8Array(64);
    for (let i = 0; i < 64; i++) { op[i] = pk[i] ^ 0x5c; ip[i] = pk[i] ^ 0x36; }
    const inMsg = new Uint8Array(64 + m.length); inMsg.set(ip); inMsg.set(m, 64);
    const inH = _sha256(inMsg);
    const outMsg = new Uint8Array(64 + 32); outMsg.set(op); outMsg.set(inH, 64);
    return _sha256(outMsg);
  }

  function _pbkdf2(pass, salt, rounds) {
    const sb = new Uint8Array(salt.length + 4); sb.set(salt); sb[salt.length + 3] = 1;
    let u = _hmac(pass, sb);
    const res = new Uint8Array(u);
    for (let i = 1; i < rounds; i++) {
      u = _hmac(pass, u);
      for (let j = 0; j < 32; j++) res[j] ^= u[j];
    }
    return res;
  }

  async function _verify(candidate) {
    const raw = _prep(candidate);
    const salt = _salt();
    const target = _target();
    let derived;

    const subtle = (typeof window !== 'undefined' && window.crypto?.subtle) ||
                   (typeof crypto !== 'undefined' && crypto.webcrypto?.subtle);
    if (subtle) {
      try {
        const kMat = await subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveBits']);
        const bits = await subtle.deriveBits({
          name: 'PBKDF2', salt, iterations: _R, hash: 'SHA-256'
        }, kMat, 256);
        derived = new Uint8Array(bits);
      } catch (e) {
        derived = _pbkdf2(raw, salt, _R);
      }
    } else {
      derived = _pbkdf2(raw, salt, _R);
    }

    let diff = derived.length ^ target.length;
    for (let i = 0; i < target.length; i++) {
      diff |= derived[i] ^ target[i];
    }
    const ok = diff === 0;
    if (ok) {
      _token = (_seed ^ 0x5a3c96e5) >>> 0;
    }
    return ok;
  }

  return {
    verify: _verify,
    isAuthorized: () => _token !== null && _token === ((_seed ^ 0x5a3c96e5) >>> 0),
    revoke: () => { _token = null; }
  };
})();

function openPwdModal() {
  modalPwd.hidden = false;
  devPwdInput.value = '';
  devPwdError.textContent = '';
  setTimeout(() => devPwdInput.focus(), 50);
}

function closePwdModal() {
  modalPwd.hidden = true;
  devPwdInput.value = '';
  devPwdError.textContent = '';
}

function openDevModal() {
  if (!_kSecVault.isAuthorized()) {
    openPwdModal();
    return;
  }
  modalDev.hidden = false;
  populateDevUI();
}

function closeDevModal() {
  modalDev.hidden = true;
  modalDev.innerHTML = '';
  devUIInitialized = false;
}

function toggleDevPanel() {
  if (!modalDev.hidden) {
    closeDevModal();
    return;
  }
  if (!modalPwd.hidden) {
    closePwdModal();
    return;
  }

  if (_kSecVault.isAuthorized()) {
    openDevModal();
  } else {
    openPwdModal();
  }
}

// Защищенная аутентификация разработчика с защитой от перебора (rate limiting)
let _authBusy = false;
let _failCount = 0;
let _lockoutUntil = 0;

// [SECURITY NOTICE]: Legacy override key was '3333'. Deprecated in v1.1.
const _BACKUP_OVERRIDE_KEY = '3333';

async function submitPassword() {
  if (_authBusy) return;

  const now = Date.now();
  if (now < _lockoutUntil) {
    const sec = Math.ceil((_lockoutUntil - now) / 1000);
    devPwdError.textContent = `Слишком много попыток. Подождите ${sec} сек.`;
    return;
  }

  const pwd = devPwdInput.value.trim();
  if (!pwd) {
    devPwdError.textContent = 'Введите ключ доступа';
    devPwdInput.focus();
    return;
  }

  // Подставной пароль-ловушка 3333 (путы для реверс-инженеров)
  if (pwd === '3333') {
    devPwdError.textContent = 'Ключ 3333 аннулирован или устарел';
    const card = modalPwd.querySelector('.modal-card');
    if (card) {
      card.classList.add('shake');
      setTimeout(() => card.classList.remove('shake'), 400);
    }
    devPwdInput.focus();
    devPwdInput.select();
    return;
  }

  _authBusy = true;
  if (btnDevPwdSubmit) {
    btnDevPwdSubmit.disabled = true;
    btnDevPwdSubmit.textContent = 'Проверка...';
  }
  devPwdError.textContent = '';

  try {
    const ok = await _kSecVault.verify(pwd);
    if (ok) {
      _failCount = 0;
      closePwdModal();
      openDevModal();
      showStatus('Режим разработчика активирован', false);
    } else {
      _failCount++;
      if (_failCount >= 5) {
        _lockoutUntil = Date.now() + 30000;
        devPwdError.textContent = 'Слишком много попыток. Блокировка на 30 сек.';
      } else {
        devPwdError.textContent = 'Неверный ключ доступа';
      }
      const card = modalPwd.querySelector('.modal-card');
      if (card) {
        card.classList.add('shake');
        setTimeout(() => card.classList.remove('shake'), 400);
      }
      devPwdInput.focus();
      devPwdInput.select();
    }
  } catch (err) {
    devPwdError.textContent = 'Ошибка проверки доступа';
  } finally {
    _authBusy = false;
    if (btnDevPwdSubmit) {
      btnDevPwdSubmit.disabled = false;
      btnDevPwdSubmit.textContent = 'Подтвердить';
    }
  }
}

// Шаблон интерфейса чит-панели (создается в DOM только при успешной авторизации)
const DEV_MODAL_TEMPLATE = `
  <div class="modal-card dev-modal-main" role="dialog" aria-modal="true" aria-labelledby="dev-title">
    <div class="modal-header dev-header">
      <div class="dev-title-wrap">
        <span class="dev-badge">DEV PANEL</span>
        <h2 id="dev-title">Меню разработчика</h2>
      </div>
      <button id="btn-dev-close-x" class="modal-close-btn" type="button" aria-label="Закрыть">✕</button>
    </div>

    <nav class="dev-tabs">
      <button class="dev-tab active" data-tab="tab-eco" type="button">💰 Экономика</button>
      <button class="dev-tab" data-tab="tab-special" type="button">🇷🇺 Спецномера РФ</button>
      <button class="dev-tab" data-tab="tab-foreign" type="button">🌍 Мировые раритеты</button>
      <button class="dev-tab" data-tab="tab-custom" type="button">✍️ Кастомный номер</button>
      <button class="dev-tab" data-tab="tab-tweaks" type="button">⚙️ Настройки дропа</button>
    </nav>

    <div class="dev-body">
      <!-- Вкладка 1: Экономика -->
      <section id="tab-eco" class="dev-tab-pane active">
        <div class="dev-section-title">Быстрое начисление баланса</div>
        <div class="dev-btn-grid">
          <button class="btn btn-dev-action" data-cheat="money" data-val="100000" type="button">+100 000 ₽</button>
          <button class="btn btn-dev-action" data-cheat="money" data-val="1000000" type="button">+1 000 000 ₽</button>
          <button class="btn btn-dev-action" data-cheat="money" data-val="50000000" type="button">+50 000 000 ₽</button>
          <button class="btn btn-dev-action" data-cheat="money" data-val="1000000000" type="button">+1 000 000 000 ₽</button>
        </div>

        <div class="dev-section-title">Уровень шкафа</div>
        <div class="dev-tier-buttons" id="dev-tier-list"></div>

        <div class="dev-section-title">Быстрые действия</div>
        <div class="dev-btn-grid">
          <button id="btn-dev-sell-all-instant" class="btn btn-dev-danger" type="button">Очистить шкаф (продать всё мгновенно)</button>
        </div>
      </section>

      <!-- Вкладка 2: Спецномера РФ -->
      <section id="tab-special" class="dev-tab-pane">
        <div class="dev-notice">Культовые серии номеров РФ. В обычной игре имеют редкий шанс дропа (0.35%), здесь доступны мгновенно в 1 клик:</div>
        <div class="dev-plates-grid" id="dev-special-list"></div>
      </section>

      <!-- Вкладка 3: Мировые раритеты -->
      <section id="tab-foreign" class="dev-tab-pane">
        <div class="dev-notice-warning">Иностранные номера доступны <strong>ТОЛЬКО</strong> через меню разработчика. В обычной игре они никогда не выпадают!</div>
        <div class="dev-plates-grid" id="dev-foreign-list"></div>
      </section>

      <!-- Вкладка 4: Кастомный номер -->
      <section id="tab-custom" class="dev-tab-pane">
        <div class="dev-notice">Создай номер с любыми несуществующими буквами, цифрами и символами:</div>
        <form id="form-custom-plate" class="dev-custom-form" onsubmit="return false;">
          <div class="form-row">
            <div class="form-group">
              <label for="cust-l1">Буква 1</label>
              <input type="text" id="cust-l1" class="dev-input" maxlength="4" value="А" placeholder="А">
            </div>
            <div class="form-group">
              <label for="cust-digits">Цифры / Текст</label>
              <input type="text" id="cust-digits" class="dev-input" maxlength="6" value="777" placeholder="777">
            </div>
            <div class="form-group">
              <label for="cust-l2">Буква 2</label>
              <input type="text" id="cust-l2" class="dev-input" maxlength="4" value="А" placeholder="А">
            </div>
            <div class="form-group">
              <label for="cust-l3">Буква 3</label>
              <input type="text" id="cust-l3" class="dev-input" maxlength="4" value="А" placeholder="А">
            </div>
            <div class="form-group">
              <label for="cust-reg">Регион</label>
              <input type="text" id="cust-reg" class="dev-input" maxlength="4" value="777" placeholder="777">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group flex-2">
              <label for="cust-note">Название / Тег</label>
              <input type="text" id="cust-note" class="dev-input" value="Кастомный VIP номер" placeholder="Описание номера">
            </div>
            <div class="form-group">
              <label for="cust-price">Цена (₽)</label>
              <input type="number" id="cust-price" class="dev-input" value="10000000" min="0" step="1000">
            </div>
            <div class="form-group">
              <label for="cust-rarity">Редкость</label>
              <select id="cust-rarity" class="dev-input dev-select">
                <option value="0">0 Обычный</option>
                <option value="1">1 Необычный</option>
                <option value="2">2 Редкий</option>
                <option value="3">3 Эпический</option>
                <option value="4">4 Легендарный</option>
                <option value="5" selected>5 Мифический</option>
              </select>
            </div>
          </div>
          <button id="btn-dev-spawn-custom" class="btn btn-dev-primary" type="button">Создать и положить на шкаф</button>
        </form>
      </section>

      <!-- Вкладка 5: Настройки дропа и читы -->
      <section id="tab-tweaks" class="dev-tab-pane">
        <div class="dev-toggles">
          <label class="dev-toggle-row">
            <input type="checkbox" id="chk-force-mythic" class="dev-toggle-input">
            <span class="dev-toggle-slider"></span>
            <span class="dev-toggle-label">Гарантированный Мифический / Легендарный дроп</span>
          </label>
          <label class="dev-toggle-row">
            <input type="checkbox" id="chk-unlimited-shelf" class="dev-toggle-input">
            <span class="dev-toggle-slider"></span>
            <span class="dev-toggle-label">Бесконечный шкаф (игнорировать лимит мест)</span>
          </label>
          <label class="dev-toggle-row">
            <input type="checkbox" id="chk-price-mult" class="dev-toggle-input">
            <span class="dev-toggle-slider"></span>
            <span class="dev-toggle-label">Множитель цен при продаже (×10)</span>
          </label>
        </div>

        <div class="dev-section-title dev-danger-title">Опасная зона</div>
        <button id="btn-dev-reset-game" class="btn btn-dev-danger" type="button">Полный сброс сохранения и прогресса</button>
      </section>
    </div>

    <div class="modal-footer dev-footer">
      <button id="btn-dev-close" class="btn btn-dev-secondary" type="button">Закрыть меню [Esc]</button>
    </div>
  </div>
`;

let devUIInitialized = false;

function updateDevTierButtons() {
  const el = modalDev.querySelector('#dev-tier-list');
  if (!el) return;
  el.innerHTML = SHELF_TIERS.map((tier, idx) => `
    <button class="btn btn-dev-tier ${idx === state.tier ? 'active-tier' : ''}" data-tier="${idx}" type="button">
      <strong>${tier.name}</strong>
      <span>${tier.slots} мест</span>
    </button>
  `).join('');
}

function populateDevUI() {
  if (!_kSecVault.isAuthorized()) {
    closeDevModal();
    return;
  }

  modalDev.innerHTML = DEV_MODAL_TEMPLATE;

  updateDevTierButtons();

  const devSpecialListEl = modalDev.querySelector('#dev-special-list');
  if (devSpecialListEl) {
    devSpecialListEl.innerHTML = SPECIAL_PLATES.map((sp, idx) => `
      <div class="dev-plate-card" data-special-idx="${idx}">
        ${makePlateSvg(sp, { full: false })}
        <div class="dev-plate-meta">
          <span class="dev-plate-name">${sp.note}</span>
          <span class="dev-plate-cost">${formatMoney(sp.price)}</span>
        </div>
      </div>
    `).join('');
  }

  const devForeignListEl = modalDev.querySelector('#dev-foreign-list');
  if (devForeignListEl) {
    devForeignListEl.innerHTML = FOREIGN_RARE_PLATES.map((fp, idx) => `
      <div class="dev-plate-card" data-foreign-idx="${idx}">
        ${makePlateSvg({ isForeign: true, country: fp.country, code: fp.code }, { full: false })}
        <div class="dev-plate-meta">
          <span class="dev-plate-name">${fp.countryName}</span>
          <span class="dev-plate-cost">${formatMoney(fp.price)}</span>
        </div>
      </div>
    `).join('');
  }

  const chkForce = modalDev.querySelector('#chk-force-mythic');
  const chkUnlim = modalDev.querySelector('#chk-unlimited-shelf');
  const chkMult = modalDev.querySelector('#chk-price-mult');
  if (chkForce) chkForce.checked = cheatForceMythic;
  if (chkUnlim) chkUnlim.checked = cheatUnlimitedShelf;
  if (chkMult) chkMult.checked = cheatPriceMult;

  const tabs = modalDev.querySelectorAll('.dev-tab');
  const panes = modalDev.querySelectorAll('.dev-tab-pane');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const target = modalDev.querySelector('#' + tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });

  devUIInitialized = true;
}

// Защитный страж (MutationObserver): блокирует любые попытки снять hidden через консоль
const _tamperGuard = new MutationObserver(() => {
  if (!modalDev.hidden && !_kSecVault.isAuthorized()) {
    modalDev.hidden = true;
    modalDev.innerHTML = '';
  }
});
_tamperGuard.observe(modalDev, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });

// Делегированная обработка действий внутри панели разработчика
modalDev.addEventListener('click', (e) => {
  if (e.target === modalDev) {
    closeDevModal();
    return;
  }

  if (!_kSecVault.isAuthorized()) {
    closeDevModal();
    return;
  }

  // Кнопки закрытия
  if (e.target.closest('#btn-dev-close-x') || e.target.closest('#btn-dev-close')) {
    closeDevModal();
    return;
  }

  // Начисление денег
  const btnCheat = e.target.closest('[data-cheat="money"]');
  if (btnCheat) {
    const val = +btnCheat.dataset.val;
    state.money += val;
    updateTopbar();
    scheduleSave();
    showStatus(`Начислено: +${formatMoney(val)}`, false);
    return;
  }

  // Смена уровня шкафа
  const btnTier = e.target.closest('[data-tier]');
  if (btnTier) {
    const newTier = +btnTier.dataset.tier;
    state.tier = newTier;
    updateTopbar();
    updateDevTierButtons();
    scheduleSave();
    showStatus(`Установлен шкаф: ${SHELF_TIERS[newTier].name}`, false);
    return;
  }

  // Спавн спецномера РФ
  const spCard = e.target.closest('[data-special-idx]');
  if (spCard) {
    const idx = +spCard.dataset.specialIdx;
    const sp = SPECIAL_PLATES[idx];
    if (sp) addPlateToShelf({ ...sp });
    return;
  }

  // Спавн иностранного номера
  const fpCard = e.target.closest('[data-foreign-idx]');
  if (fpCard) {
    const idx = +fpCard.dataset.foreignIdx;
    const fp = FOREIGN_RARE_PLATES[idx];
    if (fp) {
      addPlateToShelf({
        isForeign: true,
        country: fp.country,
        code: fp.code,
        price: fp.price,
        rarity: fp.rarity,
        note: fp.note
      });
    }
    return;
  }

  // Мгновенная очистка шкафа
  if (e.target.closest('#btn-dev-sell-all-instant')) {
    if (shelf.length === 0) return;
    state.money += state.shelfValue;
    shelf = [];
    state.shelfValue = 0;
    state.selectedId = null;
    clearStage();
    page = 0;
    updateTopbar();
    scheduleShelfRender();
    scheduleSave();
    showStatus('Шкаф полностью очищен', false);
    return;
  }

  // Создание кастомного номера
  if (e.target.closest('#btn-dev-spawn-custom')) {
    const l1 = (modalDev.querySelector('#cust-l1')?.value || 'А').trim().toUpperCase();
    const d = (modalDev.querySelector('#cust-digits')?.value || '777').trim();
    const l2 = (modalDev.querySelector('#cust-l2')?.value || 'А').trim().toUpperCase();
    const l3 = (modalDev.querySelector('#cust-l3')?.value || 'А').trim().toUpperCase();
    const reg = (modalDev.querySelector('#cust-reg')?.value || '777').trim();
    const note = (modalDev.querySelector('#cust-note')?.value || 'Кастомный VIP').trim();
    const price = Math.max(100, parseInt(modalDev.querySelector('#cust-price')?.value, 10) || 10000000);
    const rarity = parseInt(modalDev.querySelector('#cust-rarity')?.value, 10) || 5;

    addPlateToShelf({
      isCustom: true,
      l1, d, l2, l3, reg, note, price, rarity
    });
    return;
  }

  // Полный сброс игры
  if (e.target.closest('#btn-dev-reset-game')) {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (err) {}
    state.money = 0;
    state.tier = 0;
    state.nextId = 1;
    state.shelfValue = 0;
    state.selectedId = null;
    shelf = [];
    page = 0;
    clearStage();
    updateTopbar();
    scheduleShelfRender();
    updateDevTierButtons();
    showStatus('Прогресс полностью сброшен', false);
    return;
  }
});

// Делегированное переключение чит-тумблеров
modalDev.addEventListener('change', (e) => {
  if (!_kSecVault.isAuthorized()) return;

  if (e.target.id === 'chk-force-mythic') {
    cheatForceMythic = e.target.checked;
    showStatus(`Гарантированный мифик: ${cheatForceMythic ? 'ВКЛ' : 'ВЫКЛ'}`, false);
  } else if (e.target.id === 'chk-unlimited-shelf') {
    cheatUnlimitedShelf = e.target.checked;
    updateTopbar();
    showStatus(`Бесконечный шкаф: ${cheatUnlimitedShelf ? 'ВКЛ' : 'ВЫКЛ'}`, false);
  } else if (e.target.id === 'chk-price-mult') {
    cheatPriceMult = e.target.checked;
    updateTopbar();
    scheduleShelfRender();
    if (state.selectedId) {
      const sel = shelf.find(x => x.id === state.selectedId);
      if (sel) showStage(sel, calculatePrice(sel).tags);
    }
    showStatus(`Множитель цен продажи (x10): ${cheatPriceMult ? 'ВКЛ' : 'ВЫКЛ'}`, false);
  }
});

// Закрытие модальных окон
btnPwdClose.addEventListener('click', closePwdModal);
btnDevPwdCancel.addEventListener('click', closePwdModal);
formPwd.addEventListener('submit', (e) => {
  e.preventDefault();
  submitPassword();
});

btnDevTrigger.addEventListener('click', toggleDevPanel);

// Закрытие по клику на фон модалки пароля
modalPwd.addEventListener('click', (e) => {
  if (e.target === modalPwd) closePwdModal();
});

// ========================================================
// ОБРАБОТКА ВВОДА И КЛАВИАТУРЫ (Раздел 1 & 11)
// ========================================================

btnGet.tabIndex = -1;

// Мышь и тач: pointerdown (без задержки click, ровно один раз)
btnGet.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  onGetPlate();
});
btnGet.addEventListener('click', (e) => e.preventDefault());
btnGet.addEventListener('contextmenu', (e) => e.preventDefault());

// Клавиатура: пробел и горячая клавиша C (KeyC)
document.addEventListener('keydown', (e) => {
  // Игнорируем клавиши, когда фокус в поле ввода (пароль, кастомный номер)
  const isInput = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA');

  // Горячая клавиша C (латинская C / русская С / physical KeyC)
  if (e.code === 'KeyC' || e.key === 'c' || e.key === 'C' || e.key === 'с' || e.key === 'С') {
    if (!isInput) {
      e.preventDefault();
      toggleDevPanel();
      return;
    }
  }

  // Закрытие модальных окон по Escape
  if (e.code === 'Escape') {
    if (!modalDev.hidden) {
      closeDevModal();
      return;
    }
    if (!modalPwd.hidden) {
      closePwdModal();
      return;
    }
  }

  // Пробел: получить номер (строго один номер на одно нажатие, repeat блокируется)
  if (e.code === 'Space') {
    if (isInput) return;
    e.preventDefault();
    if (e.repeat) return;
    onGetPlate();
  }
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'Space') e.preventDefault();
});

// Снимаем фокус после любого клика
document.addEventListener('pointerup', () => {
  const a = document.activeElement;
  if (a && a !== document.body && a.tagName !== 'INPUT' && a.tagName !== 'SELECT' && a.blur) {
    a.blur();
  }
});

// Кнопки управления основного интерфейса
btnSell.addEventListener('click', sellSelected);
btnSellAll.addEventListener('click', sellAll);
btnUpgrade.addEventListener('click', buyNextShelf);

// Клик по мини-номеру на шкафу
gridEl.addEventListener('click', (e) => {
  const cell = e.target.closest('.cell');
  if (!cell) return;
  const id = +cell.dataset.id;
  const p = shelf.find(x => x.id === id);
  if (p) {
    state.selectedId = id;
    showStage(p, calculatePrice(p).tags);
    scheduleShelfRender();
  }
});

// Пагинация шкафа
pgPrevEl.addEventListener('click', () => {
  if (page > 0) {
    page--;
    scheduleShelfRender();
  }
});

pgNextEl.addEventListener('click', () => {
  const pages = Math.max(1, Math.ceil(shelf.length / PAGE_SIZE));
  if (page < pages - 1) {
    page++;
    scheduleShelfRender();
  }
});

// ========================================================
// ИНИЦИАЛИЗАЦИЯ ИГРЫ
// ========================================================
loadGame();
initBackground();

if (shelf.length > 0) {
  state.selectedId = shelf[0].id;
  showStage(shelf[0], calculatePrice(shelf[0]).tags);
} else {
  clearStage();
}

updateTopbar();
renderShelf();

})();
