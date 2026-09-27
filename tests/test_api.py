import importlib.util
import json
import unittest
import tempfile
from unittest.mock import patch
from pathlib import Path


@unittest.skipUnless(importlib.util.find_spec("fastapi"), "Установите зависимости .[api]")
class ApiTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        from dispatch import api
        self.state = tempfile.TemporaryDirectory()
        self.previous_dir = api.STATE_DIR
        api.STATE_DIR = Path(self.state.name)
        api.scenarios.clear()

    def tearDown(self):
        from dispatch import api
        api.STATE_DIR = self.previous_dir
        api.scenarios.clear()
        self.state.cleanup()

    async def get_json(self, path, body=None, expected_status=200):
        from dispatch.api import app
        messages = []

        async def receive():
            return {"type": "http.request", "body": json.dumps(body).encode() if body is not None else b"", "more_body": False}

        async def send(message):
            messages.append(message)

        await app({
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
            "method": "POST" if body is not None else "GET", "scheme": "http", "path": path,
            "raw_path": path.encode(), "query_string": b"", "root_path": "",
            "headers": [(b"content-type", b"application/json")], "server": ("test", 80), "client": ("test", 10000),
        }, receive, send)
        self.assertEqual(messages[0]["status"], expected_status)
        return json.loads(b"".join(m.get("body", b"") for m in messages))

    async def test_health(self):
        self.assertEqual(await self.get_json("/api/health"), {"status": "ok", "service": "ural-dispatch"})

    async def test_maps_config_only_exposes_browser_key(self):
        with patch.dict("os.environ", {"YANDEX_MAPS_API_KEY": "browser-test-key", "PRIVATE_TOKEN": "not-for-browser"}):
            result = await self.get_json("/api/maps/config")
        self.assertEqual(result, {"provider": "yandex", "api_key": "browser-test-key"})

    async def test_maps_config_missing_and_file_refresh(self):
        from dispatch import map_config
        path = Path(self.state.name) / ".env"
        with patch.object(map_config, "ENV_FILE", path), patch.dict("os.environ", {}, clear=True):
            self.assertEqual((await self.get_json("/api/maps/config"))["api_key"], "")
            path.write_text('# comment\nPRIVATE_TOKEN=keep-private\nYANDEX_MAPS_API_KEY="first-key"\n')
            self.assertEqual((await self.get_json("/api/maps/config"))["api_key"], "first-key")
            path.write_text("YANDEX_MAPS_API_KEY=second-key\n")
            self.assertEqual((await self.get_json("/api/maps/config"))["api_key"], "second-key")

    async def test_comparison_serialization(self):
        result = await self.get_json("/api/demo/compare")
        self.assertEqual(len(result["plans"]), 2)
        for plan in result["plans"]:
            self.assertEqual(plan["metrics"]["assigned"], 12)
            self.assertEqual(plan["metrics"]["unassigned"], 1)
            self.assertEqual(len(plan["routes"]), 12)

    def urgent_payload(self, version=1, event_time=720):
        return {"version": version, "event_time": event_time, "address": "Учебная срочная",
                "lat":55.712,"lon":37.765,"window_start":720,"window_end":840,
                "duration":45,"skill":"Аварийные работы","required_transport":None}

    async def test_urgent_event_and_stale_version(self):
        original = await self.get_json("/api/scenarios/demo", {})
        path = f"/api/scenarios/{original['id']}/urgent"
        result = await self.get_json(path, self.urgent_payload())
        self.assertEqual(len(result["jobs"]), 14)
        self.assertEqual(result["version"], 2)
        self.assertEqual(result["now"], 720)
        self.assertTrue(result["locked_job_ids"])
        await self.get_json(path, self.urgent_payload(), 409)
        await self.get_json(path, self.urgent_payload(version=2, event_time=700), 422)

    async def test_invalid_event_does_not_mutate_scenario(self):
        original = await self.get_json("/api/scenarios/demo", {})
        path = f"/api/scenarios/{original['id']}/urgent"
        invalid = self.urgent_payload()
        invalid["window_end"] = 600
        await self.get_json(path, invalid, 422)
        invalid = self.urgent_payload()
        invalid["lat"] = 100
        await self.get_json(path, invalid, 422)
        valid = await self.get_json(path, self.urgent_payload())
        self.assertEqual(valid["version"], 2)

    async def test_separate_sessions(self):
        first = await self.get_json("/api/scenarios/demo", {})
        second = await self.get_json("/api/scenarios/demo", {})
        self.assertNotEqual(first["id"], second["id"])
        for scenario in [first, second]:
            result = await self.get_json(f"/api/scenarios/{scenario['id']}/urgent", self.urgent_payload())
            self.assertEqual(result["version"], 2)

    async def test_original_data_has_no_invented_coordinates(self):
        result = await self.get_json("/api/source/vostok")
        self.assertEqual(result["summary"]["imported"], 66)
        self.assertEqual(result["summary"]["missing_coordinates"], 66)

    async def test_missing_session(self):
        await self.get_json("/api/scenarios/missing/urgent", self.urgent_payload(), 404)

    async def test_saved_plan_survives_memory_reset(self):
        from dispatch import api
        original = await self.get_json('/api/scenarios/demo', {})
        updated = await self.get_json(f"/api/scenarios/{original['id']}/urgent", self.urgent_payload())
        api.scenarios.clear()
        restored = await self.get_json(f"/api/scenarios/{original['id']}")
        self.assertEqual(updated, restored)

    async def test_corrupt_file_kept_and_reported(self):
        from dispatch import api
        original = await self.get_json('/api/scenarios/demo', {})
        path = api.STATE_DIR / f"{original['id']}.json"
        path.write_text('broken', encoding='utf-8')
        api.scenarios.clear()
        await self.get_json(f"/api/scenarios/{original['id']}", expected_status=422)
        self.assertEqual(path.read_text(), 'broken')
