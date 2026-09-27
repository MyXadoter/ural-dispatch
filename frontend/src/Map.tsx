import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type {
  LngLat,
  LngLatBounds,
  YMap,
  YMapFeature,
  YMapMarker,
} from "@yandex/ymaps3-types";
import { LocateFixed, MapPinned, Minus, Plus } from "lucide-react";
import { colors, request, type Point, type Scenario, type Plan } from "./types";
import { loadYandexMaps } from "./yandex";

const FallbackMap = lazy(() => import("./FallbackMap"));
let yandexUnavailable = false;

const coordinates = (point: Point): LngLat => [point.lon, point.lat];

export function RouteMap({
  scenario,
  plan,
  engineer,
  selected,
  onSelect,
}: {
  scenario: Scenario;
  plan: Plan;
  engineer: string | null;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<YMap | null>(null);
  const bounds = useRef<LngLatBounds | null>(null);
  const markers = useRef(
    new Map<string, { element: HTMLButtonElement; entity: YMapMarker }>(),
  );
  const select = useRef(onSelect);
  select.current = onSelect;
  const [status, setStatus] = useState<
    "loading" | "missing" | "error" | "ready"
  >("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    let instance: YMap | undefined;
    const fallbackTimer = window.setTimeout(() => {
      if (!disposed && !map.current) {
        yandexUnavailable = true;
        setStatus("error");
      }
    }, 6000);
    setStatus("loading");
    async function initialize() {
      try {
        if (yandexUnavailable) {
          setStatus("error");
          return;
        }
        const config = await request<{ api_key: string }>("/api/maps/config");
        if (disposed) return;
        if (!config.api_key) {
          yandexUnavailable = true;
          setStatus("missing");
          return;
        }
        const sdk = await loadYandexMaps(config.api_key);
        if (disposed || !container.current || yandexUnavailable) return;
        instance = new sdk.YMap(container.current, {
          location: { center: [37.761, 55.712], zoom: 13 },
          // Page scrolling stays natural; zoom is available through buttons and pinch.
          behaviors: ["drag", "pinchZoom", "dblClick"],
          margin: [65, 65, 65, 55],
          zoomRange: { min: 3, max: 19 },
        });
        instance.addChild(new sdk.YMapDefaultSchemeLayer({}));
        instance.addChild(new sdk.YMapDefaultFeaturesLayer({}));
        map.current = instance;
        setStatus("ready");
      } catch {
        instance?.destroy();
        instance = undefined;
        if (disposed) return;
        map.current = null;
        yandexUnavailable = true;
        setStatus("error");
      } finally {
        window.clearTimeout(fallbackTimer);
      }
    }
    void initialize();
    return () => {
      disposed = true;
      window.clearTimeout(fallbackTimer);
      map.current = null;
      instance?.destroy();
    };
  }, [attempt]);

  useEffect(() => {
    const instance = map.current;
    if (status !== "ready" || !instance) return;
    const entities: Array<YMapFeature | YMapMarker> = [];
    const points: LngLat[] = [];
    const occupied = new Map<string, number>();
    const add = (entity: YMapFeature | YMapMarker) => {
      instance.addChild(entity);
      entities.push(entity);
    };
    const addMarker = (
      point: Point,
      label: string,
      title: string,
      color: string,
      jobId?: string,
    ) => {
      const xy = coordinates(point);
      points.push(xy);
      const key = xy.join(","),
        count = occupied.get(key) || 0;
      occupied.set(key, count + 1);
      const offset =
        count === 0 ? 0 : Math.ceil(count / 2) * 34 * (count % 2 ? 1 : -1);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `yandex-pin ${jobId ? "route-pin" : "office-pin"}`;
      button.style.setProperty("--pin", color);
      button.style.setProperty("--pin-offset", `${offset}px`);
      button.title = title;
      button.setAttribute("aria-label", title);
      const face = document.createElement("span");
      face.textContent = label;
      button.appendChild(face);
      if (jobId) {
        button.setAttribute("aria-pressed", "false");
        button.onclick = (event) => {
          event.stopPropagation();
          select.current(jobId);
        };
      } else {
        button.tabIndex = -1;
      }
      const marker = new ymaps3.YMapMarker(
        { coordinates: xy, zIndex: jobId ? 10 : 5, blockBehaviors: true },
        button,
      );
      add(marker);
      if (jobId)
        markers.current.set(jobId, { element: button, entity: marker });
    };
    const starts = new Set<string>();
    const routes = plan.routes.filter(
      (route) => !engineer || route.engineer_id === engineer,
    );
    for (const route of routes) {
      const member = scenario.engineers.find(
        (item) => item.id === route.engineer_id,
      );
      if (!member) continue;
      const key = coordinates(member.start).join(",");
      if (!starts.has(key)) {
        starts.add(key);
        addMarker(member.start, "Б", "Стартовая точка инженеров", "#243d34");
      }
    }
    const jobs = new Map(scenario.jobs.map((job) => [job.id, job]));
    for (const route of routes) {
      const member = scenario.engineers.find(
        (item) => item.id === route.engineer_id,
      );
      if (!member) continue;
      const color = colors[scenario.engineers.indexOf(member) % colors.length];
      const path: LngLat[] = [coordinates(member.start)];
      route.stops.forEach((stop, index) => {
        const job = jobs.get(stop.job_id);
        if (!job?.point) return;
        path.push(coordinates(job.point));
        addMarker(
          job.point,
          String(index + 1),
          `${member.name}, остановка ${index + 1}: ${job.address}`,
          color,
          job.id,
        );
      });
      if (path.length > 1)
        add(
          new ymaps3.YMapFeature({
            id: route.engineer_id,
            geometry: { type: "LineString", coordinates: path },
            style: {
              stroke: [{ color, width: 3, opacity: 0.8, dash: [7, 7] }],
            },
          }),
        );
    }
    for (const job of scenario.jobs) {
      if (job.point && plan.unassigned[job.id]) {
        addMarker(
          job.point,
          "!",
          `Не назначена: ${job.address}`,
          "#b97536",
          job.id,
        );
      }
    }
    if (points.length) {
      const lons = points.map((point) => point[0]),
        lats = points.map((point) => point[1]);
      const west = Math.min(...lons),
        east = Math.max(...lons),
        south = Math.min(...lats),
        north = Math.max(...lats);
      const dx = Math.max((east - west) * 0.12, 0.002),
        dy = Math.max((north - south) * 0.12, 0.001);
      bounds.current = [
        [west - dx, south - dy],
        [east + dx, north + dy],
      ];
      instance.setLocation({ bounds: bounds.current });
    }
    return () => {
      markers.current.clear();
      bounds.current = null;
      // Parent effect may already have destroyed the map on unmount/retry.
      if (map.current === instance)
        entities.forEach((entity) => instance.removeChild(entity));
    };
  }, [scenario, plan, engineer, status]);

  useEffect(() => {
    for (const [id, marker] of markers.current) {
      const active = id === selected;
      marker.element.firstElementChild?.classList.toggle("is-selected", active);
      marker.element.setAttribute("aria-pressed", String(active));
      marker.entity.update({ zIndex: active ? 100 : 10 });
    }
  }, [selected, scenario, plan, engineer, status]);

  const zoom = (step: number) => {
    const instance = map.current;
    if (instance)
      instance.setLocation({
        zoom: Math.min(19, Math.max(3, instance.zoom + step)),
      });
  };

  if (status === "error" || status === "missing") {
    return (
      <Suspense
        fallback={
          <div className="map-shell">
            <div className="map-status" role="status">
              <MapPinned size={26} aria-hidden="true" />
              <p>Открываем резервную карту…</p>
            </div>
          </div>
        }
      >
        <FallbackMap
          scenario={scenario}
          plan={plan}
          engineer={engineer}
          selected={selected}
          onSelect={onSelect}
          onRetry={() => {
            yandexUnavailable = false;
            setAttempt((value) => value + 1);
          }}
        />
      </Suspense>
    );
  }

  return (
    <div className="map-shell">
      <div
        ref={container}
        className="map"
        aria-label="Яндекс Карта учебных маршрутов"
      />
      {status === "ready" ? (
        <>
          <div className="map-label">
            <span className="live-dot" /> Яндекс Карты{" "}
            <span>Москва · учебные точки</span>
          </div>
          <button
            className="map-fit icon-button"
            title="Показать все точки"
            aria-label="Показать все точки"
            onClick={() => {
              if (bounds.current && map.current)
                map.current.setLocation({
                  bounds: [...bounds.current] as LngLatBounds,
                });
            }}
          >
            <LocateFixed size={18} />
          </button>
          <div className="map-zoom" role="group" aria-label="Масштаб карты">
            <button
              className="icon-button"
              aria-label="Увеличить карту"
              title="Увеличить карту"
              onClick={() => zoom(1)}
            >
              <Plus size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Уменьшить карту"
              title="Уменьшить карту"
              onClick={() => zoom(-1)}
            >
              <Minus size={18} />
            </button>
          </div>
          <div className="map-note">
            Пунктир — порядок визитов, не дорожный маршрут
          </div>
        </>
      ) : (
        <div className="map-status" role="status" aria-live="polite">
          <div className="map-status-icon">
            <MapPinned size={26} aria-hidden="true" />
          </div>
          <h3>Открываем карту</h3>
          <p>Загружаем карту и размещаем остановки инженеров.</p>
          <button
            className="secondary"
            onClick={() => {
              yandexUnavailable = true;
              setStatus("error");
            }}
          >
            Открыть OpenStreetMap
          </button>
        </div>
      )}
    </div>
  );
}
