import streamlit as st
import google.generativeai as genai
import random

# =========================
# API KEY
# =========================
API_KEY = st.secrets["API_KEY"]
genai.configure(api_key=API_KEY)

model = genai.GenerativeModel("gemini-2.5-flash")

# =========================
# LAWS SYSTEM (UNCHANGED)
# =========================
LAWS = {
    "constitution": {
        "name": "Конституционная реформа",
        "cost": 20,
        "effect": {"liberals": 15, "conservatives": -10, "republicans": 10, "independents": 5},
        "opinion_effect": 5,
    },
    "tax_cut": {
        "name": "Снижение налогов для крестьян",
        "cost": 15,
        "effect": {"liberals": 5, "conservatives": -15, "republicans": 10, "independents": 0},
        "opinion_effect": 10,
    },
    "army_funding": {
        "name": "Финансирование армии",
        "cost": 30,
        "effect": {"liberals": -5, "conservatives": 15, "republicans": 5, "independents": 0},
        "opinion_effect": -5,
    },
    "press_freedom": {
        "name": "Свобода прессы",
        "cost": 10,
        "effect": {"liberals": 20, "conservatives": -15, "republicans": 15, "independents": 0},
        "opinion_effect": 8,
    },
    "church_alliance": {
        "name": "Союз с церковью",
        "cost": 5,
        "effect": {"liberals": -15, "conservatives": 20, "republicans": -10, "independents": 5},
        "opinion_effect": -3,
    },
    "railroads": {
        "name": "Строительство железных дорог",
        "cost": 25,
        "effect": {"liberals": 10, "conservatives": 0, "republicans": 5, "independents": 10},
        "opinion_effect": 6,
    },
    "amnesty": {
        "name": "Амнистия политзаключённых",
        "cost": 10,
        "effect": {"liberals": 10, "conservatives": -20, "republicans": 25, "independents": 0},
        "opinion_effect": 5,
    },
    "censorship": {
        "name": "Ужесточение цензуры",
        "cost": 5,
        "effect": {"liberals": -20, "conservatives": 15, "republicans": -15, "independents": -5},
        "opinion_effect": -10,
    },
}

# =========================
# FACTION NAMES
# =========================
FACTION_NAMES = {
    "liberals": "Либералы",
    "conservatives": "Консерваторы",
    "republicans": "Республиканцы",
    "independents": "Независимые",
}

# =========================
# GAME STATE
# =========================
def init_game_state():
    return {
        "year": 1852,
        "turn": 1,
        "treasury": 100,
        "public_opinion": 50,
        "political_capital": 50,
        "press_reputation": 50,
        "relation_austria": 0,
        "relation_france": 0,
        "territories": ["Piedmont-Sardinia"],
        "factions": {
            "liberals": {"seats": 30, "mood": 50},
            "conservatives": {"seats": 30, "mood": 50},
            "republicans": {"seats": 20, "mood": 50},
            "independents": {"seats": 20, "mood": 50},
        },
        "history_log": [
            "Италия раздроблена. Австрия контролирует север."
        ],
        "reforms_passed": []
    }

# =========================
# HELPERS
# =========================
def get_state():
    return st.session_state.game_state

def add_history(text):
    state = get_state()
    state["history_log"].append(text)
    state["history_log"] = state["history_log"][-10:]

def apply_turn_effects(state):
    state["treasury"] += 10
    state["political_capital"] = min(state["political_capital"] + 5, 100)

    if state["turn"] % 4 == 0:
        state["year"] += 1

def end_turn():
    state = get_state()
    state["turn"] += 1
    apply_turn_effects(state)

# =========================
# LAW FUNCTIONS (UNCHANGED)
# =========================
def vote_on_law(state, law_id):
    law = LAWS[law_id]

    details = {}
    votes_for = 0
    votes_against = 0

    for f_name, f_data in state["factions"].items():
        temp_mood = f_data["mood"] + law["effect"][f_name]

        if temp_mood >= 50:
            details[f_name] = "за"
            votes_for += f_data["seats"]
        else:
            details[f_name] = "против"
            votes_against += f_data["seats"]

    for f_name, f_data in state["factions"].items():
        f_data["mood"] = max(0, min(100, f_data["mood"] + law["effect"][f_name]))

    return {
        "passed": votes_for >= 50,
        "votes_for": votes_for,
        "votes_against": votes_against,
        "details": details
    }

def apply_law(state, law_id):
    law = LAWS[law_id]

    if state["treasury"] < law["cost"]:
        return {"error": "Недостаточно средств в казне"}

    state["treasury"] -= law["cost"]

    result = vote_on_law(state, law_id)
    result["law_name"] = law["name"]

    if result["passed"]:
        state["public_opinion"] = max(0, min(100, state["public_opinion"] + law["opinion_effect"]))
        state["reforms_passed"].append(law_id)

    return result

# =========================
# INIT
# =========================
if "game_state" not in st.session_state:
    st.session_state.game_state = init_game_state()

state = st.session_state.game_state

# =========================
# HEADER
# =========================
st.title("GenHistoria V2")
st.write("Ты — Пьемонт-Сардиния. Бот — Австрия.")

# =========================
# METRICS (FIXED ORDER)
# =========================
col1, col2, col3, col4, col5 = st.columns(5)
col1.metric("Год", state["year"])
col2.metric("Ход", state["turn"])
col3.metric("Казна", state["treasury"])
col4.metric("Капитал", state["political_capital"])
col5.metric("Поддержка", f"{state['public_opinion']}%")

# =========================
# PARLIAMENT
# =========================
st.subheader("🏛️ Парламент")
fcols = st.columns(4)

for i, (key, f) in enumerate(state["factions"].items()):
    with fcols[i]:
        st.write(FACTION_NAMES[key])
        st.write(f"Мест: {f['seats']}")
        st.progress(f["mood"] / 100)

        if f["mood"] >= 50:
            st.success(f"За ({f['mood']})")
        else:
            st.error(f"Против ({f['mood']})")

# =========================
# HISTORY (NO DUPLICATION FIXED)
# =========================
st.subheader("📰 Последнее событие")

if state["history_log"]:
    st.info(state["history_log"][-1])

if len(state["history_log"]) > 1:
    with st.expander("Показать историю полностью"):
        for entry in reversed(state["history_log"][:-1]):
            st.write(entry)

# =========================
# ACTIONS (TABS)
# =========================
st.subheader("🎮 Действия")

tab1, tab2 = st.tabs(["Быстрые действия", "Дипломатический манёвр"])

with tab1:
    col1, col2, col3 = st.columns(3)

    if col1.button("Пропустить ход"):
        state["treasury"] += 15
        state["political_capital"] += 10
        add_history("Игрок пропустил ход и стабилизировал экономику")
        end_turn()
        st.rerun()

    if col2.button("Укрепить казну"):
        state["treasury"] += 25
        state["public_opinion"] -= 2
        add_history("Игрок усилил налоги для пополнения казны")
        end_turn()
        st.rerun()

    if col3.button("Обратиться к прессе"):
        state["public_opinion"] += 5
        state["press_reputation"] += 10
        state["political_capital"] -= 10
        add_history("Игрок выступил перед прессой")
        end_turn()
        st.rerun()

    st.write("Законопроекты:")

    law_map = {f"{LAWS[k]['name']} ({LAWS[k]['cost']} казны)": k for k in LAWS}
    selected_law_label = st.selectbox("Выберите закон", list(law_map.keys()))
    selected_law_id = law_map[selected_law_label]

    if st.button("Внести законопроект"):
        result = apply_law(state, selected_law_id)

        if "error" in result:
            st.write(result["error"])
        else:
            st.write(f"📜 Закон: {result['law_name']}")
            st.write("Статус:", "ПРИНЯТ" if result["passed"] else "ОТКЛОНЁН")
            st.write("За:", result["votes_for"])
            st.write("Против:", result["votes_against"])
            st.write("Стоимость:", LAWS[selected_law_id]["cost"])

            add_history(
                f"Закон '{result['law_name']}' "
                f"{'ПРИНЯТ' if result['passed'] else 'ОТКЛОНЁН'} "
                f"({result['votes_for']} за, {result['votes_against']} против). "
                f"Казна: -{LAWS[selected_law_id]['cost']}"
            )

            end_turn()
            st.rerun()

with tab2:
    action = st.text_input("Твой ход:")

    if st.button("Сделать ход"):

        prompt = f"""
Ты — Австрийская империя в политической стратегии.

Ты НЕ просто хронист.
Ты отвечаешь как государство.

Текущая ситуация:
{chr(10).join(state["history_log"][-5:])}

Действие игрока:
{action}

Твоя задача:
1. Коротко ответить (2-3 предложения)
2. Описать реакцию Австрии
3. ВНУТРЕННЕ изменить ситуацию

Формат:
- хроника
- последствия
"""

        try:
            response = model.generate_content(prompt)
            text = response.text
        except:
            text = "Австрия не смогла отреагировать на события."

        st.write("📰 АВСТРИЙСКАЯ РЕАКЦИЯ:")
        st.write(text)

        add_history(f"Игрок: {action}")
        add_history(f"Австрия: {text}")

        end_turn()
        st.rerun()