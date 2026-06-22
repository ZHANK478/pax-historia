# app.py — только интерфейс Streamlit
import streamlit as st
import google.generativeai as genai

from state    import init_state, add_log, get_country, get_current_leader, next_leader
from laws     import LAWS, apply_law, clamp
from events   import random_event
from mechanics import parliament_support, end_of_turn
from parliament import add_player_party, remove_player_party, votes_for_law, apply_law_mood_effects
from countries  import COUNTRIES

# ═══════════════════════════════════════════
# ЭКРАН ВЫБОРА СТРАНЫ
# ═══════════════════════════════════════════
if "game_started" not in st.session_state:
    st.session_state.game_started = False

if not st.session_state.game_started:
    st.title("🌍 GenHistoria V3")
    st.subheader("Выберите страну")

    country_options = {
        f"{data['flag']} {data['name']}": cid
        for cid, data in COUNTRIES.items()
    }
    chosen_label = st.selectbox("Страна:", list(country_options.keys()))
    chosen_id    = country_options[chosen_label]

    country_data = COUNTRIES[chosen_id]
    st.info(country_data["description"])
    st.write("**Условия победы:**")
    for vc in country_data["victory_conditions"]:
        st.write(f"• {vc}")

    if st.button("▶ Начать игру"):
        st.session_state.state        = init_state(chosen_id)
        st.session_state.game_started = True
        st.session_state.defeat_reason = None
        st.rerun()
    st.stop()

# ═══════════════════════════════════════════
# API
# ═══════════════════════════════════════════
API_KEY = st.secrets["API_KEY"]
genai.configure(api_key=API_KEY)
model   = genai.GenerativeModel("gemini-2.5-flash")

S            = st.session_state.state
country_data = get_country(S)
leader       = get_current_leader(S)

def run_end_of_turn():
    return end_of_turn(S, random_event, country_data)

# ═══════════════════════════════════════════
# ЭКРАН ПОРАЖЕНИЯ
# ═══════════════════════════════════════════
if st.session_state.get("defeat_reason"):
    st.error("💀 ПОРАЖЕНИЕ")
    st.subheader(st.session_state.defeat_reason)
    st.write(f"Ты продержался **{S['turn']} ходов** ({S['year']} год).")
    if st.button("Начать заново"):
        st.session_state.state         = init_state(S["country_id"])
        st.session_state.defeat_reason = None
        st.rerun()
    st.stop()

# ═══════════════════════════════════════════
# SIDEBAR — навигация
# ═══════════════════════════════════════════
if "view_mode" not in st.session_state:
    st.session_state.view_mode = "game"

with st.sidebar:
    st.write(f"{country_data['flag']} **{country_data['name']}**")
    st.write(f"👤 {leader['name']}")
    st.write(f"📅 {S['year']} год, ход {S['turn']}")
    st.divider()
    if st.button("🎮 Игра"):
        st.session_state.view_mode = "game"
    if st.button("🏛️ Государство"):
        st.session_state.view_mode = "country"
    if st.button("🏦 Парламент"):
        st.session_state.view_mode = "parliament"

# ═══════════════════════════════════════════
# ВИД: ГОСУДАРСТВО
# ═══════════════════════════════════════════
if st.session_state.view_mode == "country":
    st.title("🏛️ Государство")

    monarch = country_data["monarch"]
    st.subheader("👑 Монарх")
    st.write(f"**{monarch['name']}** — {monarch['title']}")

    st.subheader("🎩 Глава правительства")
    st.write(f"**{leader['name']}** — {leader['title']}")
    st.write(f"Партия: {leader['party']}")
    if leader.get("note"):
        st.caption(leader["note"])

    st.subheader("📋 Условия победы")
    for vc in country_data["victory_conditions"]:
        st.write(f"• {vc}")

    st.divider()
    st.caption("Нажми 🎮 Игра в боковом меню чтобы вернуться.")
    st.stop()

# ═══════════════════════════════════════════
# ВИД: ПАРЛАМЕНТ
# ═══════════════════════════════════════════
if st.session_state.view_mode == "parliament":
    st.title("🏛️ Парламент")

    total = sum(p["seats"] for p in S["parliament"].values())
    support_pct = int(parliament_support(S["parliament"]) * 100)
    st.caption(f"Всего мест: **{total}** | Поддержка правительства: **{support_pct}%** (нужно > 25%)")
    st.progress(parliament_support(S["parliament"]))
    st.divider()

    # Таблица партий
    for pid, party in S["parliament"].items():
        cols = st.columns([3, 1, 3, 1])
        name = f"{'⭐ ' if party['is_player'] else ''}{party['name']}"
        cols[0].write(f"**{name}**")
        cols[0].caption(party["ideology"])
        cols[1].metric("Мест", party["seats"])
        cols[2].progress(party["mood"] / 100)
        if party["mood"] >= 50:
            cols[3].success(f"За ({party['mood']})")
        else:
            cols[3].error(f"Прот ({party['mood']})")

    st.divider()

    # Создать свою партию
    st.subheader("➕ Создать свою партию")
    if "player_party" in S["parliament"]:
        pp = S["parliament"]["player_party"]
        st.info(f"Твоя партия: **{pp['name']}** — {pp['seats']} мест, настроение {pp['mood']}")
        if st.button("Распустить партию"):
            ok, msg = remove_player_party(S["parliament"])
            st.success(msg) if ok else st.error(msg)
            st.rerun()
    else:
        total_seats_country = country_data["total_parliament_seats"]
        pname    = st.text_input("Название партии:")
        pseats   = st.slider(
            "Количество мест",
            min_value=1,
            max_value=int(total_seats_country * 0.4),
            value=10,
        )
        st.caption(f"Места будут пропорционально взяты у существующих партий. "
                   f"Максимум: {int(total_seats_country * 0.4)} (40% парламента).")
        if st.button("Создать партию"):
            if not pname.strip():
                st.error("Введи название партии.")
            else:
                ok, msg = add_player_party(S["parliament"], total_seats_country, pname.strip(), pseats)
                st.success(msg) if ok else st.error(msg)
                st.rerun()

    st.divider()
    st.caption("Нажми 🎮 Игра в боковом меню чтобы вернуться.")
    st.stop()

# ═══════════════════════════════════════════
# ВИД: ИГРА (основной)
# ═══════════════════════════════════════════
st.title(f"GenHistoria — {country_data['flag']} {country_data['name']}")
st.caption(f"👤 {leader['name']} | {leader['party']}")

# Метрики
m1, m2, m3, m4, m5 = st.columns(5)
m1.metric("📅 Год",    S["year"])
m2.metric("🔄 Ход",    S["turn"])
m3.metric("💰 Казна",  S["treasury"])
m4.metric("⚡ Капитал", S["capital"])
m5.metric("👥 Мнение", f"{S['opinion']}%")

# Предупреждения
if S["treasury"] < 20:
    st.warning(f"⚠️ Казна почти пуста ({S['treasury']}). Риск банкротства.")
if S["opinion"] < 25:
    st.warning(f"⚠️ Народ недоволен ({S['opinion']}%). Риск восстания.")
support_now = parliament_support(S["parliament"])
if support_now < 0.4:
    st.warning(f"⚠️ Парламент теряет доверие ({int(support_now*100)}%).")

# Мини-парламент (компактно)
st.subheader("🏛️ Парламент")
st.caption(f"Поддержка: {int(support_now*100)}% | Нажми '🏦 Парламент' слева для деталей")
st.progress(support_now)

pcols = st.columns(len(S["parliament"]))
for i, (pid, party) in enumerate(S["parliament"].items()):
    with pcols[i]:
        name = f"{'⭐' if party['is_player'] else ''}{party['name'][:12]}"
        st.caption(name)
        st.progress(party["mood"] / 100)
        if party["mood"] >= 50:
            st.success(f"За ({party['seats']})")
        else:
            st.error(f"Пр ({party['seats']})")

# Итог прошлого хода
if S.get("last_action_result"):
    st.subheader("📰 Что произошло")
    st.info(S["last_action_result"])
    S["last_action_result"] = None

# История
with st.expander("📜 История"):
    for entry in reversed(S["log"]):
        st.write(entry)

# ═══════════════════════════════════════════
# ДЕЙСТВИЯ
# ═══════════════════════════════════════════
st.subheader("🎮 Твой ход")
tab1, tab2, tab3 = st.tabs(["Законы", "Экономика", "Дипломатия"])

# ── ЗАКОНЫ ──────────────────────────────────
with tab1:
    law_options  = {f"{LAWS[k]['name']} ({LAWS[k]['cost']} казны)": k for k in LAWS}
    chosen_label = st.selectbox("Законопроект:", list(law_options.keys()), key="law_select")
    chosen_id    = law_options[chosen_label]
    chosen_law   = LAWS[chosen_id]

    with st.expander("Эффект на парламент"):
        for pid, party in S["parliament"].items():
            delta   = chosen_law["mood"].get(pid, 0)
            current = party["mood"]
            after   = clamp(current + delta)
            arrow   = "🟢" if delta > 0 else ("🔴" if delta < 0 else "⚪")
            st.write(f"{arrow} {party['name']}: {current} → {after}")
        sign = "+" if chosen_law["opinion"] >= 0 else ""
        st.write(f"Мнение народа: {sign}{chosen_law['opinion']}")

    if st.button("Внести законопроект"):
        law_name = chosen_law["name"]
        law_cost = chosen_law["cost"]
        tb = S["treasury"]

        if S["treasury"] < law_cost:
            st.error(f"Недостаточно средств. Нужно {law_cost}, в казне {S['treasury']}.")
        else:
            S["treasury"] -= law_cost
            # Голосование через parliament.py
            passed, vf, va, details = votes_for_law(S["parliament"], chosen_law["mood"])
            apply_law_mood_effects(S["parliament"], chosen_law["mood"])

            if passed:
                S["opinion"] = clamp(S["opinion"] + chosen_law["opinion"])

            status = "ПРИНЯТ ✅" if passed else "ОТКЛОНЁН ❌"
            event, election_changes, defeat = run_end_of_turn()
            ta = S["treasury"]

            lines = [
                f"Закон «{law_name}» — {status}",
                f"Голоса: {vf} за, {va} против.",
                f"Казна: {tb} → {ta} (закон −{law_cost}, доход +10, итого {ta-tb:+d})",
            ]
            if event:
                lines.append(f"⚡ Событие: {event['text']}")
                add_log(S, f"⚡ {event['text']}")
            if election_changes:
                lines.append("🗳️ Прошли выборы! Состав парламента изменился.")
                add_log(S, "🗳️ Выборы: состав парламента изменился.")

            add_log(S, f"Закон «{law_name}» {status} ({vf} за). Казна: {tb}→{ta}.")
            S["last_action_result"] = "\n\n".join(lines)

            if defeat:
                st.session_state.defeat_reason = defeat
            st.rerun()

# ── ЭКОНОМИКА ────────────────────────────────
with tab2:
    ecol1, ecol2, ecol3 = st.columns(3)

    if ecol1.button("💰 Собрать налоги\n\n+30 казны, −5 мнения"):
        tb = S["treasury"]
        S["treasury"] += 30
        S["opinion"]   = clamp(S["opinion"] - 5)
        event, elc, defeat = run_end_of_turn()
        ta  = S["treasury"]
        msg = f"Налоги: мнение −5.\nКазна: {tb} → {ta} (налоги +30, доход +10, итого {ta-tb:+d})"
        if event: msg += f"\n\n⚡ {event['text']}"; add_log(S, f"⚡ {event['text']}")
        if elc:   msg += "\n\n🗳️ Прошли выборы!";   add_log(S, "🗳️ Выборы.")
        add_log(S, f"Налоги. Казна: {tb}→{ta}.")
        S["last_action_result"] = msg
        if defeat: st.session_state.defeat_reason = defeat
        st.rerun()

    if ecol2.button("🏗️ Инвестировать\n\n−20 казны, +8 мнения"):
        if S["treasury"] < 20:
            st.error(f"Мало средств (нужно 20, есть {S['treasury']}).")
        else:
            tb = S["treasury"]
            S["treasury"] -= 20
            S["opinion"]   = clamp(S["opinion"] + 8)
            # Либералам +10 если есть в парламенте
            for pid, party in S["parliament"].items():
                if "либерал" in party["ideology"].lower():
                    party["mood"] = clamp(party["mood"] + 10)
                    break
            event, elc, defeat = run_end_of_turn()
            ta  = S["treasury"]
            msg = f"Инвестиции: мнение +8.\nКазна: {tb} → {ta} (−20, доход +10, итого {ta-tb:+d})"
            if event: msg += f"\n\n⚡ {event['text']}"; add_log(S, f"⚡ {event['text']}")
            if elc:   msg += "\n\n🗳️ Прошли выборы!";   add_log(S, "🗳️ Выборы.")
            add_log(S, f"Инвестиции. Казна: {tb}→{ta}.")
            S["last_action_result"] = msg
            if defeat: st.session_state.defeat_reason = defeat
            st.rerun()

    if ecol3.button("⏸️ Пропустить ход\n\n+15 казны, +5 капитала"):
        tb = S["treasury"]
        S["treasury"] += 15
        S["capital"]   = clamp(S["capital"] + 5)
        event, elc, defeat = run_end_of_turn()
        ta  = S["treasury"]
        msg = f"Ход пропущен: капитал +5.\nКазна: {tb} → {ta} (+15, доход +10, итого {ta-tb:+d})"
        if event: msg += f"\n\n⚡ {event['text']}"; add_log(S, f"⚡ {event['text']}")
        if elc:   msg += "\n\n🗳️ Прошли выборы!";   add_log(S, "🗳️ Выборы.")
        add_log(S, f"Ход пропущен. Казна: {tb}→{ta}.")
        S["last_action_result"] = msg
        if defeat: st.session_state.defeat_reason = defeat
        st.rerun()

# ── ДИПЛОМАТИЯ ───────────────────────────────
with tab3:
    st.caption("Бесплатно по казне. Используй редко — беречь лимит API.")
    action = st.text_input("Твоё дипломатическое действие:", key="diplo_input")

    if st.button("Сделать ход"):
        if not action.strip():
            st.warning("Напиши действие.")
        else:
            prompt = (
                f"Ты — Австрийская империя, 1850-е годы. "
                f"Отвечай от имени государства, 2-3 предложения. "
                f"Без чисел и игровых терминов.\n\n"
                f"Действие Пьемонта: {action}\nГод: {S['year']}"
            )
            try:
                resp         = model.generate_content(prompt)
                austria_text = resp.text.strip()
            except Exception:
                austria_text = "Австрия хранит молчание."

            msg = f"🇦🇹 Австрия: {austria_text}"
            event, elc, defeat = run_end_of_turn()
            if event: msg += f"\n\n⚡ {event['text']}"; add_log(S, f"⚡ {event['text']}")
            if elc:   msg += "\n\n🗳️ Прошли выборы!";   add_log(S, "🗳️ Выборы.")
            add_log(S, f"Дипломатия: {action}")
            add_log(S, f"Австрия: {austria_text}")
            S["last_action_result"] = msg
            if defeat: st.session_state.defeat_reason = defeat
            st.rerun()
