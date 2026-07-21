/**
 * 폭염 기상 자동 수집 Cron Job
 * 매일 09:00 KST (= 00:00 UTC) 에 기상청 단기예보 API를 호출하여
 * 대구·경북 31개 지역 기온/습도/체감온도를 수집하고 DB에 저장합니다.
 * 저장된 데이터는 클라이언트가 지도 로드 시 자동으로 복원합니다.
 */
import cron from "node-cron";
import { storage } from "./storage";
import type { InsertHeatWaveChecklist } from "../shared/schema";

const REGION_SETS: Record<string, { name: string; nx: number; ny: number }[]> = {
  daegubuk: [
    // 대구
    { name: '대구',   nx: 89,  ny: 90  },
    { name: '군위',   nx: 88,  ny: 99  },
    // 경북
    { name: '포항',   nx: 102, ny: 94  },
    { name: '경주',   nx: 100, ny: 91  },
    { name: '김천',   nx: 80,  ny: 96  },
    { name: '안동',   nx: 91,  ny: 106 },
    { name: '구미',   nx: 84,  ny: 96  },
    { name: '영주',   nx: 89,  ny: 111 },
    { name: '영천',   nx: 95,  ny: 93  },
    { name: '상주',   nx: 81,  ny: 102 },
    { name: '문경',   nx: 81,  ny: 106 },
    { name: '경산',   nx: 91,  ny: 90  },
    { name: '의성',   nx: 88,  ny: 101 },
    { name: '청송',   nx: 96,  ny: 103 },
    { name: '영양',   nx: 97,  ny: 108 },
    { name: '영덕',   nx: 102, ny: 103 },
    { name: '청도',   nx: 91,  ny: 86  },
    { name: '고령',   nx: 83,  ny: 87  },
    { name: '성주',   nx: 83,  ny: 91  },
    { name: '칠곡',   nx: 85,  ny: 93  },
    { name: '예천',   nx: 84,  ny: 107 },
    { name: '봉화',   nx: 90,  ny: 115 },
    { name: '울진',   nx: 102, ny: 112 },
    { name: '울릉',   nx: 127, ny: 127 },
  ],
  chungcheong: [
    // 대전·세종
    { name: '대전',   nx: 67, ny: 100 },
    { name: '세종',   nx: 66, ny: 103 },
    // 충북
    { name: '청주',   nx: 69, ny: 107 },
    { name: '충주',   nx: 76, ny: 114 },
    { name: '제천',   nx: 81, ny: 118 },
    { name: '보은',   nx: 74, ny: 105 },
    { name: '옥천',   nx: 71, ny: 99  },
    { name: '영동',   nx: 74, ny: 97  },
    { name: '증평',   nx: 71, ny: 110 },
    { name: '진천',   nx: 68, ny: 111 },
    { name: '괴산',   nx: 76, ny: 110 },
    { name: '음성',   nx: 73, ny: 114 },
    { name: '단양',   nx: 84, ny: 115 },
    // 충남
    { name: '천안',   nx: 63, ny: 110 },
    { name: '공주',   nx: 63, ny: 102 },
    { name: '보령',   nx: 54, ny: 100 },
    { name: '아산',   nx: 60, ny: 110 },
    { name: '서산',   nx: 51, ny: 110 },
    { name: '논산',   nx: 62, ny: 97  },
    { name: '계룡',   nx: 65, ny: 100 },
    { name: '당진',   nx: 54, ny: 112 },
    { name: '금산',   nx: 69, ny: 95  },
    { name: '부여',   nx: 59, ny: 99  },
    { name: '서천',   nx: 56, ny: 94  },
    { name: '청양',   nx: 59, ny: 103 },
    { name: '홍성',   nx: 55, ny: 106 },
    { name: '예산',   nx: 58, ny: 108 },
    { name: '태안',   nx: 48, ny: 108 },
  ],
  honam: [
    // 광주
    { name: '광주',   nx: 58, ny: 74  },
    // 전북
    { name: '전주',   nx: 63, ny: 89  },
    { name: '군산',   nx: 56, ny: 92  },
    { name: '익산',   nx: 60, ny: 91  },
    { name: '정읍',   nx: 58, ny: 83  },
    { name: '남원',   nx: 68, ny: 80  },
    { name: '김제',   nx: 59, ny: 88  },
    { name: '완주',   nx: 63, ny: 90  },
    { name: '진안',   nx: 68, ny: 88  },
    { name: '무주',   nx: 72, ny: 90  },
    { name: '장수',   nx: 70, ny: 85  },
    { name: '임실',   nx: 66, ny: 83  },
    { name: '순창',   nx: 63, ny: 79  },
    { name: '고창',   nx: 56, ny: 81  },
    { name: '부안',   nx: 55, ny: 87  },
    // 전남
    { name: '목포',   nx: 50, ny: 67  },
    { name: '여수',   nx: 73, ny: 66  },
    { name: '순천',   nx: 70, ny: 70  },
    { name: '나주',   nx: 56, ny: 71  },
    { name: '광양',   nx: 74, ny: 67  },
    { name: '담양',   nx: 61, ny: 78  },
    { name: '곡성',   nx: 65, ny: 74  },
    { name: '구례',   nx: 69, ny: 72  },
    { name: '고흥',   nx: 66, ny: 62  },
    { name: '보성',   nx: 62, ny: 66  },
    { name: '화순',   nx: 61, ny: 72  },
    { name: '장흥',   nx: 59, ny: 63  },
    { name: '강진',   nx: 57, ny: 60  },
    { name: '해남',   nx: 54, ny: 56  },
    { name: '영암',   nx: 55, ny: 65  },
    { name: '무안',   nx: 52, ny: 68  },
    { name: '함평',   nx: 54, ny: 72  },
    { name: '영광',   nx: 52, ny: 76  },
    { name: '장성',   nx: 57, ny: 77  },
    { name: '완도',   nx: 57, ny: 52  },
    { name: '진도',   nx: 48, ny: 55  },
    { name: '신안',   nx: 45, ny: 63  },
    // 제주
    { name: '제주시',  nx: 53, ny: 38  },
    { name: '서귀포',  nx: 52, ny: 33  },
  ],
  buulgyeong: [
    // 부산·울산
    { name: '부산',   nx: 98,  ny: 76  },
    { name: '울산',   nx: 102, ny: 84  },
    // 경남
    { name: '창원',   nx: 90,  ny: 77  },
    { name: '진주',   nx: 81,  ny: 75  },
    { name: '통영',   nx: 87,  ny: 68  },
    { name: '사천',   nx: 82,  ny: 71  },
    { name: '김해',   nx: 95,  ny: 77  },
    { name: '밀양',   nx: 96,  ny: 86  },
    { name: '거제',   nx: 90,  ny: 68  },
    { name: '양산',   nx: 97,  ny: 80  },
    { name: '의령',   nx: 87,  ny: 77  },
    { name: '함안',   nx: 89,  ny: 78  },
    { name: '창녕',   nx: 92,  ny: 84  },
    { name: '고성',   nx: 85,  ny: 71  },
    { name: '남해',   nx: 80,  ny: 68  },
    { name: '하동',   nx: 76,  ny: 72  },
    { name: '산청',   nx: 80,  ny: 78  },
    { name: '함양',   nx: 77,  ny: 83  },
    { name: '거창',   nx: 80,  ny: 87  },
    { name: '합천',   nx: 85,  ny: 84  },
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

  const PTY_LABEL: Record<string, string> = {
    '0': '없음', '1': '비', '2': '비/눈', '3': '눈', '4': '소나기', '5': '빗방울', '6': '빗방울/눈', '7': '눈날림',
  };
  type HourlyEntry = { time: string; temp: number; hum: number; feels: number; stage: string; rainType: string; rain: string; wind: number | null; windLevel: string };
  const results: { name: string; feels: number; temp: number; hum: number; stage: string; time: string; rainType: string; rain: string; wind: number | null; windLevel: string; hourly: HourlyEntry[] }[] = [];
  const BATCH = 5;

  for (let i = 0; i < REGIONS.length; i += BATCH) {
    const batch = REGIONS.slice(i, i + BATCH);
    const fetched = await Promise.all(batch.map(async (r) => {
      try {
        const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst`
          + `?serviceKey=${encodeURIComponent(KMA_KEY)}`
          + `&pageNo=1&numOfRows=400&dataType=JSON`
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
        const getValStr = (cat: string): string | null => {
          const matching = items.filter(x => x.category === cat && parseInt(x.fcstTime, 10) >= fcstHour);
          if (matching.length > 0) return String(matching[0].fcstValue);
          const past = items.filter(x => x.category === cat);
          if (past.length > 0) return String(past[past.length - 1].fcstValue);
          return null;
        };
        const temp = getVal('TMP') ?? getVal('T1H');
        const hum  = getVal('REH');
        if (temp === null || hum === null) return null;
        const feels = calcFeelsLike(temp, hum);
        const stage = feels >= 35 ? '폭염경보' : feels >= 33 ? '폭염주의보' : feels >= 31 ? '폭염관심' : '해당없음';
        const ptyCode = getVal('PTY') ?? 0;
        const rainType = PTY_LABEL[String(Math.round(ptyCode))] ?? '없음';
        const pcpRaw = getValStr('PCP') ?? '강수없음';
        const rain = (pcpRaw === '0' || pcpRaw === '강수없음') ? '강수없음' : pcpRaw.replace('mm', '') + 'mm';
        const wind = getVal('WSD');
        const windLevel = wind == null ? '정상' : wind >= 14 ? '위험' : wind >= 9 ? '경계' : wind >= 4 ? '주의' : '정상';

        // 시간별(09~18시) 예보 추출
        const TARGET_HOURS = [900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800];
        const hourly: HourlyEntry[] = TARGET_HOURS.map(h => {
          const getH = (cat: string) => {
            const m = items.find((x: any) => x.category === cat && parseInt(x.fcstTime, 10) === h);
            return m ? parseFloat(m.fcstValue) : null;
          };
          const getHStr = (cat: string): string | null => {
            const m = items.find((x: any) => x.category === cat && parseInt(x.fcstTime, 10) === h);
            return m ? String(m.fcstValue) : null;
          };
          const ht = getH('TMP') ?? getH('T1H');
          const hrh = getH('REH');
          if (ht === null || hrh === null) return null;
          const hf = calcFeelsLike(ht, hrh);
          const hs = hf >= 35 ? '폭염경보' : hf >= 33 ? '폭염주의보' : hf >= 31 ? '폭염관심' : '해당없음';
          const hptyCode = getH('PTY') ?? 0;
          const hRainType = PTY_LABEL[String(Math.round(hptyCode))] ?? '없음';
          const hPcpRaw = getHStr('PCP') ?? '강수없음';
          const hRain = (hPcpRaw === '0' || hPcpRaw === '강수없음') ? '강수없음' : hPcpRaw.replace('mm', '') + 'mm';
          const hw = getH('WSD');
          const hwl = hw == null ? '정상' : hw >= 14 ? '위험' : hw >= 9 ? '경계' : hw >= 4 ? '주의' : '정상';
          const timeStr = `${String(Math.floor(h / 100)).padStart(2, '0')}:00`;
          return { time: timeStr, temp: ht, hum: Math.round(hrh), feels: parseFloat(hf.toFixed(1)), stage: hs, rainType: hRainType, rain: hRain, wind: hw != null ? parseFloat(hw.toFixed(1)) : null, windLevel: hwl };
        }).filter(Boolean) as HourlyEntry[];

        return { name: r.name, feels, temp, hum: Math.round(hum), stage, time: timeLabel, rainType, rain, wind: wind != null ? parseFloat(wind.toFixed(1)) : null, windLevel, hourly };
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
      results.push({ name: r.name, feels: parseFloat(feels.toFixed(1)), temp: parseFloat(fallbackTemp.toFixed(1)), hum: Math.round(fallbackHum), stage, time: timeLabel, rainType: '없음', rain: '강수없음', wind: null, windLevel: '정상' });
    }
  });

  // 통계 계산
  const maxFeels = Math.max(...results.map(r => r.feels));
  const maxLoc   = results.find(r => r.feels === maxFeels)?.name ?? '';
  const avgTemp  = Math.round(results.reduce((a, b) => a + b.temp, 0) / results.length * 10) / 10;
  const avgHum   = Math.round(results.reduce((a, b) => a + b.hum,  0) / results.length);

  // weather 맵으로 변환 (hourly 포함 — Excel 시간별 데이터에 사용)
  const weather: Record<string, any> = {};
  results.forEach(r => { weather[r.name] = { feels: r.feels, temp: r.temp, hum: r.hum, stage: r.stage, time: r.time, rainType: r.rainType, rain: r.rain, wind: r.wind, windLevel: r.windLevel, hourly: r.hourly ?? [] }; });

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

// ── 권역별 도시 목록 (체크리스트 자동 생성용) ────────────────────────────
const AUTO_CHECKLIST_REGIONS = [
  {
    label: '대구 / 경북',
    cities: ['대구','군위','포항','경주','김천','안동','구미','영주','영천','상주','문경','경산','의성','청송','영양','영덕','청도','고령','성주','칠곡','예천','봉화','울진','울릉'],
  },
  {
    label: '충청권',
    cities: ['대전','세종','청주','충주','제천','보은','옥천','영동','증평','진천','괴산','음성','단양','천안','공주','보령','아산','서산','논산','계룡','당진','금산','부여','서천','청양','홍성','예산','태안'],
  },
  {
    label: '호남권',
    cities: ['광주','전주','군산','익산','정읍','남원','김제','완주','진안','무주','장수','임실','순창','고창','부안','목포','여수','순천','나주','광양','담양','곡성','구례','고흥','보성','화순','장흥','강진','해남','영암','무안','함평','영광','장성','완도','진도','신안','제주시','서귀포'],
  },
  {
    label: '부산 / 경남',
    cities: ['부산','울산','창원','진주','통영','사천','김해','밀양','거제','양산','의령','함안','창녕','고성','남해','하동','산청','함양','거창','합천'],
  },
];

async function autoCreateHeatwaveChecklists(weather: Record<string, any>, kst: Date) {
  const checkDate = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth()+1).padStart(2,'0')}-${String(kst.getUTCDate()).padStart(2,'0')}`;
  const checkHour = kst.getUTCHours();
  const checkTime = `${String(checkHour).padStart(2,'0')}:00`;

  // 오늘 자동생성 체크리스트만 가져와 중복 체크
  let todayAuto: any[] = [];
  try {
    const all = await storage.getHeatWaveChecklists();
    todayAuto = all.filter(c => c.checkDate === checkDate && c.createdBy === 'system');
  } catch {}

  for (const region of AUTO_CHECKLIST_REGIONS) {
    // 같은 날짜·시각·권역의 자동 생성 항목이 이미 있으면 건너뜀
    const dup = todayAuto.find(c =>
      c.targetArea === region.label &&
      c.checkTime.startsWith(String(checkHour).padStart(2,'0') + ':')
    );
    if (dup) continue;

    // 권역에 속한 도시 날씨 추출
    const entries = Object.entries(weather).filter(([name]) =>
      region.cities.some(c => name === c || name.includes(c) || c.includes(name))
    );
    if (entries.length === 0) continue;

    const feels  = entries.map(([, w]: any) => w.feels ?? 0);
    const temps  = entries.map(([, w]: any) => w.temp  ?? 0);
    const hums   = entries.map(([, w]: any) => w.hum   ?? 0);
    const maxFeels = Math.max(...feels);
    const avgTemp  = temps.reduce((a, b) => a + b, 0) / temps.length;
    const avgHum   = hums.reduce((a, b) => a + b, 0)  / hums.length;

    // 시간별 예보 중 최고 체감
    const hourlyFeels = entries.flatMap(([, w]: any) =>
      (w.hourly ?? []).map((h: any) => h.feels ?? 0)
    );
    const maxHourlyFeels = hourlyFeels.length > 0 ? Math.max(...hourlyFeels, maxFeels) : maxFeels;

    // 폭염 단계 결정
    const heatAlertStatus = maxFeels >= 35 ? '폭염경보'
      : maxFeels >= 33 ? '폭염주의보' : '해당없음';

    // 단계별 체크 자동 설정
    const checks31: boolean[] = maxFeels >= 31
      ? [true, true, true] : [false, false, false];
    const checks33: boolean[] = maxFeels >= 33
      ? [true, true, true, true] : [false, false, false, false];
    const checks35: boolean[] = maxFeels >= 35
      ? [true, true, true] : [false, false, false];
    const checks38: boolean[] = maxFeels >= 38
      ? [true] : [false];

    const payload: InsertHeatWaveChecklist = {
      checkDate,
      checkTime,
      targetArea: region.label,
      heatAlertStatus,
      currentTemperature: parseFloat(avgTemp.toFixed(1)),
      currentHumidity: Math.round(avgHum),
      currentFeelsLike: parseFloat(maxFeels.toFixed(1)),
      maxFeelsLikeForecast: parseFloat(maxHourlyFeels.toFixed(1)),
      checks31,
      checks33,
      checks35,
      stopTime35Start: null,
      stopTime35End: null,
      checks38,
      stopTime38Start: null,
      stopTime38End: null,
      author: null,
      safetyManager: null,
      authorSignature: null,
      safetyManagerSignature: null,
      weatherSnapshot: weather,
      mapSnapshot: null,
      createdBy: 'system',
    };

    try {
      await storage.createHeatWaveChecklist(payload);
      console.log(`[HeatwaveJob] ✅ 체크리스트 자동 생성: ${region.label} ${checkDate} ${checkTime} (체감 ${maxFeels}°C → ${heatAlertStatus})`);
    } catch (e: any) {
      console.error(`[HeatwaveJob] 체크리스트 자동 생성 실패 (${region.label}):`, e?.message);
    }
  }
}

// 09:00~18:00 KST 매시 정각 자동 수집 + 체크리스트 자동 생성
cron.schedule("0 9-18 * * *", async () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const kstHour = kst.getUTCHours();
  console.log(`[HeatwaveJob] 🌡️ 폭염 기상 자동 수집 시작 (${kstHour}:00 KST)`);

  const result = await fetchAndSaveHeatwaveWeather();

  // 기상청 특보는 09시와 13시에 갱신
  if (kstHour === 9 || kstHour === 13) {
    await fetchAndSaveHeatwaveWarnings();
  }

  // 날씨 수집 성공 시 체크리스트 자동 생성
  if (result.ok) {
    try {
      const mapSetting = await storage.getSetting('heatwave_map_data');
      if (mapSetting?.value) {
        const { weather } = JSON.parse(mapSetting.value);
        if (weather && Object.keys(weather).length > 0) {
          await autoCreateHeatwaveChecklists(weather, kst);
        }
      }
    } catch (e: any) {
      console.error('[HeatwaveJob] 체크리스트 자동 생성 전처리 실패:', e?.message);
    }
  }
}, { timezone: "Asia/Seoul" });

console.log("[HeatwaveJob] 폭염 기상 자동 수집 Cron 등록 완료 (매시 09:00~18:00 KST, 체크리스트 자동 생성 포함)");

// ── 기상청 특보 수집 ─────────────────────────────────────────────────────────
export interface HeatwaveWarningItem {
  type: string;    // 폭염경보 | 폭염주의보 | 열대야경보 | 열대야주의보
  regions: string;
}

export interface HeatwaveWarningResult {
  ok: boolean;
  items: HeatwaveWarningItem[];
  rawText: string | null;
  issuedAt: string | null;
  fetchedAt: string;
}

function parseWarningText(t6: string): HeatwaveWarningItem[] {
  if (!t6) return [];
  const result: HeatwaveWarningItem[] = [];
  const lineRegex = /o\s+([\uAC00-\uD7A3·\s]+?)\s*:\s*([^\r\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(t6)) !== null) {
    const type = m[1].trim();
    const regionStr = m[2].trim().replace(/\r/g, '');
    if (type && regionStr && regionStr !== '없음' && !type.includes('없음')) {
      result.push({ type, regions: regionStr });
    }
  }
  return result;
}

export async function fetchAndSaveHeatwaveWarnings(): Promise<HeatwaveWarningResult> {
  const KMA_KEY = process.env.KMA_API_KEY;
  const fallback: HeatwaveWarningResult = { ok: false, items: [], rawText: null, issuedAt: null, fetchedAt: new Date().toISOString() };
  if (!KMA_KEY) { console.warn('[HeatwaveWarning] KMA_API_KEY 미설정'); return fallback; }

  try {
    // Step 1: 최신 특보 목록에서 tmFc, tmSeq, stnId 조회 (stnId=108 서울기상청)
    const listUrl = `https://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnList?serviceKey=${encodeURIComponent(KMA_KEY)}&pageNo=1&numOfRows=5&dataType=JSON&stnId=108`;
    const r1 = await fetch(listUrl, { signal: AbortSignal.timeout(10000) });
    if (!r1.ok) throw new Error(`KMA list ${r1.status}`);
    const j1 = await r1.json() as any;
    const listItems: any[] = j1?.response?.body?.items?.item ?? [];
    if (!listItems.length) {
      const empty: HeatwaveWarningResult = { ok: true, items: [], rawText: null, issuedAt: null, fetchedAt: new Date().toISOString() };
      await storage.setSetting('heatwave_warnings', JSON.stringify(empty));
      return empty;
    }
    const latest = listItems[0];

    // Step 2: 해당 특보 발표문 상세 조회 (t6 필드에 현재 발효 중인 전체 특보 텍스트 포함)
    const tmFc = String(latest.tmFc);
    const tmSeq = String(latest.tmSeq);
    const stnId = String(latest.stnId);
    const msgUrl = `https://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnMsg?serviceKey=${encodeURIComponent(KMA_KEY)}&pageNo=1&numOfRows=5&dataType=JSON&stnId=${stnId}&tmFc=${tmFc}&tmSeq=${tmSeq}`;
    const r2 = await fetch(msgUrl, { signal: AbortSignal.timeout(10000) });
    if (!r2.ok) throw new Error(`KMA msg ${r2.status}`);
    const j2 = await r2.json() as any;
    const msgItems: any[] = j2?.response?.body?.items?.item ?? [];

    const latestMsg = msgItems.find((i: any) => i.stnId === '108') ?? msgItems[0];
    const t6: string = latestMsg?.t6 ?? '';
    const issuedAt = tmFc;
    const items = parseWarningText(t6);
    const result: HeatwaveWarningResult = { ok: true, items, rawText: t6, issuedAt, fetchedAt: new Date().toISOString() };
    await storage.setSetting('heatwave_warnings', JSON.stringify(result));
    console.log(`[HeatwaveWarning] ✅ 특보 수집 완료 — 폭염관련 ${items.length}건 (tmSeq=${tmSeq})`);
    return result;
  } catch (e: any) {
    console.warn('[HeatwaveWarning] 특보 조회 실패:', e?.message);
    return fallback;
  }
}
