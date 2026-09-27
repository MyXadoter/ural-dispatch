"""Локальный запуск: сервер переживает закрытие окна запуска и проверяет готовность."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import signal
import sys
import time
from urllib.error import URLError
from urllib.request import urlopen
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
URL = "http://127.0.0.1:8000"


def ready():
    try:
        with urlopen(URL + "/api/health", timeout=1) as response:
            return json.load(response).get("service") == "ural-dispatch"
    except (OSError, ValueError, URLError):
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--stop", action="store_true")
    args = parser.parse_args()
    if args.stop:
        pid_file = ROOT / "output/server.pid"
        if not pid_file.exists():
            raise SystemExit("Нет сервера, запущенного через start.command.")
        pid = int(pid_file.read_text())
        command = subprocess.run(["ps", "-p", str(pid), "-o", "args="], capture_output=True, text=True).stdout
        # macOS may show the resolved framework Python instead of the venv path.
        cwd_info = subprocess.run(["lsof", "-a", "-p", str(pid), "-d", "cwd", "-Fn"], capture_output=True, text=True).stdout
        project_process = str(ROOT / ".venv") in command or f"n{ROOT}" in cwd_info.splitlines()
        if not project_process or "uvicorn dispatch.api:app" not in command:
            raise SystemExit("Процесс не совпадает с сервером проекта; ничего не остановлено.")
        os.kill(pid, signal.SIGTERM)
        pid_file.unlink(missing_ok=True)
        print("Сервер остановлен. План сохранён.")
        return
    if not ready():
        python = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        if not python.exists():
            raise SystemExit("Не найдено окружение .venv. Следуйте инструкции README.md.")
        if not (ROOT / "frontend/dist/index.html").exists():
            raise SystemExit("Сначала соберите интерфейс: bash scripts/build_frontend.sh")
        (ROOT / "output").mkdir(exist_ok=True)
        with (ROOT / "output/server.log").open("a", encoding="utf-8") as log:
            options = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
            process = subprocess.Popen(
                [str(python), "-m", "uvicorn", "dispatch.api:app", "--host", "127.0.0.1", "--port", "8000"],
                cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=log, **options,
            )
        for _ in range(50):
            if ready():
                (ROOT / "output/server.pid").write_text(str(process.pid))
                break
            if process.poll() is not None:
                raise SystemExit("Сервер не запустился. Подробности: output/server.log. Возможно, порт 8000 занят.")
            time.sleep(0.1)
        else:
            raise SystemExit("Сервер ещё не готов. Подробности: output/server.log.")
    print(f"Сайт работает: {URL}")
    print("План сохраняется автоматически. Это окно можно закрыть.")
    if not args.no_browser:
        webbrowser.open(URL)


if __name__ == "__main__":
    main()
