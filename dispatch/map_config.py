"""Only the browser Maps API key is exposed; unrelated environment values stay private."""
import os
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


def yandex_key() -> str:
    configured = os.environ.get("YANDEX_MAPS_API_KEY")
    if configured is not None:
        return configured.strip()
    if not ENV_FILE.is_file():
        return ""
    # Read one literal setting. Never execute/source the environment file.
    for line in ENV_FILE.read_text(encoding="utf-8-sig").splitlines():
        name, separator, value = line.partition("=")
        if separator and name.strip() == "YANDEX_MAPS_API_KEY":
            return value.strip().strip("\"'")
    return ""
