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

// 도시 → 시도 매핑 (에어코리아 시도별 조회용)
const CITY_TO_SIDO: Record<string, string> = {
  대구: "대구",
  구미: "경북",
  포항: "경북",
  안동: "경북",
  문경: "경북",
  울릉도: "경북",
  울진: "경북",
  부산: "부산",
  울산: "울산",
  서울: "서울",
  인천: "인천",
  광주: "광주",
  대전: "대전",
  세종: "세종",
  수원: "경기",
  창원: "경남",
  전주: "전북",
};

function pm10Grade(value: number): { grade: string; color: string } {
  if (value <= 30) return { grade: "좋음", color: "#22c55e" };
  if (value <= 80) return { grade: "보통", color: "#eab308" };
  if (value <= 150) return { grade: "나쁨", color: "#f97316" };
  return { grade: "매우나쁨", color: "#ef4444" };
}

async function fetchPm10AirKorea(city: string, serviceKey: string): Promise<number | null> {
  const sidoName = CITY_TO_SIDO[city] ?? city;
  try {
    // 시도별 실시간 평균정보 조회 (역명 필요 없음)
    const url = new URL("https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty");
    url.searchParams.append("serviceKey", serviceKey);
    url.searchParams.append("sidoName", sidoName);
    url.searchParams.append("pageNo", "1");
    url.searchParams.append("numOfRows", "10");
    url.searchParams.append("returnType", "json");
    url.searchParams.append("ver", "1.0");

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "SafeBoard/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`[PM10/AirKorea] HTTP ${res.status} for sido=${sidoName}`);
      return null;
    }

    const json = (await res.json()) as any;
    const resultCode = json?.response?.header?.resultCode;
    if (resultCode && resultCode !== "00") {
      console.warn(`[PM10/AirKorea] resultCode=${resultCode}: ${json?.response?.header?.resultMsg}`);
      return null;
    }

    const itemsRaw = json?.response?.body?.items;
    const items: any[] = Array.isArray(itemsRaw)
      ? itemsRaw
      : Array.isArray(itemsRaw?.item)
        ? itemsRaw.item
        : [];

    // 첫 번째 유효한 pm10 값 추출
    for (const item of items) {
      const raw = item?.pm10Value ?? item?.pm10;
      if (raw && raw !== "-") {
        const v = Number(raw);
        if (!isNaN(v)) {
          console.log(`[PM10/AirKorea] sido=${sidoName} station=${item?.stationName} pm10=${v}`);
          return v;
        }
      }
    }
    console.warn(`[PM10/AirKorea] No valid pm10 data for sido=${sidoName}`);
    return null;
  } catch (e) {
    console.warn(`[PM10/AirKorea] Error: ${e}`);
    return null;
  }
}

// 도시 → 좌표 매핑 (Open-Meteo 대기질 API용, 인증 불필요)
const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  대구:   { lat: 35.8714, lon: 128.6014 },
  구미:   { lat: 36.1197, lon: 128.3445 },
  포항:   { lat: 36.0190, lon: 129.3435 },
  안동:   { lat: 36.5684, lon: 128.7294 },
  문경:   { lat: 36.5866, lon: 128.1859 },
  울릉도: { lat: 37.4855, lon: 130.9058 },
  울진:   { lat: 36.9929, lon: 129.4003 },
  부산:   { lat: 35.1796, lon: 129.0756 },
  울산:   { lat: 35.5384, lon: 129.3114 },
  서울:   { lat: 37.5665, lon: 126.9780 },
  인천:   { lat: 37.4563, lon: 126.7052 },
  광주:   { lat: 35.1595, lon: 126.8526 },
  대전:   { lat: 36.3504, lon: 127.3845 },
  세종:   { lat: 36.5040, lon: 127.2495 },
  수원:   { lat: 37.2636, lon: 127.0286 },
  창원:   { lat: 35.2280, lon: 128.6811 },
  전주:   { lat: 35.8242, lon: 127.1480 },
};

async function fetchPm10OpenMeteo(city: string): Promise<number | null> {
  // Open-Meteo 대기질 API (무료, 인증 불필요, 좌표 기반)
  const coords = CITY_COORDS[city];
  if (!coords) {
    console.warn(`[PM10/OpenMeteo] No coordinates for city=${city}`);
    return null;
  }
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${coords.lat}&longitude=${coords.lon}&hourly=pm10&timezone=Asia%2FSeoul&forecast_days=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "SafeBoard/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`[PM10/OpenMeteo] HTTP ${res.status} for city=${city}`);
      return null;
    }
    const json = (await res.json()) as any;
    const times: string[] = json?.hourly?.time ?? [];
    const pm10s: (number | null)[] = json?.hourly?.pm10 ?? [];
    // 현재 시간(KST)에 가장 가까운 인덱스 찾기 (KST = UTC+9)
    const nowUtc = new Date();
    const kstMs = nowUtc.getTime() + 9 * 60 * 60 * 1000;
    const nowHour = new Date(kstMs).toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
    let idx = times.findIndex((t) => t.startsWith(nowHour));
    if (idx < 0) idx = 0;
    const v = pm10s[idx];
    if (v == null || isNaN(Number(v))) return null;
    console.log(`[PM10/OpenMeteo] city=${city} hour=${times[idx]} pm10=${v}`);
    return Number(v);
  } catch (e) {
    console.warn(`[PM10/OpenMeteo] Error: ${e}`);
    return null;
  }
}

async function fetchPm10(city: string): Promise<{ value: number | null; grade: string | null; color: string | null }> {
  const serviceKey = process.env.KOSHA_SERVICE_KEY;

  // 1차: 에어코리아 API (KOSHA 키 필요)
  if (serviceKey) {
    const value = await fetchPm10AirKorea(city, serviceKey);
    if (value !== null) {
      return { value, ...pm10Grade(value) };
    }
  }

  // 2차 폴백: Open-Meteo 대기질 API (무료, 인증 불필요, 좌표 기반)
  const value = await fetchPm10OpenMeteo(city);
  if (value !== null) {
    return { value, ...pm10Grade(value) };
  }

  return { value: null, grade: null, color: null };
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
  // 캔버스 이미지와 동일한 구조화된 헤더 (이미지와 100% 일치)
  const now = new Date();
  const dateStr = `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일`;

  const structuredHeader = [
    `📍 오늘 ${weather.city}의 현재 기온은 ${weather.tempC}°C(체감 ${weather.feelsLikeC}°C)이며, 날씨 상태는 ${weather.weatherDesc}입니다. 오늘의 최고 기온은 ${weather.tempMaxC}°C, 최저 기온은 ${weather.tempMinC}°C로 예상됩니다.`,
    ``,
    `🌡 기상 현황 (${dateStr} 기준)`,
    `강수량 ${weather.precipMM > 0 ? weather.precipMM + "mm" : "없음"} | 강수확률 ${weather.precipProb}% | 풍속 ${weather.windspeedMs}m/s | 습도 ${weather.humidity}%`,
    `적설량 ${weather.snowCM > 0 ? weather.snowCM + "cm" : "없음"} | 미세먼지(PM10) ${weather.pm10 !== null ? weather.pm10 + "μg/m³ (" + (weather.pm10Grade ?? "-") + ")" : "정보없음"}`,
    ``,
    `⚠️ 경고요인: ${weather.warningFactor}`,
    ``,
    `🔴 위험요인: ${weather.riskFactor}`,
    ``,
    `✅ 안전조치: ${weather.safetyAction}`,
    ``,
    `📢 기상특보: ${weather.specialReport}`,
  ].join("\n");

  // AI로 현장 맞춤 안전 당부 문구 추가 생성
  const prompt = `당신은 KT MOS남부 통신 현장 안전관리 전문가입니다.
아래 날씨 데이터와 위험 분석을 바탕으로, 현장 근무자를 위한 구체적인 안전 당부 2~3문장을 작성하세요.

[${weather.city} 오늘 날씨]
- 기온: ${weather.tempC}°C (체감 ${weather.feelsLikeC}°C, 최고 ${weather.tempMaxC}°C / 최저 ${weather.tempMinC}°C)
- 경고요인: ${weather.warningFactor}
- 위험요인: ${weather.riskFactor}
- 안전조치: ${weather.safetyAction}

[작성 규칙]
- 통신탑, 기지국, 전신주, 광케이블 야외 작업자 대상
- 위의 경고/위험/안전조치 내용을 반드시 반영
- 이모지 활용, 간결하게 2~3문장
- 마지막에 안전 당부 마무리 문장 포함

반드시 아래 형식으로만 출력하세요:
ADVICE: 여기에 안전 당부 내용만`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-nano",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 400,
    });

    const raw = (response.choices[0]?.message?.content ?? "").trim();
    const adviceMatch = raw.match(/ADVICE:\s*([\s\S]+)/);
    const advice = adviceMatch?.[1]?.trim() || "";

    if (advice && advice.length >= 20) {
      const content = `${structuredHeader}\n\n${advice}`;
      return { title: `☀️ ${weather.city} 날씨 안전메시지`, content };
    }
  } catch (_) {
    // AI 실패 시 구조화 내용만 사용
  }

  // 폴백: 구조화된 내용 + 기본 마무리
  const content = `${structuredHeader}\n\n🙏 오늘도 현장 근무자 여러분 모두 안전한 하루 보내시길 바랍니다. 작업 전 안전장비 착용을 반드시 확인해 주세요.`;
  return { title: `☀️ ${weather.city} 날씨 안전메시지`, content };
}
