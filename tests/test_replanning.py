from dataclasses import replace
import unittest

from dispatch.demo import demo_data
from dispatch.models import Engineer, Job, Point, Skill, Transport
from dispatch.planner import baseline, insertion, validate_plan
from dispatch.replanning import replan, diff_plans


class ReplanningTests(unittest.TestCase):
    def setUp(self):
        self.point = Point(55.7, 37.7)
        self.engineer = Engineer("e", "Инженер", self.point, 540, 1080,
                                 frozenset([Skill.LOCAL]), Transport.WALK)
        self.first = Job("first", "Первая", 540, 600, 30, Skill.LOCAL, self.point)
        self.next = Job("next", "Вторая", 660, 720, 30, Skill.LOCAL, Point(55.71, 37.71))
        self.urgent = Job("urgent", "Срочная", 570, 800, 20, Skill.LOCAL, self.point, urgent=True)

    def test_completed_and_in_progress_stops_unchanged(self):
        jobs = [self.first, self.next]
        previous = baseline(jobs, [self.engineer])
        for now in [550, 570, 600, 680]:
            updated, locked = replan(previous, jobs + [self.urgent], [self.engineer], now)
            old = {s.job_id: s for r in previous.routes for s in r.stops}
            new = {s.job_id: s for r in updated.routes for s in r.stops}
            self.assertIn("first", locked)
            for job_id in locked:
                self.assertEqual(new[job_id], old[job_id])
            for route in updated.routes:
                for stop in route.stops:
                    if stop.job_id not in locked:
                        self.assertGreaterEqual(stop.arrival - stop.travel_minutes, now)
            self.assertEqual(validate_plan(updated, jobs + [self.urgent], [self.engineer]), [])

    def test_idle_engineer_does_not_restart_in_the_past(self):
        previous = baseline([], [self.engineer])
        updated, _ = replan(previous, [self.urgent], [self.engineer], 700)
        self.assertEqual(updated.routes[0].stops[0].start, 700)

    def test_engineer_at_end_of_shift_cannot_take_new_job(self):
        previous = baseline([], [self.engineer])
        late = replace(self.urgent, window_start=1080, window_end=1200)
        updated, _ = replan(previous, [late], [self.engineer], 1080)
        self.assertIn(late.id, updated.unassigned)

    def test_waiting_at_client_is_frozen(self):
        previous = baseline([self.next], [self.engineer])
        updated, locked = replan(previous, [self.next, self.urgent], [self.engineer], 600)
        self.assertIn("next", locked)
        self.assertEqual(updated.routes[0].stops[0], previous.routes[0].stops[0])

    def test_repeated_replanning_remains_valid(self):
        jobs, engineers = demo_data()
        plan = insertion(jobs, engineers)
        for i, now in enumerate([660, 720, 780]):
            jobs.append(Job(f"urgent-{i}", "Учебная срочная", now, now+90, 30,
                            Skill.EMERGENCY, Point(55.71,37.76), urgent=True))
            previous = plan
            plan, locked = replan(previous, jobs, engineers, now)
            self.assertEqual(validate_plan(plan, jobs, engineers), [])
            self.assertTrue(all(c["job_id"] not in locked for c in diff_plans(previous, plan)))

    def test_new_assignment_appears_in_diff(self):
        before = baseline([], [self.engineer])
        after, _ = replan(before, [self.urgent], [self.engineer], 600)
        changes = diff_plans(before, after)
        self.assertEqual(changes[0]["job_id"], "urgent")
        self.assertIsNone(changes[0]["before"])

