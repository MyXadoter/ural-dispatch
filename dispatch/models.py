from dataclasses import dataclass, field
from enum import Enum
from math import isfinite


class Skill(str, Enum):
    LOCAL = "Локальные работы"
    INSTALL = "Работы на подключение и дозаказы"
    EMERGENCY = "Аварийные работы"


class Transport(str, Enum):
    CAR = "Автомобиль"
    WALK = "Пешеход"
    BIKE = "Велосипед"
    TRANSIT = "Общественный транспорт"


@dataclass(frozen=True)
class Point:
    lat: float
    lon: float

    def __post_init__(self):
        if not (isfinite(self.lat) and isfinite(self.lon)
                and -90 <= self.lat <= 90 and -180 <= self.lon <= 180):
            raise ValueError("Некорректные координаты")


@dataclass(frozen=True)
class Job:
    id: str
    address: str
    window_start: int
    window_end: int
    duration: int
    skill: Skill
    point: Point | None = None
    required_transport: Transport | None = None
    urgent: bool = False
    source: str = "demo"
    date: str = "2026-08-17"

    def __post_init__(self):
        if not self.id or not self.address:
            raise ValueError("Заявке нужны ID и адрес")
        if not 0 <= self.window_start <= self.window_end < 1440:
            raise ValueError("Некорректное временное окно")
        if self.duration <= 0:
            raise ValueError("Длительность должна быть положительной")


@dataclass(frozen=True)
class Engineer:
    id: str
    name: str
    start: Point
    shift_start: int
    shift_end: int
    skills: frozenset[Skill]
    transport: Transport

    def __post_init__(self):
        if not self.id or not self.name or not self.skills:
            raise ValueError("Инженеру нужны ID, имя и навыки")
        if not 0 <= self.shift_start < self.shift_end <= 1440:
            raise ValueError("Некорректная смена")


@dataclass(frozen=True)
class Stop:
    job_id: str
    arrival: int
    start: int
    end: int
    travel_minutes: int
    distance_km: float
    explanation: str


@dataclass
class Route:
    engineer_id: str
    stops: list[Stop] = field(default_factory=list)

    @property
    def distance_km(self):
        return sum(stop.distance_km for stop in self.stops)


@dataclass
class Plan:
    algorithm: str
    routes: list[Route]
    unassigned: dict[str, str]
    assumptions: list[str]

    def to_dict(self):
        from dataclasses import asdict
        result = asdict(self)
        for record, route in zip(result["routes"], self.routes):
            record["distance_km"] = round(route.distance_km, 3)
        result["metrics"] = {
            "assigned": sum(len(r.stops) for r in self.routes),
            "unassigned": len(self.unassigned),
            "engineers_used": sum(bool(r.stops) for r in self.routes),
            "distance_km": round(sum(r.distance_km for r in self.routes), 3),
        }
        return result

