#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -x .venv/bin/python ]]; then
  echo "Создайте окружение по инструкции README.md."
  exit 1
fi
if [[ ! -f frontend/dist/index.html ]]; then
  bash scripts/build_frontend.sh
fi
exec .venv/bin/python scripts/serve.py "$@"
