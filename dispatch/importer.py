"""Импорт исходных CSV без изменения файлов организаторов."""
import csv
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path

from .models import Job, Skill

# Длительности и соответствие навыкам — предположения команды, не данные заказчика.
WORK_RULES = {
    "Конвергенция абонента": (Skill.INSTALL, 45),
    "Заявка на подключение": (Skill.INSTALL, 60),
    "Заказ подключения/Дозаказ оборудования": (Skill.INSTALL, 60),
    "Дозаказ оборудования": (Skill.INSTALL, 30),
    "Переключение на Гбит/с": (Skill.INSTALL, 45),
    "Авария": (Skill.EMERGENCY, 60),
    "Нет линка": (Skill.LOCAL, 45),
    "Разрывы": (Skill.LOCAL, 45),
    "Работа с кабелем": (Skill.LOCAL, 60),
    "Роутер. Замена техническим специалистом": (Skill.LOCAL, 30),
    "Мониторинг": (Skill.LOCAL, 30),
    "TVE/ENT. Другие ошибки": (Skill.LOCAL, 30),
    "TVE/ENT. Замена приставки техником": (Skill.LOCAL, 30),
    "Информация": (Skill.LOCAL, 20),
}
REQUIRED_COLUMNS = {"Заявка", "Тип заявки HD", "Начало", "Окончание", "Адрес"}


@dataclass
class ImportResult:
    jobs: list[Job] = field(default_factory=list)
    errors: list[dict] = field(default_factory=list)
    office_address: str | None = None
    skipped_blank_rows: int = 0
    encoding: str = ""

    def to_dict(self):
        result = asdict(self)
        result["summary"] = {
            "imported": len(self.jobs),
            "errors": len(self.errors),
            "missing_coordinates": sum(j.point is None for j in self.jobs),
        }
        result["assumptions"] = [
            "Навык и длительность заданы демонстрационной таблицей WORK_RULES.",
            "Приоритет обычный; транспортных ограничений в исходном CSV нет.",
            "Начало и окончание интерпретируются как окно начала визита.",
            "Координаты не подставляются: адреса требуют геокодирования.",
        ]
        return result


def read_csv(path: Path) -> ImportResult:
    raw = path.read_bytes()
    try:
        content, encoding = raw.decode("utf-8-sig"), "utf-8-sig"
    except UnicodeDecodeError:
        content, encoding = raw.decode("cp1251"), "cp1251"
    import io
    reader = csv.DictReader(io.StringIO(content), delimiter=";")
    if not REQUIRED_COLUMNS <= set(reader.fieldnames or []):
        raise ValueError("В CSV отсутствуют обязательные колонки")
    if "Статус BK" in reader.fieldnames:
        raise ValueError("Это контрольное распределение со статусами. Используйте синтетический набор.")
    result, seen = ImportResult(encoding=encoding), set()
    for row in reader:
        line = reader.line_num
        if None in row or any(value is None for value in row.values()):
            result.errors.append({"line": line, "reason": "Неверное число колонок"})
            continue
        row = {key: value.strip() for key, value in row.items()}
        if not any(row.values()):
            result.skipped_blank_rows += 1
            continue
        if row["Заявка"].casefold() == "адрес офиса":
            result.office_address = row.get("Тип заявки BK") or row.get("Адрес")
            continue
        try:
            if row["Заявка"] in seen:
                raise ValueError("Повторный ID заявки")
            rule = WORK_RULES.get(row["Тип заявки HD"])
            if rule is None:
                raise ValueError(f"Неизвестный тип работ: {row['Тип заявки HD']}")
            start = datetime.strptime(row["Начало"], "%d.%m.%Y %H:%M")
            end = datetime.strptime(row["Окончание"], "%d.%m.%Y %H:%M")
            if start.date() != end.date():
                raise ValueError("Окно должно находиться в пределах одного дня")
            skill, duration = rule
            result.jobs.append(Job(
                id=row["Заявка"], address=row["Адрес"],
                window_start=start.hour * 60 + start.minute,
                window_end=end.hour * 60 + end.minute,
                duration=duration, skill=skill, source=f"{path.name}:{line}",
                date=start.date().isoformat(),
            ))
            seen.add(row["Заявка"])
        except ValueError as error:
            result.errors.append({"line": line, "id": row["Заявка"], "reason": str(error)})
    return result

