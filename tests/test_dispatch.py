import csv
from dataclasses import replace
from pathlib import Path
import tempfile
import unittest

from dispatch.demo import demo_data
from dispatch.importer import read_csv
from dispatch.models import Engineer, Job, Point, Skill, Transport
from dispatch.planner import baseline, insertion, validate_plan
from dispatch.travel import travel

ROOT = Path(__file__).resolve().parents[1]


class SchedulingTests(unittest.TestCase):
    def setUp(self):
        self.point = Point(55.7, 37.7)
        self.engineer = Engineer("e", "Инженер", self.point, 540, 1080,
                                 frozenset([Skill.LOCAL]), Transport.WALK)
        self.job = Job("j", "Учебная точка", 600, 660, 30, Skill.LOCAL, self.point)

    def test_wait_for_window(self):
        stop = baseline([self.job], [self.engineer]).routes[0].stops[0]
        self.assertEqual((stop.arrival, stop.start, stop.end), (540, 600, 630))

    def test_only_start_must_fit_window(self):
        job = replace(self.job, window_start=600, window_end=600, duration=90)
        self.assertEqual(baseline([job], [self.engineer]).routes[0].stops[0].end, 690)

    def test_work_must_finish_within_shift(self):
        job = replace(self.job, window_start=1070, window_end=1080)
        self.assertIn(job.id, baseline([job], [self.engineer]).unassigned)

    def test_skill_rejection(self):
        plan = baseline([replace(self.job, skill=Skill.EMERGENCY)], [self.engineer])
        self.assertIn("навыком", plan.unassigned["j"])

    def test_transport_rejection(self):
        plan = baseline([replace(self.job, required_transport=Transport.CAR)], [self.engineer])
        self.assertIn("транспорта", plan.unassigned["j"])

    def test_missing_coordinates(self):
        plan = baseline([replace(self.job, point=None)], [self.engineer])
        self.assertIn("координат", plan.unassigned["j"])

    def test_baseline_preserves_order_and_first_engineer(self):
        late = replace(self.job, id="late", window_start=900, window_end=960)
        second = replace(self.engineer, id="second")
        plan = baseline([late, self.job], [self.engineer, second])
        self.assertEqual([s.job_id for s in plan.routes[0].stops], ["late"])
        self.assertEqual([s.job_id for s in plan.routes[1].stops], ["j"])

    def test_insertion_can_use_fewer_engineers(self):
        late = replace(self.job, id="late", window_start=900, window_end=960)
        engineers = [self.engineer, replace(self.engineer, id="second")]
        plan = insertion([late, self.job], engineers)
        self.assertEqual(plan.to_dict()["metrics"]["engineers_used"], 1)
        self.assertEqual(validate_plan(plan, [late, self.job], engineers), [])

    def test_overlap_leaves_explicit_rejection(self):
        jobs = [replace(self.job, window_end=600),
                replace(self.job, id="second", window_end=600)]
        plan = baseline(jobs, [self.engineer])
        self.assertEqual(len(plan.unassigned), 1)

    def test_distance_includes_start_but_no_return(self):
        job = replace(self.job, point=Point(55.71, 37.71))
        plan = baseline([job], [self.engineer])
        km, minutes = travel(self.engineer.start, job.point, self.engineer.transport)
        self.assertAlmostEqual(plan.routes[0].distance_km, km)
        self.assertEqual(plan.routes[0].stops[0].arrival, 540 + minutes)

    def test_duplicate_ids_rejected(self):
        with self.assertRaises(ValueError):
            baseline([self.job, self.job], [self.engineer])

    def test_multiple_dates_rejected(self):
        with self.assertRaises(ValueError):
            baseline([self.job, replace(self.job, id="next", date="2026-08-18")], [self.engineer])

    def test_validator_detects_corrupted_schedule(self):
        plan = baseline([self.job], [self.engineer])
        plan.routes[0].stops[0] = replace(plan.routes[0].stops[0], arrival=0, end=9999)
        self.assertGreaterEqual(len(validate_plan(plan, [self.job], [self.engineer])), 2)

    def test_validator_detects_lost_job(self):
        plan = baseline([self.job], [self.engineer])
        plan.routes[0].stops.clear()
        self.assertTrue(validate_plan(plan, [self.job], [self.engineer]))

    def test_validator_detects_duplicate_engineer(self):
        plan = baseline([self.job], [self.engineer])
        plan.routes.append(plan.routes[0])
        self.assertTrue(validate_plan(plan, [self.job], [self.engineer]))

    def test_empty_inputs(self):
        for algorithm in [baseline, insertion]:
            self.assertEqual(algorithm([], []).to_dict()["metrics"]["assigned"], 0)
            self.assertIn("j", algorithm([self.job], []).unassigned)

    def test_demo_all_jobs_accounted_for(self):
        jobs, engineers = demo_data()
        for algorithm in [baseline, insertion]:
            plan = algorithm(jobs, engineers)
            self.assertEqual(validate_plan(plan, jobs, engineers), [])
            self.assertEqual(plan.to_dict()["metrics"]["assigned"] + len(plan.unassigned), len(jobs))
            self.assertIn("demo-conflict", plan.unassigned)


class ImportTests(unittest.TestCase):
    def test_real_vostok_file(self):
        result = read_csv(ROOT / "Обезличивание/Восток Синтетические данные.csv")
        self.assertEqual(len(result.jobs), 66)
        self.assertEqual(result.errors, [])
        self.assertEqual(result.encoding, "cp1251")
        self.assertEqual(result.skipped_blank_rows, 2)
        self.assertIn("Юных Ленинцев", result.office_address)
        self.assertTrue(all(j.point is None for j in result.jobs))

    def test_control_data_needs_separate_status_policy(self):
        with self.assertRaisesRegex(ValueError, "контрольное"):
            read_csv(ROOT / "Обезличивание/Восток Контрольное распределение..csv")

    def test_invalid_rows_reported_not_silently_accepted(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "input.csv"
            with path.open("w", encoding="utf-8-sig", newline="") as stream:
                writer = csv.writer(stream, delimiter=";")
                writer.writerow(["Заявка", "Тип заявки HD", "Начало", "Окончание", "Адрес"])
                writer.writerow(["1", "Нет линка", "17.08.2026 10:00", "17.08.2026 12:00", "Адрес"])
                writer.writerow(["1", "Нет линка", "17.08.2026 10:00", "17.08.2026 12:00", "Адрес"])
                writer.writerow(["2", "Неизвестный тип", "17.08.2026 10:00", "17.08.2026 12:00", "Адрес"])
                writer.writerow(["3", "Нет линка", "17.08.2026 12:00", "17.08.2026 10:00", "Адрес"])
            result = read_csv(path)
            self.assertEqual(len(result.jobs), 1)
            self.assertEqual(len(result.errors), 3)


if __name__ == "__main__":
    unittest.main()

