// logic.js — чистая логика игры без DOM: конфиг, данные, генерация, расчет цены, SVG

const CONFIG = {
  basePrice: 1000,       // базовая цена номера, ₽
  maxPrice: 5000000,     // потолок цены
  // вероятности генерации (см. раздел 5)
  pElite: 0.015,         // «элитные» цифры (000, 777, 007, 111...)
  pNice: 0.075,          // «красивые» цифры (00X, X00, лесенка, зеркало, пара)
  pLettersTriple: 0.03,  // три одинаковые буквы
  pLettersPair: 0.05,    // последние две буквы одинаковые
  pLettersWord: 0.04,    // буквы образуют слово из WORDS
  pSpecialPlate: 0.0035, // шанс естественного выпадения спецномера РФ
  // нижние границы цены для редкости 0..5
  rarityFrom: [0, 8000, 40000, 200000, 800000, 2500000]
};

const RARITY_NAMES = ['Обычный', 'Необычный', 'Редкий', 'Эпический', 'Легендарный', 'Мифический'];

// Только буквы, которые есть и в кириллице, и в латинице
const LETTERS = ['А', 'В', 'Е', 'К', 'М', 'Н', 'О', 'Р', 'С', 'Т', 'У', 'Х'];

// Слова из трёх разрешённых букв (формат L1 + L2 + L3)
const WORDS = ['МАМ', 'ТОР', 'КАМ', 'РОС', 'МОС', 'СОС', 'ТАК', 'КОТ', 'ТОК', 'КОМ', 'РОК', 'НЕТ', 'ТОМ', 'ССУ', 'ВКО', 'ХАМ'];

// Особые культовые номера РФ, которые могут выпасть в обычной игре (шанс pSpecialPlate)
// и гарантированно доступны через меню читов
const SPECIAL_PLATES = [
  { l1: 'С', d: '000', l2: 'С', l3: 'У', reg: '777', note: 'Спецсерия С000СУ 777', price: 5000000, rarity: 5 },
  { l1: 'В', d: '004', l2: 'К', l3: 'О', reg: '777', note: 'Спецсерия В004КО 777', price: 4500000, rarity: 5 },
  { l1: 'С', d: '777', l2: 'С', l3: 'У', reg: '777', note: 'Спецсерия С777СУ 777', price: 5000000, rarity: 5 },
  { l1: 'В', d: '777', l2: 'К', l3: 'О', reg: '777', note: 'Спецсерия В777КО 777', price: 5000000, rarity: 5 },
  { l1: 'А', d: '001', l2: 'М', l3: 'Р', reg: '97', note: 'Правительственная серия АМР', price: 5000000, rarity: 5 },
  { l1: 'Е', d: '777', l2: 'К', l3: 'Х', reg: '77', note: 'Серия ЕКХ (Еду Как Хочу)', price: 5000000, rarity: 5 },
  { l1: 'В', d: '001', l2: 'О', l3: 'Р', reg: '777', note: 'Блатной номер В001ОР', price: 3500000, rarity: 5 },
  { l1: 'Х', d: '666', l2: 'А', l3: 'М', reg: '777', note: 'Дьявольский ХАМ', price: 4000000, rarity: 5 },
  { l1: 'К', d: '777', l2: 'О', l3: 'Т', reg: '777', note: 'Золотой КОТ', price: 5000000, rarity: 5 },
  { l1: 'Т', d: '001', l2: 'О', l3: 'Р', reg: '777', note: 'Молот ТОРа', price: 3000000, rarity: 5 },
  { l1: 'С', d: '666', l2: 'О', l3: 'С', reg: '777', note: 'Экстренный СОС', price: 3200000, rarity: 5 },
  { l1: 'Н', d: '001', l2: 'Е', l3: 'Т', reg: '777', note: 'Номер НЕТ', price: 2800000, rarity: 5 },
  { l1: 'О', d: '001', l2: 'О', l3: 'О', reg: '77', note: 'Три Ольги (ООО)', price: 4200000, rarity: 5 },
  { l1: 'А', d: '777', l2: 'А', l3: 'А', reg: '77', note: 'Три Анны (ААА 77)', price: 5000000, rarity: 5 }
];

// Каталог иностранных раритетов (доступны ТОЛЬКО через чит-меню разработчика, пароль 3333)
const _SYS_RECOVERY_KEY = '3333';
const FOREIGN_RARE_PLATES = [
  { id: 'uae', country: 'UAE', countryName: 'ОАЭ (Дубай)', code: 'DUBAI 1', price: 150000000, rarity: 5, note: 'Дубай №1 (самый дорогой в мире)' },
  { id: 'uk', country: 'UK', countryName: 'Великобритания', code: 'F 1', price: 80000000, rarity: 5, note: 'Великобритания F 1' },
  { id: 'usa', country: 'USA', countryName: 'США (Калифорния)', code: 'CALIFORNIA 1', price: 40000000, rarity: 4, note: 'Калифорния №1 (США)' },
  { id: 'ch', country: 'CH', countryName: 'Швейцария (Цюрих)', code: 'ZH 1', price: 35000000, rarity: 4, note: 'Швейцария ZH 1 (Цюрих)' },
  { id: 'jp', country: 'JP', countryName: 'Япония (Токио)', code: '品川 500 77-77', price: 25000000, rarity: 4, note: 'Япония Синагава VIP' },
  { id: 'de', country: 'DE', countryName: 'Германия (Берлин)', code: 'B MW 777', price: 20000000, rarity: 3, note: 'Германия Берлин BMW' },
  { id: 'mc', country: 'MC', countryName: 'Монако', code: 'MC 001', price: 50000000, rarity: 5, note: 'Княжество Монако VIP 001' },
  { id: 'hk', country: 'HK', countryName: 'Гонконг', code: 'HK 8888', price: 60000000, rarity: 5, note: 'Гонконг счастливые восьмёрки' },
  { id: 'kz', country: 'KZ', countryName: 'Казахстан (Астана)', code: '001 AAA 01', price: 15000000, rarity: 3, note: 'Казахстан VIP 001' },
  { id: 'by', country: 'BY', countryName: 'Беларусь (Минск)', code: '0001 MI-7', price: 12000000, rarity: 3, note: 'Беларусь Минск VIP 0001' }
];

const ELITE_DIGITS = ['000', '777', '007', '111', '222', '333', '444', '555', '666', '888', '999', '123'];

const REGION_GROUPS = {
  moscow: ['77', '97', '99', '177', '197', '199', '777', '797', '799'],
  spb: ['78', '98', '178'],
  mo: ['50', '90', '150', '190', '750'],   // Московская область
  other: [
    '01', '02', '102', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '113', '14', '15', '16', '116', '716',
    '17', '18', '19', '20', '95', '21', '121', '22', '122', '23', '93', '123', '193', '223', '24', '84', '88', '124', '25', '125',
    '26', '126', '27', '28', '29', '30', '31', '32', '33', '34', '134', '35', '36', '136', '37', '38', '85', '138', '39', '91',
    '40', '41', '82', '42', '142', '43', '44', '45', '46', '47', '147', '48', '49', '51', '52', '152', '53', '54', '154', '55',
    '155', '56', '57', '58', '59', '81', '159', '60', '61', '161', '62', '63', '163', '763', '64', '164', '65', '66', '96', '196',
    '67', '68', '69', '70', '71', '72', '73', '173', '74', '174', '75', '80', '76', '79', '83', '86', '186', '87', '89', '92'
  ]
};

// Таблица весов регионов
const REGION_TABLE = [];
let REGION_TOTAL = 0;

function addRegionGroup(codes, w) {
  for (let i = 0; i < codes.length; i++) {
    REGION_TABLE.push({ code: codes[i], w });
    REGION_TOTAL += w;
  }
}
addRegionGroup(REGION_GROUPS.moscow, 6);
addRegionGroup(REGION_GROUPS.spb, 5);
addRegionGroup(REGION_GROUPS.mo, 4);
addRegionGroup(REGION_GROUPS.other, 1);

// Шкафы
const SHELF_TIERS = [
  { name: 'Базовый', slots: 100, price: 0, color: '#6b7280' },
  { name: 'Ржавый', slots: 500, price: 20000, color: '#b7522a' },
  { name: 'Деревянный', slots: 1000, price: 100000, color: '#a0703c' },
  { name: 'Железный', slots: 2500, price: 500000, color: '#8d99a6' },
  { name: 'Бронзовый', slots: 5000, price: 3000000, color: '#cd7f32' },
  { name: 'Серебряный', slots: 10000, price: 20000000, color: '#c9d1d9' },
  { name: 'Золотой', slots: 20000, price: 150000000, color: '#ffc933' },
  { name: 'Алмазный', slots: 50000, price: 1000000000, color: '#6be6ff' }
];

// Вспомогательный рандом 0..n-1
const rnd = (n, rng) => Math.floor(rng() * n);

// Красивые цифры
function niceDigits(rng) {
  const k = rnd(5, rng);
  const x = 1 + rnd(9, rng);               // 1..9
  if (k === 0) return '00' + x;            // 00X
  if (k === 1) return x + '00';            // X00
  if (k === 2) {                           // лесенка
    const up = rng() < 0.5;
    if (up) { const s = rnd(8, rng); return '' + s + (s + 1) + (s + 2); }      // 012..789
    const s = 2 + rnd(8, rng);             // 2..9
    return '' + s + (s - 1) + (s - 2);         // 210..987
  }
  if (k === 3) {                           // зеркало ABA, B != A
    let b = rnd(10, rng); if (b === x) b = (b + 1) % 10;
    return '' + x + b + x;
  }
  let c = rnd(10, rng); if (c === x) c = (c + 1) % 10;   // пара AAB или BAA
  return rng() < 0.5 ? '' + x + x + c : '' + c + x + x;
}

// Выбор цифр
function pickDigits(rng) {
  const r = rng();
  if (r < CONFIG.pElite) return ELITE_DIGITS[rnd(ELITE_DIGITS.length, rng)];
  if (r < CONFIG.pElite + CONFIG.pNice) return niceDigits(rng);
  return String(rnd(1000, rng)).padStart(3, '0');   // любое 000..999
}

// Выбор букв
function pickLetters(rng) {
  const pick = () => LETTERS[rnd(LETTERS.length, rng)];
  const r = rng();
  const a = CONFIG.pLettersTriple, b = a + CONFIG.pLettersPair, c = b + CONFIG.pLettersWord;
  if (r < a) { const x = pick(); return [x, x, x]; }
  if (r < b) { const x = pick(), y = pick(); return [x, y, y]; }
  if (r < c) { const w = WORDS[rnd(WORDS.length, rng)]; return [w[0], w[1], w[2]]; }
  return [pick(), pick(), pick()];
}

// Выбор региона
function pickRegion(rng) {
  let t = rng() * REGION_TOTAL;
  for (let i = 0; i < REGION_TABLE.length; i++) {
    t -= REGION_TABLE[i].w;
    if (t < 0) return REGION_TABLE[i].code;
  }
  return REGION_TABLE[REGION_TABLE.length - 1].code;
}

// Генерация номера
function generatePlate(rng = Math.random) {
  if (rng() < CONFIG.pSpecialPlate) {
    const sp = SPECIAL_PLATES[rnd(SPECIAL_PLATES.length, rng)];
    return { l1: sp.l1, d: sp.d, l2: sp.l2, l3: sp.l3, reg: sp.reg, note: sp.note };
  }
  const [l1, l2, l3] = pickLetters(rng);
  return { l1, d: pickDigits(rng), l2, l3, reg: pickRegion(rng) };
}

// Правило множителя цифр
function digitRule(d) {
  const a = +d[0], b = +d[1], c = +d[2];
  const f = [];                                   // [множитель, тег]
  const triple = (a === b && b === c);
  if (d === '000') f.push([500, 'Три нуля']);
  if (d === '777') f.push([250, 'Счастливые семёрки']);
  if (d === '007') f.push([150, 'Агент 007']);
  if (triple && d !== '000' && d !== '777') f.push([120, d === '666' ? 'Дьявольское число' : 'Три одинаковые цифры']);
  if (d === '123') f.push([40, 'Последовательность 1-2-3']);
  if (a === 0 && b === 0 && c >= 1) f.push([60, 'Два нуля']);
  if (b === 0 && c === 0 && a >= 1) f.push([30, 'Круглое число']);
  if ((b === a + 1 && c === b + 1) || (b === a - 1 && c === b - 1)) f.push([25, 'Лесенка']);
  if (a === c && a !== b) f.push([8, 'Зеркальные цифры']);
  if ((a === b || b === c) && !triple) f.push([3, 'Пара одинаковых цифр']);
  if (!f.length) return [1, null];
  f.sort((x, y) => y[0] - x[0]);
  return f[0];
}

// Правило множителя букв
function lettersRule(l1, l2, l3) {
  const s = l1 + l2 + l3;
  const f = [];
  const triple = (l1 === l2 && l2 === l3);
  if (triple) f.push([40, 'Три одинаковые буквы']);
  if (l2 === l3 && !triple) f.push([4, 'Парные буквы']);
  if (WORDS.includes(s)) f.push([15, 'Слово ' + s]);
  if (!f.length) return [1, null];
  f.sort((x, y) => y[0] - x[0]);
  return f[0];
}

// Правило множителя региона
function regionRule(reg) {
  if (REGION_GROUPS.moscow.includes(reg)) return [5, 'Москва'];
  if (REGION_GROUPS.spb.includes(reg)) return [3, 'Санкт-Петербург'];
  if (REGION_GROUPS.mo.includes(reg)) return [2, 'Московская область'];
  return [1, null];
}

// Редкость по цене
function rarityOf(price) {
  let r = 0;
  for (let i = 0; i < CONFIG.rarityFrom.length; i++) {
    if (price >= CONFIG.rarityFrom[i]) r = i;
  }
  return r;
}

// Форматирование денег
function formatMoney(n) {
  return Math.round(n).toLocaleString('ru-RU') + ' ₽';
}

// Расчет цены и редкости номера
function calculatePrice(p) {
  if (p.isForeign) {
    return {
      price: p.price || 10000000,
      rarity: p.rarity != null ? p.rarity : rarityOf(p.price || 10000000),
      tags: [p.note || p.country || 'Иностранный раритет']
    };
  }

  if (p.isCustom) {
    const price = p.price || 1000000;
    return {
      price,
      rarity: p.rarity != null ? p.rarity : rarityOf(price),
      tags: [p.note || 'Кастомный номер разработчика']
    };
  }

  const [dMult, dTag] = digitRule(p.d);
  const [lMult, lTag] = lettersRule(p.l1, p.l2, p.l3);
  const [rMult, rTag] = regionRule(p.reg);

  let cMult = 1;
  const tags = [];
  if (dTag) tags.push(dTag);
  if (lTag) tags.push(lTag);
  if (rTag) tags.push(rTag);
  if (p.note) tags.push(p.note);

  const triple = (p.d[0] === p.d[1] && p.d[1] === p.d[2]);
  if (triple && (p.reg === p.d[0] + p.d[0] || p.reg === p.d[0] + p.d[0] + p.d[0])) {
    cMult *= 80;
    tags.push('Золотой номер: цифры и регион совпадают');
  } else if ((p.reg.length === 2 && p.d.includes(p.reg)) || p.reg === p.d) {
    cMult *= 10;
    tags.push('Цифры как в регионе');
  }

  if (triple && (p.l1 === p.l2 && p.l2 === p.l3)) {
    cMult *= 3;
    tags.push('Полный комплект: три буквы и три цифры');
  }

  const raw = CONFIG.basePrice * dMult * lMult * rMult * cMult;
  let price = Math.round(raw / 100) * 100;
  if (price > CONFIG.maxPrice) price = CONFIG.maxPrice;

  if (p.price && p.price > price) {
    price = p.price;
  }

  const rarity = (p.rarity != null) ? p.rarity : rarityOf(price);
  return { price, rarity, tags };
}

// Сериализация номера
function plateToStr(p) {
  if (p.isForeign) {
    return 'F|' + p.country + '|' + (p.code || '') + '|' + p.price + '|' + p.rarity + '|' + encodeURIComponent(p.note || '');
  }
  if (p.isCustom) {
    return 'C|' + encodeURIComponent(p.l1 || '') + '|' + encodeURIComponent(p.d || '') + '|' + encodeURIComponent(p.l2 || '') + '|' + encodeURIComponent(p.l3 || '') + '|' + (p.reg || '') + '|' + p.price + '|' + p.rarity + '|' + encodeURIComponent(p.note || '');
  }
  return p.l1 + p.d + p.l2 + p.l3 + '|' + p.reg + '|' + p.price;
}

function plateFromStr(s) {
  if (s.startsWith('F|')) {
    const parts = s.split('|');
    return {
      isForeign: true,
      country: parts[1],
      code: parts[2],
      price: +parts[3],
      rarity: +parts[4],
      note: decodeURIComponent(parts[5] || '')
    };
  }
  if (s.startsWith('C|')) {
    const parts = s.split('|');
    return {
      isCustom: true,
      l1: decodeURIComponent(parts[1] || ''),
      d: decodeURIComponent(parts[2] || ''),
      l2: decodeURIComponent(parts[3] || ''),
      l3: decodeURIComponent(parts[4] || ''),
      reg: parts[5] || '',
      price: +parts[6],
      rarity: +parts[7],
      note: decodeURIComponent(parts[8] || '')
    };
  }
  const [main, reg, price] = s.split('|');
  return { l1: main[0], d: main.slice(1, 4), l2: main[4], l3: main[5], reg, price: +price };
}

// Генерация SVG изображения иностранного номера
function makeForeignPlateSvg(p, full) {
  const c = p.country || 'UAE';
  const code = p.code || 'VIP';

  if (c === 'UAE') {
    return `<svg class="plate plate-foreign plate-uae" viewBox="0 0 1280 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Номер Дубай ${code}">` +
      `<rect x="8" y="8" width="1264" height="274" rx="30" fill="#ffffff" stroke="#1a1a1a" stroke-width="12"/>` +
      `<rect x="22" y="22" width="1236" height="246" rx="20" fill="#fdfdfd"/>` +
      `<circle cx="70" cy="145" r="16" fill="#111"/><circle cx="1210" cy="145" r="16" fill="#111"/>` +
      `<rect x="120" y="46" width="340" height="198" rx="14" fill="#0b1b3d"/>` +
      `<text x="290" y="118" font-size="52" font-family="Arial,sans-serif" font-weight="900" fill="#f59e0b" text-anchor="middle" letter-spacing="4">DUBAI</text>` +
      `<text x="290" y="196" font-size="70" font-family="'Times New Roman',serif" font-weight="700" fill="#ffffff" text-anchor="middle">دبي</text>` +
      `<text x="820" y="210" font-size="220" font-family="'Roboto Condensed',Arial,sans-serif" font-weight="900" fill="#0b1b3d" text-anchor="middle">${code.replace('DUBAI ', '')}</text>` +
      `</svg>`;
  }

  if (c === 'UK') {
    return `<svg class="plate plate-foreign plate-uk" viewBox="0 0 1280 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Номер Великобритания ${code}">` +
      `<rect x="8" y="8" width="1264" height="274" rx="24" fill="#fbbf24" stroke="#000" stroke-width="10"/>` +
      `<rect x="22" y="22" width="1236" height="246" rx="16" fill="#f59e0b"/>` +
      `<rect x="22" y="22" width="110" height="246" rx="8" fill="#1e3a8a"/>` +
      `<text x="77" y="180" font-size="54" font-family="Arial,sans-serif" font-weight="800" fill="#fff" text-anchor="middle">UK</text>` +
      `<text x="690" y="215" font-size="210" font-family="'Courier New',monospace,Arial" font-weight="900" fill="#000" text-anchor="middle" letter-spacing="20">${code}</text>` +
      `</svg>`;
  }

  if (c === 'USA') {
    return `<svg class="plate plate-foreign plate-usa" viewBox="0 0 1280 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Номер США ${code}">` +
      `<rect x="8" y="8" width="1264" height="274" rx="30" fill="#ffffff" stroke="#1e293b" stroke-width="10"/>` +
      `<rect x="20" y="20" width="1240" height="250" rx="20" fill="#fafafa"/>` +
      `<text x="640" y="76" font-size="52" font-family="'Brush Script MT',cursive,'Segoe Script',sans-serif" font-weight="bold" fill="#dc2626" text-anchor="middle">California</text>` +
      `<text x="640" y="210" font-size="160" font-family="'Roboto Condensed',Arial,sans-serif" font-weight="900" fill="#1e3a8a" text-anchor="middle" letter-spacing="14">${code.replace('CALIFORNIA ', '')}</text>` +
      `<rect x="1110" y="44" width="90" height="46" rx="6" fill="#2563eb"/><text x="1155" y="75" font-size="28" font-family="Arial,sans-serif" font-weight="bold" fill="#fff" text-anchor="middle">OCT</text>` +
      `</svg>`;
  }

  if (c === 'CH') {
    return `<svg class="plate plate-foreign plate-ch" viewBox="0 0 1280 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Номер Швейцария ${code}">` +
      `<rect x="8" y="8" width="1264" height="274" rx="20" fill="#ffffff" stroke="#000" stroke-width="12"/>` +
      `<rect x="60" y="80" width="110" height="130" rx="10" fill="#dc2626"/>` +
      `<rect x="98" y="95" width="34" height="100" fill="#fff"/><rect x="75" y="128" width="80" height="34" fill="#fff"/>` +
      `<text x="680" y="212" font-size="210" font-family="Arial,sans-serif" font-weight="900" fill="#000" text-anchor="middle" letter-spacing="10">${code}</text>` +
      `<rect x="1110" y="80" width="110" height="130" rx="10" fill="#2563eb"/>` +
      `<polygon points="1110,80 1220,210 1110,210" fill="#fff"/>` +
      `</svg>`;
  }

  if (c === 'JP') {
    return `<svg class="plate plate-foreign plate-jp" viewBox="0 0 1280 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Номер Япония ${code}">` +
      `<rect x="8" y="8" width="1264" height="274" rx="20" fill="#ffffff" stroke="#166534" stroke-width="12"/>` +
      `<circle cx="280" cy="50" r="18" fill="#cbd5e1" stroke="#475569" stroke-width="4"/>` +
      `<circle cx="1000" cy="50" r="18" fill="#cbd5e1" stroke="#475569" stroke-width="4"/>` +
      `<text x="640" y="95" font-size="70" font-family="'MS Gothic',sans-serif" font-weight="900" fill="#166534" text-anchor="middle">品川 500</text>` +
      `<text x="360" y="235" font-size="100" font-family="'MS Gothic',sans-serif" font-weight="bold" fill="#166534">さ</text>` +
      `<text x="730" y="240" font-size="170" font-family="'Roboto Condensed',Arial,sans-serif" font-weight="900" fill="#166534" text-anchor="middle" letter-spacing="8">77-77</text>` +
      `</svg>`;
  }

  if (c === 'DE') {
    return `<svg class="plate plate-foreign plate-de" viewBox="0 0 1280 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Номер Германия ${code}">` +
      `<rect x="8" y="8" width="1264" height="274" rx="20" fill="#ffffff" stroke="#000" stroke-width="10"/>` +
      `<rect x="20" y="20" width="120" height="250" rx="8" fill="#003399"/>` +
      `<circle cx="80" cy="80" r="32" fill="none" stroke="#ffcc00" stroke-width="4" stroke-dasharray="8 9"/>` +
      `<text x="80" y="210" font-size="76" font-family="Arial,sans-serif" font-weight="bold" fill="#fff" text-anchor="middle">D</text>` +
      `<text x="700" y="212" font-size="185" font-family="'DIN 1451',Arial,sans-serif" font-weight="900" fill="#000" text-anchor="middle" letter-spacing="12">${code}</text>` +
      `</svg>`;
  }

  if (c === 'MC') {
    return `<svg class="plate plate-foreign plate-mc" viewBox="0 0 1280 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Номер Монако ${code}">` +
      `<rect x="8" y="8" width="1264" height="274" rx="22" fill="#ffffff" stroke="#0284c7" stroke-width="10"/>` +
      `<rect x="60" y="60" width="100" height="150" fill="#dc2626"/>` +
      `<text x="700" y="195" font-size="190" font-family="Arial,sans-serif" font-weight="900" fill="#0369a1" text-anchor="middle" letter-spacing="16">${code}</text>` +
      `<text x="700" y="255" font-size="34" font-family="Arial,sans-serif" font-weight="bold" fill="#dc2626" text-anchor="middle" letter-spacing="4">PRINCIPAUTE DE MONACO</text>` +
      `</svg>`;
  }

  if (c === 'HK') {
    return `<svg class="plate plate-foreign plate-hk" viewBox="0 0 1280 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Номер Гонконг ${code}">` +
      `<rect x="8" y="8" width="1264" height="274" rx="16" fill="#facc15" stroke="#000" stroke-width="12"/>` +
      `<text x="640" y="215" font-size="205" font-family="'Arial Black',Arial,sans-serif" font-weight="900" fill="#000" text-anchor="middle" letter-spacing="18">${code}</text>` +
      `</svg>`;
  }

  if (c === 'KZ') {
    return `<svg class="plate plate-foreign plate-kz" viewBox="0 0 1280 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Номер Казахстан ${code}">` +
      `<rect x="8" y="8" width="1264" height="274" rx="24" fill="#ffffff" stroke="#000" stroke-width="12"/>` +
      `<rect x="22" y="22" width="120" height="246" rx="8" fill="#00afca"/>` +
      `<circle cx="82" cy="100" r="26" fill="#f59e0b"/>` +
      `<text x="82" y="215" font-size="52" font-family="Arial,sans-serif" font-weight="bold" fill="#fff" text-anchor="middle">KZ</text>` +
      `<rect x="1040" y="22" width="6" height="246" fill="#000"/>` +
      `<text x="580" y="218" font-size="210" font-family="'Roboto Condensed',Arial,sans-serif" font-weight="900" fill="#000" text-anchor="middle" letter-spacing="6">001 AAA</text>` +
      `<text x="1155" y="210" font-size="160" font-family="'Roboto Condensed',Arial,sans-serif" font-weight="900" fill="#000" text-anchor="middle">01</text>` +
      `</svg>`;
  }

  return `<svg class="plate plate-foreign plate-by" viewBox="0 0 1280 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Номер Беларусь ${code}">` +
    `<rect x="8" y="8" width="1264" height="274" rx="24" fill="#ffffff" stroke="#000" stroke-width="12"/>` +
    `<rect x="22" y="22" width="130" height="123" rx="6" fill="#dc2626"/>` +
    `<rect x="22" y="145" width="130" height="123" rx="6" fill="#16a34a"/>` +
    `<text x="87" y="225" font-size="50" font-family="Arial,sans-serif" font-weight="bold" fill="#fff" text-anchor="middle">BY</text>` +
    `<text x="700" y="218" font-size="200" font-family="'Roboto Condensed',Arial,sans-serif" font-weight="900" fill="#000" text-anchor="middle" letter-spacing="8">${code}</text>` +
    `</svg>`;
}

// Генерация SVG изображения номера
function makePlateSvg(p, opts) {
  const full = !(opts && opts.full === false);       // true: большой номер, false: мини

  if (p.isForeign) {
    return makeForeignPlateSvg(p, full);
  }

  if (p.isCustom) {
    const text = (p.l1 || '') + (p.d || '') + (p.l2 || '') + (p.l3 || '');
    const reg = p.reg || '777';
    return `<svg class="plate plate-custom" viewBox="0 0 1280 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Кастомный номер ${text} ${reg}">` +
      `<rect x="8" y="8" width="1264" height="274" rx="44" fill="#fff" stroke="#4f46e5" stroke-width="14"/>` +
      `<rect x="20" y="20" width="1240" height="250" rx="30" fill="url(#pl-paper)"/>` +
      `<circle cx="62" cy="148" r="19" fill="#0a0a0a"/><circle cx="1216" cy="148" r="19" fill="#0a0a0a"/>` +
      `<rect x="943" y="20" width="7" height="250" fill="#0a0a0a"/>` +
      `<g fill="#0a0a0a" font-family="'Roboto Condensed','Arial Narrow',Arial,sans-serif" font-weight="700">` +
      `<text x="480" y="222" font-size="220" text-anchor="middle">${text}</text>` +
      `<text x="1080" y="165" font-size="140" text-anchor="middle">${reg}</text>` +
      `<text x="968" y="234" font-size="52" textLength="105" lengthAdjust="spacingAndGlyphs">RUS</text>` +
      `</g>` +
      `<rect x="1105" y="184" width="98" height="17.4" fill="#fff"/>` +
      `<rect x="1105" y="201.4" width="98" height="17.4" fill="#0039a6"/>` +
      `<rect x="1105" y="218.8" width="98" height="17.4" fill="#d52b1e"/>` +
      `<rect x="1105" y="184" width="98" height="52" fill="none" stroke="#0a0a0a" stroke-width="2.5"/>` +
      `</svg>`;
  }
  const rarity = (p.rarity != null) ? p.rarity : 0;
  const big = p.reg.length === 2;
  const regAttrs = big
    ? 'x="985" y="172" font-size="178" textLength="180"'
    : 'x="988" y="162" font-size="130" textLength="186"';
  const chars =
    `<text x="135" y="228" font-size="245" textLength="100" lengthAdjust="spacingAndGlyphs">${p.l1}</text>` +
    `<text x="275" y="228" font-size="245" textLength="340" lengthAdjust="spacingAndGlyphs">${p.d}</text>` +
    `<text x="655" y="228" font-size="245" textLength="235" lengthAdjust="spacingAndGlyphs">${p.l2}${p.l3}</text>` +
    `<text ${regAttrs} lengthAdjust="spacingAndGlyphs">${p.reg}</text>` +
    `<text x="968" y="234" font-size="52" textLength="105" lengthAdjust="spacingAndGlyphs">RUS</text>`;

  let svg = `<svg class="plate" viewBox="0 0 1280 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Номер ${p.l1}${p.d}${p.l2}${p.l3} ${p.reg}">` +
    `<rect x="8" y="8" width="1264" height="274" rx="44" fill="#fff" stroke="#000" stroke-width="14"/>` +
    `<rect x="20" y="20" width="1240" height="250" rx="30" fill="url(#pl-paper)"/>` +
    `<circle cx="62" cy="148" r="19" fill="#0a0a0a"/><circle cx="1216" cy="148" r="19" fill="#0a0a0a"/>` +
    `<rect x="943" y="20" width="7" height="250" fill="#0a0a0a"/>` +
    `<g fill="#0a0a0a" font-family="'Roboto Condensed','Arial Narrow','Helvetica Neue',Arial,sans-serif" font-weight="700"` +
    (full ? ' filter="url(#pl-emboss)"' : '') + `>${chars}</g>` +
    `<rect x="1105" y="184" width="98" height="17.4" fill="#fff"/>` +
    `<rect x="1105" y="201.4" width="98" height="17.4" fill="#0039a6"/>` +
    `<rect x="1105" y="218.8" width="98" height="17.4" fill="#d52b1e"/>` +
    `<rect x="1105" y="184" width="98" height="52" fill="none" stroke="#0a0a0a" stroke-width="2.5"/>`;

  if (full) {
    svg += `<rect x="20" y="20" width="1240" height="250" rx="30" fill="#000" filter="url(#pl-grain)" opacity=".6"/>` +
      `<rect x="20" y="20" width="1240" height="250" rx="30" fill="url(#pl-gloss)"/>`;
    if (rarity >= 2) {
      svg += `<g clip-path="url(#pl-clip)"><rect class="plate-shine" x="0" y="0" width="260" height="290" fill="url(#pl-shine-grad)"/></g>`;
    }
  }
  return svg + '</svg>';
}

// Экспорт для Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CONFIG, LETTERS, WORDS, SPECIAL_PLATES, FOREIGN_RARE_PLATES, REGION_GROUPS, RARITY_NAMES, SHELF_TIERS,
    generatePlate, calculatePrice, rarityOf, makePlateSvg,
    plateToStr, plateFromStr, formatMoney
  };
}
