import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Database,
  Gem,
  GitCompareArrows,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  MapPin,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
  Zap,
  AlertCircle,
  LockKeyhole,
  Car,
  Footprints,
  Bike,
  Bus,
} from "lucide-react";
import { RouteMap } from "./Map";
import {
  request,
  time,
  km,
  colors,
  plural,
  type Scenario,
  type Job,
  type Plan,
  type Engineer,
} from "./types";
import "./styles.css";
import "./responsive.css";

const skills = [
  "Локальные работы",
  "Работы на подключение и дозаказы",
  "Аварийные работы",
];
const transports = [
  "Автомобиль",
  "Пешеход",
  "Велосипед",
  "Общественный транспорт",
];
const transportIcon = (name: string) =>
  name === "Автомобиль" ? (
    <Car size={14} aria-hidden="true" />
  ) : name === "Пешеход" ? (
    <Footprints size={14} aria-hidden="true" />
  ) : name === "Велосипед" ? (
    <Bike size={14} aria-hidden="true" />
  ) : (
    <Bus size={14} aria-hidden="true" />
  );
type Page = "plan" | "jobs" | "team" | "compare" | "source";
const navigation = [
  { id: "plan", label: "Планирование", icon: LayoutDashboard },
  { id: "jobs", label: "Заявки", icon: ListChecks },
  { id: "team", label: "Инженеры", icon: Users },
  { id: "compare", label: "Сравнение", icon: GitCompareArrows },
  { id: "source", label: "Исходные данные", icon: Database },
] as const;

function readPage(): Page {
  const hash = window.location.hash.slice(1);
  return navigation.some((item) => item.id === hash) ? (hash as Page) : "plan";
}

function App() {
  const [data, setData] = useState<Scenario | null>(null),
    [page, setPageState] = useState<Page>(readPage);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousPage = useRef(page);
  function setPage(next: Page) {
    setPageState(next);
    if (window.location.hash !== `#${next}`) window.location.hash = next;
  }
  useEffect(() => {
    const syncPage = () => {
      setPageState(readPage());
      setQuery("");
    };
    window.addEventListener("hashchange", syncPage);
    return () => window.removeEventListener("hashchange", syncPage);
  }, []);
  useEffect(() => {
    if (previousPage.current !== page) {
      window.scrollTo({ top: 0, behavior: "instant" });
      heading.current?.focus({ preventScroll: true });
      previousPage.current = page;
    }
  }, [page]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<string | null>(null);
  const [engineer, setEngineer] = useState<string | null>(null),
    [mode, setMode] = useState(1),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all");
  const [notice, setNotice] = useState(""),
    [source, setSource] = useState<{
      jobs: Job[];
      summary: {
        imported: number;
        errors: number;
        missing_coordinates: number;
      };
      office_address: string;
      assumptions: string[];
    } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  async function reset(resume = false) {
    setBusy(true);
    setError("");
    try {
      let result: Scenario;
      const saved = resume ? sessionStorage.getItem("ural-scenario") : null;
      if (saved) {
        try {
          result = await request<Scenario>(`/api/scenarios/${saved}`);
        } catch (error) {
          if ((error as { status?: number }).status !== 404) throw error;
          result = await request<Scenario>("/api/scenarios/demo", {});
        }
      } else result = await request<Scenario>("/api/scenarios/demo", {});
      setData(result);
      sessionStorage.setItem("ural-scenario", result.id);
      setSelected(
        result.version > 1 ? result.jobs.at(-1)!.id : result.jobs[1].id,
      );
      setEngineer(null);
      setMode(1);
      setNotice(
        resume && saved
          ? "Сохранённый план восстановлен."
          : "Учебный день открыт. План рассчитан.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void reset(true);
  }, []);
  async function loadSource() {
    setError("");
    try {
      setSource(await request<typeof source>("/api/source/vostok"));
    } catch (error) {
      setError((error as Error).message);
    }
  }
  useEffect(() => {
    if (page === "source" && !source) {
      void loadSource();
    }
  }, [page, source]);
  const plan = data?.plans[mode];
  const currentJob = data?.jobs.find((j) => j.id === selected);
  const jobRoute = plan?.routes.find((r) =>
    r.stops.some((s) => s.job_id === selected),
  );
  const stop = jobRoute?.stops.find((s) => s.job_id === selected);
  const currentEngineer = data?.engineers.find(
    (e) => e.id === jobRoute?.engineer_id,
  );
  function chooseJob(id: string) {
    setSelected(id);
  }
  function download() {
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "dispatch-plan.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  const active =
    data?.engineers.filter(
      (e) => plan?.routes.find((r) => r.engineer_id === e.id)?.stops.length,
    ) || [];
  return (
    <div className="app">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          heading.current?.focus();
        }}
      >
        Перейти к содержимому
      </a>
      <aside className="sidebar">
        <a
          href="#plan"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setPage("plan");
          }}
        >
          <span className="brand-mark">
            <Gem size={25} strokeWidth={1.6} aria-hidden="true" />
          </span>
          <span>
            самоцветы<small>помощник диспетчера</small>
          </span>
        </a>
        <div className="workspace-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <nav aria-label="Основная навигация">
          {navigation.map((n) => (
            <button
              key={n.id}
              aria-label={n.label}
              title={n.label}
              className={`nav-item ${page === n.id ? "active" : ""}`}
              aria-current={page === n.id ? "page" : undefined}
              onClick={() => {
                setPage(n.id);
                setQuery("");
              }}
            >
              <n.icon size={19} aria-hidden="true" />
              <span className="nav-full">{n.label}</span>
              <span className="nav-short" aria-hidden="true">
                {
                  {
                    plan: "План",
                    jobs: "Заявки",
                    team: "Команда",
                    compare: "Сравнить",
                    source: "Данные",
                  }[n.id]
                }
              </span>
              {n.id === "jobs" && data && (
                <span className="nav-count">{data.jobs.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-card">
            <span className="eyebrow">
              <span className="live-dot" /> ДЕМО-РЕЖИМ
            </span>
            <p>
              Один день.
              <br />
              Все маршруты на виду.
            </p>
            <small>
              Учебные заявки и инженеры.
              <br />
              Можно смело экспериментировать.
            </small>
            <button onClick={() => reset()} disabled={busy}>
              <RefreshCw size={15} aria-hidden="true" /> Новый учебный день
            </button>
          </div>
          <div className="team-sign">
            <span className="avatar">УС</span>
            <div>
              Уральские самоцветы<small>Команда разработки</small>
            </div>
          </div>
        </div>
      </aside>
      <main id="main-content">
        <header className="topbar">
          <div>
            <span className="breadcrumb-parent">Диспетчерская</span>{" "}
            <ChevronRight size={14} aria-hidden="true" />
            <strong>{navigation.find((n) => n.id === page)?.label}</strong>
          </div>
          <div className="topbar-right">
            <button
              className="restart-day"
              onClick={() => reset()}
              disabled={busy}
              title="Открыть новый учебный день"
            >
              <RefreshCw size={15} aria-hidden="true" />
              <span>Новый день</span>
            </button>
            <span className="connection">
              <span className="live-dot" />{" "}
              {error
                ? "Требуется внимание"
                : busy
                  ? "Сохраняем план"
                  : data
                    ? "План сохранён"
                    : "Подключение"}
            </span>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">МОСКВА · УЧЕБНЫЙ СЦЕНАРИЙ</div>
              <h1 ref={heading} tabIndex={-1}>
                {page === "plan"
                  ? "План на день"
                  : page === "jobs"
                    ? "Все заявки"
                    : page === "team"
                      ? "Ваша команда"
                      : page === "compare"
                        ? "Сравнение планов"
                        : "Данные организаторов"}
              </h1>
              <p>
                {page === "plan"
                  ? "Меньше ручной работы. Больше ясности в каждом маршруте."
                  : page === "compare"
                    ? "Одинаковые заявки и ограничения. Два способа распределения."
                    : page === "source"
                      ? "Исходные адреса сохранены без подстановки учебных координат."
                      : page === "team"
                        ? `${data?.engineers.length || 12} инженеров. Навыки, транспорт и загрузка каждого.`
                        : "Найдите заявку, проверьте назначение и откройте детали визита."}
              </p>
            </div>
            <div className="heading-actions">
              <span className="date-pill">
                <CalendarDays size={16} aria-hidden="true" />
                17 августа 2026
              </span>
              <button
                className="primary"
                disabled={!data || busy}
                onClick={() => dialog.current?.showModal()}
              >
                <Plus size={18} aria-hidden="true" /> Срочная заявка
              </button>
            </div>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} aria-hidden="true" />
              {error}
              <button
                onClick={() => {
                  setError("");
                  if (page === "source") void loadSource();
                  else void reset(true);
                }}
              >
                Повторить
              </button>
            </div>
          )}
          <div className="sr-only" role="status" aria-live="polite">
            {notice}
          </div>
          {!data || !plan ? (
            <div className="loading">
              {error ? (
                <AlertCircle aria-hidden="true" />
              ) : (
                <LoaderCircle className="spin" aria-hidden="true" />
              )}
              <p>
                {error ? "Не удалось загрузить план" : "Собираем рабочий день…"}
              </p>
            </div>
          ) : (
            <>
              {page === "plan" && (
                <div className="metrics">
                  <Metric
                    label="Заявки в плане"
                    value={
                      <>
                        {plan.metrics.assigned}
                        <small> / {data.jobs.length}</small>
                      </>
                    }
                    caption="с учётом всех ограничений"
                    icon={<ListChecks aria-hidden="true" />}
                    featured
                    progress={
                      data.jobs.length
                        ? Math.round(
                            (plan.metrics.assigned / data.jobs.length) * 100,
                          )
                        : 0
                    }
                  />
                  <Metric
                    label="Инженеры на маршруте"
                    value={
                      <>
                        {plan.metrics.engineers_used}
                        <small> / {data.engineers.length}</small>
                      </>
                    }
                    caption={`${data.engineers.length - plan.metrics.engineers_used} в резерве`}
                    icon={<Users aria-hidden="true" />}
                  />
                  <Metric
                    label="Суммарное расстояние"
                    value={
                      <>
                        {km(plan.metrics.distance_km)}
                        <small> км</small>
                      </>
                    }
                    caption="оценка по координатам"
                    icon={<RouteIcon aria-hidden="true" />}
                  />
                  <Metric
                    label="Требуют внимания"
                    value={plan.metrics.unassigned}
                    caption={
                      plan.metrics.unassigned === 0
                        ? "все заявки распределены"
                        : `${plan.metrics.unassigned === 1 ? "не назначена" : "не назначены"} · есть объяснение`
                    }
                    icon={<AlertCircle aria-hidden="true" />}
                    warning={plan.metrics.unassigned > 0}
                    onClick={() => {
                      setPage("jobs");
                      setStatus("unassigned");
                    }}
                  />
                </div>
              )}
              {data.version > 1 && page === "plan" && (
                <div className="event-banner">
                  <span className="event-icon">
                    <Zap size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>План обновлён в {time(data.now)}</strong>
                    <span>
                      Изменений: {data.changes.length}. Зафиксировано визитов:{" "}
                      {data.locked_job_ids.length}.
                    </span>
                  </div>
                  <button onClick={() => setPage("compare")}>
                    Что изменилось <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
              )}
              {page === "plan" && (
                <section className="panel planning">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        Маршруты инженеров{" "}
                        <span className="count-pill">{active.length}</span>
                      </h2>
                      <span className="muted">
                        Выберите инженера или точку на карте
                      </span>
                    </div>
                    <div
                      className="segmented"
                      aria-label="Алгоритм планирования"
                    >
                      <button
                        aria-pressed={mode === 0}
                        className={mode === 0 ? "chosen" : ""}
                        onClick={() => {
                          setMode(0);
                          setEngineer(null);
                        }}
                      >
                        Базовый
                      </button>
                      <button
                        aria-pressed={mode === 1}
                        className={mode === 1 ? "chosen" : ""}
                        onClick={() => {
                          setMode(1);
                          setEngineer(null);
                        }}
                      >
                        <Zap size={14} aria-hidden="true" /> Улучшенный
                      </button>
                    </div>
                  </div>
                  <div className="planning-body">
                    <div className="engineer-list">
                      <button
                        className={`all-engineers ${!engineer ? "selected" : ""}`}
                        aria-pressed={!engineer}
                        onClick={() => setEngineer(null)}
                      >
                        <span>
                          <Users size={17} aria-hidden="true" /> Все маршруты
                        </span>
                        <span>{active.length}</span>
                      </button>
                      {active.map((e) => {
                        const route = plan.routes.find(
                          (r) => r.engineer_id === e.id,
                        )!;
                        const color =
                          colors[data.engineers.indexOf(e) % colors.length];
                        return (
                          <button
                            className={`engineer-row ${engineer === e.id ? "selected" : ""}`}
                            key={e.id}
                            aria-pressed={engineer === e.id}
                            onClick={() => {
                              setEngineer(e.id);
                              setSelected(route.stops[0].job_id);
                            }}
                          >
                            <div className="engineer-row-top">
                              <span
                                className="person-avatar"
                                style={
                                  {
                                    "--route-color": color,
                                  } as React.CSSProperties
                                }
                              >
                                {e.name.split(" ")[1]}
                              </span>
                              <div>
                                <strong>{e.name}</strong>
                                <small>
                                  {transportIcon(e.transport)}
                                  {e.transport}
                                </small>
                              </div>
                              <ChevronRight size={15} aria-hidden="true" />
                            </div>
                            <div className="engineer-row-bottom">
                              <span>
                                {route.stops.length}{" "}
                                {plural(
                                  route.stops.length,
                                  "заявка",
                                  "заявки",
                                  "заявок",
                                )}
                              </span>
                              <span>{km(route.distance_km)} км</span>
                            </div>
                            <div className="workload">
                              <span
                                style={{
                                  width: `${Math.min(100, (route.stops.reduce((sum, s) => sum + s.end - s.start + s.travel_minutes, 0) / (e.shift_end - e.shift_start)) * 100)}%`,
                                  background: color,
                                }}
                              />
                            </div>
                          </button>
                        );
                      })}
                      <div className="reserve-note">
                        <ShieldCheck size={16} aria-hidden="true" />
                        <span>
                          В резерве: {data.engineers.length - active.length}{" "}
                          {plural(
                            data.engineers.length - active.length,
                            "инженер",
                            "инженера",
                            "инженеров",
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="map-column">
                      <RouteMap
                        scenario={data}
                        plan={plan}
                        engineer={engineer}
                        selected={selected}
                        onSelect={chooseJob}
                      />
                      <div className="map-footer">
                        <span>
                          <i className="legend-office" />
                          Стартовая точка
                        </span>
                        <span>
                          <i className="legend-dot" />
                          Заявка
                        </span>
                        <span>
                          <i className="legend-alert" />
                          Не назначена
                        </span>
                        <button onClick={download}>
                          <ArrowDownToLine size={15} aria-hidden="true" />{" "}
                          Скачать план
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              )}
              {page === "plan" && (
                <div className="below-grid">
                  <section className="panel schedule-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          {engineer
                            ? data.engineers.find((e) => e.id === engineer)
                                ?.name
                            : "Расписание дня"}
                        </h2>
                        <span className="muted">
                          {engineer
                            ? "Порядок работ на маршруте"
                            : `Расписание · время сценария ${time(data.now)}`}
                        </span>
                      </div>
                      <Clock3 size={20} aria-hidden="true" />
                    </div>
                    <div className="visit-list">
                      {!plan.routes.some(
                        (r) =>
                          (!engineer || r.engineer_id === engineer) &&
                          r.stops.length > 0,
                      ) && (
                        <div className="empty">
                          Назначенных визитов пока нет. Инженер остаётся в
                          резерве.
                        </div>
                      )}
                      {plan.routes
                        .filter((r) => !engineer || r.engineer_id === engineer)
                        .flatMap((r) =>
                          r.stops.map((s) => ({
                            ...s,
                            engineer_id: r.engineer_id,
                          })),
                        )
                        .sort((a, b) => a.start - b.start)
                        .map((s) => {
                          const job = data.jobs.find((j) => j.id === s.job_id)!;
                          return (
                            <button
                              key={s.job_id}
                              className={`visit ${selected === s.job_id ? "selected" : ""}`}
                              aria-pressed={selected === s.job_id}
                              onClick={() => setSelected(s.job_id)}
                            >
                              <span className="visit-time">
                                {time(s.start)}
                                <small>{time(s.end)}</small>
                              </span>
                              <span className="visit-line" />
                              <span className="visit-description">
                                <strong>
                                  {job.address.replace(" (вымышленная)", "")}
                                </strong>
                                <small>
                                  {
                                    data.engineers.find(
                                      (e) => e.id === s.engineer_id,
                                    )?.name
                                  }{" "}
                                  · {job.skill}
                                </small>
                              </span>
                              {data.locked_job_ids.includes(job.id) ? (
                                <LockKeyhole
                                  size={15}
                                  aria-label="Визит зафиксирован"
                                />
                              ) : job.urgent ? (
                                <Zap size={16} aria-label="Срочная" />
                              ) : (
                                <ChevronRight size={16} aria-hidden="true" />
                              )}
                            </button>
                          );
                        })}
                    </div>
                  </section>
                  <section className="panel detail-panel">
                    <div className="panel-heading">
                      <h2>Почему этот маршрут</h2>
                      <ShieldCheck size={20} aria-hidden="true" />
                    </div>
                    {currentJob ? (
                      <>
                        <div className="detail-title">
                          <span
                            className={`badge ${plan.unassigned[currentJob.id] ? "warning" : ""}`}
                          >
                            {plan.unassigned[currentJob.id]
                              ? "Не назначена"
                              : currentJob.urgent
                                ? "Срочная"
                                : "В плане"}
                          </span>
                          <small>#{currentJob.id}</small>
                        </div>
                        <h3>
                          {currentJob.address.replace(" (вымышленная)", "")}
                        </h3>
                        <p className="detail-skill">{currentJob.skill}</p>
                        <div className="detail-values">
                          <span>
                            <Clock3 size={15} aria-hidden="true" />{" "}
                            {time(currentJob.window_start)}–
                            {time(currentJob.window_end)}
                          </span>
                          <span>{currentJob.duration} мин работы</span>
                        </div>
                        {stop && currentEngineer ? (
                          <>
                            <div className="assigned-person">
                              <span className="avatar light">
                                {currentEngineer.name.split(" ")[1]}
                              </span>
                              <div>
                                <strong>{currentEngineer.name}</strong>
                                <small>
                                  {transportIcon(currentEngineer.transport)}
                                  {currentEngineer.transport}
                                </small>
                              </div>
                              <CheckCheck size={18} aria-hidden="true" />
                            </div>
                            <ul className="reasons">
                              <li>
                                <Check size={16} aria-hidden="true" />
                                <span>Есть необходимый навык</span>
                              </li>
                              <li>
                                <Check size={16} aria-hidden="true" />
                                <span>
                                  {currentJob.required_transport
                                    ? "Есть требуемый транспорт"
                                    : "Ограничений по транспорту нет"}
                                </span>
                              </li>
                              <li>
                                <Check size={16} aria-hidden="true" />
                                <span>
                                  Начало в {time(stop.start)} — в окне заявки
                                </span>
                              </li>
                              <li>
                                <Check size={16} aria-hidden="true" />
                                <span>
                                  Завершение в {time(stop.end)} — до конца смены
                                </span>
                              </li>
                            </ul>
                            <p className="explanation-note">
                              Переезд от предыдущей точки: {stop.travel_minutes}{" "}
                              мин · {km(stop.distance_km)} км. Порядок выбран{" "}
                              {mode === 0
                                ? "по очереди поступления"
                                : "эвристикой допустимой вставки"}
                              .
                            </p>
                          </>
                        ) : (
                          <div className="unassigned-reason">
                            <AlertCircle size={19} aria-hidden="true" />
                            <p>{plan.unassigned[currentJob.id]}</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="empty">
                        Выберите заявку на карте или в расписании.
                      </div>
                    )}
                  </section>
                </div>
              )}
              {page === "jobs" && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>
                      Реестр заявок{" "}
                      <span className="count-pill">{data.jobs.length}</span>
                    </h2>
                    <div className="table-controls">
                      <label className="search">
                        <Search size={16} aria-hidden="true" />
                        <input
                          aria-label="Поиск заявки"
                          placeholder="Адрес или номер"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>
                      <select
                        aria-label="Статус заявки"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                      >
                        <option value="all">Все статусы</option>
                        <option value="assigned">В плане</option>
                        <option value="unassigned">Не назначены</option>
                      </select>
                    </div>
                  </div>
                  <JobsTable
                    jobs={data.jobs.filter(
                      (j) =>
                        (j.address + " " + j.id)
                          .toLowerCase()
                          .includes(query.toLowerCase()) &&
                        (status === "all" ||
                          (status === "unassigned"
                            ? !!plan.unassigned[j.id]
                            : !plan.unassigned[j.id])),
                    )}
                    plan={plan}
                    engineers={data.engineers}
                    onSelect={(id) => {
                      setSelected(id);
                      setEngineer(null);
                      setPage("plan");
                    }}
                  />
                </section>
              )}
              {page === "team" && (
                <div className="team-grid">
                  {data.engineers.map((e, i) => {
                    const route = plan.routes.find(
                      (r) => r.engineer_id === e.id,
                    )!;
                    return (
                      <section className="panel team-card" key={e.id}>
                        <div className="team-card-title">
                          <span
                            className="person-avatar"
                            style={
                              {
                                "--route-color": colors[i % colors.length],
                              } as React.CSSProperties
                            }
                          >
                            {e.name.split(" ")[1]}
                          </span>
                          <div>
                            <h2>{e.name}</h2>
                            <small>
                              {transportIcon(e.transport)} {e.transport}
                            </small>
                          </div>
                          <span
                            className={`badge ${route.stops.length ? "" : "neutral"}`}
                          >
                            {route.stops.length ? "В плане" : "Резерв"}
                          </span>
                        </div>
                        <div className="team-skills">
                          {e.skills.map((s) => (
                            <span key={s}>{s}</span>
                          ))}
                        </div>
                        <div className="team-stats">
                          <span>
                            <Clock3 size={14} aria-hidden="true" />
                            {time(e.shift_start)}–{time(e.shift_end)}
                          </span>
                          <span>
                            {route.stops.length}{" "}
                            {plural(
                              route.stops.length,
                              "заявка",
                              "заявки",
                              "заявок",
                            )}{" "}
                            · {km(route.distance_km)} км
                          </span>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => {
                            setEngineer(e.id);
                            setSelected(route.stops[0]?.job_id || null);
                            setPage("plan");
                          }}
                        >
                          Открыть маршрут{" "}
                          <ArrowUpRight size={16} aria-hidden="true" />
                        </button>
                      </section>
                    );
                  })}
                </div>
              )}
              {page === "compare" && <Compare scenario={data} />}
              {page === "source" &&
                (source ? (
                  <>
                    <div className="source-intro">
                      <div className="source-icon">
                        <Database size={28} aria-hidden="true" />
                      </div>
                      <div>
                        <h2>Восток · 66 исходных заявок</h2>
                        <p>
                          17 августа 2026 · CSV организаторов · Windows-1251
                        </p>
                      </div>
                      <span className="badge warning">
                        Требуется геокодирование
                      </span>
                    </div>
                    <div className="source-summary">
                      <span>
                        <strong>{source.summary.imported}</strong> импортировано
                      </span>
                      <span>
                        <strong>{source.summary.errors}</strong> ошибок импорта
                      </span>
                      <span>
                        <strong>{source.summary.missing_coordinates}</strong>{" "}
                        без координат
                      </span>
                    </div>
                    <div className="info-box">
                      <AlertCircle size={20} aria-hidden="true" />
                      <div>
                        <strong>
                          Этот набор ещё не участвует в маршрутизации
                        </strong>
                        <p>
                          Нужно определить координаты адресов и согласовать
                          справочник инженеров. Навыки и длительности пока
                          заданы учебными правилами. Стартовый офис:{" "}
                          {source.office_address}.
                        </p>
                      </div>
                    </div>
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>Исходные заявки</h2>
                        <label className="search">
                          <Search size={16} aria-hidden="true" />
                          <input
                            value={query}
                            aria-label="Поиск исходного адреса"
                            placeholder="Найти адрес"
                            onChange={(e) => setQuery(e.target.value)}
                          />
                        </label>
                      </div>
                      <JobsTable
                        jobs={source.jobs.filter((j) =>
                          (j.address + " " + j.id)
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                        )}
                      />
                    </section>
                  </>
                ) : (
                  <div className="loading">
                    <LoaderCircle className="spin" aria-hidden="true" />{" "}
                    Загружаем CSV…
                  </div>
                ))}
              <footer className="page-footer">
                <span>
                  <ShieldCheck size={14} aria-hidden="true" /> Навыки, транспорт
                  и временные окна проверяются алгоритмом
                </span>
                <span>Прототип · Уральские самоцветы</span>
              </footer>
            </>
          )}
        </div>
      </main>
      <dialog
        ref={dialog}
        className="urgent-dialog"
        aria-labelledby="urgent-title"
        aria-describedby="urgent-description"
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <UrgentForm
          key={`${data?.id}-${data?.version}`}
          data={data}
          busy={busy}
          close={() => dialog.current?.close()}
          submit={async (payload) => {
            if (!data) return;
            setBusy(true);
            try {
              const result = await request<Scenario>(
                `/api/scenarios/${data.id}/urgent`,
                { ...payload, version: data.version },
              );
              setData(result);
              setMode(1);
              setEngineer(null);
              setSelected(result.jobs.at(-1)!.id);
              setPage("plan");
              setNotice(`План перестроен. Изменений: ${result.changes.length}`);
              dialog.current?.close();
            } finally {
              setBusy(false);
            }
          }}
        />
      </dialog>
    </div>
  );
}

function Metric({
  label,
  value,
  caption,
  icon,
  warning,
  featured,
  progress,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  caption: string;
  icon: React.ReactNode;
  warning?: boolean;
  featured?: boolean;
  progress?: number;
  onClick?: () => void;
}) {
  return (
    <div
      className={`metric ${warning ? "metric-warning" : ""} ${featured ? "metric-featured" : ""}`}
    >
      <div className="metric-label">
        {label}
        <span>{icon}</span>
      </div>
      <div className="metric-value">{value}</div>
      {progress !== undefined && (
        <div
          className="metric-progress"
          role="progressbar"
          aria-label="Доля назначенных заявок"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
      )}
      {onClick ? (
        <button className="metric-caption" onClick={onClick}>
          {caption}
          <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      ) : (
        <div className="metric-caption">{caption}</div>
      )}
    </div>
  );
}

function JobsTable({
  jobs,
  plan,
  engineers,
  onSelect,
}: {
  jobs: Job[];
  plan?: Plan;
  engineers?: Engineer[];
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="jobs-table" role="table">
        <caption className="sr-only">
          {plan ? "Реестр заявок и назначений" : "Исходные заявки"}
        </caption>
        <thead role="rowgroup">
          <tr>
            <th scope="col">Заявка / адрес</th>
            <th scope="col">Временное окно</th>
            <th scope="col">Работы</th>
            <th scope="col">Статус</th>
            {plan && <th scope="col">Исполнитель / причина</th>}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {jobs.map((j) => {
            const route = plan?.routes.find((r) =>
              r.stops.some((s) => s.job_id === j.id),
            );
            return (
              <tr key={j.id} role="row">
                <td className="job-address" role="cell">
                  {onSelect ? (
                    <button className="job-link" onClick={() => onSelect(j.id)}>
                      {j.address.replace(" (вымышленная)", "")}
                    </button>
                  ) : (
                    <strong>{j.address}</strong>
                  )}
                  <small>
                    #{j.id}
                    {j.urgent ? " · Срочная" : ""}
                  </small>
                </td>
                <td className="nowrap" data-label="Время визита" role="cell">
                  {time(j.window_start)}–{time(j.window_end)}
                </td>
                <td data-label="Работы" role="cell">
                  {j.skill}
                  <small>{j.duration} мин</small>
                </td>
                <td data-label="Статус" role="cell">
                  <span
                    className={`badge ${!plan || plan.unassigned[j.id] ? "warning" : ""}`}
                  >
                    {!plan
                      ? "Без координат"
                      : plan.unassigned[j.id]
                        ? "Не назначена"
                        : "В плане"}
                  </span>
                </td>
                {plan && (
                  <td
                    className="reason-cell"
                    data-label="Исполнитель / причина"
                    role="cell"
                  >
                    {plan.unassigned[j.id] ||
                      engineers?.find((e) => e.id === route?.engineer_id)?.name}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!jobs.length && (
        <div className="empty">
          По этому запросу ничего не найдено. Измените фильтры.
        </div>
      )}
    </div>
  );
}

function Compare({ scenario }: { scenario: Scenario }) {
  const [base, best] = scenario.plans;
  return (
    <>
      <section className="panel comparison">
        <div className="panel-heading">
          <div>
            <h2>Результат в цифрах</h2>
            <span className="muted">
              {scenario.version > 1
                ? "Оба варианта пересчитаны из одного фактического состояния дня"
                : "Один набор данных, одна модель расстояний"}
            </span>
          </div>
          <GitCompareArrows size={21} aria-hidden="true" />
        </div>
        <div className="comparison-grid">
          <div className="comparison-labels">
            <span>Алгоритм</span>
            <strong>Назначено заявок</strong>
            <strong>Задействовано инженеров</strong>
            <strong>Расстояние, км</strong>
            <strong>Не назначено</strong>
          </div>
          {[base, best].map((p, i) => (
            <div key={i} className={`comparison-col ${i ? "highlight" : ""}`}>
              <span>{i ? "Допустимая вставка" : "Первый подходящий"}</span>
              <strong data-label="Назначено заявок">
                {p.metrics.assigned} / {scenario.jobs.length}
              </strong>
              <strong data-label="Инженеры">{p.metrics.engineers_used}</strong>
              <strong data-label="Расстояние, км">
                {km(p.metrics.distance_km)}
              </strong>
              <strong data-label="Не назначено">{p.metrics.unassigned}</strong>
            </div>
          ))}
        </div>
        <div className="comparison-foot">
          <AlertCircle size={17} aria-hidden="true" />
          <span>
            Меньше инженеров не всегда означает меньше километров. Оценивайте
            обе метрики и число выполненных заявок. Глобальный оптимум не
            гарантируется.
          </span>
        </div>
      </section>
      <section className="panel distance-panel">
        <div className="panel-heading">
          <h2>Расстояние каждого инженера</h2>
          <div className="bar-legend">
            <span>
              <i />
              Базовый
            </span>
            <span>
              <i />
              Улучшенный
            </span>
          </div>
        </div>
        {scenario.engineers
          .filter((e) =>
            [base, best].some(
              (p) => p.routes.find((r) => r.engineer_id === e.id)?.stops.length,
            ),
          )
          .map((e) => {
            const a = base.routes.find(
                (r) => r.engineer_id === e.id,
              )!.distance_km,
              b = best.routes.find((r) => r.engineer_id === e.id)!.distance_km,
              max = Math.max(
                1,
                ...[base, best].flatMap((p) =>
                  p.routes.map((r) => r.distance_km),
                ),
              );
            return (
              <div key={e.id} className="bar-row">
                <strong>{e.name}</strong>
                <div>
                  <div>
                    <span style={{ width: `${(a / max) * 85}%` }} />
                    <small>{km(a)} км</small>
                  </div>
                  <div>
                    <span style={{ width: `${(b / max) * 85}%` }} />
                    <small>{km(b)} км</small>
                  </div>
                </div>
              </div>
            );
          })}
      </section>
      {scenario.version > 1 && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Что изменилось в {time(scenario.now)}</h2>
            <span className="count-pill">{scenario.changes.length}</span>
          </div>
          <div className="changes-list">
            {scenario.changes.map((c) => (
              <div key={c.job_id}>
                <span className="change-dot">
                  <ArrowRight size={15} aria-hidden="true" />
                </span>
                <div>
                  <strong>
                    {scenario.jobs.find((j) => j.id === c.job_id)?.address}
                  </strong>
                  <p>
                    {c.before
                      ? `${scenario.engineers.find((e) => e.id === c.before!.engineer_id)?.name}, ${time(c.before.start)}, №${c.before.position}`
                      : "Без назначения"}{" "}
                    →{" "}
                    {c.after
                      ? `${scenario.engineers.find((e) => e.id === c.after!.engineer_id)?.name}, ${time(c.after.start)}, №${c.after.position}`
                      : "Не назначена"}
                  </p>
                </div>
              </div>
            ))}
            {!scenario.changes.length && (
              <p>
                Назначения и расписание не изменились. Причина отказа для новой
                заявки доступна в реестре.
              </p>
            )}
          </div>
        </section>
      )}
    </>
  );
}

function UrgentForm({
  data,
  busy,
  close,
  submit,
}: {
  data: Scenario | null;
  busy: boolean;
  close: () => void;
  submit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [values, setValues] = useState({
    address: "Учебная аварийная заявка",
    event_time: time(Math.max(data?.now || 540, 720)),
    window_start: time(Math.max(data?.now || 540, 720)),
    window_end: time(Math.min(1439, Math.max(data?.now || 540, 720) + 120)),
    duration: "45",
    lat: "55.712",
    lon: "37.765",
    skill: skills[2],
    required_transport: "",
  });
  const [error, setError] = useState("");
  const errorSummary = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorSummary.current?.focus();
  }, [error]);
  const set = (name: string, value: string) => {
    setError("");
    setValues((v) => ({ ...v, [name]: value }));
  };
  const minutes = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    return h * 60 + m;
  };
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const entered = Object.fromEntries(
          new FormData(e.currentTarget),
        ) as Record<string, string>;
        setError("");
        if (data && minutes(entered.event_time) < data.now) {
          setError(`Время события должно быть не раньше ${time(data.now)}.`);
          return;
        }
        if (minutes(entered.window_start) > minutes(entered.window_end)) {
          setError("Конец окна должен быть не раньше начала.");
          return;
        }
        try {
          await submit({
            ...entered,
            event_time: minutes(entered.event_time),
            window_start: minutes(entered.window_start),
            window_end: minutes(entered.window_end),
            duration: Number(entered.duration),
            lat: Number(entered.lat),
            lon: Number(entered.lon),
            required_transport: entered.required_transport || null,
          });
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <div className="dialog-title">
        <div className="dialog-symbol">
          <Zap size={24} aria-hidden="true" />
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Закрыть"
          onClick={close}
          disabled={busy}
        >
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      <h2 id="urgent-title">Новая срочная заявка</h2>
      <p id="urgent-description" className="dialog-description">
        Перестроим оставшуюся часть дня. Завершённые работы и начатые выезды
        останутся на своих местах.
      </p>
      <div className="form-grid">
        <div className="form-section">
          <span>01</span> Объект и время визита
        </div>
        <label className="full">
          Название / адрес
          <input
            required
            name="address"
            value={values.address}
            maxLength={200}
            minLength={3}
            onChange={(e) => set("address", e.target.value)}
          />
        </label>
        <label>
          Время события
          <input
            required
            type="time"
            name="event_time"
            value={values.event_time}
            onChange={(e) => set("event_time", e.target.value)}
          />
        </label>
        <label>
          Длительность, мин
          <input
            required
            type="number"
            min="1"
            max="480"
            name="duration"
            inputMode="numeric"
            value={values.duration}
            onChange={(e) => set("duration", e.target.value)}
          />
        </label>
        <label>
          Начало окна
          <input
            required
            type="time"
            name="window_start"
            value={values.window_start}
            onChange={(e) => set("window_start", e.target.value)}
          />
        </label>
        <label>
          Конец окна
          <input
            required
            type="time"
            name="window_end"
            value={values.window_end}
            onChange={(e) => set("window_end", e.target.value)}
          />
        </label>
        <div className="form-section">
          <span>02</span> Требования к инженеру
        </div>
        <label className="full">
          Требуемый навык
          <select
            name="skill"
            value={values.skill}
            onChange={(e) => set("skill", e.target.value)}
          >
            {skills.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="full">
          Транспорт
          <select
            name="required_transport"
            value={values.required_transport}
            onChange={(e) => set("required_transport", e.target.value)}
          >
            <option value="">Без ограничений</option>
            {transports.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <div className="form-section">
          <span>03</span> Точка на карте
        </div>
        <label>
          Широта
          <input
            required
            type="number"
            step="any"
            min="-90"
            max="90"
            name="lat"
            inputMode="decimal"
            value={values.lat}
            onChange={(e) => set("lat", e.target.value)}
          />
        </label>
        <label>
          Долгота
          <input
            required
            type="number"
            step="any"
            min="-180"
            max="180"
            name="lon"
            inputMode="decimal"
            value={values.lon}
            onChange={(e) => set("lon", e.target.value)}
          />
        </label>
      </div>
      <small className="form-note">
        Координаты вводятся вручную. Значения по умолчанию — учебная точка в
        Москве.
      </small>
      {error && (
        <p ref={errorSummary} tabIndex={-1} className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button
          type="button"
          className="secondary"
          onClick={close}
          disabled={busy}
        >
          Отмена
        </button>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={17} aria-hidden="true" />
          ) : (
            <Zap size={17} aria-hidden="true" />
          )}
          Добавить и пересчитать
        </button>
      </div>
    </form>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
