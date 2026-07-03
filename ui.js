// ============================================================
// UI.JS — панели, советник, дипломатия, отношения
// ============================================================

let panelOpen = true;

function togglePanel() {
  panelOpen = !panelOpen;
  const p = document.getElementById('left-panel');
  const t = document.getElementById('toggle-btn');
  const m = document.getElementById('map-wrap');
  if (panelOpen) { p.classList.remove('hidden'); t.style.left='290px'; t.textContent='◀'; m.style.left='290px'; }
  else { p.classList.add('hidden'); t.style.left='0'; t.textContent='▶'; m.style.left='0'; }
}

function toggle(id) {
  const el = document.getElementById(id);
  const btn = el.previousElementSibling;
  el.classList.toggle('open');
  btn.textContent = (el.classList.contains('open') ? '▼ ' : '▶ ') + btn.textContent.slice(2);
}

function togglePop(show, hide) {
  if (typeof stopAutoPlay === 'function') stopAutoPlay(true);
  document.getElementById(hide).style.display = 'none';
  document.getElementById('actions-panel').style.display = 'none';
  document.getElementById('relations-panel').style.display = 'none';
  const s = document.getElementById(show);
  s.style.display = s.style.display === 'block' ? 'none' : 'block';
}

function showNotif(msg) {
  const e = document.createElement('div');
  e.className = 'notif'; e.textContent = msg;
  document.body.appendChild(e);
  setTimeout(() => e.remove(), 3300);
}

// ============================================================
// СОВЕТНИК — чат
// ============================================================
async function sendAdvisorMessage() {
  const input = document.getElementById('adv-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';

  appendAdvisorMsg('player', msg);
  appendAdvisorMsg('advisor', '⏳ Советник думает...');

  const response = await askAdvisor(msg);

  const msgs = document.querySelectorAll('.adv-msg');
  msgs[msgs.length - 1].remove();
  appendAdvisorMsg('advisor', response);
}

function appendAdvisorMsg(role, text) {
  const box = document.getElementById('adv-messages');
  const div = document.createElement('div');
  div.className = 'adv-msg ' + role;
  div.textContent = role === 'player' ? '👤 ' + text : '🎭 ' + text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function advisorKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAdvisorMessage(); }
}

// ============================================================
// ДИПЛОМАТИЯ — выбор страны и чат
// ============================================================
let selectedCountry = null;

function openDiploPanel() {
  document.getElementById('diplo-pop').style.display = 'block';
  document.getElementById('adv-pop').style.display = 'none';
  document.getElementById('actions-panel').style.display = 'none';
  document.getElementById('relations-panel').style.display = 'none';
  renderCountryList();
}

function renderCountryList() {
  if (selectedCountry) return;
  const list = document.getElementById('diplo-countries');
  const availableCountries = (typeof ALL_COUNTRIES !== 'undefined')
    ? ALL_COUNTRIES.filter(c => c !== playerCountry)
    : ['Франция', 'Испания', 'Великобритания', 'Россия', 'Австрия', 'Пруссия'].filter(c => c !== playerCountry);
  list.innerHTML = availableCountries.map(c => {
    const rel = (typeof worldState !== 'undefined') ? (worldState.relations[c] || 0) : 0;
    const color = rel > 30 ? '#7cc47f' : rel < -30 ? '#e08072' : '#d9b45c';
    const war = (typeof worldState !== 'undefined') && worldState.atWarWith.includes(c) ? ' ⚔️' : '';
    return `<button class="country-btn" onclick="selectCountry('${c}')">
      ${c}${war} <span style="color:${color};font-size:11px;margin-left:4px">${rel > 0 ? '+' : ''}${rel}</span>
    </button>`;
  }).join('');
  document.getElementById('diplo-chat').style.display = 'none';
  list.style.display = 'block';
}

function selectCountry(name) {
  selectedCountry = name;
  document.getElementById('diplo-countries').style.display = 'none';
  document.getElementById('diplo-chat').style.display = 'block';
  document.getElementById('diplo-target').textContent = name;
  document.getElementById('diplo-messages').innerHTML = '';
  document.getElementById('diplo-pop').style.display = 'block';
}

function backToCountries() {
  selectedCountry = null;
  renderCountryList();
}

async function sendDiploMessage() {
  const input = document.getElementById('diplo-input');
  const msg = input.value.trim();
  if (!msg || !selectedCountry) return;
  input.value = '';

  appendDiploMsg('france', msg);
  appendDiploMsg('ai', '⏳ Ожидаем ответа...');

  const response = await sendDiplomacy(selectedCountry, msg);

  const msgs = document.querySelectorAll('.diplo-msg');
  msgs[msgs.length - 1].remove();
  appendDiploMsg('ai', response);

  // Обновить индикатор отношений в списке стран если он открыт
  const relPanel = document.getElementById('relations-panel');
  if (relPanel.style.display === 'block') updateRelationsPanel();
}

function appendDiploMsg(role, text) {
  const box = document.getElementById('diplo-messages');
  const div = document.createElement('div');
  div.className = 'diplo-msg ' + role;
  div.textContent = role === 'france' ? '🇫🇷 ' + text : '🌍 ' + text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function diploKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDiploMessage(); }
}

// ============================================================
// ПАНЕЛЬ ОТНОШЕНИЙ — открывается кликом на страну на карте
// ============================================================
function openCountryRelations(countryName) {
  const rel = (typeof worldState !== 'undefined') ? (worldState.relations[countryName] || 0) : 0;
  const isWar = (typeof worldState !== 'undefined') && worldState.atWarWith.includes(countryName);
  const isAlly = (typeof worldState !== 'undefined') && worldState.alliedWith.includes(countryName);

  // Страна — единый объект countries[] (game.js), меняется через setCountryLeader/changeCountryStat
  // и для игрока, и для ИИ-стран одинаково — здесь показываем её текущий срез целиком.
  const c = (typeof countries !== 'undefined') ? countries[countryName] : null;
  const age = c && typeof c.rulerAge === 'number' ? `, ${c.rulerAge} лет` : '';
  const leaderText = c ? `${c.ruler} (${c.rulerTitle}${age})` : '';

  document.getElementById('rel-country-name').textContent = (c && c.displayName) || countryName;
  document.getElementById('rel-leader').textContent = leaderText;

  const annexedEl = document.getElementById('rel-annexed');
  if (c && c.annexed) {
    annexedEl.textContent = `🏳️ Аннексирована: ${c.annexedBy}`;
    annexedEl.style.display = 'block';
  } else {
    annexedEl.style.display = 'none';
  }
  // Казну/армию/стабильность чужой страны игрок НЕ видит — только форму правления
  // (публичный факт). Остальное он узнаёт из новостей, слухов и дипломатии.
  document.getElementById('rel-government').textContent = c ? c.government : '—';

  // Официальные договоры с этой страной и её блок — публичные факты
  const tEl = document.getElementById('rel-treaties');
  if (tEl) {
    const rows = [];
    if (typeof findTreaty === 'function') {
      const al = findTreaty('alliance', playerCountry, countryName);
      const nap = findTreaty('nonaggression', playerCountry, countryName);
      if (al) rows.push(`🤝 Военный союз с вами (с ${al.since} г.)`);
      if (nap) rows.push(`📜 Пакт о ненападении (с ${nap.since} г.)`);
    }
    if (typeof allianceBlocOf === 'function') {
      const bloc = allianceBlocOf(countryName);
      if (bloc) rows.push('🛡 Блок: ' + bloc.join(' + '));
    }
    tEl.innerHTML = rows.length ? rows.map(r => `<div style="font-size:11px;color:#c9c3b2;padding:2px 0">${r}</div>`).join('') : '<div style="font-size:10px;color:#8b94aa">Договоров с вами нет</div>';
  }

  // Полоска отношений: от -100 до +100, центр = 50%
  const pct = (rel + 100) / 2;
  const bar = document.getElementById('rel-bar');
  bar.style.width = pct + '%';
  bar.style.background = rel > 30 ? '#7cc47f' : rel < -30 ? '#e08072' : '#d9b45c';

  document.getElementById('rel-value').textContent = (rel > 0 ? '+' : '') + rel;

  const statusEl = document.getElementById('rel-status');
  if (isWar) {
    statusEl.textContent = '⚔️ СОСТОЯНИЕ ВОЙНЫ';
    statusEl.style.color = '#e08072';
  } else if (isAlly) {
    statusEl.textContent = '🤝 Союзник';
    statusEl.style.color = '#7cc47f';
  } else if (rel > 60) {
    statusEl.textContent = '😊 Дружественные';
    statusEl.style.color = '#7cc47f';
  } else if (rel > 30) {
    statusEl.textContent = '🙂 Хорошие';
    statusEl.style.color = '#8fcf92';
  } else if (rel > -30) {
    statusEl.textContent = '😐 Нейтральные';
    statusEl.style.color = '#d9b45c';
  } else if (rel > -60) {
    statusEl.textContent = '😠 Напряжённые';
    statusEl.style.color = '#e0a060';
  } else {
    statusEl.textContent = '😡 Враждебные';
    statusEl.style.color = '#e08072';
  }

  // Кнопка "Открыть переговоры"
  document.getElementById('rel-diplo-btn').onclick = () => {
    closeRelationsPanel();
    selectCountry(countryName);
  };

  // Показать панель, скрыть остальное
  document.getElementById('relations-panel').style.display = 'block';
  document.getElementById('adv-pop').style.display = 'none';
  document.getElementById('diplo-pop').style.display = 'none';
  document.getElementById('actions-panel').style.display = 'none';
}

function closeRelationsPanel() {
  document.getElementById('relations-panel').style.display = 'none';
}

// Обновить панель отношений если она открыта (вызывается из ai.js после изменений)
function updateRelationsPanel() {
  const panel = document.getElementById('relations-panel');
  if (panel.style.display !== 'block') return;
  const name = document.getElementById('rel-country-name').textContent;
  if (name) openCountryRelations(name);
}

// ============================================================
// ИЗМЕНЕНИЯ ЗА ХОД — сводка после каждого хода (вызывается из ai.js)
// ============================================================
function renderTurnChanges(changes) {
  const box = document.getElementById('changes-box');
  const list = document.getElementById('changes-list');
  if (!changes || changes.length === 0) {
    list.innerHTML = '<div class="chg-empty">Заметных изменений не произошло</div>';
  } else {
    list.innerHTML = changes.map(c => {
      const cls = c.sign > 0 ? 'pos' : c.sign < 0 ? 'neg' : 'neutral';
      return `<div class="chg-item"><span class="chg-label">${c.label}</span><span class="chg-val ${cls}">${c.value}</span></div>`;
    }).join('');
  }
  box.style.display = 'block';
}

// ============================================================
// ГЛАВНОЕ МЕНЮ / ПАУЗА / СОХРАНЕНИЯ
// ============================================================
function initMenu() {
  document.getElementById('continue-btn').style.display = hasSave() ? 'block' : 'none';
}

function startGame() {
  gameStarted = true;
  document.body.classList.remove('menu-mode');
  document.getElementById('main-menu').style.display = 'none';
}

// Клик по стране на карте главного меню — сразу новая игра за эту страну
function newGame(country) {
  currentSlotId = 'slot_' + Date.now();
  resetGame(country);
  saveGame();
  startGame();
  showNotif('🏳️ Новая игра началась: ' + playerCountry);
}

// "Продолжить" в главном меню — грузит последнюю по времени партию
async function continueGame() {
  const saves = listSaves();
  if (!saves.length) return;
  await loadGameSlot(saves[0].id); // сначала сценарий партии, потом её состояние
  startGame();
  showNotif('▶ Игра продолжена');
}

// ---- Экран "Загрузить игру" ----
function openLoadMenu() {
  renderSaveList();
  document.getElementById('load-menu').style.display = 'flex';
}

function closeLoadMenu() {
  document.getElementById('load-menu').style.display = 'none';
}

function renderSaveList() {
  const list = document.getElementById('save-list');
  const saves = listSaves();
  if (saves.length === 0) {
    list.innerHTML = '<div class="chg-empty">Нет сохранённых партий</div>';
    return;
  }
  list.innerHTML = saves.map(s => {
    const date = months[s.month] + ' ' + s.year + ' г.';
    return `<div class="save-item">
      <div class="save-info">
        <div class="save-title">🏳️ ${s.country} — ${s.ruler || ''}</div>
        <div class="save-sub">${s.scenarioName || ''} · Ход ${s.turn} · ${date} · ${(s.treasury || 0).toLocaleString('ru')} фр.</div>
      </div>
      <div class="save-actions">
        <button class="save-play-btn" onclick="loadSaveAndPlay('${s.id}')">▶</button>
        <button class="save-del-btn" onclick="deleteSaveAndRefresh('${s.id}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}

async function loadSaveAndPlay(id) {
  await loadGameSlot(id);
  closeLoadMenu();
  startGame();
  showNotif('▶ Игра загружена');
}

function deleteSaveAndRefresh(id) {
  if (!confirm('Удалить это сохранение?')) return;
  deleteSave(id);
  renderSaveList();
  initMenu();
}

// ---- Меню паузы (внутри игры) ----
function openPauseMenu() {
  stopAutoPlay(true);
  document.getElementById('pause-menu').style.display = 'flex';
}

function closePauseMenu() {
  document.getElementById('pause-menu').style.display = 'none';
}

// Ручное сохранение из меню паузы. Сначала закрываем меню (оно перекрывает уведомления
// по z-index), затем сохраняем с уведомлением об успехе/ошибке.
function pauseSaveGame() {
  closePauseMenu();
  saveGame({ announce: true });
}

function pauseRestart() {
  if (!confirm('Начать заново? Текущий прогресс этой партии будет потерян.')) return;
  resetGame(playerCountry);
  saveGame();
  closePauseMenu();
  showNotif('🔄 Игра начата заново');
}

function pauseExitToMenu() {
  saveGame();
  gameStarted = false;
  closePauseMenu();
  closeSettings();
  document.getElementById('adv-pop').style.display = 'none';
  document.getElementById('diplo-pop').style.display = 'none';
  document.getElementById('actions-panel').style.display = 'none';
  document.getElementById('relations-panel').style.display = 'none';
  document.getElementById('events-box').style.display = 'none';
  document.getElementById('changes-box').style.display = 'none';
  document.body.classList.add('menu-mode');
  document.getElementById('main-menu').style.display = 'flex';
  initMenu();
}

// ============================================================
// НАСТРОЙКИ ОТОБРАЖЕНИЯ (внутриигровое меню → ⚙ Настройки)
// ============================================================
function openSettings() {
  document.getElementById('settings-panel').style.display = 'flex';
  document.getElementById('setting-show-countries').checked = showCountryLabels;
  document.getElementById('setting-label-scale').value = countryLabelScale;
  document.getElementById('setting-label-scale-val').textContent = countryLabelScale.toFixed(1) + '×';
  document.getElementById('setting-obj-scale').value = objectScale;
  document.getElementById('setting-obj-scale-val').textContent = objectScale.toFixed(1) + '×';
  const ap = document.getElementById('setting-auto-portraits');
  if (ap && typeof autoPortraitsEnabled === 'function') ap.checked = autoPortraitsEnabled();
}

function closeSettings() {
  document.getElementById('settings-panel').style.display = 'none';
}

function onToggleShowCountries(checked) {
  setShowCountryLabels(checked);
}

function onChangeLabelScale(val) {
  const v = parseFloat(val);
  document.getElementById('setting-label-scale-val').textContent = v.toFixed(1) + '×';
  setCountryLabelScale(v);
}

function onChangeObjectScale(val) {
  const v = parseFloat(val);
  document.getElementById('setting-obj-scale-val').textContent = v.toFixed(1) + '×';
  setObjectScale(v);
}

function onToggleAutoPortraits(checked) {
  localStorage.setItem('gs1852_auto_portraits', checked ? '1' : '0');
  if (checked && typeof maybeAutoPortrait === 'function' && gameStarted) maybeAutoPortrait(playerCountry);
}

// ============================================================
// ПАРЛАМЕНТ — динамическая панель (фракции и поддержка из объекта страны, не из хардкода)
// ============================================================
function renderParliamentPanel() {
  const box = document.getElementById('parliament-box');
  if (!box || typeof countries === 'undefined' || !countries[playerCountry]) return;
  const c = countries[playerCountry];
  const parl = c.parliament;
  if (!parl || !parl.factions || !parl.factions.length) {
    box.innerHTML = `<div class="chg-empty" style="padding:4px 0">${c.parliamentSuspended ? 'Парламент РАСПУЩЕН указом правителя' : 'Представительный орган в стране отсутствует'}</div>
      <div style="font-size:10px;color:#8b94aa;line-height:1.5">Его можно созвать решением правителя (действие «созвать парламент»).</div>`;
    return;
  }
  const supColor = parl.support >= 60 ? '#7cc47f' : parl.support >= 40 ? '#d9b45c' : '#e08072';
  const powColor = (parl.power ?? 50) >= 60 ? '#7ba7e0' : '#8b94aa';
  box.innerHTML =
    `<div class="irow"><span class="k">Орган</span><span>${parl.name || 'Парламент'}</span></div>
     <div class="irow"><span class="k">Поддержка правительства</span><span style="color:${supColor};font-weight:bold">${parl.support}%</span></div>` +
    parl.factions.map(f => `<div class="irow"><span class="k">${f.name}</span><span>${f.pct}%</span></div>`).join('') +
    ((parl.banned || []).length ? `<div class="irow"><span class="k">🚫 Запрещены</span><span>${parl.banned.join(', ')}</span></div>` : '') +
    `<div class="irow"><span class="k">🗳 Следующие выборы</span><span>${parl.nextElection || '—'} г. (раз в ${parl.termYears || '?'} л.)</span></div>
     <div class="irow"><span class="k">Власть парламента</span><span style="color:${powColor};font-weight:bold">${parl.power ?? 50}%</span></div>
     <div style="font-size:10px;color:#8b94aa;margin-top:6px;line-height:1.5">Власть ≥50% и поддержка <40% — парламент может наложить ВЕТО на ваши законы. Поддержка <35% ест стабильность. Роспуск, перенос выборов и запрет партий — через действия правителя.</div>`;
}

// ============================================================
// ЦЕРКОВЬ — институт: влияние, статус; может быть упразднена правителем
// ============================================================
function renderChurchPanel() {
  const box = document.getElementById('church-box');
  if (!box || typeof countries === 'undefined' || !countries[playerCountry]) return;
  const ch = countries[playerCountry].church;
  if (!ch || !ch.exists) {
    box.innerHTML = `<div class="chg-empty" style="padding:4px 0">Церковь лишена государственной власти</div>
      <div style="font-size:10px;color:#8b94aa;line-height:1.5">Секуляризация: духовенство не влияет на政ику. Восстановить можно действием правителя (это вернёт лояльность верующих).</div>`.replace('政ику','политику');
    return;
  }
  const infColor = ch.influence >= 65 ? '#d9a95c' : '#8b94aa';
  box.innerHTML =
    `<div class="irow"><span class="k">Институт</span><span>${ch.name}</span></div>
     <div class="irow"><span class="k">Влияние на государство</span><span style="color:${infColor};font-weight:bold">${ch.influence}%</span></div>
     <div style="font-size:10px;color:#8b94aa;margin-top:6px;line-height:1.5">Влиятельная церковь (>50%) стоит казне 2% дохода, но поддерживает народ. Правитель может лишить её власти (секуляризация/атеизм) — ценой стабильности и гнева верующих.</div>`;
}

// ============================================================
// ВКЛАДКА «ЭКОНОМИКА» — постатейный бюджет, сословия, долг + чат с ИИ-экономистом.
// Открывается кликом по казне/доходу в верхней панели.
// ============================================================
function openEconomyPanel() {
  if (typeof stopAutoPlay === 'function') stopAutoPlay(true);
  document.getElementById('economy-panel').style.display = 'block';
  renderEconomyPanel();
}
function closeEconomyPanel() {
  document.getElementById('economy-panel').style.display = 'none';
}

function renderEconomyPanel() {
  const box = document.getElementById('economy-body');
  if (!box || typeof countries === 'undefined') return;
  const c = countries[playerCountry];
  if (!c) return;
  if (!c.lastBudget || !c.lastBudget.lines) {
    box.innerHTML = '<div class="chg-empty">Сделайте первый ход — бюджет появится после первого месяца.</div>';
    return;
  }
  const b = c.lastBudget;
  const fmt = v => v.toLocaleString('ru');
  const row = (name, val, sign) => `<div class="irow"><span class="k">${name}</span><span style="color:${sign > 0 ? '#7cc47f' : sign < 0 ? '#e08072' : '#c9c3b2'};font-weight:bold">${sign > 0 ? '+' : sign < 0 ? '−' : ''}${fmt(Math.abs(val))} фр.</span></div>`;
  const classes = c.economy ? Object.entries(c.economy.classes).map(([key, k]) => {
    const loyColor = k.loyalty >= 55 ? '#7cc47f' : k.loyalty >= 35 ? '#d9b45c' : '#e08072';
    return `<div style="border:1px solid #223050;border-radius:4px;padding:6px 8px;margin-bottom:6px">
      <div style="font-size:12px;font-weight:bold;color:#e4decd">${k.label} <span style="color:#8b94aa;font-weight:normal">(${k.share}% населения)</span></div>
      <div class="irow"><span class="k">Богатство</span><span>${fmt(k.wealth)}</span></div>
      <div class="irow"><span class="k">Налог</span><span>${k.tax}% → +${fmt(Math.round(k.wealth * k.tax / 100))} фр./мес</span></div>
      <div class="irow"><span class="k">Лояльность</span><span style="color:${loyColor};font-weight:bold">${k.loyalty}</span></div>
    </div>`;
  }).join('') : '';
  box.innerHTML =
    `<div class="phdr">Доходы (${fmt(b.gross)} фр./мес)</div>` +
    b.lines.income.map(l => row(l.name, l.value, 1)).join('') +
    `<div class="phdr" style="margin-top:10px">Расходы</div>` +
    b.lines.expense.map(l => row(l.name, l.value, -1)).join('') +
    `<div style="margin-top:8px;border-top:2px solid #c9a959;padding-top:6px">` + row('ИТОГ МЕСЯЦА', b.net, b.net >= 0 ? 1 : -1) + `</div>` +
    (b.borrowed ? `<div style="font-size:11px;color:#e08072;margin-top:4px">🏦 Дефицит покрыт займом ${fmt(b.borrowed)} фр. — ${b.borrowedFrom}</div>` : '') +
    `<div class="phdr" style="margin-top:12px">Государственный долг</div>
     <div class="irow"><span class="k">Внутренний (буржуазия)</span><span>${fmt(c.debtDomestic || 0)} фр.</span></div>
     <div class="irow"><span class="k">Внешний (иностранные банки)</span><span>${fmt(c.debtForeign || 0)} фр.</span></div>
     <div class="irow"><span class="k">Проценты</span><span>0.5% в месяц</span></div>
     <div class="irow"><span class="k">Инфляция</span><span>${c.inflation}%</span></div>
     <div class="phdr" style="margin-top:12px">Сословия</div>` + classes +
    `<div style="font-size:10px;color:#8b94aa;line-height:1.5;margin-top:4px">Налоги меняются действиями («поднять налог на народ до 25%») или советом экономиста. Ставка >25% душит богатство и лояльность; буржуазия при низких налогах богатеет и тянет доход вверх.</div>`;
}

async function sendEconomistMessage() {
  const input = document.getElementById('econ-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  appendEconMsg('player', msg);
  appendEconMsg('economist', '⏳ Экономист считает...');
  const response = await askEconomist(msg);
  const msgs = document.querySelectorAll('#econ-messages .adv-msg');
  msgs[msgs.length - 1].remove();
  appendEconMsg('economist', response);
}
function appendEconMsg(role, text) {
  const box = document.getElementById('econ-messages');
  const div = document.createElement('div');
  div.className = 'adv-msg ' + (role === 'player' ? 'player' : 'advisor');
  div.textContent = (role === 'player' ? '👤 ' : '💼 ') + text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}
function economistKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendEconomistMessage(); }
}

// ============================================================
// ЭКРАН «ОБЩЕСТВО» — большой отдельный экран с двумя вкладками: Социум (демография,
// расходы) и Законы (принятые/отменённые), плюс чат с министром внутренних дел.
// ============================================================
let societyTab = 'social';

function openSocietyScreen() {
  if (typeof stopAutoPlay === 'function') stopAutoPlay(true);
  document.getElementById('society-screen').style.display = 'flex';
  const nameEl = document.getElementById('society-country-name');
  if (nameEl && typeof playerCountryDisplayName !== 'undefined') nameEl.textContent = playerCountryDisplayName;
  renderSocietyScreen();
}
function closeSocietyScreen() {
  document.getElementById('society-screen').style.display = 'none';
}
function setSocietyTab(tab) {
  societyTab = tab;
  ['social', 'laws'].forEach(t => {
    const b = document.getElementById('society-tab-' + t);
    if (b) b.classList.toggle('active', t === tab);
  });
  renderSocietyScreen();
}

function renderSocietyScreen() {
  const box = document.getElementById('society-body');
  if (!box || typeof countries === 'undefined' || !countries[playerCountry]) return;
  const c = countries[playerCountry];
  const fmt = v => v.toLocaleString('ru');

  if (societyTab === 'laws') {
    const laws = (c.laws || []);
    const active = laws.filter(l => !l.repealed);
    const repealed = laws.filter(l => l.repealed);
    box.innerHTML =
      `<div class="phdr">Действующие законы (${active.length})</div>` +
      (active.length ? active.map(l => `<div style="border:1px solid #223050;border-radius:4px;padding:8px 10px;margin-bottom:7px;background:#121e38">
          <div style="font-size:13px;font-weight:bold;color:#e4decd">📖 ${l.name} <span style="color:#8b94aa;font-weight:normal;font-size:10px">(${l.year} г.)</span></div>
          ${l.description ? `<div style="font-size:11px;color:#a6aec4;margin-top:3px;line-height:1.5">${l.description}</div>` : ''}
        </div>`).join('') : '<div class="chg-empty">Особых законов пока не принято. Принимайте законы через действия: «принять закон о всеобщем образовании».</div>') +
      (repealed.length ? `<div class="phdr" style="margin-top:12px">Отменённые</div>` +
        repealed.map(l => `<div style="font-size:11px;color:#8b94aa;padding:3px 0;text-decoration:line-through">📖 ${l.name} (${l.year}—${l.repealedYear})</div>`).join('') : '');
    return;
  }

  const so = c.society;
  if (!so) { box.innerHTML = '<div class="chg-empty">Сделайте первый ход — данные о社ме появятся.</div>'.replace('社ме','обществе'); return; }
  const bar = (val, color) => `<div style="background:#0c1526;border-radius:3px;height:8px;overflow:hidden;margin-top:3px"><div style="width:${val}%;height:100%;background:${color}"></div></div>`;
  const metric = (icon, name, val, suffix, color, hint) => `<div style="border:1px solid #223050;border-radius:4px;padding:8px 10px;background:#121e38">
    <div style="display:flex;justify-content:space-between;font-size:12px"><span>${icon} ${name}</span><b>${val}${suffix}</b></div>
    ${bar(val, color)}
    <div style="font-size:9px;color:#8b94aa;margin-top:3px">${hint}</div>
  </div>`;
  const wealthPerCapita = c.economy ? Math.round(Object.values(c.economy.classes).reduce((s, k) => s + k.wealth, 0) / 10) : 0;
  box.innerHTML =
    `<div class="phdr">Демография и общество</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">` +
    metric('🎓', 'Грамотность', so.literacy, '%', '#7ba7e0', 'Растёт от расходов на образование; >60% ускоряет буржуазию') +
    metric('🥀', 'Бедность', so.poverty, '%', '#e08072', 'Снижается призрением; >70% злит народ') +
    metric('👩', 'Права женщин', so.womensRights, '/100', '#7a4a8a', 'Меняются законами') +
    metric('🕊', 'Свобода веры', so.religiousFreedom, '/100', '#3a7a3a', 'Меняются законами; злит/радует церковь') +
    metric('🏙', 'Урбанизация', so.urbanization, '%', '#d9b45c', 'Растёт при стабильности и низких налогах на буржуазию') +
    metric('💰', 'Достаток на душу', Math.min(100, wealthPerCapita), ' у.е.', '#1a7a5a', 'Суммарное богатство сословий') +
    `</div>
    <div class="phdr" style="margin-top:12px">Социальные расходы (строки бюджета)</div>
    <div class="irow"><span class="k">🎓 Образование</span><span>${fmt(so.spending.education)} фр./мес</span></div>
    <div class="irow"><span class="k">🍞 Призрение бедных</span><span>${fmt(so.spending.welfare)} фр./мес</span></div>
    <div style="font-size:10px;color:#8b94aa;line-height:1.5;margin-top:6px">Меняются действиями: «удвоить расходы на образование», «выделить 40 франков в месяц на призрение». Расходы >5% дохода дают заметный эффект (~2.4% в год).</div>`;
}

async function sendSocietyMessage() {
  const input = document.getElementById('society-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  appendSocietyMsg('player', msg);
  appendSocietyMsg('minister', '⏳ Министр сверяется с отчётами...');
  const response = await askSocietyAdvisor(msg);
  const msgs = document.querySelectorAll('#society-messages .adv-msg');
  msgs[msgs.length - 1].remove();
  appendSocietyMsg('minister', response);
}
function appendSocietyMsg(role, text) {
  const box = document.getElementById('society-messages');
  const div = document.createElement('div');
  div.className = 'adv-msg ' + (role === 'player' ? 'player' : 'advisor');
  div.textContent = (role === 'player' ? '👤 ' : '🏛 ') + text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}
function societyKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSocietyMessage(); }
}

// ============================================================
// ВЫБОР ТЕКСТОВОЙ МОДЕЛИ ИИ (главное меню) — список OpenRouter + свой слаг
// ============================================================
function openModelMenu() {
  const sel = document.getElementById('model-select');
  const current = localStorage.getItem('gs1852_text_model') || 'google/gemini-3.1-flash-lite';
  if (sel) {
    const known = [...sel.options].some(o => o.value === current);
    if (known) { sel.value = current; document.getElementById('model-custom').value = ''; }
    else { sel.value = '__custom__'; document.getElementById('model-custom').value = current; }
  }
  document.getElementById('model-menu').style.display = 'flex';
}
function closeModelMenu() {
  document.getElementById('model-menu').style.display = 'none';
}
function applyModelChoice() {
  const sel = document.getElementById('model-select');
  const custom = document.getElementById('model-custom').value.trim();
  const chosen = sel.value === '__custom__' ? custom : sel.value;
  if (!chosen) { showNotif('⚠️ Укажите модель'); return; }
  if (typeof setTextModel === 'function') setTextModel(chosen);
  closeModelMenu();
}

// ============================================================
// ЛЕТОПИСЬ МИРА — главы истории, которые ИИ пишет каждые 10 ходов (и по кнопке)
// ============================================================
function openHistoryPanel() {
  if (typeof stopAutoPlay === 'function') stopAutoPlay(true);
  document.getElementById('history-panel').style.display = 'block';
  renderHistoryPanel();
}
function closeHistoryPanel() {
  document.getElementById('history-panel').style.display = 'none';
}
function renderHistoryPanel() {
  const box = document.getElementById('history-body');
  if (!box) return;
  const chapters = (typeof worldState !== 'undefined' && worldState.historySummary) || [];
  box.innerHTML = chapters.length
    ? chapters.map((ch, i) => `<div style="margin-bottom:12px">
        <div style="font-size:13px;font-weight:bold;color:#e4decd">Глава ${i + 1}. ${ch.title} <span style="color:#8b94aa;font-weight:normal;font-size:10px">(${ch.year} г.)</span></div>
        <div style="font-size:12px;color:#b9bfcf;line-height:1.7;margin-top:3px">${ch.text}</div>
      </div>`).join('')
    : '<div class="chg-empty">Летопись пока пуста — главы пишутся автоматически каждые 10 ходов, либо нажмите «Дописать главу».</div>';
}
async function writeHistoryChapterNow() {
  const btn = document.getElementById('history-write-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Летописец пишет...'; }
  await summarizeWorldHistory(true);
  if (btn) { btn.disabled = false; btn.textContent = '✍ Дописать главу сейчас'; }
  renderHistoryPanel();
}

// ============================================================
// ПОРТРЕТ ПРАВИТЕЛЯ — сгенерированный ИИ или эмодзи-заглушка
// ============================================================
function renderRulerPortrait() {
  if (typeof countries === 'undefined' || !countries[playerCountry]) return;
  const c = countries[playerCountry];
  const pair = [
    ['ruler-portrait', 'ruler-portrait-emoji', c.portrait],
    ['pm-portrait', 'pm-portrait-emoji', c.pmPortrait]
  ];
  pair.forEach(([imgId, emojiId, url]) => {
    const img = document.getElementById(imgId);
    const emoji = document.getElementById(emojiId);
    if (!img || !emoji) return;
    if (url) {
      img.src = url;
      img.style.display = 'block';
      emoji.style.display = 'none';
    } else {
      img.style.display = 'none';
      emoji.style.display = 'flex';
    }
  });
}

function setPortraitLoading(loading, role) {
  const rb = document.getElementById('portrait-gen-btn');
  const pb = document.getElementById('pm-portrait-gen-btn');
  // Пока рисуется один портрет — обе кнопки заблокированы (модель одна)
  if (rb) { rb.disabled = loading; rb.textContent = loading && role === 'ruler' ? '⏳ ИИ рисует портрет...' : '🎨 Сгенерировать портрет (ИИ)'; }
  if (pb) { pb.disabled = loading; pb.textContent = loading && role === 'pm' ? '⏳ ИИ рисует портрет...' : '🎨 Портрет премьера (ИИ)'; }
}

function onGeneratePortraitClick() {
  if (typeof generatePersonPortrait !== 'function') return;
  countries[playerCountry].portrait = null;
  generatePersonPortrait(playerCountry, 'ruler');
}

function onGeneratePmPortraitClick() {
  if (typeof generatePersonPortrait !== 'function') return;
  countries[playerCountry].pmPortrait = null;
  generatePersonPortrait(playerCountry, 'pm');
}

// ============================================================
// РЕЛИГИЯ — панель: главная религия текстом, второстепенные цифрами
// ============================================================
function renderReligionPanel() {
  const box = document.getElementById('religion-box');
  if (!box || typeof countries === 'undefined' || !countries[playerCountry]) return;
  const c = countries[playerCountry];
  if (!c.religion || !c.religion.dist || !Object.keys(c.religion.dist).length) {
    box.innerHTML = '<div class="chg-empty" style="padding:4px 0">Сведения о вероисповедании собираются...</div>';
    return;
  }
  const entries = Object.entries(c.religion.dist).sort((a, b) => b[1] - a[1]);
  box.innerHTML =
    `<div class="irow"><span class="k">Главная религия</span><span style="font-weight:bold">${c.religion.main}</span></div>` +
    entries.filter(([k]) => k !== c.religion.main).map(([k, v]) => `<div class="irow"><span class="k">${k}</span><span>${v}%</span></div>`).join('') +
    (c.rulerReligion ? `<div class="irow"><span class="k">Вера правителя</span><span>${c.rulerReligion}</span></div>` : '');
}

// ============================================================
// ПРОПУСК ВРЕМЕНИ — выпадающий выбор шага (неделя → 5 лет) и авторежим:
// игра сама делает ходы выбранным шагом, пока игрок не остановит её
// (повторное нажатие ⏩, открытие панелей или breaking news).
// ============================================================
function getSelectedSkip() {
  const sel = document.getElementById('skip-select');
  return sel ? sel.value : 'm1';
}

function onSkipChange() {
  localStorage.setItem('gs1852_skip', getSelectedSkip());
}

function initSkipSelect() {
  const sel = document.getElementById('skip-select');
  if (!sel) return;
  const saved = localStorage.getItem('gs1852_skip');
  if (saved && sel.querySelector(`option[value="${saved}"]`)) sel.value = saved;
}

let autoPlay = false;
function toggleAutoPlay() {
  autoPlay = !autoPlay;
  const btn = document.getElementById('auto-btn');
  if (btn) { btn.textContent = autoPlay ? '⏸ Стоп' : '⏩ Авто'; btn.classList.toggle('active-auto', autoPlay); }
  if (autoPlay) { showNotif('⏩ Автопропуск включён — шаг: ' + document.getElementById('skip-select').selectedOptions[0].text); nextTurn(); }
}

function stopAutoPlay(silent) {
  if (!autoPlay) return;
  autoPlay = false;
  const btn = document.getElementById('auto-btn');
  if (btn) { btn.textContent = '⏩ Авто'; btn.classList.remove('active-auto'); }
  if (!silent) showNotif('⏸ Автопропуск остановлен');
}

// Вызывается движком после каждого завершённого хода
function onTurnFinished() {
  if (!autoPlay) return;
  setTimeout(() => { if (autoPlay && gameStarted) nextTurn(); }, 1200);
}

// ============================================================
// BREAKING NEWS — большой экран для катастрофических/эпохальных событий
// ============================================================
function showBreakingNews(title, text) {
  const box = document.getElementById('breaking-news');
  if (!box) return;
  stopAutoPlay(true); // огромное событие — остановить автопропуск, игрок должен увидеть
  document.getElementById('breaking-title').textContent = title || 'СРОЧНАЯ НОВОСТЬ';
  document.getElementById('breaking-text').textContent = text || '';
  document.getElementById('breaking-date').textContent = document.getElementById('date-disp').textContent;
  box.style.display = 'flex';
}

function closeBreakingNews() {
  document.getElementById('breaking-news').style.display = 'none';
}

// ============================================================
// ВЫБОР СЦЕНАРИЯ в главном меню (встроенный + созданные в редакторе)
// ============================================================
function openScenarioMenu() {
  const list = document.getElementById('scenario-menu-list');
  const saved = (typeof getScenariosIndex === 'function') ? getScenariosIndex() : [];
  const items = [
    { ref: 'builtin-world', name: 'Мир 1852 (основной, ~48 стран)', year: 1852, countries: 48 },
    { ref: 'builtin', name: 'Европа 1852 (компактный)', year: 1852, countries: 6 }
  ].concat(saved.map(s => ({ ref: s.id, name: s.name, year: s.year, countries: s.countryCount })));
  list.innerHTML = items.map(s => {
    const active = (typeof activeScenarioRef !== 'undefined' && activeScenarioRef === s.ref) ? ' ✅' : '';
    return `<div class="save-item" style="cursor:pointer" onclick="chooseScenario('${s.ref}')">
      <div class="save-info">
        <div class="save-title">🎲 ${s.name}${active}</div>
        <div class="save-sub">${s.year} г.${s.countries ? ' · стран: ' + s.countries : ''}</div>
      </div>
    </div>`;
  }).join('');
  document.getElementById('scenario-menu').style.display = 'flex';
}

function closeScenarioMenu() {
  document.getElementById('scenario-menu').style.display = 'none';
}

function chooseScenario(ref) {
  if (typeof switchActiveScenario !== 'function') return;
  switchActiveScenario(ref).then(data => {
    closeScenarioMenu();
    showNotif('🎲 Сценарий: ' + data.name + ' (' + data.year + ' г.). Кликните страну на карте.');
  }).catch(() => showNotif('⚠️ Не удалось загрузить сценарий'));
}
