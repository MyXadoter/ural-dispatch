from .models import Engineer, Job, Plan, Route, Stop
from .travel import ASSUMPTIONS, travel


def check_inputs(jobs: list[Job], engineers: list[Engineer]):
    if len({j.id for j in jobs}) != len(jobs):
        raise ValueError("ID заявок должны быть уникальными")
    if len({e.id for e in engineers}) != len(engineers):
        raise ValueError("ID инженеров должны быть уникальными")
    if len({j.date for j in jobs}) > 1:
        raise ValueError("План строится на один день; выберите одну дату")


def schedule(jobs: list[Job], engineer: Engineer) -> Route | None:
    route = Route(engineer.id)
    position, clock = engineer.start, engineer.shift_start
    for job in jobs:
        if job.point is None or job.skill not in engineer.skills:
            return None
        if job.required_transport and job.required_transport != engineer.transport:
            return None
        km, minutes = travel(position, job.point, engineer.transport)
        arrival = clock + minutes
        start = max(arrival, job.window_start)
        end = start + job.duration
        if start > job.window_end or end > engineer.shift_end:
            return None
        reason = (
            f"Навык «{job.skill.value}» есть; транспорт подходит. "
            f"Начало {start // 60:02d}:{start % 60:02d} в окне заявки, "
            f"завершение {end // 60:02d}:{end % 60:02d} в пределах смены."
        )
        route.stops.append(Stop(job.id, arrival, start, end, minutes, km, reason))
        position, clock = job.point, end
    return route


def unassigned_reason(job: Job, engineers: list[Engineer]) -> str:
    if job.point is None:
        return "Нет проверенных координат адреса: требуется геокодирование."
    qualified = [e for e in engineers if job.skill in e.skills]
    if not qualified:
        return "Нет инженера с требуемым навыком."
    compatible = [e for e in qualified if not job.required_transport
                  or e.transport == job.required_transport]
    if not compatible:
        return "У инженеров с нужным навыком нет требуемого транспорта."
    if not any(schedule([job], e) for e in compatible):
        return "Даже отдельный выезд из стартовой точки не укладывается в окно или смену."
    return "Алгоритм не нашёл места в текущих маршрутах с соблюдением окна и смены."


def baseline(jobs: list[Job], engineers: list[Engineer]) -> Plan:
    """Порядок входных данных, первый допустимый инженер, добавление в конец."""
    check_inputs(jobs, engineers)
    assigned = {e.id: [] for e in engineers}
    routes = {e.id: Route(e.id) for e in engineers}
    rejected = {}
    for job in jobs:
        for engineer in engineers:
            candidate = schedule(assigned[engineer.id] + [job], engineer)
            if candidate is not None:
                assigned[engineer.id].append(job)
                routes[engineer.id] = candidate
                break
        else:
            rejected[job.id] = unassigned_reason(job, engineers)
    return Plan("baseline", list(routes.values()), rejected, list(ASSUMPTIONS))


def insertion(jobs: list[Job], engineers: list[Engineer]) -> Plan:
    """Эвристика допустимой вставки. Глобальный оптимум не гарантируется."""
    check_inputs(jobs, engineers)
    assigned = {e.id: [] for e in engineers}
    routes = {e.id: Route(e.id) for e in engineers}
    rejected = {}
    ordered = sorted(jobs, key=lambda j: (not j.urgent, j.window_end, j.window_start))
    for job in ordered:
        best = None
        for engineer in engineers:
            old = assigned[engineer.id]
            for index in range(len(old) + 1):
                sequence = old[:index] + [job] + old[index:]
                candidate = schedule(sequence, engineer)
                if candidate is None:
                    continue
                score = (int(not old), candidate.distance_km - routes[engineer.id].distance_km)
                if best is None or score < best[0]:
                    best = (score, engineer.id, sequence, candidate)
        if best is None:
            rejected[job.id] = unassigned_reason(job, engineers)
        else:
            _, engineer_id, sequence, candidate = best
            assigned[engineer_id] = sequence
            routes[engineer_id] = candidate
    return Plan("insertion_heuristic", list(routes.values()), rejected,
                list(ASSUMPTIONS) + ["Эвристика вставки, без гарантии глобального оптимума."])


def validate_plan(plan: Plan, jobs: list[Job], engineers: list[Engineer]) -> list[str]:
    """Проверяет результат независимо от функции построения расписания."""
    check_inputs(jobs, engineers)
    job_map, engineer_map = {j.id: j for j in jobs}, {e.id: e for e in engineers}
    errors, seen, seen_engineers = [], set(), set()
    for route in plan.routes:
        if route.engineer_id not in engineer_map:
            errors.append(f"Неизвестный инженер {route.engineer_id}")
            continue
        if route.engineer_id in seen_engineers:
            errors.append(f"Несколько маршрутов инженера {route.engineer_id}")
        seen_engineers.add(route.engineer_id)
        engineer = engineer_map[route.engineer_id]
        position, clock = engineer.start, engineer.shift_start
        for stop in route.stops:
            job = job_map.get(stop.job_id)
            if job is None:
                errors.append(f"Неизвестная заявка {stop.job_id}")
                continue
            if job.id in seen:
                errors.append(f"Повторное назначение {job.id}")
            seen.add(job.id)
            if job.point is None:
                errors.append(f"Назначение без координат {job.id}")
                continue
            km, minutes = travel(position, job.point, engineer.transport)
            if job.skill not in engineer.skills:
                errors.append(f"Не подходит навык {job.id}")
            if job.required_transport and job.required_transport != engineer.transport:
                errors.append(f"Не подходит транспорт {job.id}")
            # После события инженер может ждать на текущей точке до времени пересчёта.
            if stop.arrival < clock + minutes or stop.travel_minutes != minutes:
                errors.append(f"Неверное время переезда {job.id}")
            if abs(stop.distance_km - km) > 1e-8:
                errors.append(f"Неверное расстояние {job.id}")
            if not (max(stop.arrival, job.window_start) <= stop.start <= job.window_end):
                errors.append(f"Нарушено окно или время прибытия {job.id}")
            if stop.end != stop.start + job.duration or stop.end > engineer.shift_end:
                errors.append(f"Нарушена длительность или смена {job.id}")
            position, clock = job.point, stop.end
    rejected = set(plan.unassigned)
    if seen & rejected:
        errors.append("Заявка одновременно назначена и отклонена")
    if seen | rejected != set(job_map):
        errors.append("Набор заявок плана отличается от входного")
    if any(not reason.strip() for reason in plan.unassigned.values()):
        errors.append("Отсутствует причина неназначения")
    return errors
