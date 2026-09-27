#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
runtime="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"
if ! command -v node >/dev/null 2>&1 && [[ -x "$runtime/node/bin/node" ]]; then
  export PATH="$runtime/node/bin:$PATH"
fi
if command -v pnpm >/dev/null 2>&1; then
  package_manager="$(command -v pnpm)"
elif [[ -x "$runtime/bin/fallback/pnpm" ]]; then
  package_manager="$runtime/bin/fallback/pnpm"
else
  echo "Для сборки нужны Node.js 22+ и pnpm 11. Инструкция в README.md."
  exit 1
fi
cd frontend
if [[ ! -d node_modules ]]; then
  "$package_manager" install --frozen-lockfile
fi
"$package_manager" run build
