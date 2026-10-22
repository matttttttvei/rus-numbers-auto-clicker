// test.js — проверка logic.js в Node

const L = require('./logic.js');
let fails = 0;
function eq(name, got, want) {
  if (got === want) console.log('PASS', name);
  else { fails++; console.log('FAIL', name, '| получили', got, '| ожидали', want); }
}

const cases = [
  [{l1:'С',d:'065',l2:'М',l3:'К',reg:'78'},  3000,    0],
  [{l1:'В',d:'528',l2:'О',l3:'Р',reg:'163'}, 1000,    0],
  [{l1:'А',d:'121',l2:'В',l3:'С',reg:'50'},  16000,   1],
  [{l1:'О',d:'234',l2:'М',l3:'Р',reg:'50'},  50000,   2],
  [{l1:'Е',d:'123',l2:'К',l3:'Х',reg:'50'},  80000,   2],
  [{l1:'М',d:'001',l2:'Т',l3:'К',reg:'78'},  180000,  2],
  [{l1:'Т',d:'500',l2:'О',l3:'Р',reg:'163'}, 450000,  3],
  [{l1:'Х',d:'878',l2:'Н',l3:'Н',reg:'78'},  960000,  4],
  [{l1:'А',d:'100',l2:'А',l3:'А',reg:'163'}, 1200000, 4],
  [{l1:'А',d:'000',l2:'А',l3:'А',reg:'77'},  5000000, 5],
  [{l1:'А',d:'777',l2:'А',l3:'А',reg:'77'},  5000000, 5],
  [{l1:'К',d:'555',l2:'К',l3:'К',reg:'77'},  5000000, 5]
];
for (const [p, price, rar] of cases) {
  const r = L.calculatePrice(p);
  const name = p.l1 + p.d + p.l2 + p.l3 + ' ' + p.reg;
  eq(name + ' цена', r.price, price);
  eq(name + ' редкость', r.rarity, rar);
}

// формат сгенерированных номеров
const re = /^[АВЕКМНОРСТУХ]\d{3}[АВЕКМНОРСТУХ]{2}$/;
const allRegions = new Set([].concat(
  L.REGION_GROUPS.moscow, L.REGION_GROUPS.spb, L.REGION_GROUPS.mo, L.REGION_GROUPS.other));
let bad = 0;
for (let i = 0; i < 50000; i++) {
  const p = L.generatePlate();
  if (!re.test(p.l1 + p.d + p.l2 + p.l3) || !allRegions.has(p.reg)) bad++;
}
eq('формат номеров (плохих)', bad, 0);

// сериализация стандартного номера
const t = { l1:'С', d:'065', l2:'М', l3:'К', reg:'78', price: 3000 };
const back = L.plateFromStr(L.plateToStr(t));
eq('сериализация', JSON.stringify(back), JSON.stringify(t));

// проверка наличия и корректности SPECIAL_PLATES
eq('наличие спецсерий РФ', Array.isArray(L.SPECIAL_PLATES) && L.SPECIAL_PLATES.length >= 10, true);
let badSpecial = 0;
for (const sp of L.SPECIAL_PLATES) {
  if (!re.test(sp.l1 + sp.d + sp.l2 + sp.l3) || !allRegions.has(sp.reg)) badSpecial++;
}
eq('валидность спецсерий РФ', badSpecial, 0);

// проверка наличия и корректности FOREIGN_RARE_PLATES (только для чит-меню)
eq('наличие иностранных раритетов (чит-панель)', Array.isArray(L.FOREIGN_RARE_PLATES) && L.FOREIGN_RARE_PLATES.length >= 10, true);

// сериализация иностранного номера
const fSample = { isForeign: true, country: 'UAE', code: 'DUBAI 1', price: 150000000, rarity: 5, note: 'Дубай №1' };
const fBack = L.plateFromStr(L.plateToStr(fSample));
eq('сериализация иностранного номера', fBack.code, fSample.code);
eq('цена иностранного номера', fBack.price, fSample.price);

// калибровка экономики (только вывод чисел, ничего не проверяет)
const N = 200000, prices = [], counts = [0,0,0,0,0,0];
let sum = 0;
for (let i = 0; i < N; i++) {
  const r = L.calculatePrice(L.generatePlate());
  prices.push(r.price); counts[r.rarity]++; sum += r.price;
}
prices.sort((a, b) => a - b);
console.log('медиана', prices[N >> 1], '| среднее', Math.round(sum / N));
console.log('распределение редкости, %:', counts.map(c => (c * 100 / N).toFixed(2)).join(' / '));
console.log(fails ? 'ЕСТЬ ОШИБКИ: ' + fails : 'ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
process.exit(fails ? 1 : 0);
