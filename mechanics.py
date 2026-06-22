# mechanics.py — правила игры: пассивный доход, поражение, конец хода, выборы

from parliament import parliament_support, run_elections, should_run_elections

def clamp(v, lo=0, hi=100):
    return max(lo, min(hi, v))


def passive_income(state):
    """
    Пассивный доход каждый ход.
    +10 казны, +5 капитала.
    Каждые 4 хода — год +1, и проверяются выборы.
    """
    state["treasury"] += 10
    state["capital"]   = clamp(state["capital"] + 5)
    if state["turn"] % 4 == 0:
        state["year"] += 1


def check_defeat(state):
    """
    Проверяет условия поражения.
    Возвращает строку-причину или None.
    """
    # Казна
    if state["treasury"] < 0:
        state["defeat_treasury_streak"] += 1
    else:
        state["defeat_treasury_streak"] = 0

    if state["defeat_treasury_streak"] >= 2:
        return "Казна пуста два хода подряд — государство объявило банкротство."

    # Мнение
    if state["opinion"] <= 15:
        state["defeat_opinion_streak"] += 1
    else:
        state["defeat_opinion_streak"] = 0

    if state["defeat_opinion_streak"] >= 2:
        return "Народное восстание — ты свергнут с поста."

    # Парламент — используем parliament.py
    if parliament_support(state["parliament"]) < 0.25:
        return "Парламент вынес вотум недоверия — ты отправлен в отставку."

    return None


def check_elections(state, country_data):
    """
    Проверяет нужны ли выборы в текущем году.
    Если да — проводит и возвращает словарь изменений мест.
    Если нет — возвращает None.
    """
    from parliament import should_run_elections, run_elections
    if should_run_elections(state, country_data):
        total = country_data["total_parliament_seats"]
        changes = run_elections(state["parliament"], total, randomness=0.25)
        return changes
    return None


def end_of_turn(state, random_event_fn, country_data):
    """
    Завершает ход. Порядок операций:
    1. turn += 1
    2. passive_income (казна+10, капитал+5, год если нужно)
    3. Случайное событие
    4. Выборы если наступил год
    5. Проверка поражения

    Возвращает (событие или None, изменения_выборов или None, поражение или None)
    """
    state["turn"] += 1
    passive_income(state)

    event           = random_event_fn(state)
    election_changes = check_elections(state, country_data)
    defeat          = check_defeat(state)

    return event, election_changes, defeat
