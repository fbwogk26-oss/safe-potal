import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface WeatherData {
  city: string;
  tempC: number;
  feelsLikeC: number;
  tempMaxC: number;
  tempMinC: number;
  humidity: number;
  windspeedKmph: number;
  windspeedMs: number;
  precipMM: number;
  precipProb: number;
  uvIndex: number;
  snowCM: number;
  weatherDesc: string;
  weatherCode: string;
  pm10: number | null;
  pm10Grade: string | null;
  pm10Color: string | null;
  warningFactor: string;
  riskFactor: string;
  safetyAction: string;
  specialReport: string;
  fetchedAt: string;
}

const weatherCache = new Map<string, { data: WeatherData; fetchedAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

const PM10_STATION_MAP: Record<string, string> = {
  대구: "수성구",
  구미: "구미",
  포항: "포항",
  안동: "안동",
  문경: "문경",
  울릉도: "울릉도",
  울진: "울진",
};

async function fetchPm10(city: string): Promise<{ value: number | null; grade: string | null; color: string | null }> {
  const serviceKey = process.env.KOSHA_SERVICE_KEY;
  if (!serviceKey) return { value: null, grade: null, color: null };

  const stationName = PM10_STATION_MAP[city] ?? city;
  try {
    const url = new URL("https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty");
    url.searchParams.append("serviceKey", serviceKey);
    url.searchParams.append("stationName", stationName);
    url.searchParams.append("dataTerm", "DAILY");
    url.searchParams.append("pageNo", "1");
    url.searchParams.append("numOfRows", "1");
    url.searchParams.append("returnType", "json");
    url.searchParams.append("ver", "1.0");

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "SafeBoard/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { value: null, grade: null, color: null };

    const json = (await res.json()) as any;
    const item = json?.response?.body?.items?.item?.[0];
    const raw = item?.pm10Value;
    if (!raw || raw === "-") return { value: null, grade: null, color: null };

    const value = Number(raw);
    if (isNaN(value)) return { value: null, grade: null, color: null };

    let grade: string;
    let color: string;
    if (value <= 30) { grade = "좋음"; color = "#22c55e"; }
    else if (value <= 80) { grade = "보통"; color = "#eab308"; }
    else if (value <= 150) { grade = "나쁨"; color = "#f97316"; }
    else { grade = "매우나쁨"; color = "#ef4444"; }

    return { value, grade, color };
  } catch {
    return { value: null, grade: null, color: null };
  }
}

function computeWarnings(weather: {
  tempC: number;
  tempMinC: number;
  tempMaxC: number;
  precipMM: number;
  windspeedKmph: number;
  uvIndex: number;
  humidity: number;
}, pm10: number | null): { warningFactor: string; riskFactor: string; safetyAction: string } {
  const warnings: string[] = [];
  const risks: string[] = [];
  const actions: string[] = [];

  // 폭염
  if (weather.tempC >= 35) {
    warnings.push("폭염주의보");
    risks.push("열사병·열탈진 위험");
    actions.push("그늘 휴식, 규칙적 수분 섭취");
  } else if (weather.tempC >= 33) {
    warnings.push("고온주의");
    risks.push("온열질환 발생 가능");
    actions.push("1시간마다 휴식, 수분 300ml 이상");
  }

  // 결빙 (야간 저온 포함)
  if (weather.tempC <= -5 || weather.tempMinC <= 0) {
    warnings.push("결빙우려");
    risks.push(weather.tempMinC <= 0 ? "야간·새벽 노면 결빙 가능성" : "지면·발판 결빙 위험");
    actions.push("이른 아침 작업 전 노면 상태 확인, 방수포 설치");
  } else if (weather.tempC <= 5 || weather.tempMinC <= 5) {
    warnings.push("저온주의");
    risks.push("근육경직·저체온 위험");
    actions.push("방한복 착용, 핫팩 지참");
  }

  // 강수
  if (weather.precipMM >= 20) {
    warnings.push("집중호우");
    risks.push("낙뢰·지반 유실 위험");
    actions.push("고소작업 즉시 중단, 대피 장소 확보");
  } else if (weather.precipMM >= 5) {
    warnings.push("강우주의");
    risks.push("발판·노면 미끄럼 위험");
    actions.push("절연장갑 착용, 미끄럼방지 안전화 착용");
  } else if (weather.precipMM > 0) {
    warnings.push("소량 강수");
    risks.push("노면 습기로 미끄럼 주의");
    actions.push("안전화 착용, 발판 물기 제거");
  }

  // 강풍
  if (weather.windspeedKmph >= 55) {
    warnings.push("강풍경보");
    risks.push("고소작업 추락·낙하물 위험");
    actions.push("고소작업 전면 금지, 장비 고정");
  } else if (weather.windspeedKmph >= 35) {
    warnings.push("강풍주의보");
    risks.push("고소작업 균형 불안정");
    actions.push("안전대 이중 체결, 경량 자재 고정");
  } else if (weather.windspeedKmph >= 20) {
    warnings.push("바람 강함");
    risks.push("공구·자재 낙하 위험");
    actions.push("안전대 착용, 낙하물 방지망 설치");
  }

  // 자외선
  if (weather.uvIndex >= 8) {
    warnings.push("자외선 매우강함");
    risks.push("피부 화상·눈 손상 위험");
    actions.push("SPF50+ 자외선차단제 도포, 선글라스 착용");
  } else if (weather.uvIndex >= 6) {
    warnings.push("자외선 강함");
    risks.push("장시간 노출 시 피부 손상");
    actions.push("자외선차단제 도포, 모자 착용 권고");
  }

  // 미세먼지
  if (pm10 !== null && pm10 > 150) {
    warnings.push("미세먼지 매우나쁨");
    risks.push("호흡기 심각한 손상 위험");
    actions.push("N95 이상 마스크 착용, 야외작업 자제");
  } else if (pm10 !== null && pm10 > 80) {
    warnings.push("호흡기 질환 주의");
    risks.push("호흡기 PPE 필요");
    actions.push("마스크 착용 권고, 환기 최소화");
  } else if (pm10 !== null && pm10 > 30) {
    warnings.push("미세먼지 보통");
    risks.push("민감군 호흡기 주의");
    actions.push("장시간 야외 작업 시 마스크 착용");
  }

  // 기본값 (특이 사항 없음)
  if (warnings.length === 0) {
    warnings.push("특이 기상 없음");
    risks.push("기본 안전수칙 준수 필요");
    actions.push("작업 전 안전장비 착용 확인");
  }

  return {
    warningFactor: warnings.join(", "),
    riskFactor: risks.join(", "),
    safetyAction: actions.join(", "),
  };
}

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

  const daily = json?.weather?.[0];
  const hourly: any[] = daily?.hourly ?? [];
  const tempMaxC = Number(daily?.maxtempC ?? c.temp_C ?? 0);
  const tempMinC = Number(daily?.mintempC ?? c.temp_C ?? 0);
  const snowCM = hourly.reduce((max: number, h: any) => Math.max(max, Number(h.snowfall_cm ?? 0)), 0);
  const precipProb = hourly.reduce((max: number, h: any) => Math.max(max, Number(h.chanceofrain ?? 0)), 0);

  const windKmph = Number(c.windspeedKmph ?? 0);

  // PM10 fetch (best-effort)
  const pm10Result = await fetchPm10(city);

  const warnings = computeWarnings({
    tempC: Number(c.temp_C ?? 0),
    tempMinC,
    tempMaxC,
    precipMM: Number(c.precipMM ?? 0),
    windspeedKmph: windKmph,
    uvIndex: Number(c.uvIndex ?? 0),
    humidity: Number(c.humidity ?? 0),
  }, pm10Result.value);

  const data: WeatherData = {
    city,
    tempC: Number(c.temp_C ?? 0),
    feelsLikeC: Number(c.FeelsLikeC ?? 0),
    tempMaxC,
    tempMinC,
    humidity: Number(c.humidity ?? 0),
    windspeedKmph: windKmph,
    windspeedMs: Math.round((windKmph / 3.6) * 10) / 10,
    precipMM: Number(c.precipMM ?? 0),
    precipProb,
    uvIndex: Number(c.uvIndex ?? 0),
    snowCM,
    weatherDesc: c.lang_ko?.[0]?.value ?? c.weatherDesc?.[0]?.value ?? "정보없음",
    weatherCode: String(c.weatherCode ?? ""),
    pm10: pm10Result.value,
    pm10Grade: pm10Result.grade,
    pm10Color: pm10Result.color,
    ...warnings,
    specialReport: "발효중인 특보 없음",
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
  const risks: string[] = [];
  const safetyPoints: string[] = [];

  if (weather.tempC >= 35) {
    risks.push("폭염(35°C 이상) 온열질환 위험 매우 높음");
    safetyPoints.push(`현재 기온 ${weather.tempC}°C(체감 ${weather.feelsLikeC}°C) 폭염 상황 — 30분 작업 후 10분 이상 그늘 휴식 필수, 시간당 500ml 이상 수분 섭취`);
  } else if (weather.tempC >= 33) {
    risks.push("고온(33°C 이상) 열탈진 주의");
    safetyPoints.push(`기온 ${weather.tempC}°C 고온 — 1시간마다 충분한 휴식과 수분(300ml 이상) 보충 필수`);
  } else if (weather.tempC <= -10) {
    risks.push("혹한(영하 10°C 이하) 저체온·동상 위험");
    safetyPoints.push(`${weather.tempC}°C 혹한 — 방한복·방한장갑·방한화 완전 착용 필수, 노출 피부 동상 위험`);
  } else if (weather.tempC <= 0 || weather.tempMinC <= 0) {
    risks.push("영하권 기온 결빙·근육경직 주의");
    safetyPoints.push(`기온 ${weather.tempC}°C (최저 ${weather.tempMinC}°C) 결빙 예상 — 노면·발판 결빙 확인, 미끄럼 방지 장화 착용`);
  } else if (weather.tempC <= 5 || weather.tempMinC <= 5) {
    risks.push("저온으로 신체 기능 저하 주의");
    safetyPoints.push(`기온 ${weather.tempC}°C 저온 (최저 ${weather.tempMinC}°C) — 방한복 착용, 30분마다 실내 이동으로 보온 유지`);
  }

  if (weather.precipMM >= 20) {
    risks.push("집중 강수로 재해 위험 매우 높음");
    safetyPoints.push(`강수량 ${weather.precipMM}mm 집중호우 — 옥외 철탑·전주 작업 즉시 중단, 낙뢰 위험 구간 접근 금지`);
  } else if (weather.precipMM >= 5) {
    risks.push("강우로 낙뢰·미끄럼 위험");
    safetyPoints.push(`강수량 ${weather.precipMM}mm 강우 — 젖은 노면·사다리·발판 미끄럼 위험, 절연장갑 착용 철저`);
  } else if (weather.precipMM > 0) {
    risks.push("소량 강수로 미끄럼 주의");
    safetyPoints.push(`강수량 ${weather.precipMM}mm — 노면 및 작업 발판 습기 주의, 절연장갑 착용`);
  }

  if (weather.windspeedKmph >= 55) {
    risks.push("강풍(55km/h 이상) 고소작업 불가");
    safetyPoints.push(`풍속 ${weather.windspeedKmph}km/h 강풍 — 10m 이상 고소작업 전면 금지, 지상 작업 시에도 낙하물 주의`);
  } else if (weather.windspeedKmph >= 35) {
    risks.push("강풍(35km/h 이상) 고소작업 위험");
    safetyPoints.push(`풍속 ${weather.windspeedKmph}km/h 강풍 — 철탑·안테나 작업 자제 권고, 안전대 2중 체결`);
  } else if (weather.windspeedKmph >= 20) {
    risks.push("바람 강함으로 고소작업 주의");
    safetyPoints.push(`풍속 ${weather.windspeedKmph}km/h — 고소작업 시 안전대 필수 착용, 가벼운 장비 고정`);
  }

  if (weather.uvIndex >= 8) {
    risks.push("자외선 매우 강함(UV 8 이상)");
    safetyPoints.push(`UV지수 ${weather.uvIndex} 자외선 매우 강함 — SPF50+ 자외선차단제 2시간마다 도포, 선글라스 착용`);
  } else if (weather.uvIndex >= 6) {
    safetyPoints.push(`UV지수 ${weather.uvIndex} 자외선 강함 — 자외선차단제 도포, 피부 노출 최소화`);
  }

  if (weather.pm10 !== null && weather.pm10 > 150) {
    risks.push("미세먼지 매우 나쁨");
    safetyPoints.push(`PM10 ${weather.pm10}μg/m³ 미세먼지 매우 나쁨 — N95 마스크 착용 필수, 야외작업 최소화`);
  } else if (weather.pm10 !== null && weather.pm10 > 80) {
    risks.push("미세먼지 나쁨, 호흡기 주의");
    safetyPoints.push(`PM10 ${weather.pm10}μg/m³ 미세먼지 나쁨 — 마스크 착용 권고, 장시간 야외 노출 자제`);
  }

  if (weather.humidity >= 85 && weather.tempC >= 28) {
    risks.push("고온다습으로 온열질환 위험");
    safetyPoints.push(`습도 ${weather.humidity}% 고온다습 — 전해질 음료 섭취, 통풍 작업복 착용`);
  }

  const riskSummary = risks.length > 0
    ? `⚠️ 오늘의 주요 위험: ${risks.join(" | ")}`
    : `✅ 오늘의 기상 조건: 비교적 양호 (${weather.weatherDesc}, ${weather.tempC}°C, 최저 ${weather.tempMinC}°C)`;

  if (safetyPoints.length === 0) {
    safetyPoints.push(`오늘 ${weather.city} 날씨는 ${weather.weatherDesc} ${weather.tempC}°C (최고 ${weather.tempMaxC}°C/최저 ${weather.tempMinC}°C) — 현장 작업에 큰 지장은 없으나 기본 안전수칙 준수 필요`);
  }

  const prompt = `당신은 KT MOS남부 통신 현장 안전관리 전문가입니다.
아래의 실시간 날씨 데이터와 위험 분석 결과를 바탕으로, 현장 근무자에게 전달할 구체적이고 실용적인 안전메시지를 작성하세요.

[${weather.city} 실시간 날씨]
- 현재 기온: ${weather.tempC}°C (체감 ${weather.feelsLikeC}°C)
- 최고/최저: ${weather.tempMaxC}°C / ${weather.tempMinC}°C
- 날씨: ${weather.weatherDesc}
- 풍속: ${weather.windspeedKmph}km/h (${weather.windspeedMs}m/s)
- 습도: ${weather.humidity}%
- 강수량: ${weather.precipMM}mm (강수확률 ${weather.precipProb}%)
- 적설량: ${weather.snowCM > 0 ? weather.snowCM + "cm" : "없음"}
- 자외선지수: ${weather.uvIndex}
- 미세먼지(PM10): ${weather.pm10 !== null ? weather.pm10 + "μg/m³ (" + weather.pm10Grade + ")" : "정보없음"}

[위험 분석]
${riskSummary}

[날씨별 안전 포인트]
${safetyPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}

[작성 규칙]
- 대상: 통신탑, 기지국, 전신주, 광케이블 야외 전기통신 설비 유지보수 작업자
- 실제 수치(기온, 최고/최저, 풍속 등)를 본문에 직접 인용
- 이모지를 활용하여 가독성 향상
- 본문 6~8문장, 날씨 데이터를 충분히 반영하여 상세하게 작성
- 작업자 안전에 대한 진심 어린 당부로 마무리

반드시 아래 형식으로만 출력하세요. 다른 내용 절대 금지:
TITLE: 여기에 제목 (이모지 포함, 20자 이내)
CONTENT: 여기에 본문 내용 전체`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-nano",
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 1000,
  });

  const raw = (response.choices[0]?.message?.content ?? "").trim();

  const titleMatch = raw.match(/TITLE:\s*(.+)/);
  const contentMatch = raw.match(/CONTENT:\s*([\s\S]+)/);

  const title = titleMatch?.[1]?.trim() || `☀️ ${weather.city} 날씨 안전메시지`;
  const content = contentMatch?.[1]?.trim() || raw.replace(/TITLE:.*\n?/, "").trim();

  if (!content || content.length < 20) {
    const fallbackContent = [
      `📍 오늘 ${weather.city}의 현재 기온은 ${weather.tempC}°C(체감 ${weather.feelsLikeC}°C)이며, 날씨 상태는 ${weather.weatherDesc}입니다. 오늘의 최고 기온은 ${weather.tempMaxC}°C, 최저 기온은 ${weather.tempMinC}°C로 예상됩니다.`,
      riskSummary,
      ...safetyPoints.map(p => `✅ ${p}`),
      `🙏 오늘도 현장 근무자 여러분 모두 안전한 하루 보내시길 바랍니다. 작업 전 안전장비 착용을 반드시 확인해 주세요.`,
    ].join("\n\n");
    return { title, content: fallbackContent };
  }

  return { title, content };
}
