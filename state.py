# state.py — начальное состояние игры
from countries import COUNTRIES
from parliament import build_parliament

def init_state(country_id="piedmont"):
    """Создаёт полное состояние игры для выбранной страны."""
    country = COUNTRIES[country_id]

    return {
        "country_id": country_id,

        # Базовые параметры из countries.py
        "year":     country["start_state"]["year"],
        "turn":     1,
        "treasury": country["start_state"]["treasury"],
        "opinion":  country["start_state"]["opinion"],
        "capital":  country["start_state"]["capital"],

        # Парламент — строится через parliament.py
        # Это словарь {party_id: {name, seats, mood, ideology, is_player}}
        "parliament": build_parliament(country),

        # Текущий лидер (индекс в списке leaders страны)
        "leader_index": 0,

        # Счётчики поражения
        "defeat_treasury_streak": 0,
        "defeat_opinion_streak":  0,

        # Последний результат хода (показывается один раз)
        "last_action_result": None,

        # История
        "log": [
            f"{country['flag']} {country['name']} — начало игры. "
            f"{country['leaders'][0]['name']} у власти."
        ],
    }


def add_log(state, text):
    """Добавляет запись в историю. Хранит не более 12 последних записей."""
    state["log"].append(text)
    state["log"] = state["log"][-12:]


def get_country(state):
    """Удобная функция — возвращает данные страны из COUNTRIES."""
    return COUNTRIES[state["country_id"]]


def get_current_leader(state):
    """Возвращает данные текущего главы правительства."""
    country = get_country(state)
    idx     = min(state["leader_index"], len(country["leaders"]) - 1)
    return country["leaders"][idx]


def next_leader(state):
    """
    Переключает на следующего лидера в списке.
    Используется при смене правительства (не поражение, а смена лидера).
    Возвращает (новый_лидер, был_ли_последний).
    """
    country   = get_country(state)
    max_index = len(country["leaders"]) - 1

    if state["leader_index"] >= max_index:
        return country["leaders"][max_index], True  # последний лидер, дальше некуда

    state["leader_index"] += 1
    return country["leaders"][state["leader_index"]], False
