# Локальный запуск «Уральских самоцветов» v0.1.0

Приложение открывается по адресу **http://127.0.0.1:8000**. Backend на Python раздаёт API и собранный React-интерфейс; отдельная база данных не нужна. Все команды выполняйте из папки проекта, где находятся `pyproject.toml` и этот файл.

## Что установить

- Python 3.11 или новее; релиз проверен на Python 3.13. При установке Python в Windows включите добавление в PATH.
- Для сборки исходников — Node.js 22+ вместе с npm, затем `npm install --global pnpm@11.19.0`.
- Git нужен только для клонирования. Можно скачать ZIP через GitHub и распаковать его.

Интернет нужен для установки зависимостей и загрузки подложки карты. Ключ Яндекс Карт необязателен: без него автоматически используется OpenStreetMap.

## Вариант 1: архив релиза с готовым интерфейсом

В разделе **Releases** скачайте вложение `ural-dispatch-v0.1.0.zip` и распакуйте. В нём уже есть `frontend/dist`. Автоматический архив **Source code (zip)** содержит только исходники — для него используйте вариант 2 ниже.

Для готового архива нужны только Python и интернет для установки Python-зависимостей. Node.js и pnpm не требуются.

### macOS и Linux

Откройте терминал в распакованной папке `ural-dispatch-v0.1.0`:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -c constraints.txt -e '.[api]'
.venv/bin/python -m uvicorn dispatch.api:app --host 127.0.0.1 --port 8000
```

Откройте **http://127.0.0.1:8000**. Терминал должен оставаться открытым; остановка — **Ctrl+C**.

### Windows, PowerShell

Откройте PowerShell в распакованной папке `ural-dispatch-v0.1.0`:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -c constraints.txt -e ".[api]"
.\.venv\Scripts\python.exe -m uvicorn dispatch.api:app --host 127.0.0.1 --port 8000
```

Откройте **http://127.0.0.1:8000**. Остановка — **Ctrl+C**. Активация окружения и изменение политики PowerShell не нужны. Если команда `py` недоступна, используйте `python` при создании окружения.

## Вариант 2: исходники из GitHub

Откройте публичный репозиторий [MyXadoter/ural-dispatch](https://github.com/MyXadoter/ural-dispatch). Нажмите **Code → Download ZIP**, распакуйте архив и откройте терминал в папке проекта. Вход в GitHub не требуется. Если установлен Git, можно клонировать репозиторий:

```bash
git clone https://github.com/MyXadoter/ural-dispatch.git
cd ural-dispatch
```

### macOS и Linux

```bash
npm install --global pnpm@11.19.0
python3 -m venv .venv
.venv/bin/python -m pip install -c constraints.txt -e '.[api]'
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend build
.venv/bin/python -m uvicorn dispatch.api:app --host 127.0.0.1 --port 8000
```

### Windows, PowerShell

```powershell
npm.cmd install --global pnpm@11.19.0
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -c constraints.txt -e ".[api]"
pnpm.cmd --dir frontend install --frozen-lockfile
pnpm.cmd --dir frontend build
.\.venv\Scripts\python.exe -m uvicorn dispatch.api:app --host 127.0.0.1 --port 8000
```

На обеих системах откройте **http://127.0.0.1:8000**; остановка — **Ctrl+C**. Команды с `.cmd` в Windows обходят необходимость запускать PowerShell-скрипты npm/pnpm.

## Повторный запуск

Зависимости устанавливаются один раз. Для следующих запусков из папки проекта достаточно последней команды `uvicorn` для вашей системы.

В macOS можно запустить сервер в фоне и автоматически открыть браузер:

```bash
bash start.command
```

После этого окно запуска можно закрыть. Остановка фонового сервера:

```bash
bash stop.command
```

Также можно открыть `start.command` двойным щелчком. Если macOS не разрешает запуск скачанного файла, используйте команду в терминале выше. Лог фонового сервера: `output/server.log`.

## Проверка работы

1. Откройте http://127.0.0.1:8000/api/health — ожидается `{"status":"ok","service":"ural-dispatch"}`.
2. Откройте http://127.0.0.1:8000 — должен появиться интерфейс диспетчера с учебным днём.
3. В «Планировании» отображаются 13 учебных заявок, из них 12 назначены.
4. В «Исходных данных» доступны 66 заявок «Востока».
5. Добавьте «Срочную заявку» и проверьте раздел «Что изменилось».

API-документация: http://127.0.0.1:8000/docs.

Автоматические проверки, macOS/Linux:

```bash
.venv/bin/python -m unittest discover -s tests -v
pnpm --dir frontend test:maps
```

Windows:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
pnpm.cmd --dir frontend test:maps
```

Для проверки карты через `test:maps` нужны Node.js и установленные frontend-зависимости даже при использовании готового архива. В релизе проверены 37 Python-тестов и 5 тестов загрузчика карты. Команды запуска и готовый архив проверены на macOS; Windows и Linux на отдельных машинах не проверялись.

## Необязательная настройка Яндекс Карт

Скопируйте `.env.example` в `.env` рядом с `pyproject.toml` и укажите свой браузерный ключ:

```dotenv
YANDEX_MAPS_API_KEY=ваш_ключ
```

Для локального запуска настройте разрешённые HTTP Referer `localhost` и `127.0.0.1` в кабинете Яндекса. Обновите страницу и нажмите «Включить Яндекс». Без этой настройки можно пользоваться OpenStreetMap. Файл `.env` не входит в релиз и не должен попадать в Git.

## Разработка

Запустите API командой `uvicorn` выше. Во втором терминале из корня проекта выполните:

```bash
pnpm --dir frontend dev
```

В PowerShell используйте `pnpm.cmd`. Откройте адрес, который выведет Vite (обычно http://127.0.0.1:5173). Запросы `/api` проксируются на порт 8000. После изменения интерфейса пересоберите его командой `pnpm --dir frontend build` для обычного запуска на порту 8000.

## Если не запускается

| Симптом | Что сделать |
| --- | --- |
| `python3`, `py`, `npm` или `pnpm` не найдены | Установите нужный инструмент, откройте новый терминал и проверьте его командой `--version`. |
| `No module named uvicorn` | Повторите команду установки `pip install -c constraints.txt -e '.[api]'` именно через Python из `.venv`. |
| На странице ошибка 503 | Нет собранного интерфейса. Выполните установку frontend-зависимостей и `pnpm --dir frontend build`. |
| Порт 8000 занят | Остановите ранее запущенный экземпляр. Для `start.command` используйте `bash stop.command`; для обычного запуска — Ctrl+C в его терминале. |
| На карте нет подложки | Проверьте интернет. При проблемах с Яндексом выберите OpenStreetMap. |
| В исходных данных ошибка 404 | Сохраните папку `Обезличивание` рядом с `dispatch`; не переносите только код без CSV. |
| Браузер показывает исходный HTML | Открывайте http://127.0.0.1:8000, а не файл `frontend/index.html`. |

Планы автоматически сохраняются в `output/sessions`. Эта папка создаётся при работе и не входит в релиз. Обновление страницы и перезапуск сервера сохраняют текущий день; кнопка «Новый день» создаёт отдельную сессию. При обновлении проекта сохраняйте свою папку `output` и файл `.env`.

## Границы прототипа

Маршруты рассчитываются на учебных координатах. Исходный CSV доступен отдельно; геокодирование и дорожная матрица ещё не подключены. Расстояния оцениваются по координатам, OR-Tools и авторизация пока не реализованы. Подробности — в [README.md](README.md).
