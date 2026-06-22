# parliament.py — вся логика парламента
#
# Ключевые понятия:
#   party     — партия: name, seats, mood, ideology
#   parliament — словарь партий в state["parliament"]
#   elections  — перераспределение мест каждые X лет
#
# Зависимости: только стандартная библиотека Python (random)
# Этот файл НЕ знает про Streamlit, Gemini, laws, events — только математика.

import random


# ─────────────────────────────────────────────
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ─────────────────────────────────────────────

def clamp(v, lo=0, hi=100):
    return max(lo, min(hi, v))


def total_seats(parliament):
    """Суммарное количество мест во всём парламенте."""
    return sum(p["seats"] for p in parliament.values())


def parliament_support(parliament):
    """
    Доля мест (0.0–1.0) партий которые поддерживают правительство (mood >= 50).
    Используется для проверки вотума недоверия.
    """
    total = total_seats(parliament)
    if total == 0:
        return 0.0
    support = sum(p["seats"] for p in parliament.values() if p["mood"] >= 50)
    return support / total


def votes_for_law(parliament, law_effects):
    """
    Считает голосование парламента за конкретный закон.

    law_effects — словарь {party_id: delta_mood} из закона.
    Партии которых нет в law_effects голосуют по своему текущему mood.

    Возвращает:
        passed       — True/False
        votes_for    — количество мест "за"
        votes_against — количество мест "против"
        details      — {party_id: "за"/"против"}
    """
    votes_for    = 0
    votes_against = 0
    details      = {}

    for pid, party in parliament.items():
        delta         = law_effects.get(pid, 0)
        effective_mood = party["mood"] + delta

        if effective_mood >= 50:
            votes_for += party["seats"]
            details[pid] = "за"
        else:
            votes_against += party["seats"]
            details[pid] = "против"

    total = total_seats(parliament)
    passed = votes_for > (total / 2)

    return passed, votes_for, votes_against, details


def apply_law_mood_effects(parliament, law_effects):
    """
    После голосования обновляет реальный mood каждой партии.
    Вызывать ПОСЛЕ vote_for_law, не до.
    """
    for pid, party in parliament.items():
        delta = law_effects.get(pid, 0)
        party["mood"] = clamp(party["mood"] + delta)


# ─────────────────────────────────────────────
# СОЗДАНИЕ ПАРЛАМЕНТА
# ─────────────────────────────────────────────

def build_parliament(country_data):
    """
    Создаёт парламент из данных страны (countries.py).
    Возвращает словарь партий готовый для state["parliament"].

    Каждая партия в state["parliament"]:
        name      — отображаемое название ("Либеральная партия")
        seats     — текущее количество мест
        mood      — отношение к правительству 0–100
        ideology  — строка для отображения ("либеральная", "консервативная"...)
        is_player — True если создана игроком (своя партия)
    """
    parliament = {}
    for pid, pdata in country_data["parties"].items():
        parliament[pid] = {
            "name":      pdata["name"],
            "seats":     pdata["start_seats"],
            "mood":      pdata["start_mood"],
            "ideology":  pdata.get("ideology", ""),
            "is_player": False,
        }
    return parliament


# ─────────────────────────────────────────────
# ВЫБОРЫ
# ─────────────────────────────────────────────

def run_elections(parliament, total_parliament_seats, randomness=0.3):
    """
    Перераспределяет места в парламенте — симуляция выборов.

    Логика:
    1. Для каждой партии считается "вес" = mood + случайный шум
    2. Места распределяются пропорционально весу
    3. Гарантируется минимум 1 место каждой партии (кроме совсем маргинальных)

    Аргументы:
        parliament             — текущий парламент из state
        total_parliament_seats — общее число мест (из countries.py)
        randomness             — сила случайности 0.0–1.0 (0.3 = умеренная)

    Возвращает словарь изменений {party_id: delta_seats} для отображения игроку.
    """
    weights = {}
    for pid, party in parliament.items():
        # Вес = настроение + случайный шум ± randomness*50
        noise         = random.uniform(-randomness * 50, randomness * 50)
        weights[pid]  = max(1, party["mood"] + noise)

    total_weight = sum(weights.values())
    changes      = {}
    new_seats    = {}
    seats_assigned = 0

    # Распределяем пропорционально весу
    for pid in parliament:
        raw = (weights[pid] / total_weight) * total_parliament_seats
        new_seats[pid] = max(1, round(raw))  # минимум 1 место
        seats_assigned += new_seats[pid]

    # Корректируем округление чтобы сумма была точно равна total
    diff = total_parliament_seats - seats_assigned
    if diff != 0:
        # Добавляем/убираем места у самой большой партии
        biggest = max(parliament.keys(), key=lambda pid: new_seats[pid])
        new_seats[biggest] += diff

    # Фиксируем изменения и применяем
    for pid, party in parliament.items():
        changes[pid]   = new_seats[pid] - party["seats"]
        party["seats"] = new_seats[pid]

    return changes


def should_run_elections(state, country_data):
    """
    Проверяет нужно ли проводить выборы в этом году.
    Выборы проводятся каждые election_every_years лет начиная со start_year.
    """
    interval    = country_data.get("election_every_years", 4)
    start_year  = country_data["start_state"]["year"]
    years_passed = state["year"] - start_year

    # Выборы в первый год не проводим
    if years_passed <= 0:
        return False

    return years_passed % interval == 0


# ─────────────────────────────────────────────
# СВОЯ ПАРТИЯ ИГРОКА
# ─────────────────────────────────────────────

def add_player_party(parliament, total_parliament_seats, party_name, requested_seats):
    """
    Игрок создаёт свою партию.

    Механика:
    - Игрок указывает название и желаемое количество мест
    - Места забираются пропорционально у всех существующих партий
    - Новая партия стартует с mood=75 (лояльна правительству)
    - Нельзя взять больше 40% от общего числа мест (ограничение баланса)

    Возвращает (success, message)
    """
    # Проверки
    if "player_party" in parliament:
        return False, "У тебя уже есть своя партия. Нельзя создать две."

    max_allowed = int(total_parliament_seats * 0.4)
    if requested_seats > max_allowed:
        return False, f"Нельзя взять больше {max_allowed} мест (40% парламента)."

    if requested_seats < 1:
        return False, "Минимум 1 место."

    current_total = total_seats(parliament)
    if requested_seats >= current_total:
        return False, "Недостаточно мест для перераспределения."

    # Забираем места пропорционально у существующих партий
    to_take = requested_seats
    # Сначала считаем пропорции
    proportions = {
        pid: party["seats"] / current_total
        for pid, party in parliament.items()
    }
    taken = {pid: 0 for pid in parliament}
    remaining = to_take

    for pid in parliament:
        share = round(proportions[pid] * to_take)
        # Не забирать последнее место у партии
        max_take = max(0, parliament[pid]["seats"] - 1)
        actual   = min(share, max_take)
        taken[pid]  = actual
        remaining  -= actual

    # Если осталось взять — добираем у самой большой партии
    if remaining > 0:
        biggest = max(parliament.keys(), key=lambda pid: parliament[pid]["seats"])
        extra   = min(remaining, parliament[biggest]["seats"] - 1)
        taken[biggest] += extra

    # Применяем
    for pid, take in taken.items():
        parliament[pid]["seats"] -= take

    # Добавляем партию игрока
    parliament["player_party"] = {
        "name":      party_name,
        "seats":     requested_seats,
        "mood":      75,   # стартует лояльной
        "ideology":  "правительственная",
        "is_player": True,
    }

    return True, f"Партия «{party_name}» создана с {requested_seats} местами."


def remove_player_party(parliament):
    """Удаляет партию игрока, возвращая места пропорционально остальным."""
    if "player_party" not in parliament:
        return False, "Своей партии нет."

    seats_to_return = parliament["player_party"]["seats"]
    del parliament["player_party"]

    # Возвращаем места пропорционально
    current_total = total_seats(parliament)
    remaining     = seats_to_return

    for pid, party in parliament.items():
        share = round((party["seats"] / current_total) * seats_to_return)
        party["seats"] += share
        remaining      -= share

    # Остаток — самой большой партии
    if remaining != 0:
        biggest = max(parliament.keys(), key=lambda pid: parliament[pid]["seats"])
        parliament[biggest]["seats"] += remaining

    return True, "Партия распущена. Места перераспределены."
