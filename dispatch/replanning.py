"""Пересчёт будущего с сохранением завершённых и уже начатых выездов."""
from dataclasses import replace

from .models import Engineer, Job, Plan, Route
from .planner import check_inputs, schedule, validate_plan
from .travel import ASSUMPTIONS


def replan(previous: Plan, jobs: list[Job], engineers: list[Engineer],
           event_time: int, method: str = "insertion") -> tuple[Plan, list[str]]:
    check_inputs(jobs, engineers)
    if not 0 <= event_time < 1440:
        raise ValueError("Время события должно находиться в пределах дня")
    job_map = {j.id: j for j in jobs}
    previous_jobs = [j for j in jobs if j.id in previous.unassigned or
                     any(s.job_id == j.id for r in previous.routes for s in r.stops)]
    errors = validate_plan(previous, previous_jobs, engineers)
    if errors:
        raise ValueError("Нельзя перепланировать некорректный исходный план")
    old_routes = {r.engineer_id: r for r in previous.routes}
    locked, prefixes, available = set(), {}, {}
    for engineer in engineers:
        prefix = []
        for stop in old_routes.get(engineer.id, Route(engineer.id)).stops:
            departure = stop.arrival - stop.travel_minutes
            if stop.end <= event_time or departure < event_time or stop.start <= event_time:
                prefix.append(stop)
                locked.add(stop.job_id)
            else:
                break
        prefixes[engineer.id] = prefix
        ready = max(event_time, prefix[-1].end if prefix else engineer.shift_start)
        if ready < engineer.shift_end:
            point = job_map[prefix[-1].job_id].point if prefix else engineer.start
            available[engineer.id] = replace(engineer, start=point, shift_start=ready)
    remaining = [j for j in jobs if j.id not in locked]
    if method == "insertion":
        remaining.sort(key=lambda j: (not j.urgent, j.window_end, j.window_start))
    assigned = {e.id: [] for e in engineers}
    tails = {e.id: Route(e.id) for e in engineers}
    rejected = {}
    for job in remaining:
        best = None
        for original in engineers:
            engineer = available.get(original.id)
            if engineer is None:
                continue
            sequence = assigned[engineer.id]
            positions = range(len(sequence) + 1) if method == "insertion" else [len(sequence)]
            for index in positions:
                candidate_jobs = sequence[:index] + [job] + sequence[index:]
                route = schedule(candidate_jobs, engineer)
                if route is None:
                    continue
                score = (int(not sequence and not prefixes[engineer.id]),
                         route.distance_km - tails[engineer.id].distance_km)
                if best is None or (method == "insertion" and score < best[0]):
                    best = (score, engineer.id, candidate_jobs, route)
            if best is not None and method == "baseline":
                break
        if best is None:
            rejected[job.id] = (
                "После события не найдено допустимое назначение: учитываются текущее время, "
                "зафиксированные выезды, навыки, транспорт, окно и остаток смены."
            )
        else:
            _, engineer_id, sequence, route = best
            assigned[engineer_id], tails[engineer_id] = sequence, route
    routes = [Route(e.id, prefixes[e.id] + tails[e.id].stops) for e in engineers]
    result = Plan(f"replan_{method}", routes, rejected, list(ASSUMPTIONS) + [
        "Завершённые работы и начатые переезды/визиты сохранены. "
        "Ожидающий у клиента инженер заканчивает запланированный визит.",
        "Новые переезды начинаются не раньше времени события."
    ])
    errors = validate_plan(result, jobs, engineers)
    if errors:
        raise RuntimeError(errors)
    return result, sorted(locked)


def diff_plans(before: Plan, after: Plan) -> list[dict]:
    def index(plan):
        return {s.job_id: {"engineer_id": r.engineer_id, "position": i + 1, "start": s.start}
                for r in plan.routes for i, s in enumerate(r.stops)}
    old, new = index(before), index(after)
    changes = []
    ids = sorted(set(old) | set(new) | set(before.unassigned) | set(after.unassigned))
    for job_id in ids:
        if old.get(job_id) != new.get(job_id):
            changes.append({"job_id": job_id, "before": old.get(job_id), "after": new.get(job_id)})
    return changes
