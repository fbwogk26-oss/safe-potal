export interface KoshaMajorAccident {
  dsptYr: string;
  dsptMm: string;
  bizplcNm: string;
  accdntDt: string;
  indstryNm: string;
  accdntTpNm: string;
  accdntCausNm: string;
  dthNum: number;
  injuNum: number;
  locNm: string;
}

interface CacheEntry {
  data: KoshaMajorAccident[];
  fetchedAt: number;
  isSampleData: boolean;
}

let accidentCache: CacheEntry | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

const SAMPLE_ACCIDENTS: KoshaMajorAccident[] = [
  {
    dsptYr: "2025",
    dsptMm: "12",
    bizplcNm: "(주)건설현장",
    accdntDt: "2025-12-15",
    indstryNm: "건설업",
    accdntTpNm: "떨어짐",
    accdntCausNm: "안전난간 미설치",
    dthNum: 1,
    injuNum: 0,
    locNm: "경기도",
  },
  {
    dsptYr: "2025",
    dsptMm: "11",
    bizplcNm: "(주)제조사업장",
    accdntDt: "2025-11-28",
    indstryNm: "제조업",
    accdntTpNm: "끼임",
    accdntCausNm: "방호장치 미작동",
    dthNum: 1,
    injuNum: 0,
    locNm: "경상남도",
  },
  {
    dsptYr: "2025",
    dsptMm: "11",
    bizplcNm: "(유)물류창고",
    accdntDt: "2025-11-10",
    indstryNm: "운수·창고업",
    accdntTpNm: "부딪힘",
    accdntCausNm: "지게차 안전통로 미확보",
    dthNum: 1,
    injuNum: 1,
    locNm: "인천광역시",
  },
  {
    dsptYr: "2025",
    dsptMm: "10",
    bizplcNm: "(주)조선소",
    accdntDt: "2025-10-22",
    indstryNm: "조선업",
    accdntTpNm: "폭발·파열",
    accdntCausNm: "밀폐공간 가스 누출",
    dthNum: 2,
    injuNum: 3,
    locNm: "경상남도",
  },
  {
    dsptYr: "2025",
    dsptMm: "10",
    bizplcNm: "(주)화학공장",
    accdntDt: "2025-10-05",
    indstryNm: "화학·고무·플라스틱제조업",
    accdntTpNm: "화재",
    accdntCausNm: "인화성 물질 관리 소홀",
    dthNum: 1,
    injuNum: 2,
    locNm: "충청남도",
  },
  {
    dsptYr: "2025",
    dsptMm: "09",
    bizplcNm: "(주)터널공사",
    accdntDt: "2025-09-18",
    indstryNm: "건설업",
    accdntTpNm: "무너짐",
    accdntCausNm: "지반 붕괴 위험 미조치",
    dthNum: 1,
    injuNum: 0,
    locNm: "강원도",
  },
  {
    dsptYr: "2025",
    dsptMm: "09",
    bizplcNm: "(주)전기설비업체",
    accdntDt: "2025-09-03",
    indstryNm: "전기·가스·수도업",
    accdntTpNm: "감전",
    accdntCausNm: "활선 작업 중 안전조치 미이행",
    dthNum: 1,
    injuNum: 0,
    locNm: "서울특별시",
  },
  {
    dsptYr: "2025",
    dsptMm: "08",
    bizplcNm: "(주)플랜트업체",
    accdntDt: "2025-08-20",
    indstryNm: "제조업",
    accdntTpNm: "질식",
    accdntCausNm: "밀폐공간 환기 미조치",
    dthNum: 2,
    injuNum: 1,
    locNm: "전라남도",
  },
  {
    dsptYr: "2025",
    dsptMm: "08",
    bizplcNm: "(주)아파트공사",
    accdntDt: "2025-08-07",
    indstryNm: "건설업",
    accdntTpNm: "떨어짐",
    accdntCausNm: "개구부 덮개 미설치",
    dthNum: 1,
    injuNum: 0,
    locNm: "부산광역시",
  },
  {
    dsptYr: "2025",
    dsptMm: "07",
    bizplcNm: "(주)식품가공공장",
    accdntDt: "2025-07-14",
    indstryNm: "식품제조업",
    accdntTpNm: "끼임",
    accdntCausNm: "컨베이어 정비 중 전원 미차단",
    dthNum: 1,
    injuNum: 0,
    locNm: "경기도",
  },
  {
    dsptYr: "2025",
    dsptMm: "06",
    bizplcNm: "(주)도금공장",
    accdntDt: "2025-06-25",
    indstryNm: "금속제품제조업",
    accdntTpNm: "유해물질 노출",
    accdntCausNm: "유해화학물질 취급 중 보호구 미착용",
    dthNum: 1,
    injuNum: 2,
    locNm: "대구광역시",
  },
  {
    dsptYr: "2025",
    dsptMm: "05",
    bizplcNm: "(주)건축공사현장",
    accdntDt: "2025-05-30",
    indstryNm: "건설업",
    accdntTpNm: "물체에 맞음",
    accdntCausNm: "고소작업 중 공구·자재 낙하",
    dthNum: 1,
    injuNum: 0,
    locNm: "경기도",
  },
];

async function tryKoshaApi(serviceKey: string): Promise<KoshaMajorAccident[] | null> {
  const years = [new Date().getFullYear(), new Date().getFullYear() - 1];
  
  for (const year of years) {
    try {
      const url = new URL(
        "https://apis.data.go.kr/B552015/safetyAndHealthData/getSerAccdntHstry"
      );
      url.searchParams.append("serviceKey", serviceKey);
      url.searchParams.append("pageNo", "1");
      url.searchParams.append("numOfRows", "20");
      url.searchParams.append("_type", "json");
      url.searchParams.append("dsptYr", String(year));

      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
      
      if (!res.ok) {
        console.log(`[KOSHA] API returned ${res.status} for year ${year}, trying next...`);
        continue;
      }

      const json = (await res.json()) as any;
      const resultCode = json?.response?.header?.resultCode;
      
      if (resultCode && resultCode !== "00") {
        console.log(`[KOSHA] API error code: ${resultCode} for year ${year}`);
        continue;
      }

      const raw = json?.response?.body?.items?.item ?? [];
      const accidents: KoshaMajorAccident[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
      
      if (accidents.length > 0) {
        console.log(`[KOSHA] Successfully fetched ${accidents.length} accidents for year ${year}`);
        return accidents;
      }
    } catch (err: any) {
      console.log(`[KOSHA] Fetch error for year ${year}:`, err.message);
    }
  }
  
  return null;
}

export async function getKoshaMajorAccidents(): Promise<{
  accidents: KoshaMajorAccident[];
  configured: boolean;
  fetchedAt: string | null;
  isSampleData: boolean;
}> {
  const serviceKey = process.env.KOSHA_SERVICE_KEY;

  if (!serviceKey) {
    return { accidents: [], configured: false, fetchedAt: null, isSampleData: false };
  }

  if (accidentCache && Date.now() - accidentCache.fetchedAt < CACHE_TTL_MS) {
    return {
      accidents: accidentCache.data,
      configured: true,
      fetchedAt: new Date(accidentCache.fetchedAt).toISOString(),
      isSampleData: accidentCache.isSampleData,
    };
  }

  const realData = await tryKoshaApi(serviceKey);
  
  if (realData) {
    accidentCache = { data: realData, fetchedAt: Date.now(), isSampleData: false };
    return {
      accidents: realData,
      configured: true,
      fetchedAt: new Date(accidentCache.fetchedAt).toISOString(),
      isSampleData: false,
    };
  }

  console.log("[KOSHA] Using sample data (API unavailable)");
  accidentCache = { data: SAMPLE_ACCIDENTS, fetchedAt: Date.now(), isSampleData: true };
  return {
    accidents: SAMPLE_ACCIDENTS,
    configured: true,
    fetchedAt: new Date(accidentCache.fetchedAt).toISOString(),
    isSampleData: true,
  };
}

export function clearKoshaCache() {
  accidentCache = null;
}
