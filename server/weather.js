const WEATHER_CODES = {
  0: "晴朗",
  1: "大部晴朗",
  2: "多云",
  3: "阴天",
  45: "有雾",
  48: "雾凇",
  51: "小毛毛雨",
  53: "毛毛雨",
  55: "强毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  80: "阵雨",
  81: "较强阵雨",
  82: "强阵雨",
  85: "阵雪",
  86: "强阵雪",
  95: "雷暴",
  96: "雷暴伴小冰雹",
  99: "雷暴伴强冰雹",
};

export async function geocodeLocation(location, fetchImpl = fetch) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", location);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "zh");
  url.searchParams.set("format", "json");

  const response = await fetchImpl(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error("地点解析服务暂时不可用");
  const data = await response.json();
  if (!data.results?.length) throw new Error(`没有找到“${location}”，请补充城市或地区名称`);
  return data.results[0];
}

export async function fetchWeather({ location, days = 5 }, fetchImpl = fetch) {
  const place = await geocodeLocation(location, fetchImpl);
  const forecastDays = Math.min(Math.max(Number(days) || 5, 1), 7);
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", place.latitude);
  url.searchParams.set("longitude", place.longitude);
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
  );
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  );
  url.searchParams.set("forecast_days", String(forecastDays));
  url.searchParams.set("timezone", "auto");

  const response = await fetchImpl(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error("天气服务暂时不可用");
  const data = await response.json();

  // 将第三方接口压缩为稳定结构，减少传给模型的无关 token，同时避免前端依赖上游字段。
  return {
    location: [place.name, place.admin1, place.country].filter(Boolean).join("，"),
    timezone: data.timezone,
    current: {
      observedAt: data.current.time,
      temperatureC: data.current.temperature_2m,
      feelsLikeC: data.current.apparent_temperature,
      humidityPercent: data.current.relative_humidity_2m,
      precipitationMm: data.current.precipitation,
      windKmh: data.current.wind_speed_10m,
      condition: WEATHER_CODES[data.current.weather_code] || "未知天气",
    },
    forecast: data.daily.time.map((date, index) => ({
      date,
      condition: WEATHER_CODES[data.daily.weather_code[index]] || "未知天气",
      highC: data.daily.temperature_2m_max[index],
      lowC: data.daily.temperature_2m_min[index],
      precipitationProbabilityPercent: data.daily.precipitation_probability_max[index],
    })),
  };
}
