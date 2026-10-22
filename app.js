// app.js — состояние игры, интерфейс, чит-панель разработчика, ввод, WebGL шейдер фона, сохранение

// --- Константы и состояние ---
const PAGE_SIZE = 48;
const SAVE_KEY = 'rarePlates_v1';
const DEV_PASSWORD = '2020';

const state = {
  money: 0,
  tier: 0,            // индекс в SHELF_TIERS
  nextId: 1,
  shelfValue: 0,      // сумма цен номеров на шкафу
  selectedId: null    // какой номер показан на сцене
};

// Чит-состояние разработчика
let devUnlocked = false;
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

// --- DOM элементы модальных окон разработчика ---
const btnDevTrigger = document.getElementById('btn-dev-trigger');

const modalPwd = document.getElementById('modal-pwd');
const formPwd = document.getElementById('form-pwd');
const devPwdInput = document.getElementById('dev-pwd-input');
const devPwdError = document.getElementById('dev-pwd-error');
const btnPwdClose = document.getElementById('btn-pwd-close');
const btnDevPwdCancel = document.getElementById('btn-dev-pwd-cancel');

const modalDev = document.getElementById('modal-dev');
const btnDevCloseX = document.getElementById('btn-dev-close-x');
const btnDevClose = document.getElementById('btn-dev-close');

const devTabs = document.querySelectorAll('.dev-tab');
const devTabPanes = document.querySelectorAll('.dev-tab-pane');
const devTierListEl = document.getElementById('dev-tier-list');
const devSpecialListEl = document.getElementById('dev-special-list');
const devForeignListEl = document.getElementById('dev-foreign-list');

const btnDevSellAllInstant = document.getElementById('btn-dev-sell-all-instant');
const btnDevSpawnCustom = document.getElementById('btn-dev-spawn-custom');
const chkForceMythic = document.getElementById('chk-force-mythic');
const chkUnlimitedShelf = document.getElementById('chk-unlimited-shelf');
const chkPriceMult = document.getElementById('chk-price-mult');
const btnDevResetGame = document.getElementById('btn-dev-reset-game');

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
// ЛОГИКА ЧИТ-ПАНЕЛИ И ПАРОЛЯ РАЗРАБОТЧИКА (KeyC, пароль 2020)
// ========================================================

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
  modalDev.hidden = false;
  populateDevUI();
}

function closeDevModal() {
  modalDev.hidden = true;
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

  if (devUnlocked) {
    openDevModal();
  } else {
    openPwdModal();
  }
}

// Проверка пароля разработчика
function submitPassword() {
  const pwd = devPwdInput.value.trim();
  if (pwd === DEV_PASSWORD) {
    devUnlocked = true;
    closePwdModal();
    openDevModal();
    showStatus('Режим разработчика активирован', false);
  } else {
    devPwdError.textContent = 'Неверный пароль доступа';
    const card = modalPwd.querySelector('.modal-card');
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 400);
    devPwdInput.focus();
    devPwdInput.select();
  }
}

// Заполнение интерфейса чит-панели (списки шкафов, спецномеров и иностранных)
let devUIInitialized = false;
function populateDevUI() {
  if (devUIInitialized) {
    updateDevTierButtons();
    return;
  }
  devUIInitialized = true;

  // 1. Кнопки уровней шкафа
  updateDevTierButtons();

  // 2. Спецномера РФ
  devSpecialListEl.innerHTML = SPECIAL_PLATES.map((sp, idx) => `
    <div class="dev-plate-card" data-special-idx="${idx}">
      ${makePlateSvg(sp, { full: false })}
      <div class="dev-plate-meta">
        <span class="dev-plate-name">${sp.note}</span>
        <span class="dev-plate-cost">${formatMoney(sp.price)}</span>
      </div>
    </div>
  `).join('');

  // 3. Мировые раритеты (доступны только в чит-меню!)
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

function updateDevTierButtons() {
  devTierListEl.innerHTML = SHELF_TIERS.map((tier, idx) => `
    <button class="btn btn-dev-tier ${idx === state.tier ? 'active-tier' : ''}" data-tier="${idx}" type="button">
      <strong>${tier.name}</strong>
      <span>${tier.slots} мест</span>
    </button>
  `).join('');
}

// Переключение вкладок меню разработчика
devTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    devTabs.forEach(t => t.classList.remove('active'));
    devTabPanes.forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    const target = document.getElementById(tab.dataset.tab);
    if (target) target.classList.add('active');
  });
});

// Обработка клика по начислению денег
modalDev.addEventListener('click', (e) => {
  const btnCheat = e.target.closest('[data-cheat="money"]');
  if (btnCheat) {
    const val = +btnCheat.dataset.val;
    state.money += val;
    updateTopbar();
    scheduleSave();
    showStatus(`Начислено: +${formatMoney(val)}`, false);
    return;
  }

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
  }
});

// Мгновенная очистка шкафа
btnDevSellAllInstant.addEventListener('click', () => {
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
});

// Создание кастомного номера
btnDevSpawnCustom.addEventListener('click', () => {
  const l1 = document.getElementById('cust-l1').value.trim().toUpperCase() || 'А';
  const d = document.getElementById('cust-digits').value.trim() || '777';
  const l2 = document.getElementById('cust-l2').value.trim().toUpperCase() || 'А';
  const l3 = document.getElementById('cust-l3').value.trim().toUpperCase() || 'А';
  const reg = document.getElementById('cust-reg').value.trim() || '777';
  const note = document.getElementById('cust-note').value.trim() || 'Кастомный номер';
  const price = Math.max(100, parseInt(document.getElementById('cust-price').value, 10) || 1000000);
  const rarity = parseInt(document.getElementById('cust-rarity').value, 10);

  addPlateToShelf({
    isCustom: true,
    l1, d, l2, l3, reg, note, price, rarity
  });
});

// Чекбоксы читов
chkForceMythic.addEventListener('change', (e) => {
  cheatForceMythic = e.target.checked;
  showStatus(`Гарантированный мифик: ${cheatForceMythic ? 'ВКЛ' : 'ВЫКЛ'}`, false);
});

chkUnlimitedShelf.addEventListener('change', (e) => {
  cheatUnlimitedShelf = e.target.checked;
  updateTopbar();
  showStatus(`Бесконечный шкаф: ${cheatUnlimitedShelf ? 'ВКЛ' : 'ВЫКЛ'}`, false);
});

chkPriceMult.addEventListener('change', (e) => {
  cheatPriceMult = e.target.checked;
  updateTopbar();
  scheduleShelfRender();
  if (state.selectedId) {
    const sel = shelf.find(x => x.id === state.selectedId);
    if (sel) showStage(sel, calculatePrice(sel).tags);
  }
  showStatus(`Множитель цен продажи (x10): ${cheatPriceMult ? 'ВКЛ' : 'ВЫКЛ'}`, false);
});

// Полный сброс игры
btnDevResetGame.addEventListener('click', () => {
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
});

// Закрытие модальных окон
btnPwdClose.addEventListener('click', closePwdModal);
btnDevPwdCancel.addEventListener('click', closePwdModal);
btnDevCloseX.addEventListener('click', closeDevModal);
btnDevClose.addEventListener('click', closeDevModal);
formPwd.addEventListener('submit', (e) => {
  e.preventDefault();
  submitPassword();
});

btnDevTrigger.addEventListener('click', toggleDevPanel);

// Закрытие по клику на фон
modalPwd.addEventListener('click', (e) => {
  if (e.target === modalPwd) closePwdModal();
});
modalDev.addEventListener('click', (e) => {
  if (e.target === modalDev) closeDevModal();
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
