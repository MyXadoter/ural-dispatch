"""Первый API для подключения интерфейса; установка: pip install -e '.[api]'."""
from dataclasses import asdict, dataclass, field
import json
import os
import re
import tempfile
from pathlib import Path
from threading import RLock
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, ConfigDict

from .demo import demo_data
from .planner import baseline, insertion, validate_plan
from .models import Job, Engineer, Plan, Point, Skill, Transport, Route, Stop
from .replanning import replan, diff_plans
from .importer import read_csv
from .map_config import yandex_key

app = FastAPI(title="Уральские самоцветы — диспетчер", version="0.1.0")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "ural-dispatch"}


@app.get("/api/maps/config")
def maps_config(response: Response):
    response.headers["Cache-Control"] = "no-store"
    return {"provider": "yandex", "api_key": yandex_key()}


@app.get("/api/demo/compare")
def compare_demo():
    jobs, engineers = demo_data()
    plans = [baseline(jobs, engineers), insertion(jobs, engineers)]
    for plan in plans:
        errors = validate_plan(plan, jobs, engineers)
        if errors:
            raise RuntimeError(errors)
    return {
        "dataset": "Вымышленный демонстрационный набор",
        "plans": [p.to_dict() for p in plans],
    }


@dataclass
class Scenario:
    jobs: list[Job]
    engineers: list[Engineer]
    plans: list[Plan]
    now: int = 540
    version: int = 1
    changes: list[dict] = field(default_factory=list)
    locked: list[str] = field(default_factory=list)


scenarios: dict[str, Scenario] = {}
lock = RLock()
STATE_DIR = Path(__file__).resolve().parents[1] / "output/sessions"


def serialize(scenario_id, scenario, changes=None, locked=None):
    return {
        "id": scenario_id, "version": scenario.version, "now": scenario.now,
        "date": scenario.jobs[0].date, "dataset": "Учебный день · Москва",
        "is_demo": True, "jobs": [asdict(j) for j in scenario.jobs],
        "engineers": [{**asdict(e), "skills": sorted(e.skills)} for e in scenario.engineers],
        "plans": [p.to_dict() for p in scenario.plans],
        "changes": scenario.changes if changes is None else changes,
        "locked_job_ids": scenario.locked if locked is None else locked,
    }


def save_scenario(scenario_id: str, scenario: Scenario):
    from fastapi.encoders import jsonable_encoder
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=STATE_DIR, delete=False) as stream:
        json.dump(jsonable_encoder(serialize(scenario_id, scenario)), stream, ensure_ascii=False)
        temp_path = stream.name
    os.replace(temp_path, STATE_DIR / f"{scenario_id}.json")


def find_scenario(scenario_id: str) -> Scenario:
    if not re.fullmatch(r"[0-9a-f]{32}", scenario_id):
        raise HTTPException(404, "Учебная сессия не найдена.")
    if scenario_id in scenarios:
        return scenarios[scenario_id]
    path = STATE_DIR / f"{scenario_id}.json"
    if not path.exists():
        raise HTTPException(404, "Учебная сессия завершена. Откройте новый день.")
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
        jobs = [Job(**{**j, "point": Point(**j["point"]) if j["point"] else None,
                       "skill": Skill(j["skill"]),
                       "required_transport": Transport(j["required_transport"]) if j["required_transport"] else None}) for j in record["jobs"]]
        engineers = [Engineer(**{**e, "start": Point(**e["start"]), "skills": frozenset(Skill(s) for s in e["skills"]),
                                 "transport": Transport(e["transport"])}) for e in record["engineers"]]
        plans = [Plan(p["algorithm"], [Route(r["engineer_id"], [Stop(**s) for s in r["stops"]]) for r in p["routes"]],
                      p["unassigned"], p["assumptions"]) for p in record["plans"]]
        if any(validate_plan(p, jobs, engineers) for p in plans):
            raise ValueError("Некорректный сохранённый план")
        scenario = Scenario(jobs, engineers, plans, record["now"], record["version"], record["changes"], record["locked_job_ids"])
    except (ValueError, TypeError, KeyError) as error:
        raise HTTPException(422, "Сохранённый план повреждён. Создайте новый учебный день.") from error
    if len(scenarios) >= 100:
        scenarios.pop(next(iter(scenarios)))
    scenarios[scenario_id] = scenario
    return scenario


@app.get("/api/scenarios/{scenario_id}")
def get_scenario(scenario_id: str):
    with lock:
        return serialize(scenario_id, find_scenario(scenario_id))


@app.post("/api/scenarios/demo")
def create_demo():
    jobs, engineers = demo_data()
    scenario = Scenario(jobs, engineers, [baseline(jobs, engineers), insertion(jobs, engineers)])
    scenario_id = uuid4().hex
    with lock:
        if len(scenarios) >= 100:
            scenarios.pop(next(iter(scenarios)))
        scenarios[scenario_id] = scenario
        save_scenario(scenario_id, scenario)
    return serialize(scenario_id, scenario)


class UrgentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    version: int = Field(ge=1)
    event_time: int = Field(ge=0, le=1439)
    address: str = Field(min_length=3, max_length=200)
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lon: float = Field(ge=-180, le=180, allow_inf_nan=False)
    window_start: int = Field(ge=0, le=1439)
    window_end: int = Field(ge=0, le=1439)
    duration: int = Field(ge=1, le=480)
    skill: Skill
    required_transport: Transport | None = None


@app.post("/api/scenarios/{scenario_id}/urgent")
def add_urgent(scenario_id: str, payload: UrgentRequest):
    with lock:
        scenario = find_scenario(scenario_id)
        if payload.version != scenario.version:
            raise HTTPException(409, "План уже изменился. Откройте новый день.")
        if payload.event_time < scenario.now:
            raise HTTPException(422, "Время события не может быть раньше текущего времени плана.")
        if payload.window_start > payload.window_end or payload.window_end < payload.event_time:
            raise HTTPException(422, "Проверьте окно: его конец должен быть после начала и времени события.")
        if len(scenario.jobs) >= 100:
            raise HTTPException(422, "Учебный набор ограничен 100 заявками.")
        job = Job(
            id=f"urgent-{scenario.version}", address=payload.address,
            point=Point(payload.lat, payload.lon), window_start=payload.window_start,
            window_end=payload.window_end, duration=payload.duration, skill=payload.skill,
            required_transport=payload.required_transport, urgent=True, date=scenario.jobs[0].date,
        )
        jobs = scenario.jobs + [job]
        previous = scenario.plans[1]
        # Одинаковое фактическое состояние дня для обоих алгоритмов сравнения.
        simple, _ = replan(previous, jobs, scenario.engineers, payload.event_time, "baseline")
        improved, locked_ids = replan(previous, jobs, scenario.engineers, payload.event_time)
        changes = diff_plans(previous, improved)
        updated = Scenario(jobs, scenario.engineers, [simple, improved], payload.event_time,
                           scenario.version + 1, changes, locked_ids)
        save_scenario(scenario_id, updated)
        scenarios[scenario_id] = updated
        return serialize(scenario_id, updated)


@app.get("/api/source/vostok")
def source_vostok():
    path = Path(__file__).resolve().parents[1] / "Обезличивание/Восток Синтетические данные.csv"
    if not path.exists():
        raise HTTPException(404, "Исходный CSV не найден в папке проекта.")
    return read_csv(path).to_dict()


FRONTEND = Path(__file__).resolve().parents[1] / "frontend/dist"
if FRONTEND.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND / "assets"), name="assets")


@app.get("/")
def index():
    if not (FRONTEND / "index.html").exists():
        raise HTTPException(503, "Сначала соберите frontend: pnpm --dir frontend build")
    return FileResponse(FRONTEND / "index.html")
