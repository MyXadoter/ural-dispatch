"""Полностью вымышленный набор, не геокодированные адреса организаторов."""
from .models import Engineer, Job, Point, Skill, Transport


def demo_data() -> tuple[list[Job], list[Engineer]]:
    office = Point(55.70, 37.75)
    engineers = [Engineer(
        id=f"engineer-{i + 1}", name=f"Инженер {i + 1:02d}", start=office,
        shift_start=9 * 60, shift_end=18 * 60,
        skills=frozenset([list(Skill)[i % 3], list(Skill)[(i + 1) % 3]]),
        transport=list(Transport)[i % 4],
    ) for i in range(12)]
    jobs = []
    # Поздняя заявка поступила первой: порядок исходного baseline должен сохраниться.
    for i, start in enumerate([15, 10, 11, 12, 13, 14, 10, 11, 12, 13, 14, 15]):
        jobs.append(Job(
            id=f"demo-{i + 1:02d}", address=f"Учебная точка {i + 1} (вымышленная)",
            point=Point(55.70 + (i % 4) * 0.006, 37.75 + (i // 4) * 0.009),
            window_start=start * 60, window_end=(start + 1) * 60,
            duration=40, skill=list(Skill)[i % 3],
            required_transport=list(Transport)[i % 4] if i % 3 == 0 else None,
        ))
    jobs.append(Job("demo-conflict", "Учебная точка с невыполнимым окном",
                    8 * 60, 8 * 60 + 30, 30, Skill.LOCAL, office))
    return jobs, engineers

