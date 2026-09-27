"""Демонстрационная модель: геодезическое расстояние и постоянная скорость."""
from math import asin, ceil, cos, radians, sin, sqrt

from .models import Point, Transport

SPEED_KMH = {
    Transport.CAR: 25,
    Transport.WALK: 5,
    Transport.BIKE: 15,
    Transport.TRANSIT: 18,
}
ASSUMPTIONS = [
    "Расстояния по координатам, без дорожной сети; это оценка, а не дорожный пробег.",
    "Скорости (км/ч): авто 25, пешком 5, велосипед 15, общественный транспорт 18.",
    "Пробки, парковка, расписание транспорта и пересадки не моделируются.",
    "Окно ограничивает начало работы; завершение должно укладываться в смену.",
    "Возвращение в стартовую точку после последней заявки не требуется.",
]


def travel(a: Point, b: Point, transport: Transport) -> tuple[float, int]:
    lat1, lat2 = radians(a.lat), radians(b.lat)
    dlat, dlon = lat2 - lat1, radians(b.lon - a.lon)
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    km = 6371.0088 * 2 * asin(sqrt(min(1, max(0, h))))
    return km, ceil(km / SPEED_KMH[transport] * 60)

