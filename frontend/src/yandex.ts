import type * as Yandex from "@yandex/ymaps3-types";

let loaded: { key: string; promise: Promise<typeof Yandex> } | undefined;

/** One SDK load per page, shared across React mounts. */
export function loadYandexMaps(key: string): Promise<typeof Yandex> {
  if (loaded?.key === key) return loaded.promise;
  if (loaded) {
    return Promise.reject(
      new Error("Ключ изменён. Обновите страницу, чтобы применить его."),
    );
  }
  const promise = new Promise<typeof Yandex>((resolve, reject) => {
    const script = document.createElement("script");
    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.remove();
      loaded = undefined;
      reject(new Error(message));
    };
    const timer = window.setTimeout(
      () =>
        fail(
          "Яндекс Карты не ответили. Проверьте подключение к интернету и повторите загрузку.",
        ),
      20000,
    );
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(key)}&lang=ru_RU`;
    script.async = true;
    script.referrerPolicy = "strict-origin-when-cross-origin";
    script.onerror = () =>
      fail(
        "Не удалось загрузить Яндекс Карты. Проверьте интернет, ключ JavaScript API и ограничение HTTP Referer для адреса сайта.",
      );
    script.onload = async () => {
      try {
        if (typeof ymaps3 === "undefined") throw new Error("SDK unavailable");
        await ymaps3.ready;
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(ymaps3);
      } catch {
        fail(
          "Яндекс Карты отклонили подключение. Проверьте ключ JavaScript API и ограничение HTTP Referer для адреса сайта. Новый ключ активируется до 15 минут.",
        );
      }
    };
    document.head.appendChild(script);
  });
  loaded = { key, promise };
  return promise;
}
