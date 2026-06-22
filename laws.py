# laws.py — список законов, голосование, применение закона

def clamp(v, lo=0, hi=100):
    """Ограничивает число в диапазоне [lo, hi]. По умолчанию 0-100."""
    return max(lo, min(hi, v))


# Каждый закон:
#   name    — название (показывается игроку)
#   cost    — стоимость в казне (вычитается при внесении, даже если отклонён)
#   mood    — как изменится настроение каждой фракции если закон внесён
#   opinion — как изменится мнение народа если закон ПРИНЯТ
LAWS = {
    "constitution": {
        "name": "Конституционная реформа", "cost": 20,
        "mood":    {"liberals": +15, "conservatives": -10, "republicans": +10, "independents": +5},
        "opinion": +5,
    },
    "tax_cut": {
        "name": "Снижение налогов для крестьян", "cost": 15,
        "mood":    {"liberals": +5, "conservatives": -15, "republicans": +10, "independents": 0},
        "opinion": +10,
    },
    "army_funding": {
        "name": "Финансирование армии", "cost": 30,
        "mood":    {"liberals": -5, "conservatives": +15, "republicans": +5, "independents": 0},
        "opinion": -5,
    },
    "press_freedom": {
        "name": "Свобода прессы", "cost": 10,
        "mood":    {"liberals": +20, "conservatives": -15, "republicans": +15, "independents": 0},
        "opinion": +8,
    },
    "church_alliance": {
        "name": "Союз с церковью", "cost": 5,
        "mood":    {"liberals": -15, "conservatives": +20, "republicans": -10, "independents": +5},
        "opinion": -3,
    },
    "railroads": {
        "name": "Строительство железных дорог", "cost": 25,
        "mood":    {"liberals": +10, "conservatives": 0, "republicans": +5, "independents": +10},
        "opinion": +6,
    },
    "amnesty": {
        "name": "Амнистия политзаключённых", "cost": 10,
        "mood":    {"liberals": +10, "conservatives": -20, "republicans": +25, "independents": 0},
        "opinion": +5,
    },
    "censorship": {
        "name": "Ужесточение цензуры", "cost": 5,
        "mood":    {"liberals": -20, "conservatives": +15, "republicans": -15, "independents": -5},
        "opinion": -10,
    },
}


def vote_on_law(state, law_id):
    """
    Считает голосование фракций за закон.
    Формула: если mood фракции + эффект закона >= 50 → фракция голосует ЗА.
    После подсчёта — обновляет реальный mood фракций.
    Возвращает: (passed, votes_for, votes_against, details)
    """
    law = LAWS[law_id]
    votes_for = 0
    votes_against = 0
    details = {}

    for f_name, f_data in state["factions"].items():
        effective_mood = f_data["mood"] + law["mood"][f_name]
        if effective_mood >= 50:
            votes_for += f_data["seats"]
            details[f_name] = "за"
        else:
            votes_against += f_data["seats"]
            details[f_name] = "против"

    # Обновляем реальный mood ПОСЛЕ подсчёта голосов
    for f_name, f_data in state["factions"].items():
        f_data["mood"] = clamp(f_data["mood"] + law["mood"][f_name])

    passed = votes_for >= 50  # нужно больше половины из 100 мест
    return passed, votes_for, votes_against, details


def apply_law(state, law_id):
    """
    Применяет закон к состоянию игры.
    Вычитает стоимость из казны (даже если закон отклонён).
    Если закон принят — применяет opinion_effect к мнению народа.
    Возвращает словарь с результатом или {"error": "..."} если денег не хватает.
    """
    law = LAWS[law_id]

    if state["treasury"] < law["cost"]:
        return {"error": f"Недостаточно средств. Нужно {law['cost']}, в казне {state['treasury']}."}

    state["treasury"] -= law["cost"]

    passed, vf, va, details = vote_on_law(state, law_id)

    if passed:
        state["opinion"] = clamp(state["opinion"] + law["opinion"])

    return {
        "passed":       passed,
        "votes_for":    vf,
        "votes_against": va,
        "details":      details,
        "law_name":     law["name"],
        "cost":         law["cost"],
    }
