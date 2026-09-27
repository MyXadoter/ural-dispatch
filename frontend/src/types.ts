export type Point = { lat: number; lon: number };
export type Job = {
  id: string;
  address: string;
  point: Point | null;
  window_start: number;
  window_end: number;
  duration: number;
  skill: string;
  required_transport: string | null;
  urgent: boolean;
  date: string;
};
export type Engineer = {
  id: string;
  name: string;
  start: Point;
  shift_start: number;
  shift_end: number;
  skills: string[];
  transport: string;
};
export type Stop = {
  job_id: string;
  arrival: number;
  start: number;
  end: number;
  travel_minutes: number;
  distance_km: number;
  explanation: string;
};
export type Route = { engineer_id: string; stops: Stop[]; distance_km: number };
export type Plan = {
  algorithm: string;
  routes: Route[];
  unassigned: Record<string, string>;
  assumptions: string[];
  metrics: {
    assigned: number;
    unassigned: number;
    engineers_used: number;
    distance_km: number;
  };
};
export type Assignment = {
  engineer_id: string;
  position: number;
  start: number;
};
export type Scenario = {
  id: string;
  version: number;
  now: number;
  date: string;
  dataset: string;
  is_demo: boolean;
  jobs: Job[];
  engineers: Engineer[];
  plans: Plan[];
  changes: {
    job_id: string;
    before: Assignment | null;
    after: Assignment | null;
  }[];
  locked_job_ids: string[];
};
export const time = (value: number) =>
  `${Math.floor(value / 60)
    .toString()
    .padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
export const km = (value: number) =>
  value.toLocaleString("ru-RU", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
export function plural(n: number, one: string, few: string, many: string) {
  const last = n % 10,
    hundred = n % 100;
  return hundred >= 11 && hundred <= 14
    ? many
    : last === 1
      ? one
      : last >= 2 && last <= 4
        ? few
        : many;
}
export const colors = [
  "#386b58",
  "#8470bc",
  "#c1832a",
  "#32788e",
  "#b46070",
  "#577d36",
  "#4864a6",
  "#996444",
  "#815b87",
  "#567f80",
  "#796c42",
  "#a54a4a",
];
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError(
      0,
      "Нет связи с сервером. Запустите start.command и повторите запрос. Ваш сохранённый план останется на месте.",
    );
  }
  const result = await response.json().catch(() => ({
    detail: "Сервер не смог обработать запрос. Повторите попытку.",
  }));
  if (!response.ok)
    throw new ApiError(
      response.status,
      typeof result.detail === "string"
        ? result.detail
        : "Проверьте заполнение полей и повторите запрос.",
    );
  return result;
}
