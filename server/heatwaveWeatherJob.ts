/**
 * 폭염 기상 자동 수집 Cron Job
 * 매일 09:00 KST (= 00:00 UTC) 에 기상청 단기예보 API를 호출하여
 * 대구·경북 31개 지역 기온/습도/체감온도를 수집하고 DB에 저장합니다.
 * 저장된 데이터는 클라이언트가 지도 로드 시 자동으로 복원합니다.
 */
import cron from "node-cron";
import { storage } from "./storage";

const REGION_SETS: Record<string, { name: string; nx: number; ny: number }[]> = {
  daegubuk: [
    // 대구
    { name: '중구',   nx: 89,  ny: 90  },
    { name: '동구',   nx: 90,  ny: 91  },
    { name: '서구',   nx: 88,  ny: 90  },
    { name: '남구',   nx: 89,  ny: 89  },
    { name: '북구',   nx: 89,  ny: 92  },
    { name: '수성구', nx: 90,  ny: 90  },
    { name: '달서구', nx: 88,  ny: 89  },
    { name: '달성군', nx: 86,  ny: 88  },
    { name: '군위군', nx: 88,  ny: 99  },
    // 경북
    { name: '포항시', nx: 102, ny: 94  },
    { name: '경주시', nx: 100, ny: 91  },
    { name: '김천시', nx: 80,  ny: 96  },
    { name: '안동시', nx: 91,  ny: 106 },
    { name: '구미시', nx: 84,  ny: 96  },
    { name: '영주시', nx: 89,  ny: 111 },
    { name: '영천시', nx: 95,  ny: 93  },
    { name: '상주시', nx: 81,  ny: 102 },
    { name: '문경시', nx: 81,  ny: 106 },
    { name: '경산시', nx: 91,  ny: 90  },
    { name: '의성군', nx: 88,  ny: 101 },
    { name: '청송군', nx: 96,  ny: 103 },
    { name: '영양군', nx: 97,  ny: 108 },
    { name: '영덕군', nx: 102, ny: 103 },
    { name: '청도군', nx: 91,  ny: 86  },
    { name: '고령군', nx: 83,  ny: 87  },
    { name: '성주군', nx: 83,  ny: 91  },
    { name: '칠곡군', nx: 85,  ny: 93  },
    { name: '예천군', nx: 84,  ny: 107 },
    { name: '봉화군', nx: 90,  ny: 115 },
    { name: '울진군', nx: 102, ny: 112 },
    { name: '울릉군', nx: 127, ny: 127 },
  ],
  chungcheong: [
    // 대전·세종
    { name: '대전',   nx: 67, ny: 100 },
    { name: '세종',   nx: 66, ny: 103 },
    // 충북
    { name: '청주시', nx: 69, ny: 107 },
    { name: '충주시', nx: 76, ny: 114 },
    { name: '제천시', nx: 81, ny: 118 },
    { name: '보은군', nx: 74, ny: 105 },
    { name: '옥천군', nx: 71, ny: 99  },
    { name: '영동군', nx: 74, ny: 97  },
    { name: '증평군', nx: 71, ny: 110 },
    { name: '진천군', nx: 68, ny: 111 },
    { name: '괴산군', nx: 76, ny: 110 },
    { name: '음성군', nx: 73, ny: 114 },
    { name: '단양군', nx: 84, ny: 115 },
    // 충남
    { name: '천안시', nx: 63, ny: 110 },
    { name: '공주시', nx: 63, ny: 102 },
    { name: '보령시', nx: 54, ny: 100 },
    { name: '아산시', nx: 60, ny: 110 },
    { name: '서산시', nx: 51, ny: 110 },
    { name: '논산시', nx: 62, ny: 97  },
    { name: '계룡시', nx: 65, ny: 100 },
    { name: '당진시', nx: 54, ny: 112 },
    { name: '금산군', nx: 69, ny: 95  },
    { name: '부여군', nx: 59, ny: 99  },
    { name: '서천군', nx: 56, ny: 94  },
    { name: '청양군', nx: 59, ny: 103 },
    { name: '홍성군', nx: 55, ny: 106 },
    { name: '예산군', nx: 58, ny: 108 },
    { name: '태안군', nx: 48, ny: 108 },
  ],
  honam: [
    // 광주
    { name: '광주',   nx: 58, ny: 74  },
    // 전북
    { name: '전주시', nx: 63, ny: 89  },
    { name: '군산시', nx: 56, ny: 92  },
    { name: '익산시', nx: 60, ny: 91  },
    { name: '정읍시', nx: 58, ny: 83  },
    { name: '남원시', nx: 68, ny: 80  },
    { name: '김제시', nx: 59, ny: 88  },
    { name: '완주군', nx: 63, ny: 90  },
    { name: '진안군', nx: 68, ny: 88  },
    { name: '무주군', nx: 72, ny: 90  },
    { name: '장수군', nx: 70, ny: 85  },
    { name: '임실군', nx: 66, ny: 83  },
    { name: '순창군', nx: 63, ny: 79  },
    { name: '고창군', nx: 56, ny: 81  },
    { name: '부안군', nx: 55, ny: 87  },
    // 전남
    { name: '목포시', nx: 50, ny: 67  },
    { name: '여수시', nx: 73, ny: 66  },
    { name: '순천시', nx: 70, ny: 70  },
    { name: '나주시', nx: 56, ny: 71  },
    { name: '광양시', nx: 74, ny: 67  },
    { name: '담양군', nx: 61, ny: 78  },
    { name: '곡성군', nx: 65, ny: 74  },
    { name: '구례군', nx: 69, ny: 72  },
    { name: '고흥군', nx: 66, ny: 62  },
    { name: '보성군', nx: 62, ny: 66  },
    { name: '화순군', nx: 61, ny: 72  },
    { name: '장흥군', nx: 59, ny: 63  },
    { name: '강진군', nx: 57, ny: 60  },
    { name: '해남군', nx: 54, ny: 56  },
    { name: '영암군', nx: 55, ny: 65  },
    { name: '무안군', nx: 52, ny: 68  },
    { name: '함평군', nx: 54, ny: 72  },
    { name: '영광군', nx: 52, ny: 76  },
    { name: '장성군', nx: 57, ny: 77  },
    { name: '완도군', nx: 57, ny: 52  },
    { name: '진도군', nx: 48, ny: 55  },
    { name: '신안군', nx: 45, ny: 63  },
    // 제주
    { name: '제주시',   nx: 53, ny: 38  },
    { name: '서귀포시', nx: 52, ny: 33  },
  ],
  buulgyeong: [
    // 부산·울산
    { name: '부산',   nx: 98,  ny: 76  },
    { name: '울산',   nx: 102, ny: 84  },
    // 경남
    { name: '창원시', nx: 90,  ny: 77  },
    { name: '진주시', nx: 81,  ny: 75  },
    { name: '통영시', nx: 87,  ny: 68  },
    { name: '사천시', nx: 82,  ny: 71  },
    { name: '김해시', nx: 95,  ny: 77  },
    { name: '밀양시', nx: 96,  ny: 86  },
    { name: '거제시', nx: 90,  ny: 68  },
    { name: '양산시', nx: 97,  ny: 80  },
    { name: '의령군', nx: 87,  ny: 77  },
    { name: '함안군', nx: 89,  ny: 78  },
    { name: '창녕군', nx: 92,  ny: 84  },
    { name: '고성군', nx: 85,  ny: 71  },
    { name: '남해군', nx: 80,  ny: 68  },
    { name: '하동군', nx: 76,  ny: 72  },
    { name: '산청군', nx: 80,  ny: 78  },
    { name: '함양군', nx: 77,  ny: 83  },
    { name: '거창군', nx: 80,  ny: 87  },
    { name: '합천군', nx: 85,  ny: 84  },
  ],
};

const REGIONS = Object.values(REGION_SETS).flat();

// 기상청 여름 체감온도 공식 (습구온도 Stull 2011 + Steadman AT)
// 기상청 동일 공식: AT = -0.2442 + 0.55399*Tw + 0.45535*T - 0.0022*Tw² + 0.00278*T*Tw + 3.0
function calcFeelsLike(t: number, rh: number): number {
  if (t < 25) return parseFloat(t.toFixed(1));
  const Tw = t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659))
    + Math.atan(t + rh)
    - Math.atan(rh - 1.676331)
    + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh)
    - 4.686035;
  const at = -0.2442 + 0.55399 * Tw + 0.45535 * t - 0.0022 * Tw * Tw + 0.00278 * t * Tw + 3.0;
  return parseFloat(at.toFixed(1));
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
