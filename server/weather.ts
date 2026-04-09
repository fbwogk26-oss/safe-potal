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

// 도시 → 좌표 매핑 (Open-Meteo API용, 인증 불필요)
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
    const nowUtc = new Date();
    const kstMs = nowUtc.getTime() + 9 * 60 * 60 * 1000;
    const nowHour = new Date(kstMs).toISOString().slice(0, 13);
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

  if (serviceKey) {
    const value = await fetchPm10AirKorea(city, serviceKey);
    if (value !== null) {
      return { value, ...pm10Grade(value) };
    }
  }

  const value = await fetchPm10OpenMeteo(city);
  if (value !== null) {
    return { value, ...pm10Grade(value) };
  }

  return { value: null, grade: null, color: null };
}

// WMO 날씨 코드 → 한국어 설명 (Open-Meteo fallback용)
const WMO_DESC: Record<number, string> = {
  0: "맑음", 1: "대체로 맑음", 2: "대체로 흐림", 3: "흐림",
  45: "안개", 48: "안개 결빙",
  51: "가벼운 이슬비", 53: "이슬비", 55: "강한 이슬비",
  61: "가벼운 비", 63: "비", 65: "강한 비",
  66: "가벼운 어는 비", 67: "어는 비",
  71: "가벼운 눈", 73: "눈", 75: "강한 눈", 77: "가루눈",
  80: "소나기", 81: "강한 소나기", 82: "매우 강한 소나기",
  85: "눈소나기", 86: "강한 눈소나기",
  95: "뇌우", 96: "강한 뇌우", 99: "매우 강한 뇌우",
};

// WMO 코드 → wttr.in weatherCode 근사 매핑 (이모지 표시용)
const WMO_TO_WTTR_CODE: Record<number, string> = {
  0: "113", 1: "116", 2: "119", 3: "122",
  45: "143", 48: "143",
  51: "263", 53: "266", 55: "266",
  61: "293", 63: "296", 65: "302",
  66: "311", 67: "314",
  71: "323", 73: "326", 75: "338", 77: "320",
  80: "293", 81: "299", 82: "302",
  85: "323", 86: "329",
  95: "389", 96: "392", 99: "395",
};

// Open-Meteo 날씨 API fallback (wttr.in 오류 시 사용, 무료·인증 불필요)
async function fetchWeatherOpenMeteo(city: string, pm10Result: { value: number | null; grade: string | null; color: string | null }): Promise<WeatherData> {
  const coords = CITY_COORDS[city];
  if (!coords) throw new Error(`Open-Meteo: 좌표 없음 (${city})`);

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m,uv_index,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,snowfall_sum&timezone=Asia%2FSeoul&forecast_days=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "SafeBoard/1.0" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Open-Meteo API 오류: ${res.status}`);

  const json = (await res.json()) as any;
  const c = json?.current;
  const daily = json?.daily;
  if (!c) throw new Error("Open-Meteo 데이터 파싱 실패");

  const wmoCode: number = Number(c.weather_code ?? 0);
  const windKmph = Number(c.wind_speed_10m ?? 0);
  const tempMaxC = Number(daily?.temperature_2m_max?.[0] ?? c.temperature_2m ?? 0);
  const tempMinC = Number(daily?.temperature_2m_min?.[0] ?? c.temperature_2m ?? 0);
  const precipProb = Number(daily?.precipitation_probability_max?.[0] ?? 0);
  const snowCM = Number(daily?.snowfall_sum?.[0] ?? 0);
  const precipMM = Number(c.precipitation ?? daily?.precipitation_sum?.[0] ?? 0);

  const warnings = computeWarnings({
    tempC: Number(c.temperature_2m ?? 0),
    tempMinC,
    tempMaxC,
    precipMM,
    windspeedKmph: windKmph,
    uvIndex: Number(c.uv_index ?? 0),
    humidity: Number(c.relative_humidity_2m ?? 0),
  }, pm10Result.value);

  console.log(`[Weather/OpenMeteo] city=${city} temp=${c.temperature_2m} wmo=${wmoCode}`);

  return {
    city,
    tempC: Number(c.temperature_2m ?? 0),
    feelsLikeC: Number(c.apparent_temperature ?? c.temperature_2m ?? 0),
    tempMaxC,
    tempMinC,
    humidity: Number(c.relative_humidity_2m ?? 0),
    windspeedKmph: windKmph,
    windspeedMs: Math.round((windKmph / 3.6) * 10) / 10,
    precipMM,
    precipProb,
    uvIndex: Number(c.uv_index ?? 0),
    snowCM,
    weatherDesc: WMO_DESC[wmoCode] ?? "정보없음",
    weatherCode: WMO_TO_WTTR_CODE[wmoCode] ?? "113",
    pm10: pm10Result.value,
    pm10Grade: pm10Result.grade,
    pm10Color: pm10Result.color,
    ...warnings,
    specialReport: "발효중인 특보 없음",
    fetchedAt: new Date().toISOString(),
  };
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

  if (weather.tempC >= 35) {
    warnings.push("폭염주의보");
    risks.push("기지국 옥상·전신주 작업 중 열사병·열탈진 위험");
    actions.push("철탑·옥상 작업 1시간마다 그늘 휴식 필수, 물·이온음료 수시 섭취, 2인 1조 작업으로 건강 상태 상호 확인, 어지럼증 느끼면 즉시 작업 중단 후 신고");
  } else if (weather.tempC >= 33) {
    warnings.push("고온주의");
    risks.push("야외 현장 장시간 작업 시 온열질환 위험");
    actions.push("1시간 작업 후 15분 이상 그늘 휴식, 수분 300ml 이상 섭취, 통기성 좋은 작업복 착용, 얼음조끼 활용 권고");
  }

  if (weather.tempC <= -5 || weather.tempMinC <= 0) {
    warnings.push("결빙우려");
    risks.push("전주 발판·기지국 옥상 바닥 결빙으로 추락 위험, 야간 노면 결빙으로 차량 사고 위험");
    actions.push("승주 전 발판 결빙 상태 반드시 확인 및 제빙, 아이젠 또는 미끄럼방지 안전화 착용, 새벽 현장 이동 시 서행 및 안전거리 확보, 고소작업차 아웃트리거 설치 지면 상태 확인");
  } else if (weather.tempC <= 5 || weather.tempMinC <= 5) {
    warnings.push("저온주의");
    risks.push("손발 감각 저하로 공구 조작 실수, 근육경직으로 추락 위험 증가");
    actions.push("방한복·방한장갑 착용(단, 작업 시 절연장갑으로 교체), 핫팩 지참, 승주 전 준비운동으로 근육 경직 예방, 저체온 증상 시 즉시 작업 중단");
  }

  if (weather.precipMM >= 20) {
    warnings.push("집중호우");
    risks.push("낙뢰·지반 유실·맨홀 침수 위험");
    actions.push("통신탑·전신주 고소작업 즉시 중단 및 지상 대기, 맨홀 개방 작업 금지, 차량은 안전지대로 이동, 낙뢰 시 안테나·철구조물 접근 금지");
  } else if (weather.precipMM >= 5) {
    warnings.push("강우주의");
    risks.push("전신주·통신탑 발판 미끄럼·감전 위험");
    actions.push("절연장갑·미끄럼방지 안전화 착용, 전주 승주 시 2인 1조 작업, 광케이블 접속 작업 전 절연 확인, 전기 설비 접촉 금지");
  } else if (weather.precipMM > 0) {
    warnings.push("소량 강수");
    risks.push("전주·기지국 발판 습기로 미끄럼 위험");
    actions.push("승주 전 발판 물기 완전 제거, 안전화 착용, 젖은 케이블 함부로 다루지 않기");
  }

  if (weather.windspeedKmph >= 55) {
    warnings.push("강풍경보");
    risks.push("통신탑·전신주 고소작업 추락·낙하물 위험");
    actions.push("기지국 옥상·통신탑·전신주 고소작업 전면 금지, 안테나 교체·케이블 포설 작업 중단, 공구·자재 낙하 방지 고정 후 철수");
  } else if (weather.windspeedKmph >= 35) {
    warnings.push("강풍주의보");
    risks.push("고소작업 균형 불안정, 공중 케이블 포설 위험");
    actions.push("안전대 이중 체결 필수, 경량 자재·공구 밧줄 결박, 공중 광케이블 포설 작업 보류");
  } else if (weather.windspeedKmph >= 20) {
    warnings.push("바람 강함");
    risks.push("전신주 작업 시 공구·자재 낙하 위험");
    actions.push("안전대 착용 및 낙하물 방지망 설치, 공구는 공구함에 보관, 아래 작업자 접근 통제");
  }

  if (weather.uvIndex >= 8) {
    warnings.push("자외선 매우강함");
    risks.push("옥상·철탑 장시간 노출 시 피부 화상·열사병 위험");
    actions.push("기지국 옥상·통신탑 작업 시 자외선차단제(SPF50+) 도포, 차광 모자·선글라스 착용, 1시간마다 그늘 휴식");
  } else if (weather.uvIndex >= 6) {
    warnings.push("자외선 강함");
    risks.push("야외 현장 작업 시 피부 손상 위험");
    actions.push("자외선차단제 도포, 긴소매 작업복 착용, 직사광선 노출 최소화");
  }

  if (pm10 !== null && pm10 > 150) {
    warnings.push("미세먼지 매우나쁨");
    risks.push("야외 현장 호흡기 심각한 손상 위험");
    actions.push("KF94 이상 마스크 착용 필수, 맨홀·지하 공동구 작업 시 환기 후 입장, 야외 작업 시간 최소화 및 차량 내 대기");
  } else if (pm10 !== null && pm10 > 80) {
    warnings.push("미세먼지 나쁨");
    risks.push("야외 현장 호흡기 질환 위험");
    actions.push("KF80 이상 마스크 착용, 지하 공동구·맨홀 작업 전 환기 실시");
  } else if (pm10 !== null && pm10 > 30) {
    warnings.push("미세먼지 보통");
    risks.push("민감군 호흡기 주의");
    actions.push("장시간 야외 현장 작업 시 마스크 착용 권고");
  }

  if (warnings.length === 0) {
    warnings.push("특이 기상 없음");
    risks.push("통신 현장 기본 안전수칙 준수 필요");
    actions.push("작업 전 안전장비(안전대·안전모·절연장갑) 착용 확인, 2인 1조 원칙 준수, 작업 전 위험성평가 실시");
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

  // PM10은 항상 병렬로 가져옴
  const pm10Result = await fetchPm10(city);

  // 1차: wttr.in
  try {
    const encodedCity = encodeURIComponent(city);
    const url = `https://wttr.in/${encodedCity}?format=j1`;

    const res = await fetch(url, {
      headers: { "User-Agent": "SafeBoard/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`wttr.in HTTP ${res.status}`);
    }

    const raw = (await res.json()) as any;
    const json = raw?.data ?? raw;
    const c = json?.current_condition?.[0];
    if (!c) throw new Error("wttr.in 파싱 실패");

    const daily = json?.weather?.[0];
    const hourly: any[] = daily?.hourly ?? [];
    const tempMaxC = Number(daily?.maxtempC ?? c.temp_C ?? 0);
    const tempMinC = Number(daily?.mintempC ?? c.temp_C ?? 0);
    const snowCM = hourly.reduce((max: number, h: any) => Math.max(max, Number(h.snowfall_cm ?? 0)), 0);
    const precipProb = hourly.reduce((max: number, h: any) => Math.max(max, Number(h.chanceofrain ?? 0)), 0);
    const windKmph = Number(c.windspeedKmph ?? 0);

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

  } catch (wttrErr) {
    console.warn(`[Weather/wttr.in] 실패: ${wttrErr} → Open-Meteo fallback 시도`);
  }

  // 2차 fallback: Open-Meteo (무료, 인증 불필요)
  try {
    const data = await fetchWeatherOpenMeteo(city, pm10Result);
    weatherCache.set(cacheKey, { data, fetchedAt: Date.now() });
    return data;
  } catch (openMeteoErr) {
    console.error(`[Weather/OpenMeteo] 실패: ${openMeteoErr}`);
    throw new Error(`날씨 데이터를 가져올 수 없습니다 (wttr.in, Open-Meteo 모두 실패)`);
  }
}

export function clearWeatherCache(city?: string) {
  if (city) weatherCache.delete(city.toLowerCase());
  else weatherCache.clear();
}

export async function generateSafetyMessage(weather: WeatherData): Promise<{
  title: string;
  content: string;
}> {
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

  const prompt = `당신은 스피드이엔지(KT MOS 남부) 통신 현장 안전보건관리 전문가입니다.
아래 날씨 정보를 바탕으로 통신 현장 작업자들을 위한 실질적이고 구체적인 안전 당부 메시지를 작성하세요.

[오늘 ${weather.city} 기상 현황]
- 기온: ${weather.tempC}°C (체감 ${weather.feelsLikeC}°C, 최고 ${weather.tempMaxC}°C / 최저 ${weather.tempMinC}°C)
- 강수량: ${weather.precipMM}mm | 풍속: ${weather.windspeedMs}m/s | 습도: ${weather.humidity}%
- 경고요인: ${weather.warningFactor}
- 위험요인: ${weather.riskFactor}
- 권장 안전조치: ${weather.safetyAction}

[작업 현장 환경 — 반드시 아래 상황에 맞는 안전조치를 포함할 것]
- 전신주(전주) 승주 작업: 추락방지용 안전대(Y형/벨트형) 착용, 승주 발판 상태 확인, 2인 1조 원칙
- 이동통신 기지국(BTS) 옥상 및 철탑 작업: 안전모·안전대 착용, 공구낙하 방지줄 사용, 혼자 작업 금지
- 통신 케이블(광케이블·동축케이블) 포설 및 접속 작업: 절연장갑 착용, 활선 여부 확인 후 작업, 케이블 장력 조심
- 맨홀·지하 공동구 진입 작업: 산소농도·유해가스 측정 후 진입, 환기 실시, 안전줄 착용, 보조자 배치
- 차량 이동 및 현장 진출입: 방어운전 생활화, 현장 주차 시 안전삼각대 설치, 야간 반사조끼 착용
- 고소작업차(버킷트럭) 운용: 아웃트리거 완전 전개, 탑승 전 장비 점검, 풍속 10m/s 초과 시 작업 중단

[작성 규칙]
- 반드시 한글로만 작성 (영어 단어 사용 금지)
- 오늘의 기상 상황과 연계하여 위 작업 중 위험이 높아지는 항목을 우선 강조
- 이모지를 적극 활용하여 가독성 높이기
- 3~5문장으로 작성 (너무 짧지 않게, 현장에서 바로 실천할 수 있는 구체적인 행동 지침)
- 마지막 문장은 "오늘도 모두 안전하게 귀가하시길 바랍니다" 류의 마무리 문구로 끝내기

반드시 아래 형식으로만 출력하세요:
ADVICE: 여기에 안전 당부 내용만`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-nano",
      messages: [
        {
          role: "system",
          content: "당신은 통신 현장(전신주 승주, 기지국 철탑, 맨홀, 고소작업차 등) 안전보건 전문가입니다. 모든 답변은 반드시 한글로만 작성하고, 날씨와 연계된 구체적인 현장 안전조치를 상세히 안내합니다.",
        },
        { role: "user", content: prompt },
      ],
      max_completion_tokens: 700,
    });

    const raw = (response.choices[0]?.message?.content ?? "").trim();
    // ADVICE: 패턴 포함 여부 우선 확인, 없으면 전체 내용 사용
    const adviceMatch = raw.match(/ADVICE:\s*([\s\S]+)/i);
    const advice = adviceMatch ? adviceMatch[1].trim() : raw;

    if (advice && advice.length >= 20) {
      const content = `${structuredHeader}\n\n${advice}`;
      return { title: `☀️ ${weather.city} 날씨 안전메시지`, content };
    }
  } catch (err) {
    console.error("[Weather AI] 메시지 생성 실패:", err);
  }

  // AI 실패 시 날씨 조건별 맞춤 안전 당부 메시지 생성
  const fallbackLines: string[] = [];

  if (weather.precipMM >= 20) {
    fallbackLines.push(`🌧️ 오늘 ${weather.city} 지역에 집중호우(${weather.precipMM}mm)가 예보되어 있습니다. 전신주 승주·기지국 옥상·통신탑 등 모든 고소작업을 즉시 중단하고, 낙뢰 발생 시 안테나·철구조물 접근을 금지하세요.`);
    fallbackLines.push(`🚫 맨홀·지하 공동구 진입 작업은 침수 위험으로 절대 금지하며, 차량은 안전지대로 이동하고 호우 상황이 종료될 때까지 대기하세요.`);
  } else if (weather.precipMM >= 5) {
    fallbackLines.push(`🌧️ 오늘 ${weather.city}에 강우(${weather.precipMM}mm)가 예보되어 전신주·통신탑 발판이 미끄러울 수 있습니다. 승주 전 발판 물기를 완전히 제거하고 미끄럼방지 안전화와 절연장갑을 반드시 착용하세요.`);
    fallbackLines.push(`⚡ 빗물로 인한 감전 위험이 높아집니다. 전주 승주 작업은 2인 1조로 진행하고, 광케이블 접속 작업 전 활선 여부를 반드시 확인하세요. 고소작업차(버킷트럭) 운용 시 젖은 지면의 아웃트리거 침하 여부를 점검하세요.`);
  } else if (weather.precipMM > 0) {
    fallbackLines.push(`🌦️ 오늘 이슬비 또는 소량 강수(${weather.precipMM}mm)가 내려 전신주 발판과 기지국 옥상 바닥이 미끄러울 수 있습니다. 승주 전 발판 물기를 완전히 닦아내고, 젖은 케이블·전기설비는 절연장갑 착용 후 다루세요.`);
    fallbackLines.push(`🔧 광케이블 포설·접속 작업 시 케이블 피복 손상 여부를 사전 확인하고, 맨홀 진입 전 유해가스 측정과 환기를 실시하세요. 차량 현장 이동 시 빗길 서행 및 안전거리를 확보하세요.`);
  }

  if (weather.windspeedKmph >= 55) {
    fallbackLines.push(`💨 강풍경보(풍속 ${weather.windspeedMs}m/s)가 발효 중입니다. 기지국 옥상·통신탑·전신주 고소작업을 전면 금지하고 장비·자재를 고정 후 즉시 철수하세요.`);
  } else if (weather.windspeedKmph >= 35) {
    fallbackLines.push(`💨 강풍(풍속 ${weather.windspeedMs}m/s)으로 고소작업 중 균형 불안정이 우려됩니다. 안전대를 이중으로 체결하고, 공중 광케이블 포설 작업은 보류하세요.`);
  } else if (weather.windspeedKmph >= 20) {
    fallbackLines.push(`🌬️ 바람이 강합니다(풍속 ${weather.windspeedMs}m/s). 전신주 작업 중 공구·볼트 등 낙하물 위험에 주의하고, 낙하물 방지망을 설치한 뒤 아래 작업자 접근을 통제하세요.`);
  }

  if (weather.tempC >= 35) {
    fallbackLines.push(`🌡️ 폭염(${weather.tempC}°C)으로 기지국 옥상·철탑 작업 중 열사병 위험이 높습니다. 1시간마다 그늘에서 휴식하고, 물·이온음료를 수시로 섭취하세요. 어지럼증 발생 시 즉시 작업을 중단하고 신고하세요.`);
  } else if (weather.tempC <= -5 || weather.tempMinC <= 0) {
    fallbackLines.push(`🧊 결빙 우려(최저 ${weather.tempMinC}°C)로 전주 발판·기지국 옥상이 얼어 있을 수 있습니다. 승주 전 발판 결빙 여부를 반드시 확인하고 제빙한 뒤 아이젠·미끄럼방지 안전화를 착용하세요.`);
  }

  if (weather.pm10 !== null && weather.pm10 > 150) {
    fallbackLines.push(`😷 미세먼지 매우나쁨(PM10 ${weather.pm10}μg/m³)입니다. 야외 현장 작업 시 KF94 이상 마스크를 착용하고, 맨홀·지하 공동구 진입 전 환기를 충분히 실시하세요.`);
  }

  if (fallbackLines.length === 0) {
    fallbackLines.push(`✅ 오늘 ${weather.city}의 기상 상태는 비교적 양호합니다(기온 ${weather.tempC}°C, 풍속 ${weather.windspeedMs}m/s). 통신 현장 작업 전 안전모·안전대·절연장갑 등 보호구 착용 상태를 반드시 점검하고, 전신주 승주·맨홀 진입 시 2인 1조 원칙을 지켜주세요.`);
    fallbackLines.push(`🔧 고소작업차(버킷트럭) 운용 전 아웃트리거 완전 전개 여부와 주변 장애물을 확인하고, 광케이블 접속 작업 시 활선 여부 확인을 생활화하세요.`);
  }

  fallbackLines.push(`🙏 오늘도 현장 근무자 여러분 모두 안전하게 작업하고 무사히 귀가하시길 바랍니다.`);

  const content = `${structuredHeader}\n\n${fallbackLines.join("\n")}`;
  return { title: `☀️ ${weather.city} 날씨 안전메시지`, content };
}
