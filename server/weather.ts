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
  // 날씨 요소별 위험도 분석
  const risks: string[] = [];
  const safetyPoints: string[] = [];

  // 기온 분석
  if (weather.tempC >= 35) {
    risks.push("폭염(35°C 이상) 온열질환 위험 매우 높음");
    safetyPoints.push(`현재 기온 ${weather.tempC}°C(체감 ${weather.feelsLikeC}°C) 폭염 상황 — 30분 작업 후 10분 이상 그늘 휴식 필수, 시간당 500ml 이상 수분 섭취, 옥상/철탑 작업 오전 11시~오후 4시 자제`);
  } else if (weather.tempC >= 33) {
    risks.push("고온(33°C 이상) 열탈진 주의");
    safetyPoints.push(`기온 ${weather.tempC}°C 고온 주의 — 체감온도 ${weather.feelsLikeC}°C에 달하므로 1시간마다 충분한 휴식과 수분(300ml 이상) 보충 필수, 어지러움·구역질 증상 시 즉시 작업 중단`);
  } else if (weather.tempC <= -10) {
    risks.push("혹한(영하 10°C 이하) 저체온·동상 위험");
    safetyPoints.push(`현재 ${weather.tempC}°C 혹한 — 방한복·방한장갑·방한화 완전 착용 필수, 노출 피부 동상 위험 높음(15분 이상 야외 노출 금지), 핫팩 및 방한 커버 반드시 지참`);
  } else if (weather.tempC <= 0) {
    risks.push("영하 기온으로 결빙·근육경직 주의");
    safetyPoints.push(`기온 ${weather.tempC}°C(체감 ${weather.feelsLikeC}°C) 영하권 — 노면·철탑 발판 결빙 예상, 이동 시 미끄럼 방지 장화 착용, 작업 전 충분한 스트레칭으로 근육경직 예방`);
  } else if (weather.tempC <= 5) {
    risks.push("저온으로 신체 기능 저하 주의");
    safetyPoints.push(`기온 ${weather.tempC}°C 저온 — 장시간 야외 작업 시 체온 저하로 집중력 감소, 30분마다 실내 이동 또는 핫팩으로 보온, 방한복 착용 권장`);
  }

  // 강수량 분석
  if (weather.precipMM >= 20) {
    risks.push("집중 강수로 재해 위험 매우 높음");
    safetyPoints.push(`강수량 ${weather.precipMM}mm 집중호우 — 옥외 철탑·전주 작업 즉시 중단, 낙뢰 위험 구간 접근 금지, 우의 착용 및 미끄럼 방지 신발 필수, 침수 예상 지역 작업 차량 이동 조치`);
  } else if (weather.precipMM >= 5) {
    risks.push("강우로 낙뢰·미끄럼 위험");
    safetyPoints.push(`강수량 ${weather.precipMM}mm 강우 중 — 젖은 노면·사다리·발판 미끄럼 위험, 고소작업 시 안전대 이중 점검, 전기설비 작업 전 절연장갑 착용 철저 확인, 뇌우 예보 시 즉시 대피`);
  } else if (weather.precipMM > 0) {
    risks.push("소량 강수로 미끄럼 주의");
    safetyPoints.push(`강수량 ${weather.precipMM}mm 비/눈 — 노면 및 작업 발판 습기로 미끄럼 위험, 절연 장갑·안전화 착용 확인, 전기설비 주변 물기 완전 제거 후 작업`);
  }

  // 풍속 분석
  if (weather.windspeedKmph >= 55) {
    risks.push("강풍(55km/h 이상) 고소작업 불가");
    safetyPoints.push(`풍속 ${weather.windspeedKmph}km/h 강풍 — 10m 이상 고소작업 전면 금지, 지상 작업 시에도 낙하물 위험 주의, 경량 장비·공구 로프로 고정, 개인보호장비 풀림 여부 재확인`);
  } else if (weather.windspeedKmph >= 35) {
    risks.push("강풍(35km/h 이상) 고소작업 위험");
    safetyPoints.push(`풍속 ${weather.windspeedKmph}km/h 강풍 — 철탑·안테나 작업 자제 권고, 불가피 시 추락방지대 2중 체결, 공구 및 자재 낙하 방지 조치, 바람 방향 수시 확인`);
  } else if (weather.windspeedKmph >= 20) {
    risks.push("바람 강함으로 고소작업 주의");
    safetyPoints.push(`풍속 ${weather.windspeedKmph}km/h — 고소작업 시 균형 잡기 어려울 수 있으므로 안전대 필수 착용, 가벼운 장비는 고정 후 작업`);
  }

  // 자외선 분석
  if (weather.uvIndex >= 8) {
    risks.push("자외선 매우 강함(UV 8 이상)");
    safetyPoints.push(`UV지수 ${weather.uvIndex} 자외선 매우 강함 — 야외 작업 시 SPF50+ 자외선차단제 2시간마다 도포, 안전모 착용 및 목·팔 피부 노출 최소화, 선글라스 착용 권장`);
  } else if (weather.uvIndex >= 6) {
    safetyPoints.push(`UV지수 ${weather.uvIndex} 자외선 강함 — 자외선차단제 도포 및 피부 노출 줄이는 복장 착용 권고`);
  }

  // 습도 분석
  if (weather.humidity >= 85 && weather.tempC >= 28) {
    risks.push("고온다습으로 온열질환 위험 증가");
    safetyPoints.push(`습도 ${weather.humidity}% 고온다습 — 체감온도 급상승으로 땀 배출 기능 저하, 전해질 포함 음료(이온음료) 섭취 권장, 통풍이 잘 되는 경량 작업복 착용`);
  }

  // 위험요소 없는 경우 기본 지침
  if (safetyPoints.length === 0) {
    safetyPoints.push(`오늘 ${weather.city} 날씨는 ${weather.weatherDesc} ${weather.tempC}°C — 현장 작업에 큰 지장은 없으나 기본 안전수칙 준수 철저`);
  }

  // 주요 위험 요약
  const riskSummary = risks.length > 0
    ? `⚠️ 오늘의 주요 위험: ${risks.join(" | ")}`
    : `✅ 오늘의 기상 조건: 비교적 양호 (${weather.weatherDesc}, ${weather.tempC}°C)`;

  // 제목용 핵심 위험
  const titleRisk = risks.length > 0 ? risks[0] : `${weather.city} 현장 안전수칙`;

  const prompt = `당신은 KT MOS남부 통신 현장 안전관리 전문가입니다.
아래의 실시간 날씨 데이터와 위험 분석 결과를 바탕으로, 현장 근무자에게 전달할 구체적이고 실용적인 안전메시지를 작성하세요.

═══════════════════════════════════
📍 ${weather.city} 실시간 날씨 현황
═══════════════════════════════════
• 기온: ${weather.tempC}°C (체감 ${weather.feelsLikeC}°C)
• 날씨 상태: ${weather.weatherDesc}
• 풍속: ${weather.windspeedKmph}km/h
• 습도: ${weather.humidity}%
• 강수량: ${weather.precipMM}mm
• 자외선지수: ${weather.uvIndex}

🔍 위험 분석 결과:
${riskSummary}

📋 날씨별 세부 안전 포인트:
${safetyPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}

═══════════════════════════════════
작성 지침:
- 제목: 오늘 날씨의 핵심 위험을 담은 강렬하고 명확한 제목 (20자 이내, 이모지 포함)
- 본문 구성:
  ① 첫째 줄: 오늘 날씨 상황을 실제 수치와 함께 요약 (기온, 날씨 상태 언급 필수)
  ② 날씨 분석 결과의 각 안전 포인트를 구체적으로 풀어서 작성 (항목당 1~2문장)
  ③ 마무리: 작업자들에 대한 진심 어린 당부 문장
- 대상: 통신탑, 기지국, 전신주, 광케이블 등 야외 전기통신 설비 유지보수 작업자
- 실제 수치(기온, 풍속, 강수량 등)를 본문에 직접 인용하여 현실감 있게 작성
- 이모지를 적극 활용하여 가독성 향상
- 각 문단 사이 줄바꿈(\\n\\n) 사용
- 분량: 본문 6~10문장 (충분히 상세하게)

반드시 아래 JSON 형식으로만 반환:
{"title": "제목", "content": "본문내용"}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-nano",
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 900,
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
