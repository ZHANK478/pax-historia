# events.py — случайные события и их применение
import random

def clamp(v, lo=0, hi=100):
    return max(lo, min(hi, v))

# Каждое событие:
#   text     — текст который видит игрок
#   treasury — изменение казны (может быть отрицательным)
#   opinion  — изменение мнения народа
#   capital  — изменение политического капитала
#   mood     — изменение настроения партий по идеологии {"republicans": +15}
#              Ключ сравнивается с party_id И с ideology партии
EVENTS = [
    {
        "text":     "Австрия усилила войска на границе.",
        "treasury": 0,   "opinion": -5,  "capital": 0,
        "mood":     {},
    },
    {
        "text":     "Франция намекает на союз против Австрии.",
        "treasury": 0,   "opinion": +3,  "capital": +10,
        "mood":     {},
    },
    {
        "text":     "Неурожай — крестьяне голодают, казна теряет налоги.",
        "treasury": -20, "opinion": -8,  "capital": 0,
        "mood":     {},
    },
    {
        "text":     "Гарибальди призвал к немедленной войне с Австрией.",
        "treasury": 0,   "opinion": -3,  "capital": 0,
        "mood":     {"republicans": +15, "conservatives": -10},
    },
    {
        "text":     "Скандал в прессе — коррупция в правительстве.",
        "treasury": 0,   "opinion": -10, "capital": -10,
        "mood":     {},
    },
    {
        "text":     "Торговля с Францией выросла — казна пополнилась.",
        "treasury": +20, "opinion": +5,  "capital": 0,
        "mood":     {},
    },
    {
        "text":     "Либералы провели митинг за реформы.",
        "treasury": 0,   "opinion": +5,  "capital": 0,
        "mood":     {"liberals": +10, "liberal": +10},
    },
    {
        "text":     "Консерваторы угрожают выйти из коалиции.",
        "treasury": 0,   "opinion": -3,  "capital": -10,
        "mood":     {"conservatives": -15},
    },
]


def apply_event(state, event):
    """
    Применяет эффекты события к состоянию игры.
    Парламент теперь в state["parliament"], не state["factions"].
    Поиск партий по mood ведётся по совпадению ключа с party_id или ideology.
    """
    state["treasury"] += event["treasury"]
    state["capital"]  += event["capital"]
    state["opinion"]   = clamp(state["opinion"] + event["opinion"])

    for mood_key, delta in event["mood"].items():
        for pid, party in state["parliament"].items():
            # Совпадение если mood_key содержится в id партии или в её идеологии
            if mood_key in pid or mood_key in party.get("ideology", ""):
                party["mood"] = clamp(party["mood"] + delta)
                break


def random_event(state):
    """
    С вероятностью 45% выбирает случайное событие и применяет его.
    Возвращает событие или None.
    """
    if random.random() < 0.45:
        event = random.choice(EVENTS)
        apply_event(state, event)
        return event
    return None