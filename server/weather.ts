import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface WeatherData {
  city: string;
  tempC: number;
  feelsLikeC: number;
  humidity: number;
  windspeedKmph: number;
  precipMM: number;
  uvIndex: number;
  weatherDesc: string;
  weatherCode: string;
  fetchedAt: string;
}

const weatherCache = new Map<string, { data: WeatherData; fetchedAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function fetchWeather(city: string): Promise<WeatherData> {
  const cacheKey = city.toLowerCase();
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const encodedCity = encodeURIComponent(city);
  const url = `https://wttr.in/${encodedCity}?format=j1`;

  const res = await fetch(url, {
    headers: { "User-Agent": "SafeBoard/1.0" },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`날씨 API 오류: ${res.status}`);
  }

  const json = (await res.json()) as any;
  const c = json?.current_condition?.[0];
  if (!c) throw new Error("날씨 데이터를 파싱할 수 없습니다.");

  const data: WeatherData = {
    city,
    tempC: Number(c.temp_C ?? 0),
    feelsLikeC: Number(c.FeelsLikeC ?? 0),
    humidity: Number(c.humidity ?? 0),
    windspeedKmph: Number(c.windspeedKmph ?? 0),
    precipMM: Number(c.precipMM ?? 0),
    uvIndex: Number(c.uvIndex ?? 0),
    weatherDesc:
      c.lang_ko?.[0]?.value ?? c.weatherDesc?.[0]?.value ?? "정보없음",
    weatherCode: String(c.weatherCode ?? ""),
    fetchedAt: new Date().toISOString(),
  };

  weatherCache.set(cacheKey, { data, fetchedAt: Date.now() });
  return data;
}

export function clearWeatherCache(city?: string) {
  if (city) weatherCache.delete(city.toLowerCase());
  else weatherCache.clear();
}

export async function generateSafetyMessage(weather: WeatherData): Promise<{
  title: string;
  content: string;
}> {
  const conditions: string[] = [];
  if (weather.tempC <= -10) conditions.push("혹한(영하 10도 이하)");
  else if (weather.tempC <= 0) conditions.push("영하 기온");
  else if (weather.tempC >= 35) conditions.push("폭염(35도 이상)");
  else if (weather.tempC >= 30) conditions.push("고온주의");
  if (weather.precipMM > 10) conditions.push("강한 비/눈");
  else if (weather.precipMM > 0) conditions.push("비 또는 눈");
  if (weather.windspeedKmph >= 50) conditions.push("강풍주의");
  else if (weather.windspeedKmph >= 30) conditions.push("바람 강함");
  if (weather.uvIndex >= 8) conditions.push("자외선 매우 강함");
  if (weather.humidity >= 85) conditions.push("고습도");

  const conditionText =
    conditions.length > 0 ? conditions.join(", ") : "일반 기상 조건";

  const prompt = `오늘의 날씨 데이터를 기반으로 야외 현장 근무자를 위한 안전메시지를 작성해줘.

날씨 정보:
- 도시: ${weather.city}
- 기온: ${weather.tempC}°C (체감온도 ${weather.feelsLikeC}°C)
- 날씨: ${weather.weatherDesc}
- 바람: ${weather.windspeedKmph}km/h
- 습도: ${weather.humidity}%
- 강수량: ${weather.precipMM}mm
- UV지수: ${weather.uvIndex}
- 특이사항: ${conditionText}

요구사항:
1. 제목은 15자 이내로 오늘 날씨 특성과 안전을 강조
2. 본문은 3~4문장으로 구체적인 안전 행동 지침 포함
3. 통신탑, 기지국, 야외 전기설비 작업자를 대상으로 작성
4. 친근하지만 전문적인 어조로 작성
5. 이모지 적절히 활용

JSON 형식으로 반환:
{"title": "제목", "content": "본문"}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-nano",
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 500,
  });

  const raw = response.choices[0]?.message?.content ?? "{}";

  // JSON 블록 추출 (```json ... ``` 또는 순수 JSON)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : "{}";

  let parsed: { title?: string; content?: string } = {};
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // JSON 파싱 실패 시 전체 텍스트를 내용으로 사용
    return {
      title: `${weather.city} 날씨 안전메시지`,
      content: raw.trim() || "오늘도 안전한 하루 되세요.",
    };
  }

  return {
    title: parsed.title ?? `${weather.city} 날씨 안전메시지`,
    content: parsed.content ?? "오늘도 안전한 하루 되세요.",
  };
}
