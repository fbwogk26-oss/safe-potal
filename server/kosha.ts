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
}

let accidentCache: CacheEntry | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

export async function getKoshaMajorAccidents(): Promise<{
  accidents: KoshaMajorAccident[];
  configured: boolean;
  fetchedAt: string | null;
}> {
  const serviceKey = process.env.KOSHA_SERVICE_KEY;

  if (!serviceKey) {
    return { accidents: [], configured: false, fetchedAt: null };
  }

  if (accidentCache && Date.now() - accidentCache.fetchedAt < CACHE_TTL_MS) {
    return {
      accidents: accidentCache.data,
      configured: true,
      fetchedAt: new Date(accidentCache.fetchedAt).toISOString(),
    };
  }

  const year = new Date().getFullYear();
  const url = new URL(
    "https://apis.data.go.kr/B552015/safetyAndHealthData/getSerAccdntHstry"
  );
  url.searchParams.append("serviceKey", serviceKey);
  url.searchParams.append("pageNo", "1");
  url.searchParams.append("numOfRows", "20");
  url.searchParams.append("_type", "json");
  url.searchParams.append("dsptYr", String(year));

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    throw new Error(`KOSHA API 응답 오류: ${res.status}`);
  }

  const json = (await res.json()) as any;
  const raw = json?.response?.body?.items?.item ?? [];
  const accidents: KoshaMajorAccident[] = Array.isArray(raw)
    ? raw
    : raw
    ? [raw]
    : [];

  accidentCache = { data: accidents, fetchedAt: Date.now() };

  return {
    accidents,
    configured: true,
    fetchedAt: new Date(accidentCache.fetchedAt).toISOString(),
  };
}

export function clearKoshaCache() {
  accidentCache = null;
}
