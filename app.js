// app.js — клиентский модуль игры «Редкие номера РФ» (Photoreal + On-Demand Shader + Zero-Overhead Auth)

(() => {
  'use strict';

// --- Константы и состояние ---
const PAGE_SIZE = 24;
const SAVE_KEY = 'rarePlates_lite_v1';
const LEGACY_KEY = 'rarePlates_v1';

const state = {
  money: 0,
  tier: 0,
  nextId: 1,
  shelfValue: 0,
  selectedId: null
};

// Чит-состояние разработчика
let cheatForceMythic = false;
let cheatUnlimitedShelf = false;
let cheatPriceMult = false;
let devAuthorized = false;

// Спрятанная проверка ключа доступа без хранения строки пароля в коде и без нагрузки на ЦП (O(1) битовая свертка)
function _verifyAccessKey(s) {
  if (typeof s !== 'string' || s.length !== 5) return false;
  const w1 = (s.charCodeAt(0) << 24) | (s.charCodeAt(1) << 16) | (s.charCodeAt(2) << 8) | s.charCodeAt(3);
  const w2 = (s.charCodeAt(1) << 24) | (s.charCodeAt(2) << 16) | (s.charCodeAt(3) << 8) | s.charCodeAt(4);
  const h1 = (Math.imul(w1 ^ 0x9E3779B9, 0x85EBCA6B) ^ 0xC2B2AE35) >>> 0;
  const h2 = (Math.imul(w2 ^ 0x7F4A7C15, 0xCC9E2D51) ^ 0x1B873593) >>> 0;
  return h1 === 0x0F58D89B && h2 === 0xB7FE3F76;
}

let shelf = []; // номера на шкафу, всегда отсортированы по убыванию цены
let page = 0;

// --- DOM элементы основной игры ---
const moneyEl = document.getElementById('money');
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
const btnDevPwdCancel = document.getElementById('btn-dev-pwd-cancel');
const modalDev = document.getElementById('modal-dev');

// ========================================================
// УМНЫЙ ШЕЙДЕР ФОНА «ПО СОБЫТИЮ» (0% НАГРУЗКИ В ПРОСТОЕ)
// ========================================================
const RARITY_TINT = [
  [0.05, 0.07, 0.10],   // 0 Обычный
  [0.08, 0.42, 0.26],   // 1 Необычный
  [0.08, 0.28, 0.62],   // 2 Редкий
  [0.42, 0.16, 0.68],   // 3 Эпический
  [0.72, 0.46, 0.04],   // 4 Легендарный
  [0.68, 0.16, 0.46]    // 5 Мифический
];

let renderBgShader = () => {};

function initOnDemandShader() {
  const canvas = document.getElementById('bg');
  if (!canvas) return;
  const gl = canvas.getContext('webgl', {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
    powerPreference: 'low-power'
  });
  if (!gl) return;

  const vsSrc = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';
  const fsSrc = `
    precision mediump float;
    uniform vec2 u_res;
    uniform vec3 u_tint;
    float hash(vec2 p){
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }
    void main(){
      vec2 uv = gl_FragCoord.xy / u_res;
      vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
      float n = 0.65 * noise(p * 2.2 + vec2(0.4, -0.3)) + 0.35 * noise(p * 4.5);
      vec3 base = mix(vec3(0.04, 0.05, 0.07), vec3(0.09, 0.11, 0.15), uv.y);
      vec3 col = base + (n - 0.5) * 0.045;
      float glow = smoothstep(1.15, 0.0, length(p * vec2(0.85, 1.15) - vec2(0.0, 0.12)));
      col += u_tint * (0.14 + 0.08 * n) * glow;
      col *= clamp(1.0 - 0.48 * dot(p, p), 0.0, 1.0);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  }

  const vs = compile(gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'u_res');
  const uTint = gl.getUniformLocation(prog, 'u_tint');
  let curRarity = 0;

  // Сверхнизкое внутреннее разрешение (1/4 экрана) — дает мягкий градиент и тратит менее 200 КБ видеопамяти!
  function drawNow(rarity) {
    if (rarity !== undefined) curRarity = rarity;
    const w = Math.max(64, Math.min(360, (window.innerWidth * 0.25) | 0));
    const h = Math.max(64, Math.min(240, (window.innerHeight * 0.25) | 0));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    const t = RARITY_TINT[curRarity] || RARITY_TINT[0];
    gl.uniform2f(uRes, w, h);
    gl.uniform3f(uTint, t[0], t[1], t[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  renderBgShader = drawNow;
  window.addEventListener('resize', () => drawNow(curRarity));
  drawNow(0);
}

// --- Управление шкафом (бинарный поиск, возвращает индекс вставки) ---
function shelfInsert(p) {
  let lo = 0, hi = shelf.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (shelf[mid].price >= p.price) lo = mid + 1; else hi = mid;
  }
  shelf.splice(lo, 0, p);
  return lo;
}

function shelfRemoveById(id) {
  for (let i = 0; i < shelf.length; i++) {
    if (shelf[i].id === id) {
      return shelf.splice(i, 1)[0];
    }
  }
  return null;
}

// --- Получить номер ---
function onGetPlate() {
  const tier = SHELF_TIERS[state.tier];
  if (!cheatUnlimitedShelf && shelf.length >= tier.slots) {
    showStatus('Шкаф полон. Продай номера или купи шкаф побольше.');
    return;
  }

  let base = cheatForceMythic
    ? { l1: 'А', d: '111', l2: 'Т', l3: 'В', reg: '777', note: 'Чит: Мифический номер' }
    : generatePlate();

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

  const prevSelectedId = state.selectedId;
  const insertedIdx = shelfInsert(p);
  state.shelfValue += p.price;
  state.selectedId = p.id;
  showStage(p, calc.tags);
  updateTopbar();

  // Умная отсечка перерисовки шкафа: перерисовываем DOM сетки только если затронута текущая страница!
  const pageStart = page * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  if (insertedIdx < pageEnd || prevSelectedId != null) {
    scheduleShelfRender();
  } else {
    updatePagerOnly();
  }
  scheduleSave();
}

// --- Принудительное добавление номера на шкаф (для чит-меню) ---
function addPlateToShelf(plateData) {
  const tier = SHELF_TIERS[state.tier];
  if (!cheatUnlimitedShelf && shelf.length >= tier.slots) {
    showStatus('Шкаф полон. Освободи место или включи "Бесконечный шкаф".');
    return false;
  }

  const calc = calculatePrice(plateData);
  const p = Object.assign({}, plateData, {
    id: state.nextId++,
    price: calc.price,
    rarity: calc.rarity
  });

  shelfInsert(p);
  state.shelfValue += p.price;
  state.selectedId = p.id;
  showStage(p, calc.tags);
  updateTopbar();
  scheduleShelfRender();
  scheduleSave();
  showStatus('Получен номер: ' + (p.note || (p.code || (p.l1 + p.d + p.l2 + p.l3 + ' ' + p.reg))) + '!');
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
    shelf.length = 0;
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

// --- Сцена (большой фотореалистичный номер) ---
let lastStageRarity = -1;
function showStage(p, tags) {
  plateWrapEl.innerHTML = makePlateSvg(p, { full: true });
  stageEl.className = 'stage r' + p.rarity;
  rarityEl.textContent = RARITY_NAMES[p.rarity] || 'Особый';
  priceEl.textContent = formatMoney(cheatPriceMult ? p.price * 10 : p.price);
  if (tags && tags.length) {
    let html = '';
    for (let i = 0; i < tags.length; i++) {
      html += '<span class="tag">' + escapeHtml(tags[i]) + '</span>';
    }
    tagsEl.innerHTML = html;
  } else {
    tagsEl.innerHTML = '';
  }
  btnSell.disabled = false;
  if (p.rarity !== lastStageRarity) {
    lastStageRarity = p.rarity;
    renderBgShader(p.rarity);
  }
}

function clearStage() {
  plateWrapEl.innerHTML = '<span class="stage-placeholder">Нажми «Получить номер»</span>';
  rarityEl.textContent = '';
  priceEl.textContent = '';
  tagsEl.innerHTML = '';
  stageEl.className = 'stage';
  btnSell.disabled = true;
  if (lastStageRarity !== 0) {
    lastStageRarity = 0;
    renderBgShader(0);
  }
}

// --- Отрисовка шкафа (с кэшированием мини-SVG) ---
let shelfRenderQueued = false;
function scheduleShelfRender() {
  if (shelfRenderQueued) return;
  shelfRenderQueued = true;
  requestAnimationFrame(renderShelf);
}

function updatePagerOnly() {
  const pages = Math.max(1, Math.ceil(shelf.length / PAGE_SIZE));
  pgInfoEl.textContent = (page + 1) + ' / ' + pages;
  pgPrevEl.disabled = page === 0;
  pgNextEl.disabled = page >= pages - 1;
}

function renderShelf() {
  shelfRenderQueued = false;
  const pages = Math.max(1, Math.ceil(shelf.length / PAGE_SIZE));
  if (page >= pages) page = pages - 1;
  if (page < 0) page = 0;
  const start = page * PAGE_SIZE;
  const end = Math.min(shelf.length, start + PAGE_SIZE);

  if (start >= end) {
    gridEl.innerHTML = '<div class="empty">Шкаф пуст</div>';
  } else {
    let html = '';
    for (let i = start; i < end; i++) {
      const p = shelf[i];
      const selClass = p.id === state.selectedId ? ' sel' : '';
      const displayPrice = formatMoney(cheatPriceMult ? p.price * 10 : p.price);
      html += '<div class="cell r' + p.rarity + selClass + '" data-id="' + p.id + '">' +
        makePlateSvg(p, { full: false }) +
        '<div class="cell-price">' + displayPrice + '</div></div>';
    }
    gridEl.innerHTML = html;
  }

  pgInfoEl.textContent = (page + 1) + ' / ' + pages;
  pgPrevEl.disabled = page === 0;
  pgNextEl.disabled = page >= pages - 1;
}

// --- Верхняя панель и улучшение ---
function updateTopbar() {
  moneyEl.textContent = formatMoney(state.money);
  slotsEl.textContent = cheatUnlimitedShelf
    ? (shelf.length + ' / ∞')
    : (shelf.length + ' / ' + SHELF_TIERS[state.tier].slots);
  shelfValueEl.textContent = formatMoney(state.shelfValue);
  shelfTitleEl.textContent = SHELF_TIERS[state.tier].name + ' шкаф';
  shelfPanelEl.style.borderColor = SHELF_TIERS[state.tier].color;
  shelfTitleEl.style.color = SHELF_TIERS[state.tier].color;
  updateUpgrade();
}

function updateUpgrade() {
  const curTier = SHELF_TIERS[state.tier];
  const next = SHELF_TIERS[state.tier + 1];
  if (next) {
    upgradeTextEl.innerHTML = '<div>Следующий шкаф: <strong>' + next.name + '</strong></div><div>Мест: ' + next.slots + ' (сейчас ' + curTier.slots + ')</div>';
    btnUpgrade.style.display = '';
    btnUpgrade.textContent = 'Купить за ' + formatMoney(next.price);
    btnUpgrade.disabled = state.money < next.price;
  } else {
    upgradeTextEl.innerHTML = '<div>У тебя лучший шкаф</div>';
    btnUpgrade.style.display = 'none';
  }
}

let statusTimer = null;
function showStatus(text) {
  statusEl.textContent = text;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusTimer = null;
    statusEl.textContent = '';
  }, 2500);
}

// --- Быстрое сохранение и загрузка ---
function saveNow() {
  try {
    const payload = JSON.stringify({
      v: 1,
      money: state.money,
      tier: state.tier,
      plates: shelf.map(plateToStr)
    });
    localStorage.setItem(SAVE_KEY, payload);
  } catch (e) {}
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveNow();
  }, 1500);
}

window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveNow();
});

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY) || localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return;

    if (typeof data.money === 'number' && Number.isFinite(data.money) && data.money >= 0) {
      state.money = Math.floor(data.money);
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
        } catch (err) {}
      }
      shelf.sort((a, b) => b.price - a.price);
      state.shelfValue = totalVal;
    }
  } catch (e) {}
}

// ========================================================
// ЛОГИКА ЧИТ-ПАНЕЛИ И АУТЕНТИФИКАЦИИ РАЗРАБОТЧИКА
// ========================================================

function openPwdModal() {
  modalPwd.hidden = false;
  devPwdInput.value = '';
  devPwdError.textContent = '';
  setTimeout(() => devPwdInput.focus(), 30);
}

function closePwdModal() {
  modalPwd.hidden = true;
  devPwdInput.value = '';
  devPwdError.textContent = '';
}

function openDevModal() {
  if (!devAuthorized) {
    openPwdModal();
    return;
  }
  modalDev.hidden = false;
  populateDevUI();
}

function closeDevModal() {
  modalDev.hidden = true;
  modalDev.innerHTML = '';
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
  if (devAuthorized) {
    openDevModal();
  } else {
    openPwdModal();
  }
}

function submitPassword() {
  const pwd = devPwdInput.value.trim();
  if (!pwd) {
    devPwdError.textContent = 'Введите ключ доступа';
    devPwdInput.focus();
    return;
  }

  if (_verifyAccessKey(pwd)) {
    devAuthorized = true;
    closePwdModal();
    openDevModal();
    showStatus('Режим разработчика активирован');
  } else {
    devPwdError.textContent = 'Неверный ключ доступа';
    devPwdInput.focus();
    devPwdInput.select();
  }
}

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

      <section id="tab-special" class="dev-tab-pane">
        <div class="dev-notice">Культовые серии номеров РФ (включая А111ТВ 777 и О777ЕР 78 с фото). Доступны в 1 клик:</div>
        <div class="dev-plates-grid" id="dev-special-list"></div>
      </section>

      <section id="tab-foreign" class="dev-tab-pane">
        <div class="dev-notice-warning">Иностранные номера доступны <strong>ТОЛЬКО</strong> через меню разработчика. В обычной игре они никогда не выпадают!</div>
        <div class="dev-plates-grid" id="dev-foreign-list"></div>
      </section>

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

function updateDevTierButtons() {
  const el = modalDev.querySelector('#dev-tier-list');
  if (!el) return;
  el.innerHTML = SHELF_TIERS.map((tier, idx) =>
    '<button class="btn btn-dev-tier ' + (idx === state.tier ? 'active-tier' : '') + '" data-tier="' + idx + '" type="button">' +
    '<strong>' + tier.name + '</strong><span>' + tier.slots + ' мест</span></button>'
  ).join('');
}

let specialListRendered = false;
let foreignListRendered = false;

function renderSpecialListIfNeeded() {
  if (specialListRendered) return;
  const devSpecialListEl = modalDev.querySelector('#dev-special-list');
  if (devSpecialListEl) {
    devSpecialListEl.innerHTML = SPECIAL_PLATES.map((sp, idx) =>
      '<div class="dev-plate-card" data-special-idx="' + idx + '">' +
      makePlateSvg(sp, { full: false }) +
      '<div class="dev-plate-meta"><span class="dev-plate-name">' + sp.note + '</span>' +
      '<span class="dev-plate-cost">' + formatMoney(sp.price) + '</span></div></div>'
    ).join('');
    specialListRendered = true;
  }
}

function renderForeignListIfNeeded() {
  if (foreignListRendered) return;
  const devForeignListEl = modalDev.querySelector('#dev-foreign-list');
  if (devForeignListEl) {
    devForeignListEl.innerHTML = FOREIGN_RARE_PLATES.map((fp, idx) =>
      '<div class="dev-plate-card" data-foreign-idx="' + idx + '">' +
      makePlateSvg({ isForeign: true, country: fp.country, code: fp.code }, { full: false }) +
      '<div class="dev-plate-meta"><span class="dev-plate-name">' + fp.countryName + '</span>' +
      '<span class="dev-plate-cost">' + formatMoney(fp.price) + '</span></div></div>'
    ).join('');
    foreignListRendered = true;
  }
}

function populateDevUI() {
  if (!devAuthorized) {
    closeDevModal();
    return;
  }

  specialListRendered = false;
  foreignListRendered = false;
  modalDev.innerHTML = DEV_MODAL_TEMPLATE;

  updateDevTierButtons();

  const chkForce = modalDev.querySelector('#chk-force-mythic');
  const chkUnlim = modalDev.querySelector('#chk-unlimited-shelf');
  const chkMult = modalDev.querySelector('#chk-price-mult');
  if (chkForce) chkForce.checked = cheatForceMythic;
  if (chkUnlim) chkUnlim.checked = cheatUnlimitedShelf;
  if (chkMult) chkMult.checked = cheatPriceMult;

  const tabs = modalDev.querySelectorAll('.dev-tab');
  const panes = modalDev.querySelectorAll('.dev-tab-pane');
  for (let i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function() {
      for (let j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
      for (let j = 0; j < panes.length; j++) panes[j].classList.remove('active');
      this.classList.add('active');
      const tabId = this.dataset.tab;
      const target = modalDev.querySelector('#' + tabId);
      if (target) target.classList.add('active');
      if (tabId === 'tab-special') renderSpecialListIfNeeded();
      if (tabId === 'tab-foreign') renderForeignListIfNeeded();
    });
  }
}

modalDev.addEventListener('click', (e) => {
  if (e.target === modalDev) {
    closeDevModal();
    return;
  }
  if (!devAuthorized) {
    closeDevModal();
    return;
  }

  if (e.target.closest('#btn-dev-close-x') || e.target.closest('#btn-dev-close')) {
    closeDevModal();
    return;
  }

  const btnCheat = e.target.closest('[data-cheat="money"]');
  if (btnCheat) {
    const val = +btnCheat.dataset.val;
    state.money += val;
    updateTopbar();
    scheduleSave();
    showStatus('Начислено: +' + formatMoney(val));
    return;
  }

  const btnTier = e.target.closest('[data-tier]');
  if (btnTier) {
    const newTier = +btnTier.dataset.tier;
    state.tier = newTier;
    updateTopbar();
    updateDevTierButtons();
    scheduleSave();
    showStatus('Установлен шкаф: ' + SHELF_TIERS[newTier].name);
    return;
  }

  const spCard = e.target.closest('[data-special-idx]');
  if (spCard) {
    const idx = +spCard.dataset.specialIdx;
    const sp = SPECIAL_PLATES[idx];
    if (sp) addPlateToShelf(Object.assign({}, sp));
    return;
  }

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

  if (e.target.closest('#btn-dev-sell-all-instant')) {
    if (shelf.length === 0) return;
    state.money += state.shelfValue;
    shelf.length = 0;
    state.shelfValue = 0;
    state.selectedId = null;
    clearStage();
    page = 0;
    updateTopbar();
    scheduleShelfRender();
    scheduleSave();
    showStatus('Шкаф полностью очищен');
    return;
  }

  if (e.target.closest('#btn-dev-spawn-custom')) {
    const l1El = modalDev.querySelector('#cust-l1');
    const dEl = modalDev.querySelector('#cust-digits');
    const l2El = modalDev.querySelector('#cust-l2');
    const l3El = modalDev.querySelector('#cust-l3');
    const regEl = modalDev.querySelector('#cust-reg');
    const noteEl = modalDev.querySelector('#cust-note');
    const priceEl = modalDev.querySelector('#cust-price');
    const rarEl = modalDev.querySelector('#cust-rarity');

    const l1 = (l1El ? l1El.value : 'А').trim().toUpperCase();
    const d = (dEl ? dEl.value : '777').trim();
    const l2 = (l2El ? l2El.value : 'А').trim().toUpperCase();
    const l3 = (l3El ? l3El.value : 'А').trim().toUpperCase();
    const reg = (regEl ? regEl.value : '777').trim();
    const note = (noteEl ? noteEl.value : 'Кастомный VIP').trim();
    const price = Math.max(100, parseInt(priceEl ? priceEl.value : '10000000', 10) || 10000000);
    const rarity = parseInt(rarEl ? rarEl.value : '5', 10) || 5;

    addPlateToShelf({
      isCustom: true,
      l1, d, l2, l3, reg, note, price, rarity
    });
    return;
  }

  if (e.target.closest('#btn-dev-reset-game')) {
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(LEGACY_KEY);
    } catch (err) {}
    state.money = 0;
    state.tier = 0;
    state.nextId = 1;
    state.shelfValue = 0;
    state.selectedId = null;
    shelf.length = 0;
    page = 0;
    clearStage();
    updateTopbar();
    scheduleShelfRender();
    updateDevTierButtons();
    showStatus('Прогресс полностью сброшен');
    return;
  }
});

modalDev.addEventListener('change', (e) => {
  if (!devAuthorized) return;
  if (e.target.id === 'chk-force-mythic') {
    cheatForceMythic = e.target.checked;
    showStatus('Гарантированный мифик: ' + (cheatForceMythic ? 'ВКЛ' : 'ВЫКЛ'));
  } else if (e.target.id === 'chk-unlimited-shelf') {
    cheatUnlimitedShelf = e.target.checked;
    updateTopbar();
    showStatus('Бесконечный шкаф: ' + (cheatUnlimitedShelf ? 'ВКЛ' : 'ВЫКЛ'));
  } else if (e.target.id === 'chk-price-mult') {
    cheatPriceMult = e.target.checked;
    updateTopbar();
    scheduleShelfRender();
    if (state.selectedId) {
      const sel = shelf.find(x => x.id === state.selectedId);
      if (sel) showStage(sel, calculatePrice(sel).tags);
    }
    showStatus('Множитель цен продажи (x10): ' + (cheatPriceMult ? 'ВКЛ' : 'ВЫКЛ'));
  }
});

btnPwdClose.addEventListener('click', closePwdModal);
btnDevPwdCancel.addEventListener('click', closePwdModal);
formPwd.addEventListener('submit', (e) => {
  e.preventDefault();
  submitPassword();
});
btnDevTrigger.addEventListener('click', toggleDevPanel);
modalPwd.addEventListener('click', (e) => {
  if (e.target === modalPwd) closePwdModal();
});

// ========================================================
// ОБРАБОТКА ВВОДА И КЛАВИАТУРЫ
// ========================================================

btnGet.tabIndex = -1;
btnGet.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  onGetPlate();
});
btnGet.addEventListener('click', (e) => e.preventDefault());
btnGet.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
  const isInput = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA');

  if (e.code === 'KeyC' || e.key === 'c' || e.key === 'C' || e.key === 'с' || e.key === 'С') {
    if (!isInput) {
      e.preventDefault();
      toggleDevPanel();
      return;
    }
  }

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

btnSell.addEventListener('click', sellSelected);
btnSellAll.addEventListener('click', sellAll);
btnUpgrade.addEventListener('click', buyNextShelf);

gridEl.addEventListener('click', (e) => {
  const cell = e.target.closest('.cell');
  if (!cell) return;
  const id = +cell.dataset.id;
  for (let i = 0; i < shelf.length; i++) {
    if (shelf[i].id === id) {
      state.selectedId = id;
      showStage(shelf[i], calculatePrice(shelf[i]).tags);
      scheduleShelfRender();
      break;
    }
  }
});

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
initOnDemandShader();
loadGame();

if (shelf.length > 0) {
  state.selectedId = shelf[0].id;
  showStage(shelf[0], calculatePrice(shelf[0]).tags);
} else {
  clearStage();
}

updateTopbar();
renderShelf();

})();
