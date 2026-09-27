import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LocateFixed, Minus, Plus, RefreshCw } from "lucide-react";
import { colors, type Plan, type Point, type Scenario } from "./types";

export default function FallbackMap({
  scenario,
  plan,
  engineer,
  selected,
  onSelect,
  onRetry,
}: {
  scenario: Scenario;
  plan: Plan;
  engineer: string | null;
  selected: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const bounds = useRef<L.LatLngBounds | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const select = useRef(onSelect);
  select.current = onSelect;
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const instance = L.map(container.current, {
      zoomControl: false,
      scrollWheelZoom: false,
      zoomAnimation: !reduceMotion,
      fadeAnimation: !reduceMotion,
    }).setView([55.712, 37.761], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      minZoom: 3,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    })
      .on("tileerror", () => setTileError(true))
      .on("tileload", () => setTileError(false))
      .addTo(instance);
    instance.attributionControl.setPrefix(false);
    map.current = instance;
    layer.current = L.layerGroup().addTo(instance);
    const observer = new ResizeObserver(() =>
      instance.invalidateSize({ pan: false }),
    );
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = map.current,
      group = layer.current;
    if (!instance || !group) return;
    group.clearLayers();
    markers.current.clear();
    const points: L.LatLngTuple[] = [],
      occupied = new Map<string, number>();
    const addMarker = (
      point: Point,
      label: string,
      title: string,
      color: string,
      id?: string,
    ) => {
      const position: L.LatLngTuple = [point.lat, point.lon];
      points.push(position);
      const key = position.join(","),
        count = occupied.get(key) || 0;
      occupied.set(key, count + 1);
      const offset =
        count === 0 ? 0 : Math.ceil(count / 2) * 34 * (count % 2 ? 1 : -1);
      const marker = L.marker(position, {
        title,
        alt: title,
        keyboard: Boolean(id),
        icon: L.divIcon({
          className: `osm-pin ${id ? "route-pin" : "office-pin"}`,
          html: `<span style="--pin:${color}">${label}</span>`,
          iconSize: [44, 44],
          iconAnchor: [22 - offset, 22],
        }),
      }).addTo(group);
      if (id) {
        marker.on("click", () => select.current(id));
        marker.getElement()?.setAttribute("aria-label", title);
        markers.current.set(id, marker);
      }
    };
    const routes = plan.routes.filter(
      (route) => !engineer || route.engineer_id === engineer,
    );
    const starts = new Set<string>();
    for (const route of routes) {
      const member = scenario.engineers.find((e) => e.id === route.engineer_id);
      if (!member) continue;
      const key = `${member.start.lat},${member.start.lon}`;
      if (!starts.has(key)) {
        starts.add(key);
        addMarker(member.start, "Б", "Стартовая точка инженеров", "#243d34");
      }
    }
    const jobs = new Map(scenario.jobs.map((job) => [job.id, job]));
    for (const route of routes) {
      const member = scenario.engineers.find((e) => e.id === route.engineer_id);
      if (!member) continue;
      const color = colors[scenario.engineers.indexOf(member) % colors.length];
      const path: L.LatLngTuple[] = [[member.start.lat, member.start.lon]];
      route.stops.forEach((stop, index) => {
        const job = jobs.get(stop.job_id);
        if (!job?.point) return;
        path.push([job.point.lat, job.point.lon]);
        addMarker(
          job.point,
          String(index + 1),
          `${member.name}, остановка ${index + 1}: ${job.address}`,
          color,
          job.id,
        );
      });
      if (path.length > 1)
        L.polyline(path, {
          color,
          weight: 3,
          opacity: 0.8,
          dashArray: "7 7",
          interactive: false,
        }).addTo(group);
    }
    for (const job of scenario.jobs) {
      if (job.point && plan.unassigned[job.id])
        addMarker(
          job.point,
          "!",
          `Не назначена: ${job.address}`,
          "#b97536",
          job.id,
        );
    }
    bounds.current = points.length ? L.latLngBounds(points).pad(0.15) : null;
    if (bounds.current)
      instance.fitBounds(bounds.current, {
        padding: [48, 60],
        maxZoom: 15,
        animate: false,
      });
  }, [scenario, plan, engineer]);
  useEffect(() => {
    markers.current.forEach((marker, id) => {
      const active = selected === id;
      marker
        .getElement()
        ?.querySelector("span")
        ?.classList.toggle("is-selected", active);
      marker.getElement()?.setAttribute("aria-pressed", String(active));
      marker.setZIndexOffset(active ? 1000 : 0);
    });
  }, [selected, scenario, plan, engineer]);
  return (
    <div className="map-shell fallback-map">
      <div
        ref={container}
        className="map"
        aria-label="Карта маршрутов OpenStreetMap"
      />
      <div className="map-label">
        <span className="live-dot" /> OpenStreetMap{" "}
        <span>Москва · учебные точки</span>
      </div>
      <button
        className="map-fit icon-button"
        aria-label="Показать все точки"
        title="Показать все точки"
        onClick={() => {
          if (bounds.current)
            map.current?.fitBounds(bounds.current, {
              padding: [48, 60],
              maxZoom: 15,
            });
        }}
      >
        <LocateFixed size={18} aria-hidden="true" />
      </button>
      <div className="map-zoom" role="group" aria-label="Масштаб карты">
        <button
          className="icon-button"
          aria-label="Увеличить карту"
          onClick={() => map.current?.zoomIn()}
        >
          <Plus size={18} aria-hidden="true" />
        </button>
        <button
          className="icon-button"
          aria-label="Уменьшить карту"
          onClick={() => map.current?.zoomOut()}
        >
          <Minus size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="map-note">
        {tileError
          ? "Подложка недоступна. Точки и план сохранены."
          : "Пунктир — порядок визитов, не дорожный маршрут"}
      </div>
      <button
        className="map-provider"
        onClick={onRetry}
        title="Яндекс пока недоступен. Повторить подключение"
      >
        <RefreshCw size={13} aria-hidden="true" /> Включить Яндекс
      </button>
    </div>
  );
}
