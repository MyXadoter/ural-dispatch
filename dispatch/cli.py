import argparse
import json
from pathlib import Path

from .demo import demo_data
from .importer import read_csv
from .planner import baseline, insertion, validate_plan


def main():
    parser = argparse.ArgumentParser(description="Уральские самоцветы: помощник диспетчера")
    commands = parser.add_subparsers(dest="command", required=True)
    importer = commands.add_parser("import", help="Проверить и нормализовать CSV")
    importer.add_argument("path", type=Path)
    importer.add_argument("--output", type=Path)
    demo = commands.add_parser("demo", help="Сравнить алгоритмы на вымышленном наборе")
    demo.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.command == "import":
        result = read_csv(args.path).to_dict()
    else:
        jobs, engineers = demo_data()
        result = {"dataset": "Вымышленный демонстрационный набор; не адреса из CSV", "plans": []}
        for algorithm in [baseline, insertion]:
            plan = algorithm(jobs, engineers)
            errors = validate_plan(plan, jobs, engineers)
            if errors:
                raise RuntimeError(errors)
            result["plans"].append(plan.to_dict())
    serialized = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized + "\n", encoding="utf-8")
        print(f"Сохранено: {args.output}")
    else:
        print(serialized)
    if args.command == "import" and result["errors"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

