/**
 * 폭염 기상 자동 수집 Cron Job
 * 매일 09:00 KST (= 00:00 UTC) 에 기상청 단기예보 API를 호출하여
 * 대구·경북 31개 지역 기온/습도/체감온도를 수집하고 DB에 저장합니다.
 * 저장된 데이터는 클라이언트가 지도 로드 시 자동으로 복원합니다.
 */
import cron from "node-cron";
import { storage } from "./storage";

const REGIONS: { name: string; nx: number; ny: number }[] = [
  // 대구
  { name: '중구',   nx: 89, ny: 90 },
  { name: '동구',   nx: 90, ny: 91 },
  { name: '서구',   nx: 88, ny: 90 },
  { name: '남구',   nx: 89, ny: 89 },
  { name: '북구',   nx: 89, ny: 92 },
  { name: '수성구', nx: 90, ny: 90 },
  { name: '달서구', nx: 88, ny: 89 },
  { name: '달성군', nx: 86, ny: 88 },
  { name: '군위군', nx: 88, ny: 99 },
  // 경북
  { name: '포항시', nx: 102, ny: 94 },
  { name: '경주시', nx: 100, ny: 91 },
  { name: '김천시', nx: 80,  ny: 96 },
  { name: '안동시', nx: 91,  ny: 106 },
  { name: '구미시', nx: 84,  ny: 96 },
  { name: '영주시', nx: 89,  ny: 111 },
  { name: '영천시', nx: 95,  ny: 93 },
  { name: '상주시', nx: 81,  ny: 102 },
  { name: '문경시', nx: 81,  ny: 106 },
  { name: '경산시', nx: 91,  ny: 90 },
  { name: '의성군', nx: 88,  ny: 101 },
  { name: '청송군', nx: 96,  ny: 103 },
  { name: '영양군', nx: 97,  ny: 108 },
  { name: '영덕군', nx: 102, ny: 103 },
  { name: '청도군', nx: 91,  ny: 86 },
  { name: '고령군', nx: 83,  ny: 87 },
  { name: '성주군', nx: 83,  ny: 91 },
  { name: '칠곡군', nx: 85,  ny: 93 },
  { name: '예천군', nx: 84,  ny: 107 },
  { name: '봉화군', nx: 90,  ny: 115 },
  { name: '울진군', nx: 102, ny: 112 },
  { name: '울릉군', nx: 127, ny: 127 },
];

function calcFeelsLike(t: number, rh: number): number {
  if (t < 27) return parseFloat(t.toFixed(1));
  const hi =
    -8.78469475556 + 1.61139411 * t + 2.33854883889 * rh
    - 0.14611605 * t * rh - 0.012308094 * t * t
    - 0.0164248277778 * rh * rh + 0.002211732 * t * t * rh
    + 0.00072546 * t * rh * rh - 0.000003582 * t * t * rh * rh;
  return parseFloat(hi.toFixed(1));
}

export async function fetchAndSaveHeatwaveWeather(): Promise<{ ok: boolean; count: number; message?: string }> {
  const KMA_KEY = process.env.KMA_API_KEY;
  if (!KMA_KEY) {
    console.warn("[HeatwaveJob] KMA_API_KEY 미설정 — 스킵");
    return { ok: false, count: 0, message: "KMA_API_KEY 미설정" };
  }

  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const baseHours = [2, 5, 8, 11, 14, 17, 20, 23];
  const kstHour = kst.getUTCHours();
  const kstMin  = kst.getUTCMinutes();
  let baseHour  = baseHours.filter(h => h * 60 + 10 <= kstHour * 60 + kstMin).pop() ?? 23;
  let baseDate  = kst;
  if (baseHour === 23 && kstHour < 23) {
    baseDate = new Date(kst.getTime() - 24 * 60 * 60 * 1000);
  }
  const baseDateStr = `${baseDate.getUTCFullYear()}${String(baseDate.getUTCMonth() + 1).padStart(2, '0')}${String(baseDate.getUTCDate()).padStart(2, '0')}`;
  const baseTimeStr = `${String(baseHour).padStart(2, '0')}00`;
  const timeLabel   = `${String(kstHour).padStart(2, '0')}:${String(kstMin).padStart(2, '0')}`;

  const results: { name: string; feels: number; temp: number; hum: number; stage: string; time: string }[] = [];
  const BATCH = 5;

  for (let i = 0; i < REGIONS.length; i += BATCH) {
    const batch = REGIONS.slice(i, i + BATCH);
    const fetched = await Promise.all(batch.map(async (r) => {
      try {
        const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst`
          + `?serviceKey=${encodeURIComponent(KMA_KEY)}`
          + `&pageNo=1&numOfRows=100&dataType=JSON`
          + `&base_date=${baseDateStr}&base_time=${baseTimeStr}`
          + `&nx=${r.nx}&ny=${r.ny}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!resp.ok) throw new Error(`KMA ${resp.status}`);
        const json = await resp.json() as any;
        const items: any[] = json?.response?.body?.items?.item ?? [];
        const fcstHour = kstHour * 100;
        const getVal = (cat: string) => {
          const matching = items.filter(x => x.category === cat && parseInt(x.fcstTime, 10) >= fcstHour);
          if (matching.length > 0) return parseFloat(matching[0].fcstValue);
          const past = items.filter(x => x.category === cat);
          if (past.length > 0) return parseFloat(past[past.length - 1].fcstValue);
          return null;
        };
        const temp = getVal('TMP') ?? getVal('T1H');
        const hum  = getVal('REH');
        if (temp === null || hum === null) return null;
        const feels = calcFeelsLike(temp, hum);
        const stage = feels >= 35 ? '폭염경보' : feels >= 33 ? '폭염주의보' : feels >= 31 ? '폭염관심' : '해당없음';
        return { name: r.name, feels, temp, hum: Math.round(hum), stage, time: timeLabel };
      } catch {
        return null;
      }
    }));
    fetched.forEach(f => { if (f) results.push(f); });
  }

  if (results.length === 0) {
    console.error("[HeatwaveJob] 기상청 데이터 수집 실패");
    return { ok: false, count: 0, message: "기상청 데이터 수집 실패" };
  }

  // 조회 실패 지역은 평균값으로 채움
  const fallbackTemp = results.reduce((a, b) => a + b.temp, 0) / results.length;
  const fallbackHum  = results.reduce((a, b) => a + b.hum,  0) / results.length;
  REGIONS.forEach(r => {
    if (!results.find(x => x.name === r.name)) {
      const feels = calcFeelsLike(fallbackTemp, fallbackHum);
      const stage = feels >= 35 ? '폭염경보' : feels >= 33 ? '폭염주의보' : feels >= 31 ? '폭염관심' : '해당없음';
      results.push({ name: r.name, feels: parseFloat(feels.toFixed(1)), temp: parseFloat(fallbackTemp.toFixed(1)), hum: Math.round(fallbackHum), stage, time: timeLabel });
    }
  });

  // 통계 계산
  const maxFeels = Math.max(...results.map(r => r.feels));
  const maxLoc   = results.find(r => r.feels === maxFeels)?.name ?? '';
  const avgTemp  = Math.round(results.reduce((a, b) => a + b.temp, 0) / results.length * 10) / 10;
  const avgHum   = Math.round(results.reduce((a, b) => a + b.hum,  0) / results.length);

  // weather 맵으로 변환 (기존 프론트엔드 형식과 동일)
  const weather: Record<string, { feels: number; temp: number; hum: number; stage: string; time: string }> = {};
  results.forEach(r => { weather[r.name] = { feels: r.feels, temp: r.temp, hum: r.hum, stage: r.stage, time: r.time }; });

  const statsData = { maxFeels, avgTemp, avgHum, maxLoc, count: results.length };

  await storage.setSetting('heatwave_map_data', JSON.stringify({
    weather,
    stats: statsData,
    autoUpdatedAt: new Date().toISOString(),
    source: '기상청 단기예보 (자동)',
  }));

  console.log(`[HeatwaveJob] ✅ ${results.length}개 지역 수집 완료 — 최고체감 ${maxFeels}°C (${maxLoc})`);
  return { ok: true, count: results.length };
}

// 매일 09:00 KST (timezone: "Asia/Seoul" 옵션으로 직접 KST 기준 지정)
cron.schedule("0 9 * * *", async () => {
  console.log("[HeatwaveJob] 🌡️ 폭염 기상 자동 수집 시작 (09:00 KST)");
  await fetchAndSaveHeatwaveWeather();
}, { timezone: "Asia/Seoul" });

console.log("[HeatwaveJob] 폭염 기상 자동 수집 Cron 등록 완료 (매일 09:00 KST)");
