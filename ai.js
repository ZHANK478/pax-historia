// ============================================================
// AI.JS v5 — динамические страны (профили от ИИ, без хардкода),
// субъектность каждой страны (интересы/agenda), скрытая дипломатия
// между ИИ-странами, внутренние новости, breaking news,
// экономика (долг/инфляция) в промптах, генерация портретов
// ============================================================

// Ключ жёстко очищается от любых непечатаемых/неASCII символов — иначе Bearer-заголовок
// ломается с ошибкой "String contains non ISO-8859-1 code point".
let GEMINI_API_KEY = (localStorage.getItem('openrouter_key') || '').replace(/[^\x20-\x7E]/g, '').trim();
if (!GEMINI_API_KEY) {
  const k = prompt('Введите OpenRouter API ключ:');
  if (k) {
    GEMINI_API_KEY = k.replace(/[^\x20-\x7E]/g, '').trim();
    localStorage.setItem('openrouter_key', GEMINI_API_KEY);
    location.reload();
  }
}
const GEMINI_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Текстовая модель ИИ — выбирается в главном меню («🧠 Модель ИИ»), хранится в браузере.
// Все текстовые вызовы (события, дипломатия, советники, профили, летопись) идут через неё.
let MODEL = localStorage.getItem('gs1852_text_model') || 'google/gemini-3.1-flash-lite';
function setTextModel(m) {
  m = (m || '').trim();
  if (!m) return;
  MODEL = m;
  localStorage.setItem('gs1852_text_model', m);
  showNotif('🧠 Текстовая модель: ' + m);
}
// Модель генерации изображений (портреты правителей/премьеров). Работает через тот же
// OpenRouter ключ. gemini-3.1-flash-image — актуальная модель генерации картинок.
const IMAGE_MODEL = 'google/gemini-3.1-flash-image';

// ============================================================
// СОСТОЯНИЕ МИРА
// ============================================================
let worldState = {
  relations: {},        // отношения игрока с другими странами (видны игроку)
  relationsAmong: {},   // СКРЫТЫЕ отношения ИИ-стран между собой ("A␟B" -> число)
  aiWars: [],           // войны между ИИ-странами (без участия игрока): [["A","B"], ...]
  treaties: [],         // официальные договоры: {type:'alliance'|'nonaggression', a, b, since}
  warGoals: {},         // цели активных войн: "A␟B" -> {attacker, defender, type, provinces}
  atWarWith: [],
  alliedWith: [],
  pastEvents: [],       // хроника — до 120 событий
  historySummary: [],   // летопись мира: главы-резюме, чтобы ИИ не забывал давние события
  diploLog: [],
  mapObjects: []
};

let playerActions = [];

function changeRelations(country, delta) {
  if (worldState.relations[country] === undefined) worldState.relations[country] = 0;
  worldState.relations[country] = Math.max(-100, Math.min(100, worldState.relations[country] + delta));
  if (typeof updateRelationsPanel === 'function') updateRelationsPanel();
}

function getGameState() {
  const c = countries[playerCountry];
  return {
    date: document.getElementById('date-disp').textContent,
    treasury: c.treasury.toLocaleString('ru') + ' фр.',
    income: (c.income >= 0 ? '+' : '') + c.income.toLocaleString('ru') + ' фр.',
    army: c.army.toLocaleString('ru'),
    stability: String(c.stability),
    debt: c.debt.toLocaleString('ru') + ' фр.',
    inflation: c.inflation + '%',
    country: c.displayName,
    ruler: c.ruler,
    rulerAge: c.rulerAge,
    rulerTitle: c.rulerTitle,
    government: c.government,
    pm: c.pm,
    pmTitle: c.pmTitle,
    year
  };
}

// Сводка каждой НЕаннексированной страны сценария — только для промптов ИИ
// (игрок этих чисел в интерфейсе НЕ видит, кроме своей страны).
function describeCountries() {
  return ALL_COUNTRIES.filter(c => countries[c] && !countries[c].annexed).map(c => {
    const d = countries[c];
    const age = typeof d.rulerAge === 'number' ? `, ${d.rulerAge} лет` : '';
    const parl = d.parliament ? ` Парламент (${d.parliament.name}): власть ${d.parliament.power ?? 50}%, поддержка правительства ${d.parliament.support}%, следующие выборы ${d.parliament.nextElection || '—'} г., фракции: ${(d.parliament.factions||[]).map(f=>`${f.name} ${f.pct}%`).join(', ')}.${(d.parliament.banned||[]).length ? ' Запрещены: ' + d.parliament.banned.join(', ') + '.' : ''}` : ' Парламента нет (упразднён или отсутствует).';
    const church = d.church ? (d.church.exists ? ` Церковь (${d.church.name}): влияние ${d.church.influence}%.` : ' Церковь лишена государственной власти (секуляризация).') : '';
    const rel = d.religion && d.religion.main ? ` Религия: ${Object.entries(d.religion.dist || {}).map(([k,v])=>`${k} ${v}%`).join(', ')} (главная ${d.religion.main}); вера правителя: ${d.rulerReligion || d.religion.main}.` : '';
    const agenda = d.agenda ? ` ИНТЕРЕСЫ: ${d.agenda}` : '';
    return `${d.displayName}: казна ${d.treasury.toLocaleString('ru')} фр., доход ${d.income >= 0 ? '+' : ''}${d.income.toLocaleString('ru')} фр./мес, долг ${d.debt.toLocaleString('ru')} фр., инфляция ${d.inflation}%, армия ${d.army.toLocaleString('ru')}, стабильность ${d.stability}, правитель ${d.ruler} (${d.rulerTitle}${age}), правление: ${d.government}.${rel}${church}${parl}${agenda}`;
  }).join('\n');
}

// Точная бюджетная сводка страны игрока за последний ход — чтобы ИИ писал про долги и
// инфляцию ТОЛЬКО по реальным числам, а не выдумывал их при профицитном бюджете.
function describePlayerBudget() {
  const c = countries[playerCountry];
  const b = c.lastBudget;
  if (!b) return '';
  return `БЮДЖЕТ ${c.displayName} за прошлый месяц (реальные числа движка — НЕ противоречь им): доход ${b.gross.toLocaleString('ru')} фр., содержание армии −${b.upkeep.toLocaleString('ru')} фр., проценты по долгу −${b.interest.toLocaleString('ru')} фр., итог ${b.net >= 0 ? 'ПРОФИЦИТ +' : 'ДЕФИЦИТ '}${b.net.toLocaleString('ru')} фр.${b.borrowed ? ` Взято новых займов: ${b.borrowed.toLocaleString('ru')} фр.` : ''} Общий долг ${c.debt.toLocaleString('ru')} фр., инфляция ${c.inflation}%. Если бюджет в профиците и долг мал — НЕ пиши о долгах/инфляции как о проблеме.`;
}

// Полная постатейная экономика страны игрока (для ИИ-экономиста и нарратора):
// строки бюджета, классы с налогами/лояльностью, структура долга.
function describePlayerEconomy() {
  const c = countries[playerCountry];
  if (!c || !c.lastBudget || !c.lastBudget.lines) return describePlayerBudget();
  const b = c.lastBudget;
  const inc = b.lines.income.map(l => `${l.name}: +${l.value.toLocaleString('ru')}`).join('; ');
  const exp = b.lines.expense.map(l => `${l.name}: −${l.value.toLocaleString('ru')}`).join('; ');
  const classes = c.economy ? Object.values(c.economy.classes).map(k =>
    `${k.label} (${k.share}% населения): богатство ${k.wealth.toLocaleString('ru')}, налог ${k.tax}%, лояльность ${k.loyalty}`).join('; ') : '';
  return `ЭКОНОМИКА ${c.displayName} (точные числа движка — НЕ противоречь им, не выдумывай долги при профиците):
ДОХОДЫ (${b.gross.toLocaleString('ru')} фр./мес): ${inc}.
РАСХОДЫ: ${exp}.
ИТОГ МЕСЯЦА: ${b.net >= 0 ? 'ПРОФИЦИТ +' : 'ДЕФИЦИТ '}${b.net.toLocaleString('ru')} фр.${b.borrowed ? ` Взят заём ${b.borrowed.toLocaleString('ru')} фр. (${b.borrowedFrom}).` : ''}
ДОЛГ: всего ${c.debt.toLocaleString('ru')} фр. (внутренний ${(c.debtDomestic||0).toLocaleString('ru')} у буржуазии, внешний ${(c.debtForeign||0).toLocaleString('ru')} у иностранных банков). Инфляция ${c.inflation}%.
СОСЛОВИЯ: ${classes}.`;
}

// Скрытые отношения ИИ-стран между собой (игрок их не видит — только ИИ)
function describeHiddenDiplomacy() {
  const ra = worldState.relationsAmong || {};
  const lines = Object.entries(ra)
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => { const [a, b] = k.split('␟'); return `${a}↔${b}: ${v > 0 ? '+' : ''}${v}`; });
  const wars = (worldState.aiWars || []).map(w => `⚔️ ${w[0]} против ${w[1]}`);
  if (!lines.length && !wars.length) return '';
  return 'СКРЫТЫЕ ОТНОШЕНИЯ МЕЖДУ ДРУГИМИ СТРАНАМИ (игрок их не видит, но страны действуют исходя из них — они боятся и интригуют друг против друга):\n' +
    [...wars, ...lines].join('; ');
}

function describeWorldState() {
  const relText = Object.entries(worldState.relations)
    .map(([c, v]) => `${c}: ${v > 0 ? '+' : ''}${v} (${v > 30 ? 'дружелюбные' : v < -30 ? 'враждебные' : 'нейтральные'})`)
    .join(', ');
  const warText = worldState.atWarWith.length > 0
    ? `⚔️ ВОЙНА с: ${worldState.atWarWith.join(', ')}.`
    : 'Войн нет.';
  const allyText = worldState.alliedWith.length > 0
    ? `Союзники: ${worldState.alliedWith.join(', ')}.`
    : '';
  const chronicle = (worldState.historySummary || []).length
    ? 'ЛЕТОПИСЬ МИРА (краткая история прошлых лет — ПОМНИ её, это твоя долгая память):\n' +
      worldState.historySummary.slice(-6).map(ch => `【${ch.title}】 ${ch.text}`).join('\n') + '\n\n'
    : '';
  const newsText = chronicle + (worldState.pastEvents.length > 0
    ? 'ХРОНИКА ПОСЛЕДНИХ СОБЫТИЙ (от новых к старым):\n' +
      worldState.pastEvents.slice(-40).reverse().map((e, i) => `${i + 1}. ${e}`).join('\n')
    : 'Игра только началась, прошлых событий нет.');

  const pc = (typeof playerCountryDisplayName !== 'undefined') ? playerCountryDisplayName : playerCountry;
  const hidden = describeHiddenDiplomacy();

  const treatyText = (worldState.treaties || []).length
    ? 'ОФИЦИАЛЬНЫЕ ДОГОВОРЫ (их разрыв — вероломство с тяжёлой ценой: −60 отношений с преданным, −10 со ВСЕМИ, −20 репутации, −5 стабильности): ' +
      worldState.treaties.map(t => `${t.a}+${t.b} (${t.type === 'alliance' ? 'военный союз' : 'пакт о ненападении'}, с ${t.since} г.)`).join('; ') + '.'
    : 'Официальных договоров в мире пока нет.';

  const goalsText = Object.values(worldState.warGoals || {}).length
    ? 'ЦЕЛИ АКТИВНЫХ ВОЙН (война должна идти к своей цели, а не висеть): ' +
      Object.values(worldState.warGoals).map(g => `${g.attacker}→${g.defender}: ${typeof warGoalLabel === 'function' ? warGoalLabel(g) : g.type}`).join('; ') + '.'
    : '';

  const repText = ALL_COUNTRIES.filter(c => countries[c] && !countries[c].annexed && (countries[c].reputation ?? 70) < 50)
    .map(c => `${c}: ${countries[c].reputation}`).join(', ');
  const repLine = repText ? `ПОДОРВАННАЯ РЕПУТАЦИЯ (этим странам не верят, союзы с ними заключают неохотно): ${repText}.` : '';

  return `Отношения ${pc} со странами: ${relText}.\n${warText} ${allyText}\n${treatyText}\n${goalsText}\n${repLine}\n${hidden ? hidden + '\n' : ''}\n${newsText}`;
}

// Компактный список провинций стран сценария с текущим владельцем
function describeProvinces() {
  if (typeof scenarioProvinces === 'undefined' || !scenarioProvinces.length) return 'Список провинций пока не загружен.';
  return scenarioProvinces
    .map(p => ({ name: p.name, owner: (typeof provinceOwnerOf === 'function') ? provinceOwnerOf(p.id, p.owner) : p.owner }))
    .filter(p => p.owner && ALL_COUNTRIES.includes(p.owner))
    .map(p => `${p.name}(${p.owner})`)
    .join(', ');
}

// Провинции страны игрока с доходами — база для внутренних новостей по регионам
function describePlayerProvinces() {
  if (typeof scenarioProvinces === 'undefined') return '';
  const rows = scenarioProvinces
    .filter(p => (provinceOwners[p.id] || p.owner) === playerCountry)
    .map(p => {
      const e = provinceEcon[p.id] || {};
      return `${p.name} (доход ${e.income || '?'} фр./мес, развитие ${e.dev || '?'}/5)`;
    });
  return rows.length ? 'ПРОВИНЦИИ страны игрока: ' + rows.join(', ') : '';
}

async function askGemini(prompt, maxTokens = 400) {
  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GEMINI_API_KEY
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.75
      })
    });
    const data = await response.json();
    if (data.choices && data.choices[0]) {
      return data.choices[0].message.content;
    }
    return 'ИИ не ответил. Проверьте API ключ.';
  } catch (e) {
    return 'Ошибка соединения с ИИ: ' + e.message;
  }
}

// ============================================================
// ГЕНЕРАЦИЯ ПОРТРЕТОВ (изображение через OpenRouter, модель Gemini Image)
// Возвращает dataURL (data:image/...;base64,...) или null.
// ============================================================
async function askGeminiImage(promptText) {
  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GEMINI_API_KEY },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        messages: [{ role: 'user', content: promptText }],
        modalities: ['image', 'text']
      })
    });
    const data = await response.json();
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    if (msg && msg.images && msg.images[0] && msg.images[0].image_url && msg.images[0].image_url.url) {
      return msg.images[0].image_url.url;
    }
    console.log('Портрет: изображение не пришло', data.error ? data.error.message : '');
    return null;
  } catch (e) {
    console.log('Портрет: ошибка запроса', e.message);
    return null;
  }
}

// Портрет персоны: role 'ruler' (правитель, поле portrait) или 'pm' (глава правительства,
// поле pmPortrait). Единая функция — обе кнопки и автогенерация идут через неё.
let portraitGenerating = false;
async function generatePersonPortrait(country, role) {
  const c = countries[country];
  if (!c || portraitGenerating) return null;
  role = role === 'pm' ? 'pm' : 'ruler';
  portraitGenerating = true;
  if (typeof setPortraitLoading === 'function') setPortraitLoading(true, role);
  const isPm = role === 'pm';
  const name = isPm ? c.pm : c.ruler;
  const title = isPm ? c.pmTitle : c.rulerTitle;
  const age = !isPm && typeof c.rulerAge === 'number' ? `${c.rulerAge} years old` : 'middle-aged';
  const faith = !isPm && c.rulerReligion ? `, ${c.rulerReligion} faith` : '';
  const era = year < 1900 ? '19th century academic style' : 'early 20th century formal style';
  const prompt = `Formal painted state portrait, oil painting, ${era}. Subject: ${name}, ${title} of ${c.displayName}, ${age}${faith}, year ${year}. Dignified pose, period-accurate formal attire${isPm ? '' : ' and regalia'} of ${c.displayName}, muted palace background, 3:4 portrait crop, head and shoulders. No text, no frame.`;
  const url = await askGeminiImage(prompt);
  portraitGenerating = false;
  if (typeof setPortraitLoading === 'function') setPortraitLoading(false, role);
  if (url) {
    if (isPm) c.pmPortrait = url; else c.portrait = url;
    if (country === playerCountry && typeof renderRulerPortrait === 'function') renderRulerPortrait();
    saveGame();
  }
  return url;
}

// Обратная совместимость со старым именем
function generateRulerPortrait(country) { return generatePersonPortrait(country, 'ruler'); }

// Автогенерация портрета правителя страны игрока (вкл/выкл в настройках)
function autoPortraitsEnabled() { return localStorage.getItem('gs1852_auto_portraits') !== '0'; }
function maybeAutoPortrait(country) {
  if (!autoPortraitsEnabled()) return;
  const c = countries[country];
  if (!c || c.portrait) return;
  generatePersonPortrait(country, 'ruler');
}

// ============================================================
// ПРОФИЛИ СТРАН ОТ ИИ — фундамент "без хардкода": для стран сценария без исторических
// данных ИИ придумывает правителя (с возрастом!), форму правления, показатели, описание
// и ИНТЕРЕСЫ; для известных стран — только интересы/agenda. Партиями по 10 стран.
// ============================================================
let profilesGenerating = false;

async function queueMissingProfiles() {
  if (profilesGenerating || typeof countries === 'undefined') return;
  const needFull = ALL_COUNTRIES.filter(c => countries[c] && countries[c].profilePending);
  const needAgenda = ALL_COUNTRIES.filter(c => countries[c] && !countries[c].profilePending && !countries[c].agenda);
  if (!needFull.length && !needAgenda.length) return;
  profilesGenerating = true;
  try {
    const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
    for (const group of chunk(needFull, 10)) await generateCountryProfiles(group, true);
    for (const group of chunk(needAgenda, 12)) await generateCountryProfiles(group, false);
  } finally {
    profilesGenerating = false;
  }
}

async function generateCountryProfiles(names, full) {
  if (!names.length) return;
  const knownLine = full
    ? 'Для КАЖДОЙ страны придумай исторически достоверный профиль на этот год.'
    : 'Для КАЖДОЙ страны показатели УЖЕ заданы — верни ТОЛЬКО agenda (интересы) и parliament (если у страны его нет — null). Числа не придумывай.';
  const prompt = `Ты — историк-справочник стратегической игры. Год: ${year}. Страны: ${names.join(', ')}.
${knownLine}
Ответь ТОЛЬКО валидным JSON-массивом без пояснений, по объекту на страну:
[{"country":"название как в списке","ruler":"имя реального/правдоподобного правителя на ${year} год","ruler_age":число (реальный возраст, обычно 30-75),"ruler_title":"титул","government":"форма правления","pm":"глава правительства","pm_title":"его должность","treasury":число (казна во франках, масштаб: великая держава 3000-5000, средняя 1500-2500, малая 400-1200),"income":число (доход/мес: великая 400-700, средняя 200-350, малая 60-180),"army":число солдат,"stability":число 0-100,"capital":"столица","pop":"население текстом","gdp":"ВВП текстом","blurb":"2 предложения о положении страны в ${year} году","agenda":"1-2 предложения: национальные интересы, чего страна боится, чего добивается, с кем соперничает","religion":{"main":"главная религия","dist":{"Религия1":число%,"Религия2":число%}} (реальное распределение верующих, сумма ~100),"ruler_religion":"вера правителя","church":{"name":"название церкви/конфессии","influence":число 0-100},"parliament":null или {"name":"название органа","support":число 0-100,"power":число 0-100 (реальная власть органа),"term_years":число (срок между выборами),"factions":[{"name":"фракция","pct":число}]}}]
${full ? '' : 'Для этого списка заполни ТОЛЬКО поля country, agenda, religion, ruler_religion, parliament — остальные ставь null.'}`;
  const raw = await askGemini(prompt, Math.min(6000, 220 * names.length + 500));
  try {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start === -1 || end === -1) throw new Error('JSON-массив не найден');
    const arr = JSON.parse(raw.slice(start, end + 1));
    arr.forEach(p => {
      const c = countries[p.country];
      if (!c) return;
      if (full) {
        if (p.ruler) c.ruler = p.ruler;
        if (typeof p.ruler_age === 'number') c.rulerAge = p.ruler_age;
        if (p.ruler_title) c.rulerTitle = p.ruler_title;
        if (p.government) c.government = p.government;
        if (p.pm) c.pm = p.pm;
        if (p.pm_title) c.pmTitle = p.pm_title;
        if (typeof p.treasury === 'number') c.treasury = p.treasury;
        if (typeof p.income === 'number') { c.income = p.income; c.incomeModifier = null; }
        if (typeof p.army === 'number') c.army = p.army;
        if (typeof p.stability === 'number') c.stability = Math.max(0, Math.min(100, p.stability));
        if (p.capital) c.capital = p.capital;
        if (p.pop) c.pop = p.pop;
        if (p.gdp) c.gdp = p.gdp;
        if (p.blurb) c.blurb = p.blurb;
        c.rulerSince = year;
        c.profilePending = false;
      }
      if (p.agenda) c.agenda = p.agenda;
      if (p.religion && p.religion.dist) c.religion = p.religion;
      if (p.ruler_religion) c.rulerReligion = p.ruler_religion;
      if (p.church && typeof p.church.influence === 'number') c.church = { exists: true, name: p.church.name || 'Церковь', influence: p.church.influence };
      if (p.parliament && p.parliament.factions) {
        c.parliament = p.parliament;
        if (c.parliament.power === undefined) c.parliament.power = 50;
        c.parliament.termYears = p.parliament.term_years || 5;
        c.parliament.nextElection = year + Math.max(1, Math.round((c.parliament.termYears) / 2));
        c.parliament.banned = [];
      }
    });
    if (full) {
      // Доходы новых профилей — перераспределяем по провинциям заново
      if (typeof initProvinceEconomy === 'function' && names.some(n => countries[n] && !countries[n].profilePending)) {
        initProvinceEconomy();
        recomputeIncomes();
      }
      if (names.includes(playerCountry)) {
        renderPlayerStats(); renderPlayerPowerPanel(); updateCountryInfoPanel(playerCountry);
        if (typeof maybeAutoPortrait === 'function') maybeAutoPortrait(playerCountry);
      }
      showNotif('📜 ИИ подготовил профили стран: ' + names.join(', '));
    }
    saveGame();
  } catch (e) {
    console.log('Профили стран: ошибка парсинга —', e.message);
  }
}

// ============================================================
// ПРАВИЛА РЕАЛИЗМА
// ============================================================
function getRealismRules() {
  const pc = (typeof playerCountryDisplayName !== 'undefined') ? playerCountryDisplayName : playerCountry;
  return `
СТРОГИЕ ПРАВИЛА:
1. Действие происходит ТОЛЬКО в реальной истории ${year} года. Никакой фантастики, никаких анахронизмов.
2. Игрок управляет ТОЛЬКО страной ${pc}. Другие страны реагируют исходя из СВОЕЙ логики, СВОИХ интересов (см. ИНТЕРЕСЫ каждой страны) и своих скрытых отношений друг с другом.
3. Если действие игрока нереалистично — опиши провальную или саркастичную попытку.
4. Войны не откладываются бесконечно: если отношения ниже -50 и есть провокация — бои реально начинаются.
5. Игрок НЕ МОЖЕТ просто НАПИСАТЬ, что что-то произошло в ЧУЖОЙ суверенной стране (смерть монарха, переворот, бунт, смена власти) — у него нет над ней власти. Такое либо игнорируй, либо описывай как провальную попытку — реальные изменения в чужой стране следуют ТОЛЬКО из настоящих действий игрока через силу/дипломатию/шпионаж с риском провала, либо из самостоятельной логики этой страны.
`;
}

function normalizeCountryName(name) {
  if (!name) return name;
  if (typeof playerCountryDisplayName !== 'undefined' && name === playerCountryDisplayName) {
    return playerCountry;
  }
  // ИИ может ссылаться на переименованную ИИ-страну по displayName
  const canon = ALL_COUNTRIES.find(c => countries[c] && countries[c].displayName === name);
  return canon || name;
}

// ============================================================
// НАДЁЖНОЕ ИЗВЛЕЧЕНИЕ JSON-БЛОКА ИЗ ОТВЕТА ИИ
// ============================================================
function extractBalancedJson(text, marker) {
  const markerIdx = text.indexOf(marker);
  if (markerIdx === -1) return null;
  const start = text.indexOf('{', markerIdx);
  if (start === -1) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

// Клэмпинг числового эффекта (защита от произвола ИИ)
function applyClampedDelta(country, stat, delta) {
  const c = countries[country];
  if (!c || !delta) return 0;
  let clamped = delta;
  if (stat === 'treasury' || stat === 'income') {
    const cap = Math.max(500, Math.abs(c[stat]) * 0.35);
    clamped = Math.max(-cap, Math.min(cap, delta));
  } else if (stat === 'army') {
    clamped = Math.max(-c.army, Math.min(c.army, delta));
  }
  changeCountryStat(country, stat, clamped);
  return clamped;
}

// ============================================================
// ПАРСИНГ И ПРИМЕНЕНИЕ JSON-ЭФФЕКТОВ ОТ ИИ
// Изменения показателей ЧУЖИХ стран применяются, но игроку в сводке НЕ показываются —
// он узнаёт о состоянии чужих стран только из новостей и дипломатии.
// ============================================================
function parseAndApplyEffects(text, baseChanges) {
  const turnChanges = (baseChanges || []).slice();
  try {
    const jsonText = extractBalancedJson(text, 'EFFECTS:');
    console.log('[EFFECTS] match:', jsonText ? 'ok' : 'НЕ НАЙДЕНО');
    if (!jsonText) { if (typeof renderTurnChanges === 'function') renderTurnChanges(turnChanges); return; }
    const effects = JSON.parse(jsonText);

    if (effects.treasury_delta && effects.treasury_delta !== 0) {
      const applied = applyClampedDelta(playerCountry, 'treasury', effects.treasury_delta);
      if (applied) turnChanges.push({ label: '💰 Казна', value: (applied > 0 ? '+' : '') + applied + ' фр.', sign: applied });
    }
    if (effects.income_delta && effects.income_delta !== 0) {
      const applied = applyClampedDelta(playerCountry, 'income', effects.income_delta);
      if (applied) turnChanges.push({ label: '📈 Доход/мес', value: (applied > 0 ? '+' : '') + applied + ' фр.', sign: applied });
    }
    if (effects.debt_delta && effects.debt_delta !== 0) {
      changeCountryStat(playerCountry, 'debt', effects.debt_delta);
      turnChanges.push({ label: '🏦 Долг', value: (effects.debt_delta > 0 ? '+' : '') + effects.debt_delta + ' фр.', sign: -effects.debt_delta });
    }
    if (effects.army_delta && effects.army_delta !== 0) {
      const applied = applyClampedDelta(playerCountry, 'army', effects.army_delta);
      if (applied) turnChanges.push({ label: '⚔️ Армия', value: (applied > 0 ? '+' : '') + applied, sign: applied });
    }
    if (effects.stability_delta && effects.stability_delta !== 0) {
      changeCountryStat(playerCountry, 'stability', effects.stability_delta);
      turnChanges.push({ label: '🌾 Стабильность', value: (effects.stability_delta > 0 ? '+' : '') + effects.stability_delta, sign: effects.stability_delta });
    }

    // Показатели ОСТАЛЬНЫХ стран: применяем, но игроку НЕ показываем (он их не должен знать)
    if (effects.other_countries && typeof effects.other_countries === 'object') {
      Object.entries(effects.other_countries).forEach(([rawCountry, deltas]) => {
        const country = normalizeCountryName(rawCountry);
        if (country === playerCountry || !countries[country] || countries[country].annexed || !deltas) return;
        ['treasury', 'income', 'army'].forEach(stat => {
          const key = stat + '_delta';
          if (deltas[key] && deltas[key] !== 0) applyClampedDelta(country, stat, deltas[key]);
        });
        if (deltas.stability_delta && deltas.stability_delta !== 0) {
          changeCountryStat(country, 'stability', deltas.stability_delta);
        }
      });
    }

    if (effects.relations) {
      Object.entries(effects.relations).forEach(([rawCountry, delta]) => {
        const country = normalizeCountryName(rawCountry);
        if (delta && delta !== 0) {
          changeRelations(country, delta);
          turnChanges.push({ label: '🤝 ' + country, value: (delta > 0 ? '+' : '') + delta, sign: delta });
        }
      });
    }

    // Скрытые отношения между ИИ-странами — применяем молча
    if (effects.relations_between && Array.isArray(effects.relations_between)) {
      effects.relations_between.forEach(r => {
        if (!r || !r.a || !r.b || !r.delta) return;
        const a = normalizeCountryName(r.a), b = normalizeCountryName(r.b);
        if (a === playerCountry || b === playerCountry || !countries[a] || !countries[b]) return;
        changeMutualRelations(a, b, r.delta);
      });
    }

    // Войны между ИИ-странами (без игрока) — для памяти мира; игрок узнаёт из новостей
    if (effects.wars_between && Array.isArray(effects.wars_between)) {
      effects.wars_between.forEach(w => {
        if (!w || !w.a || !w.b) return;
        const a = normalizeCountryName(w.a), b = normalizeCountryName(w.b);
        if (!countries[a] || !countries[b] || a === playerCountry || b === playerCountry) return;
        const key = (x, y) => worldState.aiWars.findIndex(p => (p[0] === x && p[1] === y) || (p[0] === y && p[1] === x));
        if (w.status === 'start' && key(a, b) === -1) worldState.aiWars.push([a, b]);
        if (w.status === 'end') {
          const i = key(a, b); if (i > -1) worldState.aiWars.splice(i, 1);
          if (worldState.warGoals) delete worldState.warGoals[mutualRelKey(a, b)];
        }
      });
    }

    // СРАЖЕНИЯ: ИИ объявляет бой, ПОТЕРИ считает движок (математика в game.js)
    if (effects.battles && Array.isArray(effects.battles) && typeof resolveBattle === 'function') {
      effects.battles.forEach(bt => {
        if (!bt || !bt.a || !bt.b) return;
        const a = normalizeCountryName(bt.a), b = normalizeCountryName(bt.b);
        if (!countries[a] || !countries[b]) return;
        const res = resolveBattle(a, b, bt.scale || 'battle', bt.location || null);
        if (!res) return;
        showNotif('⚔️ ' + res.summary);
        if (a === playerCountry || b === playerCountry) {
          const mine = a === playerCountry ? a : b;
          turnChanges.push({ label: '⚔️ Потери в бою', value: '-' + (res.winner === mine ? res.winnerLosses : res.loserLosses).toLocaleString('ru'), sign: res.winner === mine ? 1 : -1 });
          if ((bt.scale || 'battle') !== 'skirmish' && typeof showBreakingNews === 'function') {
            showBreakingNews(res.winner === mine ? 'ПОБЕДА В СРАЖЕНИИ' : 'ПОРАЖЕНИЕ В СРАЖЕНИИ', res.summary);
          }
        }
      });
    }

    // НОВЫЕ ГОСУДАРСТВА: мятежные режимы, марионеточные правительства, отделения.
    // Доступно и игроку (свои/захваченные земли), и ИИ-странам. Страна создаётся движком
    // и становится полноценной (профиль дозаполнит ИИ).
    if (effects.new_countries && Array.isArray(effects.new_countries) && typeof createDynamicCountry === 'function') {
      effects.new_countries.forEach(nc => {
        const res = createDynamicCountry(nc);
        if (!res) return;
        showNotif(`🏳️ Новое государство: ${res.name}`);
        if (typeof showBreakingNews === 'function') {
          showBreakingNews(nc.type === 'rebel' ? 'ВОССТАНИЕ' : 'НОВОЕ ГОСУДАРСТВО',
            `Провозглашено государство ${res.name}${res.from ? ' на землях ' + res.from : ''} (${res.provinces} провинций).`);
        }
        turnChanges.push({ label: '🏳️ Новое государство', value: res.name, sign: 0 });
        if (typeof queueMissingProfiles === 'function') queueMissingProfiles();
      });
    }

    // Религия страны игрока: сдвиги процентов и/или смена веры правителя
    if (effects.religion && typeof shiftReligion === 'function') {
      shiftReligion(playerCountry, effects.religion.shift || null, effects.religion.ruler_religion || null);
      if (effects.religion.shift) turnChanges.push({ label: '⛪ Религия', value: Object.entries(effects.religion.shift).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}%`).join(', '), sign: 0 });
      if (effects.religion.ruler_religion) turnChanges.push({ label: '⛪ Вера правителя', value: effects.religion.ruler_religion, sign: 0 });
    }

    // ДОГОВОРЫ: подписание и разрыв (последствия разрыва применяет движок)
    if (effects.treaties && Array.isArray(effects.treaties) && typeof signTreaty === 'function') {
      effects.treaties.forEach(tr => {
        if (!tr || !tr.action || !tr.type || !tr.a || !tr.b) return;
        if (tr.type !== 'alliance' && tr.type !== 'nonaggression') return;
        const a = normalizeCountryName(tr.a), b = normalizeCountryName(tr.b);
        if (!countries[a] || !countries[b]) return;
        if (tr.action === 'sign') {
          const t = signTreaty(tr.type, a, b);
          if (t) turnChanges.push({ label: '📜 Договор', value: `${a} + ${b}`, sign: (a === playerCountry || b === playerCountry) ? 1 : 0 });
        } else if (tr.action === 'break') {
          const ok = breakTreaty(tr.type, a, b);
          if (ok) turnChanges.push({ label: '💔 Разрыв договора', value: `${a} → ${b}`, sign: (a === playerCountry) ? -1 : 0 });
        }
      });
    }

    // Парламент страны игрока: поддержка/власть/состав/вето/роспуск/созыв/выборы/запреты
    if (effects.parliament) {
      const ep = effects.parliament;
      if (ep.dissolve === true && typeof dissolveParliament === 'function' && dissolveParliament(playerCountry)) {
        showNotif('🏛 Парламент распущен!');
        turnChanges.push({ label: '🏛 Парламент', value: 'РАСПУЩЕН', sign: -1 });
      }
      if (ep.restore === true && typeof restoreParliament === 'function' && restoreParliament(playerCountry, null)) {
        showNotif('🏛 Парламент созван');
        turnChanges.push({ label: '🏛 Парламент', value: 'созван', sign: 1 });
      }
      const parl = countries[playerCountry].parliament;
      if (parl) {
        if (typeof ep.support_delta === 'number' && ep.support_delta !== 0) {
          parl.support = Math.max(0, Math.min(100, parl.support + ep.support_delta));
          turnChanges.push({ label: '🏛 Поддержка парламента', value: (ep.support_delta > 0 ? '+' : '') + ep.support_delta + '%', sign: ep.support_delta });
        }
        if (typeof ep.power_delta === 'number' && ep.power_delta !== 0) {
          parl.power = Math.max(0, Math.min(100, (parl.power ?? 50) + ep.power_delta));
          turnChanges.push({ label: '🏛 Власть парламента', value: (ep.power_delta > 0 ? '+' : '') + ep.power_delta + '%', sign: 0 });
        }
        if (Array.isArray(ep.factions) && ep.factions.length) {
          const bannedSet = new Set((parl.banned || []).map(x => x.toLowerCase()));
          parl.factions = ep.factions.filter(f => f && f.name && typeof f.pct === 'number' && !bannedSet.has(f.name.toLowerCase()));
          turnChanges.push({ label: '🗳 Выборы', value: 'новый состав парламента', sign: 0 });
        }
        if (typeof ep.next_election_year === 'number' && ep.next_election_year > year) {
          parl.nextElection = ep.next_election_year;
          turnChanges.push({ label: '🗳 Дата выборов', value: String(ep.next_election_year), sign: 0 });
        }
        if (typeof ep.term_years === 'number' && ep.term_years >= 1 && ep.term_years <= 15) parl.termYears = ep.term_years;
        if (ep.ban_party && typeof banParty === 'function' && banParty(playerCountry, ep.ban_party)) {
          showNotif(`🚫 Партия запрещена: ${ep.ban_party}`);
          turnChanges.push({ label: '🚫 Запрет партии', value: ep.ban_party, sign: -1 });
        }
        if (ep.veto && typeof ep.veto === 'string') {
          showNotif('🏛 ВЕТО парламента!');
          worldState.pastEvents.push(`🏛 Парламент ${playerCountryDisplayName} наложил ВЕТО: ${ep.veto}`);
          turnChanges.push({ label: '🏛 ВЕТО парламента', value: ep.veto.slice(0, 60), sign: -1 });
        }
      }
      if (typeof renderParliamentPanel === 'function') renderParliamentPanel();
    }

    // Налоговые ставки сословий (страна игрока)
    if (effects.economy && typeof setClassTax === 'function') {
      const map = { tax_noble: 'noble', tax_burgher: 'burgher', tax_commons: 'commons' };
      Object.entries(map).forEach(([key, cls]) => {
        if (typeof effects.economy[key] === 'number') {
          const before = countries[playerCountry].economy ? countries[playerCountry].economy.classes[cls].tax : null;
          setClassTax(playerCountry, cls, effects.economy[key]);
          if (before !== null && before !== countries[playerCountry].economy.classes[cls].tax) {
            turnChanges.push({ label: '💸 Налог: ' + countries[playerCountry].economy.classes[cls].label, value: before + '% → ' + countries[playerCountry].economy.classes[cls].tax + '%', sign: 0 });
          }
        }
      });
    }

    // Социум: расходы и права (страна игрока)
    if (effects.society && countries[playerCountry].society) {
      const so = effects.society;
      if (typeof so.education_spending === 'number' && typeof setSocialSpending === 'function') {
        setSocialSpending(playerCountry, 'education', so.education_spending);
        turnChanges.push({ label: '🎓 Расходы на образование', value: so.education_spending + ' фр./мес', sign: 0 });
      }
      if (typeof so.welfare_spending === 'number' && typeof setSocialSpending === 'function') {
        setSocialSpending(playerCountry, 'welfare', so.welfare_spending);
        turnChanges.push({ label: '🍞 Призрение бедных', value: so.welfare_spending + ' фр./мес', sign: 0 });
      }
      const soc = countries[playerCountry].society;
      if (typeof so.womens_rights_delta === 'number' && so.womens_rights_delta !== 0) {
        soc.womensRights = Math.max(0, Math.min(100, soc.womensRights + so.womens_rights_delta));
        turnChanges.push({ label: '👩 Права женщин', value: (so.womens_rights_delta > 0 ? '+' : '') + so.womens_rights_delta, sign: so.womens_rights_delta });
      }
      if (typeof so.religious_freedom_delta === 'number' && so.religious_freedom_delta !== 0) {
        soc.religiousFreedom = Math.max(0, Math.min(100, soc.religiousFreedom + so.religious_freedom_delta));
        turnChanges.push({ label: '🕊 Свобода вероисповедания', value: (so.religious_freedom_delta > 0 ? '+' : '') + so.religious_freedom_delta, sign: so.religious_freedom_delta });
      }
      if (typeof renderSocietyScreen === 'function') renderSocietyScreen();
    }

    // Законы: принятие и отмена
    if (effects.laws && Array.isArray(effects.laws) && typeof enactLaw === 'function') {
      effects.laws.forEach(l => {
        if (!l || !l.action || !l.name) return;
        if (l.action === 'enact' && enactLaw(playerCountry, l.name, l.description)) {
          showNotif(`📖 Принят закон: «${l.name}»`);
          turnChanges.push({ label: '📖 Новый закон', value: l.name, sign: 1 });
        }
        if (l.action === 'repeal' && repealLaw(playerCountry, l.name)) {
          showNotif(`📖 Закон отменён: «${l.name}»`);
          turnChanges.push({ label: '📖 Отмена закона', value: l.name, sign: 0 });
        }
      });
    }

    // Институты: церковь
    if (effects.institutions) {
      const ins = effects.institutions;
      if (ins.church === 'abolish' && typeof abolishChurch === 'function' && abolishChurch(playerCountry)) {
        showNotif('⛪ Церковь лишена государственной власти');
        turnChanges.push({ label: '⛪ Церковь', value: 'лишена власти', sign: -1 });
      }
      if (ins.church === 'restore' && typeof restoreChurch === 'function' && restoreChurch(playerCountry)) {
        showNotif('⛪ Церковь восстановлена');
        turnChanges.push({ label: '⛪ Церковь', value: 'восстановлена', sign: 1 });
      }
      const ch = countries[playerCountry].church;
      if (ch && ch.exists && typeof ins.church_influence_delta === 'number' && ins.church_influence_delta !== 0) {
        ch.influence = Math.max(0, Math.min(100, ch.influence + ins.church_influence_delta));
        turnChanges.push({ label: '⛪ Влияние церкви', value: (ins.church_influence_delta > 0 ? '+' : '') + ins.church_influence_delta + '%', sign: 0 });
      }
      if (typeof renderChurchPanel === 'function') renderChurchPanel();
    }

    if (effects.map_objects && Array.isArray(effects.map_objects) && typeof applyMapObjects === 'function') {
      const objLog = applyMapObjects(effects.map_objects);
      objLog.forEach(msg => turnChanges.push({ label: '🗺️ Карта', value: msg.replace(/^\S+\s/, ''), sign: 0 }));
    }

    if (effects.territory_transfer && Array.isArray(effects.territory_transfer) && typeof transferTerritory === 'function') {
      effects.territory_transfer.forEach(t => {
        if (!t || !t.country || !t.new_owner) return;
        const country = normalizeCountryName(t.country);
        const newOwner = normalizeCountryName(t.new_owner);
        if (!ALL_COUNTRIES.includes(country) || !ALL_COUNTRIES.includes(newOwner)) return;
        const oldOwner = (typeof territoryOwnerOf === 'function') ? territoryOwnerOf(country) : country;
        if (oldOwner === newOwner) return;
        transferTerritory(country, newOwner);
        showNotif(`🏳️ ${country} теперь под властью: ${newOwner}`);
        if (typeof showBreakingNews === 'function') showBreakingNews('АННЕКСИЯ', `${country} перестала существовать как самостоятельное государство — её земли переходят под власть ${newOwner}.`);
        turnChanges.push({ label: '🏳️ Территория', value: country + ' → ' + newOwner, sign: newOwner === playerCountry ? 1 : (oldOwner === playerCountry ? -1 : 0) });
      });
    }

    if (effects.province_transfer && Array.isArray(effects.province_transfer) && typeof transferProvince === 'function') {
      effects.province_transfer.forEach(t => {
        if (!t || !t.province || !t.new_owner) return;
        const newOwner = normalizeCountryName(t.new_owner);
        if (!ALL_COUNTRIES.includes(newOwner)) return;
        const result = transferProvince(t.province, newOwner);
        if (!result) return;
        showNotif(`🏳️ Провинция «${result.name}» теперь под властью: ${newOwner}`);
        turnChanges.push({ label: '🏳️ Провинция ' + result.name, value: result.oldOwner + ' → ' + newOwner, sign: newOwner === playerCountry ? 1 : (result.oldOwner === playerCountry ? -1 : 0) });
      });
    }

    if (effects.war_declared && Array.isArray(effects.war_declared)) {
      effects.war_declared.forEach(raw => {
        const c = normalizeCountryName(raw);
        if (!worldState.atWarWith.includes(c)) worldState.atWarWith.push(c);
        changeRelations(c, -50);
        showNotif(`⚔️ Война объявлена: ${c}!`);
        if (typeof showBreakingNews === 'function') showBreakingNews('ВОЙНА', `${playerCountryDisplayName} и ${c} находятся в состоянии войны!`);
        turnChanges.push({ label: '⚔️ Война', value: c, sign: -1 });
      });
    }

    if (effects.peace_made && Array.isArray(effects.peace_made)) {
      effects.peace_made.forEach(raw => {
        const c = normalizeCountryName(raw);
        worldState.atWarWith = worldState.atWarWith.filter(x => x !== c);
        if (worldState.warGoals) delete worldState.warGoals[mutualRelKey(playerCountry, c)];
        changeRelations(c, 20);
        showNotif(`🕊️ Мир заключён с ${c}`);
        turnChanges.push({ label: '🕊️ Мир', value: c, sign: 1 });
      });
    }

    if (effects.country_name && typeof renameCountry === 'function' && effects.country_name !== playerCountryDisplayName) {
      const old = playerCountryDisplayName;
      renameCountry(playerCountry, effects.country_name);
      showNotif(`🏳️ Страна переименована: ${effects.country_name}`);
      turnChanges.push({ label: '🏳️ Название страны', value: old + ' → ' + effects.country_name, sign: 0 });
    }

    if (effects.country_color && effects.country_color.country && effects.country_color.color && typeof setCountryColor === 'function') {
      const country = normalizeCountryName(effects.country_color.country);
      setCountryColor(country, effects.country_color.color);
      turnChanges.push({ label: '🎨 Цвет территории', value: country + ': ' + effects.country_color.color, sign: 0 });
    }

    // Смена власти в ЧУЖИХ странах (включая преемника после смерти правителя — с возрастом!)
    if (effects.foreign_leader_change && Array.isArray(effects.foreign_leader_change)) {
      effects.foreign_leader_change.forEach(f => {
        if (!f || !f.country) return;
        const country = normalizeCountryName(f.country);
        if (country === playerCountry || !countries[country]) return;
        const old = countries[country].ruler;
        const fields = {};
        if (f.ruler_name) fields.ruler = f.ruler_name;
        if (typeof f.ruler_age === 'number') fields.rulerAge = f.ruler_age;
        if (f.ruler_title) fields.rulerTitle = f.ruler_title;
        if (f.government) fields.government = f.government;
        if (f.pm_name) fields.pm = f.pm_name;
        if (f.pm_title) fields.pmTitle = f.pm_title;
        if (Object.keys(fields).length === 0) return;
        setCountryLeader(country, fields);
        showNotif(`👑 Новый правитель в ${country}: ${fields.ruler || old}`);
        turnChanges.push({ label: '👑 Власть в ' + country, value: old + ' → ' + (fields.ruler || old), sign: 0 });
      });
    }

    // Смена власти в СВОЕЙ стране
    const playerLeaderFields = {};
    const cp = countries[playerCountry];
    if (effects.ruler_name && effects.ruler_name !== cp.ruler) {
      playerLeaderFields.ruler = effects.ruler_name;
      if (typeof effects.ruler_age === 'number') playerLeaderFields.rulerAge = effects.ruler_age;
      showNotif(`👑 Новый глава государства: ${effects.ruler_name}`);
      turnChanges.push({ label: '👑 Смена власти', value: cp.ruler + ' → ' + effects.ruler_name, sign: 0 });
    }
    if (effects.ruler_title && effects.ruler_title !== cp.rulerTitle) {
      playerLeaderFields.rulerTitle = effects.ruler_title;
      turnChanges.push({ label: '👑 Титул главы государства', value: cp.rulerTitle + ' → ' + effects.ruler_title, sign: 0 });
    }
    if (effects.government && effects.government !== cp.government) {
      playerLeaderFields.government = effects.government;
      showNotif(`🏛 Форма правления изменена: ${effects.government}`);
      turnChanges.push({ label: '🏛 Форма правления', value: cp.government + ' → ' + effects.government, sign: 0 });
    }
    if (effects.pm_name && effects.pm_name !== cp.pm) {
      playerLeaderFields.pm = effects.pm_name;
      showNotif(`🎩 Новый глава правительства: ${effects.pm_name}`);
      turnChanges.push({ label: '🎩 Глава правительства', value: cp.pm + ' → ' + effects.pm_name, sign: 0 });
    }
    if (effects.pm_title && effects.pm_title !== cp.pmTitle) {
      playerLeaderFields.pmTitle = effects.pm_title;
      turnChanges.push({ label: '🎩 Титул главы правительства', value: cp.pmTitle + ' → ' + effects.pm_title, sign: 0 });
    }
    if (Object.keys(playerLeaderFields).length > 0) setCountryLeader(playerCountry, playerLeaderFields);

    if (typeof updateRelationsPanel === 'function') updateRelationsPanel();
    if (typeof renderTurnChanges === 'function') renderTurnChanges(turnChanges);
  } catch (e) {
    console.log('EFFECTS parse error:', e.message);
    if (typeof renderTurnChanges === 'function') renderTurnChanges(turnChanges);
  }
}

// Парсинг изменения отношений из дипломатического ответа
function parseDiploEffects(text, targetCountry) {
  try {
    const jsonText = extractBalancedJson(text, 'DIPLO_EFFECTS:');
    if (!jsonText) return;
    const effects = JSON.parse(jsonText);
    if (effects.relations_delta && effects.relations_delta !== 0) {
      changeRelations(targetCountry, effects.relations_delta);
      if (effects.relations_delta <= -20) {
        showNotif(`😠 ${targetCountry} крайне недоволен переговорами`);
      } else if (effects.relations_delta >= 10) {
        showNotif(`🤝 Отношения с ${targetCountry} улучшились`);
      }
    }
    if (effects.treaty && effects.treaty.action && (effects.treaty.type === 'alliance' || effects.treaty.type === 'nonaggression') && typeof signTreaty === 'function') {
      if (effects.treaty.action === 'sign') {
        signTreaty(effects.treaty.type, playerCountry, targetCountry);
      } else if (effects.treaty.action === 'break') {
        const breaker = normalizeCountryName(effects.treaty.breaker) === playerCountry ? playerCountry : targetCountry;
        const other = breaker === playerCountry ? targetCountry : playerCountry;
        breakTreaty(effects.treaty.type, breaker, other);
      }
    }
    if (effects.war_start) {
      if (!worldState.atWarWith.includes(targetCountry)) {
        worldState.atWarWith.push(targetCountry);
        if (worldState.warGoals && typeof makeWarGoal === 'function') {
          worldState.warGoals[mutualRelKey(playerCountry, targetCountry)] = makeWarGoal(targetCountry, playerCountry);
        }
        showNotif(`⚔️ ${targetCountry} объявляет войну!`);
        if (typeof showBreakingNews === 'function') showBreakingNews('ВОЙНА', `${targetCountry} объявляет войну ${playerCountryDisplayName}!`);
      }
    }
  } catch (e) {
    console.log('DIPLO_EFFECTS parse error:', e.message);
  }
}

// ============================================================
// 1. СОБЫТИЯ ПОСЛЕ ХОДА — мировые новости + внутренние новости + BREAKING + JSON-эффекты
// ============================================================
async function generateEvents(deaths, opts) {
  opts = opts || {};
  const newsCount = opts.newsCount || 10;
  const domesticCount = opts.domesticCount || 3;
  const periodLabel = opts.periodLabel || null;
  const state = getGameState();
  const actions = playerActions.length > 0
    ? playerActions.join('\n')
    : 'Никаких особых действий не предпринималось.';

  const deathsLine = (deaths && deaths.length)
    ? `\nСОБЫТИЯ ДВИЖКА ЭТОГО ХОДА (обязательные факты, их НЕЛЬЗЯ игнорировать):\n${deaths.map(d => `- Скончался ${d.title} ${d.ruler} (${d.country}) в возрасте ${d.age} лет. ОБЯЗАТЕЛЬНО опиши это в новостях и назначь преемника${d.country === playerCountry ? ' через ruler_name/ruler_age' : ` через foreign_leader_change с ruler_age (реалистичный возраст наследника)`}.`).join('\n')}\n`
    : '';

  const otherNames = ALL_COUNTRIES.filter(c => c !== playerCountry && countries[c] && !countries[c].annexed);

  // Директивы дипломатического движка (войны/кризисы/союзы, решённые математикой) —
  // обязательные факты этого хода; после использования очищаются
  const directives = (typeof pendingDirectives !== 'undefined' && pendingDirectives.length)
    ? '\nДИРЕКТИВЫ ДВИЖКА НА ЭТОТ ХОД (обязательные факты и задания — отработай КАЖДУЮ в новостях и эффектах):\n' +
      pendingDirectives.map(d => '- ' + d).join('\n') + '\n'
    : '';
  if (typeof pendingDirectives !== 'undefined') pendingDirectives = [];

  const prompt = `Ты — нарратор исторической стратегической игры. Сейчас ${state.date}.
Страна игрока: ${state.country}. Правитель: ${state.ruler}${state.rulerAge ? ` (${state.rulerAge} лет)` : ''} (${state.rulerTitle}). Форма правления: ${state.government}. Глава правительства: ${state.pm} (${state.pmTitle}).
Казна: ${state.treasury}. Доход: ${state.income}. Армия: ${state.army}. Стабильность: ${state.stability}. Долг: ${state.debt}. Инфляция: ${state.inflation}.

${describePlayerEconomy()}

${describePlayerSociety()}

ПОКАЗАТЕЛИ ВСЕХ СТРАН СЦЕНАРИЯ (скрыты от игрока — используй их для реализма, но НЕ называй игроку точные числа чужих казн/армий в новостях, только качественные оценки: "истощена войной", "собирает огромную армию"):
${describeCountries()}

${describePlayerProvinces()}

${describeWorldState()}
${deathsLine}${directives}
${getRealismRules()}

Действия игрока за этот ход:
${actions}

${periodLabel
    ? `ЭТО ПРОПУСК ВРЕМЕНИ: прошёл целый период ${periodLabel}. Напиши РОВНО ${newsCount} КЛЮЧЕВЫХ событий всего этого периода (самое важное, что случилось в мире за это время) — крупные сдвиги, войны, реформы, кризисы. Каждое — 2-3 предложения.`
    : `Напиши РОВНО ${newsCount} мировых новостных событий этого ${newsCount < 10 ? 'НЕДЕЛЬНОГО отрезка (мелкий масштаб: неделя, не месяц)' : 'месяца'}. Каждое — 2-3 предложения (40-60 слов).`}
- Минимум ${Math.ceil(newsCount * 0.4)} из ${newsCount} — САМОСТОЯТЕЛЬНЫЕ действия других стран (${otherNames.join(', ')}): каждая преследует СВОИ ИНТЕРЕСЫ (поле ИНТЕРЕСЫ выше), боится и интригует против соседей согласно СКРЫТЫМ ОТНОШЕНИЯМ. Они воюют, торгуют, реформируются независимо от игрока. Другие страны ТОЖЕ двигают фигуры на карте (map_objects с owner=их название): стягивают армии к границам, шлют делегации, строят штабы — используй это, когда их политика этого требует.
- Остальные — последствия действий игрока.
Каждое событие с новой строки, без нумерации. На русском языке.

После мировых событий напиши строку "ВНУТРЕННИЕ:" и затем РОВНО ${domesticCount} ВНУТРЕННИЕ новости страны игрока — громкие и важные внутренние дела: конкретные провинции (бери из списка ПРОВИНЦИИ выше), парламент/фракции, религиозные общины, бюджет/долг/инфляция (по РЕАЛЬНЫМ числам из сводки БЮДЖЕТ), общественные настроения. Каждая 1-2 предложения, с новой строки.

Раз в несколько ходов (РЕДКО, не чаще одного раза за 4-6 ходов и только если это логично следует из хроники) может случиться ОГРОМНОЕ событие: смерть очень крупной фигуры, крах банка, революция, эпидемия. Если такое происходит В ЭТОМ ходу — добавь строку:
BREAKING:{"title":"КОРОТКИЙ ЗАГОЛОВОК","text":"1-2 предложения сути"}
Если нет — строку BREAKING не пиши вовсе.

В конце напиши ровно одну строку:
EFFECTS:{"treasury_delta":0,"income_delta":0,"debt_delta":0,"army_delta":0,"stability_delta":0,"relations":{${otherNames.map(c => `"${c}":0`).join(',')}},"relations_between":[],"wars_between":[],"battles":[],"new_countries":[],"treaties":[],"religion":null,"other_countries":{},"parliament":{"support_delta":0,"power_delta":0,"factions":null,"veto":null,"dissolve":false,"restore":false,"next_election_year":null,"term_years":null,"ban_party":null},"economy":{"tax_noble":null,"tax_burgher":null,"tax_commons":null},"society":{"education_spending":null,"welfare_spending":null,"womens_rights_delta":0,"religious_freedom_delta":0},"laws":[],"institutions":{"church":null,"church_influence_delta":0},"war_declared":[],"peace_made":[],"country_name":null,"country_color":null,"ruler_name":null,"ruler_age":null,"ruler_title":null,"government":null,"pm_name":null,"pm_title":null,"map_objects":[],"territory_transfer":[],"province_transfer":[],"foreign_leader_change":[]}

КРИТИЧЕСКИ ВАЖНО — заполняй числа исходя из событий, не ставь нули без причины:
- Казнил/убил солдат → army_delta отрицательный, stability_delta −3..−8
- Потратил деньги → treasury_delta минус сумма. Взял заём → debt_delta плюс сумма (и treasury_delta плюс).
- Оскорблял/угрожал стране → relations с ней −10..−30. Объявил войну → war_declared.
- Мобилизация из СУЩЕСТВУЮЩИХ солдат — это map_objects, army_delta=0. Новый набор рекрутов — army_delta>0 и стоимость в treasury_delta.
- ОГРАНИЧЕНИЕ: treasury_delta/income_delta не больше ~25-30% текущих значений за ход, если не катастрофа.
- income_delta — РЕДКО, только структурные изменения экономики (фабрики, налоги, потеря территорий). Разовые траты — только treasury_delta.
- other_countries: {"Страна":{"treasury_delta":0,"income_delta":0,"army_delta":0,"stability_delta":0}} — ТОЛЬКО для стран, у которых в новостях выше есть независимое событие с реальным эффектом. Соразмерно масштабу страны.
- relations_between: [{"a":"Страна1","b":"Страна2","delta":число}] — сдвиги СКРЫТЫХ отношений между ДРУГИМИ странами, когда их события выше влияют друг на друга (союз, конфликт, торговая сделка). Игрока в паре быть не должно.
- wars_between: [{"a":"Страна1","b":"Страна2","status":"start"|"end"}] — начало/конец войны МЕЖДУ другими странами.
- battles: [{"a":"Атакующий","b":"Обороняющийся","scale":"skirmish|battle|decisive","location":"место"}] — РЕАЛЬНОЕ СРАЖЕНИЕ между воюющими странами (включая игрока). Указывай его, когда по хронике/действиям армии сходятся в бою: движок сам МАТЕМАТИЧЕСКИ посчитает потери из численности армий, стабильности и случайности — потери могут быть огромными, в решающем бою можно потерять почти всю задействованную армию. НЕ указывай army_delta за тот же бой — движок сам спишет потери. skirmish — стычка, battle — крупное сражение, decisive — генеральное сражение. Если страны воюют (⚔️ в сводке), сражения должны происходить регулярно, а не висеть в воздухе.
- new_countries: [{"name":"Название","type":"rebel|puppet|independent","from":"Страна, из чьих земель","patron":"Страна-покровитель или null","provinces":["Название провинции",...],"color":"#RRGGBB","ruler":"имя","ruler_age":число,"ruler_title":"титул","government":"форма правления","army":число,"treasury":число,"stability":число,"agenda":"интересы","religion_main":"религия","blurb":"1-2 предложения"}] — СОЗДАНИЕ НОВОГО ГОСУДАРСТВА:
  * rebel — мятежный режим/сепаратисты: возникает ТОЛЬКО при низкой стабильности (<40), гражданской войне или после разгрома в войне. Мятежники автоматически в войне с метрополией. Так делаются гражданские войны: часть провинций уходит новому образованию, дальше — battles между ними.
  * puppet — марионеточное правительство: игрок (или ИИ-страна) СОЗНАТЕЛЬНО создаёт правительство на СВОИХ или ЗАХВАЧЕННЫХ землях и ставит кого-то у власти ("создать королевство в Ломбардии, посадить герцога X"). patron — создатель. Это законное право владельца земель.
  * independent — мирное отделение/уния по договору.
  Провинции бери ТОЧНО из списка провинций. ИИ-страны тоже могут создавать марионетки и переживать восстания — используй это как живой инструмент мира, но РЕДКО и обоснованно.
- religion: {"shift":{"Религия":дельта_процентов,...},"ruler_religion":"новая вера правителя или null"} — сдвиг религиозного состава страны игрока (обращения, миграции, реформы; дельты малые, 1-3% за ход) и/или смена веры правителя (крупное событие!). Если ничего — null.
- treaties: [{"action":"sign"|"break","type":"alliance"|"nonaggression","a":"Страна1","b":"Страна2"}] — заключение/разрыв ОФИЦИАЛЬНЫХ договоров. sign: только при хороших отношениях сторон (>+40 для пакта, >+60 для союза) и по логике их интересов; учитывай репутацию — с вероломными не подписывают. break: a — КТО разрывает (он платит цену: −60 с преданным, −10 со всеми, −20 репутации, −5 стабильности) — используй только при серьёзном расхождении интересов или подготовке удара в спину. Союз означает: нападение на одного втягивает другого — отражай это в войнах.
- parliament (страна игрока): support_delta — сдвиг поддержки; power_delta — сдвиг ВЛАСТИ парламента (реформы усиливают, узурпация ослабляет); factions — новый состав ТОЛЬКО на выборах/при роспуске (директива ВЫБОРЫ) — тогда придумывай партии по контексту эпохи и событий игры; veto — если ВЛАСТЬ парламента ≥50 и поддержка <40, парламент МОЖЕТ заблокировать законодательное действие игрока: опиши блокировку вновостях и укажи в veto короткий текст ЧТО заблокировано (тогда НЕ применяй эффекты этого действия); dissolve:true — если правитель РАСПУСКАЕТ парламент (движок сам спишет цену); restore:true — созыв парламента там, где его нет; next_election_year/term_years — перенос даты выборов/изменение срока; ban_party — запрет партии по названию.
- economy: {"tax_noble":ставка|null,"tax_burgher":...,"tax_commons":...} — НОВЫЕ налоговые ставки сословий (0-45%), только если игрок реально менял налоги или события этого требуют. Помни: высокие налоги (>25%) душат богатство и лояльность класса.
- institutions: {"church":"abolish"|"restore"|null,"church_influence_delta":число} — лишение церкви власти (атеизм/секуляризация — движок спишет цену) или её восстановление; сдвиг влияния церкви от событий.
- society (страна игрока): education_spending/welfare_spending — НОВЫЕ суммы расходов в фр./мес (только если игрок их менял или закон этого требует); womens_rights_delta/religious_freedom_delta — сдвиги прав (−15..+15) ТОЛЬКО при реальных законах/реформах/реакции.
- laws: [{"action":"enact"|"repeal","name":"Название закона","description":"1 предложение сути"}] — когда игрок ПРИНИМАЕТ или ОТМЕНЯЕТ закон (реформа, кодекс, указ). Закон — это документ: сопровождай его эффектами (society/economy/stability/parliament) по смыслу. Не выдумывай законы без действий игрока или крупных событий.
- ЧИСТОТА КАРТЫ: когда война/миссия завершается — ОБЯЗАТЕЛЬНО убирай её объекты с карты (map_objects remove/update: армии по домам, делегации отозваны). Не оставляй армии стоять после мира.
- parliament: support_delta — сдвиг поддержки правительства в парламенте игрока от событий/действий (законы, скандалы, победы); factions — новый состав фракций ТОЛЬКО при выборах/роспуске, иначе null.
- ruler_name/ruler_age/ruler_title/government/pm_name/pm_title — только при реальном перевороте/провозглашении/смерти/отставке в стране игрока. При смене правителя ВСЕГДА указывай ruler_age (возраст нового).
- foreign_leader_change: [{"country":"...","ruler_name":"...","ruler_age":число,"ruler_title":"...","government":"...","pm_name":null,"pm_title":null}] — смена власти в чужой стране: только по её собственной логике или из реальных действий игрока (см. правило 5). ВСЕГДА с ruler_age.
- territory_transfer: [{"country":"X","new_owner":"Y"}] — ТОЛЬКО когда страна аннексируется ЦЕЛИКОМ.
- province_transfer: [{"province":"Название","new_owner":"Y"}] — переход ОДНОЙ провинции (захват/уступка). Названия точно из списка: ${describeProvinces()}
- map_objects (армии/штабы/флоты/делегации; location — город из: ${Object.keys(CITY_COORDS).join(', ')} или название провинции из списка выше):
${worldState.mapObjects && worldState.mapObjects.length > 0
    ? 'Существующие объекты (id для update/remove/move):\n' + worldState.mapObjects.map(o => `- id:"${o.id}" label:"${o.label}" type:${o.type} owner:${o.owner} troops:${o.troops} location:${o.location}`).join('\n')
    : 'На карте пока нет объектов.'}
  Создание: {"action":"create","id":"id_латиницей","type":"army|hq|naval|diplomat|other","owner":"${state.country}","label":"...","troops":50000,"location":"..."}; изменение: {"action":"update","id":"...","troops":N}; перемещение: {"action":"move","id":"...","to":"..."}; удаление: {"action":"remove","id":"..."}. Только когда явно следует из событий.`;

  const result = await askGemini(prompt, 2500);

  // Разбор секций: мировые новости / ВНУТРЕННИЕ / BREAKING / EFFECTS
  const effectsIndex = result.indexOf('EFFECTS:');
  let textPart = effectsIndex > -1 ? result.slice(0, effectsIndex) : result;

  let breaking = null;
  const breakingJson = extractBalancedJson(textPart, 'BREAKING:');
  if (breakingJson) {
    try { breaking = JSON.parse(breakingJson); } catch (e) { /* битый breaking — пропускаем */ }
    textPart = textPart.replace(/BREAKING:[\s\S]*$/, '');
  }

  let domestic = [];
  const domIdx = textPart.search(/ВНУТРЕННИЕ\s*:/);
  let worldPart = textPart;
  if (domIdx > -1) {
    worldPart = textPart.slice(0, domIdx);
    domestic = textPart.slice(domIdx).replace(/ВНУТРЕННИЕ\s*:/, '').trim()
      .split('\n').map(l => l.trim()).filter(l => l.length > 10).slice(0, 3);
  }
  const events = worldPart.trim().split('\n').filter(l => l.trim().length > 10).slice(0, 10);

  worldState.pastEvents.push(...events);
  domestic.forEach(d => worldState.pastEvents.push('[внутр.] ' + d));
  if (breaking && breaking.title) worldState.pastEvents.push('‼️ ' + breaking.title + ': ' + (breaking.text || ''));
  if (worldState.pastEvents.length > 120) worldState.pastEvents = worldState.pastEvents.slice(-120);

  return { events, domestic, breaking, raw: result };
}

// ============================================================
// ЛЕТОПИСЬ МИРА — долгая память ИИ. Хроника событий в промпте ограничена последними 40
// записями (~4-6 полных ходов); всё, что старше, ИИ забывал. Теперь каждые 10 ходов
// (и по кнопке) ИИ сжимает старые события в ГЛАВУ летописи; главы всегда в промпте —
// мир помнит свою историю: старые войны, предательства, реформы.
// ============================================================
let historySummarizing = false;

async function summarizeWorldHistory(manual) {
  if (historySummarizing || worldState.pastEvents.length < 15) return null;
  historySummarizing = true;
  try {
    const prevChapters = (worldState.historySummary || []).slice(-4)
      .map(ch => `【${ch.title}】 ${ch.text}`).join('\n');
    const prompt = `Ты — летописец мира стратегической игры. Сейчас ${months[month]} ${year} г.
${prevChapters ? 'ПРЕДЫДУЩИЕ ГЛАВЫ ЛЕТОПИСИ:\n' + prevChapters + '\n' : ''}
СОБЫТИЯ, КОТОРЫЕ НУЖНО СЖАТЬ В НОВУЮ ГЛАВУ (от старых к новым):
${worldState.pastEvents.slice(0, -15).map((e, i) => `${i + 1}. ${e}`).join('\n')}

Напиши ОДНУ новую главу летописи: самое важное из этих событий (войны и их итоги, смены власти, договоры и предательства, территориальные изменения, великие потрясения) — 100-160 слов, связным текстом, без нумерации. Не повторяй то, что уже есть в предыдущих главах.
Первой строкой дай короткое название главы (3-6 слов), со второй строки — текст.`;
    const raw = await askGemini(prompt, 500);
    const lines = raw.trim().split('\n').filter(l => l.trim());
    if (!lines.length) return null;
    const title = lines[0].replace(/^[#*\d.\s«»"]+|[«»"]+$/g, '').slice(0, 60) || ('Глава ' + ((worldState.historySummary || []).length + 1));
    const text = lines.slice(1).join(' ').trim();
    if (!text) return null;
    const chapter = { title, text, upToTurn: turn, year };
    if (!worldState.historySummary) worldState.historySummary = [];
    worldState.historySummary.push(chapter);
    if (worldState.historySummary.length > 12) worldState.historySummary = worldState.historySummary.slice(-12);
    // Сжатое — убираем из сырой хроники (остаются последние 15 свежих событий)
    worldState.pastEvents = worldState.pastEvents.slice(-15);
    if (typeof renderHistoryPanel === 'function') renderHistoryPanel();
    if (manual) showNotif('📜 Летопись пополнена: «' + title + '»');
    saveGame();
    return chapter;
  } finally {
    historySummarizing = false;
  }
}

// Социум и законы страны игрока — для промптов и общественного советника
function describePlayerSociety() {
  const c = countries[playerCountry];
  if (!c || !c.society) return '';
  const so = c.society;
  const laws = (c.laws || []).filter(l => !l.repealed);
  return `СОЦИУМ ${c.displayName} (реальные числа движка): грамотность ${so.literacy}%, бедность ${so.poverty}%, права женщин ${so.womensRights}/100, свобода вероисповедания ${so.religiousFreedom}/100, урбанизация ${so.urbanization}%. Расходы: образование ${so.spending.education} фр./мес, призрение бедных ${so.spending.welfare} фр./мес.
ДЕЙСТВУЮЩИЕ ЗАКОНЫ: ${laws.length ? laws.map(l => `«${l.name}» (${l.year})`).join('; ') : 'особых законов не принято'}.`;
}

let societyHistory = [];
async function askSocietyAdvisor(userMessage) {
  const state = getGameState();
  const systemContext = `Ты — министр внутренних дел страны ${state.country} в ${state.date}. Объясняешь правителю ПРОСТЫМ языком состояние общества и законов, советуешь.
${describePlayerSociety()}
${describePlayerEconomy()}

МЕХАНИКА (объясняй по ней): расходы на образование >5% дохода поднимают грамотность ~2.4%/год; призрение >5% снижает бедность так же; инфляция >10% и стабильность <35 плодят бедность; бедность >70% злит народ (лояльность падает); грамотность >60% ускоряет обогащение буржуазии. Права женщин и свобода вероисповедания меняются ЗАКОНАМИ (через действия правителя) — либеральные законы радуют народ и буржуазию, но злят церковь и аристократию (и наоборот).

Отвечай кратко (до 130 слов), с конкретными числами. На вопрос «что делать» — 1-2 конкретных совета (расходы, законы).`;
  societyHistory.push({ role: 'user', text: userMessage });
  const historyText = societyHistory.slice(-8).map(m => `${m.role === 'user' ? 'Правитель' : 'Министр'}: ${m.text}`).join('\n');
  const response = await askGemini(`${systemContext}\n\nРазговор:\n${historyText}\n\nОтвет министра:`, 350);
  societyHistory.push({ role: 'minister', text: response });
  return response;
}

// ============================================================
// ИИ-ЭКОНОМИСТ — чат во вкладке «Экономика»: объясняет игроку простым языком, откуда
// берутся доходы, куда уходят деньги, что с долгом и что сделать с налогами.
// ============================================================
let economistHistory = [];

async function askEconomist(userMessage) {
  const state = getGameState();
  const systemContext = `Ты — придворный экономист страны ${state.country} в ${state.date}. Твоя задача — ПРОСТЫМ ЯЗЫКОМ объяснять правителю устройство экономики его страны и советовать.
${describePlayerEconomy()}

МЕХАНИКА ЭКОНОМИКИ (объясняй по ней): доход = провинции (земля/производство, растут при стабильности >70) + налоги с трёх сословий (ставка × богатство; ставка >25% душит богатство и лояльность, <12% радует) + торговля. Расходы: армия (0.045% численности в мес), администрация (8% дохода), двор, церковь (если влиятельна), проценты по долгу (0.5%/мес). Дефицит покрывается займами: сперва у своей буржуазии (злит её), потом у иностранных банков. Долг >1.5 годового дохода и дефицит разгоняют инфляцию; инфляция >10% злит все сословия и жжёт стабильность. Средняя лояльность сословий <45 — минус стабильность каждый месяц.

Отвечай кратко (до 130 слов), по делу, с конкретными числами из сводки выше. Если правитель спрашивает "что делать" — дай 1-2 конкретных совета (ставки налогов, армия, долг).`;

  economistHistory.push({ role: 'user', text: userMessage });
  const historyText = economistHistory.slice(-8).map(m =>
    `${m.role === 'user' ? 'Правитель' : 'Экономист'}: ${m.text}`).join('\n');
  const prompt = `${systemContext}\n\nРазговор:\n${historyText}\n\nОтвет экономиста:`;
  const response = await askGemini(prompt, 350);
  economistHistory.push({ role: 'economist', text: response });
  return response;
}

// ============================================================
// 2. СОВЕТНИК — видит всю хронику
// ============================================================
let advisorHistory = [];

async function askAdvisor(userMessage) {
  const state = getGameState();

  const systemContext = `Ты — главный советник страны ${state.country} в ${state.date}.
Правитель: ${state.ruler}. Казна: ${state.treasury}. Армия: ${state.army}. Стабильность: ${state.stability}. Долг: ${state.debt}. Инфляция: ${state.inflation}.
${describePlayerBudget()}

ПОКАЗАТЕЛИ ВСЕХ СТРАН СЦЕНАРИЯ (секретные разведданные — передавай игроку только качественные оценки, без точных чисел чужих казн):
${describeCountries()}

${describeWorldState()}

${getRealismRules()}

Отвечай кратко, по делу, от лица советника эпохи ${state.year} года. ОБЯЗАТЕЛЬНО упомяни 1-2 конкретных события из хроники, если они есть. Максимум 120 слов.`;

  advisorHistory.push({ role: 'user', text: userMessage });
  const historyText = advisorHistory.slice(-10).map(m =>
    `${m.role === 'user' ? 'Игрок' : 'Советник'}: ${m.text}`
  ).join('\n');

  const prompt = `${systemContext}\n\nИстория разговора:\n${historyText}\n\nОтвет советника:`;
  const response = await askGemini(prompt, 350);
  advisorHistory.push({ role: 'advisor', text: response });
  return response;
}

// ============================================================
// 3. ДИПЛОМАТИЯ — ИИ играет лидера страны с её интересами
// ============================================================
const diplomacyHistories = {};

async function sendDiplomacy(targetCountry, message) {
  const state = getGameState();
  if (!diplomacyHistories[targetCountry]) diplomacyHistories[targetCountry] = [];

  const cr = countries[targetCountry];
  const leader = cr ? `${cr.rulerTitle || 'правитель'} ${cr.ruler}` : ('правитель ' + targetCountry);
  const relation = worldState.relations[targetCountry] || 0;
  const isWar = worldState.atWarWith.includes(targetCountry);
  const isAlly = worldState.alliedWith.includes(targetCountry);

  const recentNews = worldState.pastEvents.length > 0
    ? 'Последние известия в мире:\n' + worldState.pastEvents.slice(-8).reverse().map((e,i) => `${i+1}. ${e}`).join('\n')
    : '';

  diplomacyHistories[targetCountry].push({ role: 'player', text: message });
  const historyText = diplomacyHistories[targetCountry].slice(-8)
    .map(m => `${m.role === 'player' ? state.country : targetCountry}: ${m.text}`).join('\n');

  const relLabel = relation > 30 ? 'дружелюбные' : relation < -30 ? 'враждебные' : 'нейтральные';
  const warLine = isWar ? `ВЫ СЕЙЧАС В СОСТОЯНИИ ВОЙНЫ С ${state.country.toUpperCase()}.` : '';
  const allyLine = isAlly ? `Вы союзники с ${state.country}.` : '';
  const pactAB = (typeof findTreaty === 'function') ? findTreaty('nonaggression', playerCountry, targetCountry) : null;
  const allianceAB = (typeof findTreaty === 'function') ? findTreaty('alliance', playerCountry, targetCountry) : null;
  const treatyLine = allianceAB ? `Между вами ОФИЦИАЛЬНЫЙ ВОЕННЫЙ СОЮЗ (с ${allianceAB.since} г.).` : pactAB ? `Между вами пакт о ненападении (с ${pactAB.since} г.).` : 'Официальных договоров между вами нет.';
  const playerRep = (countries[playerCountry].reputation ?? 70);
  const trustLine = playerRep < 50 ? `ВАЖНО: у ${state.country} подорванная репутация (${playerRep}/100) — она уже нарушала договоры, будь осторожен с её обещаниями и неохотно заключай новые союзы.` : '';

  const selfStatsLine = cr ? `Твоя страна: казна ${cr.treasury.toLocaleString('ru')} фр., долг ${cr.debt.toLocaleString('ru')} фр., армия ${cr.army.toLocaleString('ru')}, стабильность ${cr.stability}.${cr.agenda ? ' ТВОИ НАЦИОНАЛЬНЫЕ ИНТЕРЕСЫ: ' + cr.agenda : ''}` : '';
  const prompt = `Ты — ${leader} страны ${targetCountry} в ${state.date}.
${selfStatsLine}
Текущие отношения с ${state.country}: ${relation} (${relLabel}). ${warLine} ${allyLine}
${treatyLine} ${trustLine}
Ты ведёшь дипломатические переговоры с ${state.country} (правитель: ${state.ruler}).
${recentNews}

${getRealismRules()}

Отвечай от первого лица, как этот исторический персонаж, исходя из СВОИХ интересов. Реагируй на тон: грубость → гнев и последствия, выгода → интерес. 60-100 слов.

История переговоров:
${historyText}

Ответ ${targetCountry}:

После ответа напиши одну строку — твоя оценка этого обмена:
DIPLO_EFFECTS:{"relations_delta":0,"war_start":false,"treaty":null}
relations_delta: от -40 до +20. war_start: true только если ситуация дошла до реального разрыва.
treaty: null, либо {"action":"sign","type":"alliance"|"nonaggression"} — если в ЭТОМ обмене вы РЕАЛЬНО договорились и ты СОГЛАСИЛСЯ заключить договор (соглашайся только при отношениях выше +40 для пакта, выше +60 для союза, с учётом своих интересов и репутации собеседника); либо {"action":"break","type":...,"breaker":"${targetCountry}"} — если ты объявляешь о разрыве существующего договора (помни о цене вероломства).`;

  const rawResponse = await askGemini(prompt, 350);

  const diploIdx = rawResponse.indexOf('DIPLO_EFFECTS:');
  const response = diploIdx > -1 ? rawResponse.slice(0, diploIdx).trim() : rawResponse;

  diplomacyHistories[targetCountry].push({ role: targetCountry, text: response });
  parseDiploEffects(rawResponse, targetCountry);

  worldState.diploLog.push(`Переговоры с ${targetCountry}: "${message.slice(0, 60)}" → "${response.slice(0, 80)}"`);
  if (worldState.diploLog.length > 15) worldState.diploLog = worldState.diploLog.slice(-15);

  return response;
}

// ============================================================
// UI — Окно действий
// ============================================================
function openActionsPanel() {
  if (typeof stopAutoPlay === 'function') stopAutoPlay(true);
  document.getElementById('actions-panel').style.display = 'block';
  document.getElementById('diplo-pop').style.display = 'none';
  document.getElementById('adv-pop').style.display = 'none';
  document.getElementById('relations-panel').style.display = 'none';
  renderActionsList();
}

function addAction() {
  const input = document.getElementById('action-input');
  const text = input.value.trim();
  if (!text) return;
  playerActions.push(text);
  input.value = '';
  renderActionsList();
  showNotif('✅ Действие добавлено');
}

function removeAction(i) {
  playerActions.splice(i, 1);
  renderActionsList();
}

function renderActionsList() {
  const list = document.getElementById('actions-list');
  if (playerActions.length === 0) {
    list.innerHTML = '<div style="color:#7e89a3;font-size:11px;font-style:italic">Нет действий на этот ход</div>';
    return;
  }
  list.innerHTML = playerActions.map((a, i) =>
    `<div class="action-item">
      <span>${a}</span>
      <button onclick="removeAction(${i})" class="rm-btn">✕</button>
    </div>`
  ).join('');
}

// ============================================================
// Конец хода
// ============================================================
async function onTurnEnd(econChanges, deaths, opts) {
  const eventsBox = document.getElementById('events-box');
  const eventsList = document.getElementById('events-list');

  eventsBox.style.display = 'block';
  eventsList.innerHTML = '<div class="ev-loading">⏳ ИИ симулирует мир...</div>';
  const domList = document.getElementById('domestic-list');
  if (domList) domList.innerHTML = '';

  if (worldState.diploLog.length > 0) {
    playerActions.push('Дипломатические события этого хода: ' + worldState.diploLog.join('; '));
  }

  const { events, domestic, breaking, raw } = await generateEvents(deaths, opts);
  parseAndApplyEffects(raw, econChanges);

  eventsList.innerHTML = events.map(e =>
    `<div class="ev-item">📰 ${e}</div>`
  ).join('');
  if (domList) {
    domList.innerHTML = domestic.length
      ? domestic.map(e => `<div class="ev-item">🏠 ${e}</div>`).join('')
      : '<div class="ev-loading">Внутри страны месяц прошёл спокойно.</div>';
  }
  if (breaking && breaking.title && typeof showBreakingNews === 'function') {
    showBreakingNews(breaking.title, breaking.text || '');
  }

  playerActions = [];
  worldState.diploLog = [];
  renderActionsList();
  document.getElementById('actions-panel').style.display = 'none';

  // Каждые 10 ходов ИИ сжимает старую хронику в главу летописи (фоново, ход не ждёт)
  if (turn % 10 === 0) summarizeWorldHistory(false);
}
