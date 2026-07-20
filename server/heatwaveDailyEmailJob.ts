/**
 * 폭염 일일 현황 메일 자동 발송
 * 매일 08:30 KST에 실행. 수동 발송 시 클라이언트가 현재 화면 데이터를 직접 전달.
 */
import cron from "node-cron";
import { storage } from "./storage";

// ── 권역 분류 (이메일 HTML/Excel 공통) ─────────────────────────────────────
const CITY_TO_ZONE: Record<string, string> = {
  // 대구·경북
  '대구': '대구·경북', '군위': '대구·경북',
  '포항': '대구·경북', '경주': '대구·경북', '김천': '대구·경북', '안동': '대구·경북',
  '구미': '대구·경북', '영주': '대구·경북', '영천': '대구·경북', '상주': '대구·경북',
  '문경': '대구·경북', '경산': '대구·경북', '의성': '대구·경북', '청송': '대구·경북',
  '영양': '대구·경북', '영덕': '대구·경북', '청도': '대구·경북', '고령': '대구·경북',
  '성주': '대구·경북', '칠곡': '대구·경북', '예천': '대구·경북', '봉화': '대구·경북',
  '울진': '대구·경북', '울릉': '대구·경북',
  // 부산·울산·경남
  '부산': '부산·울산·경남', '울산': '부산·울산·경남',
  '창원': '부산·울산·경남', '마산': '부산·울산·경남', '진해': '부산·울산·경남',
  '진주': '부산·울산·경남', '통영': '부산·울산·경남', '사천': '부산·울산·경남',
  '김해': '부산·울산·경남', '밀양': '부산·울산·경남', '거제': '부산·울산·경남',
  '양산': '부산·울산·경남', '의령': '부산·울산·경남', '함안': '부산·울산·경남',
  '창녕': '부산·울산·경남', '고성': '부산·울산·경남', '남해': '부산·울산·경남',
  '하동': '부산·울산·경남', '산청': '부산·울산·경남', '함양': '부산·울산·경남',
  '거창': '부산·울산·경남', '합천': '부산·울산·경남',
  // 충청
  '대전': '충청권', '세종': '충청권', '청주': '충청권', '충주': '충청권', '제천': '충청권',
  '보은': '충청권', '옥천': '충청권', '영동': '충청권', '증평': '충청권', '진천': '충청권',
  '괴산': '충청권', '음성': '충청권', '단양': '충청권',
  '천안': '충청권', '공주': '충청권', '보령': '충청권', '아산': '충청권', '서산': '충청권',
  '논산': '충청권', '계룡': '충청권', '당진': '충청권', '금산': '충청권', '부여': '충청권',
  '서천': '충청권', '청양': '충청권', '홍성': '충청권', '예산': '충청권', '태안': '충청권',
  // 호남
  '광주': '호남권', '전주': '호남권', '군산': '호남권', '익산': '호남권', '정읍': '호남권',
  '남원': '호남권', '김제': '호남권', '완주': '호남권', '진안': '호남권', '무주': '호남권',
  '장수': '호남권', '임실': '호남권', '순창': '호남권', '고창': '호남권', '부안': '호남권',
  '목포': '호남권', '여수': '호남권', '순천': '호남권', '나주': '호남권', '광양': '호남권',
  '담양': '호남권', '곡성': '호남권', '구례': '호남권', '고흥': '호남권', '보성': '호남권',
  '화순': '호남권', '장흥': '호남권', '강진': '호남권', '해남': '호남권', '영암': '호남권',
  '무안': '호남권', '함평': '호남권', '영광': '호남권', '장성': '호남권', '완도': '호남권',
  '진도': '호남권', '신안': '호남권', '제주시': '호남권', '서귀포': '호남권',
};

const ZONE_ORDER = ['대구·경북', '부산·울산·경남', '충청권', '호남권'];

// Excel 상세 권역 분류
const CITY_TO_DETAIL: Record<string, string> = {
  '대구': '대구', '군위': '경북', '포항': '경북', '경주': '경북', '김천': '경북',
  '안동': '경북', '구미': '경북', '영주': '경북', '영천': '경북', '상주': '경북',
  '문경': '경북', '경산': '경북', '의성': '경북', '청송': '경북', '영양': '경북',
  '영덕': '경북', '청도': '경북', '고령': '경북', '성주': '경북', '칠곡': '경북',
  '예천': '경북', '봉화': '경북', '울진': '경북', '울릉': '울릉',
  '부산': '부산', '울산': '울산', '창원': '경남', '마산': '경남', '진해': '경남',
  '진주': '경남', '통영': '경남', '사천': '경남', '김해': '경남', '밀양': '경남',
  '거제': '경남', '양산': '경남', '의령': '경남', '함안': '경남', '창녕': '경남',
  '고성': '경남', '남해': '경남', '하동': '경남', '산청': '경남', '함양': '경남',
  '거창': '경남', '합천': '경남',
  '대전': '대전', '세종': '세종', '청주': '충북', '충주': '충북', '제천': '충북',
  '보은': '충북', '옥천': '충북', '영동': '충북', '증평': '충북', '진천': '충북',
  '괴산': '충북', '음성': '충북', '단양': '충북',
  '천안': '충남', '공주': '충남', '보령': '충남', '아산': '충남', '서산': '충남',
  '논산': '충남', '계룡': '충남', '당진': '충남', '금산': '충남', '부여': '충남',
  '서천': '충남', '청양': '충남', '홍성': '충남', '예산': '충남', '태안': '충남',
  '광주': '광주', '전주': '전북', '군산': '전북', '익산': '전북', '정읍': '전북',
  '남원': '전북', '김제': '전북', '완주': '전북', '진안': '전북', '무주': '전북',
  '장수': '전북', '임실': '전북', '순창': '전북', '고창': '전북', '부안': '전북',
  '목포': '전남', '여수': '전남', '순천': '전남', '나주': '전남', '광양': '전남',
  '담양': '전남', '곡성': '전남', '구례': '전남', '고흥': '전남', '보성': '전남',
  '화순': '전남', '장흥': '전남', '강진': '전남', '해남': '전남', '영암': '전남',
  '무안': '전남', '함평': '전남', '영광': '전남', '장성': '전남', '완도': '전남',
  '진도': '전남', '신안': '전남', '제주시': '제주', '서귀포': '제주',
};
const DETAIL_ORDER: Record<string, number> = {
  '대구': 0, '경북': 1, '울릉': 2, '부산': 3, '울산': 4, '경남': 5,
  '대전': 6, '세종': 7, '충북': 8, '충남': 9,
  '광주': 10, '전북': 11, '전남': 12, '제주': 13,
};

type WeatherEntry = { feels: number; temp: number | null; hum: number | null; stage: string; time: string; rainType?: string; rain?: string; wind?: number | null; windLevel?: string };

// ── 색상 유틸 ──────────────────────────────────────────────────────────────
function tileBg(feels: number): string {
  if (feels >= 38) return '#7f1d1d';
  if (feels >= 35) return '#991b1b';
  if (feels >= 33) return '#c2410c';
  if (feels >= 31) return '#b45309';
  if (feels >= 28) return '#a16207';
  if (feels >= 25) return '#3f6212';
  return '#1e40af';
}

// ── HTML 이메일 빌드 ─────────────────────────────────────────────────────────
function buildHtmlEmail(weather: Record<string, WeatherEntry>, dateStr: string, reportUrl?: string): string {
  const entries = Object.entries(weather).sort((a, b) => b[1].feels - a[1].feels);
  if (!entries.length) return '<p>날씨 데이터가 없습니다.</p>';

  const maxEntry  = entries[0];
  const alertCnt  = entries.filter(([, w]) => w.feels >= 35).length;
  const watchCnt  = entries.filter(([, w]) => w.feels >= 33 && w.feels < 35).length;
  const careCnt   = entries.filter(([, w]) => w.feels >= 31 && w.feels < 33).length;

  // 권역별 그룹화 (정렬 유지)
  const byZone: Record<string, [string, WeatherEntry][]> = {};
  entries.forEach(([name, w]) => {
    const z = CITY_TO_ZONE[name] ?? '기타';
    if (!byZone[z]) byZone[z] = [];
    byZone[z].push([name, w]);
  });

  // ── 권역별 앵커 ID 매핑 ─────────────────────────────────────────────────
  const ZONE_ID: Record<string, string> = {
    '대구·경북': 'zone-daegubuk', '부산·울산·경남': 'zone-buulgyeong',
    '충청권': 'zone-chungcheong', '호남권': 'zone-honam',
  };
  const ZONE_ICON: Record<string, string> = {
    '대구·경북': '🏔', '부산·울산·경남': '⚓', '충청권': '🌾', '호남권': '🌊',
  };

  // ── 권역별 타일 섹션 ────────────────────────────────────────────────────
  const zoneSections = ZONE_ORDER.filter(z => byZone[z]).map(zone => {
    const cities = byZone[zone]; // 이미 feels 내림차순 정렬됨
    const zoneMax = cities[0]?.[1].feels ?? 0;
    const tiles = cities.map(([name, w]) => {
      const bg = tileBg(w.feels);
      const stageLabel = w.stage && w.stage !== '해당없음' ? w.stage : '해당없음';
      return `<!--[if mso]><td style="width:74px;padding:0"><![endif]--><div style="display:inline-block;vertical-align:top;margin:3px;width:68px;background:${bg};border-radius:7px;padding:7px 4px;text-align:center;box-sizing:border-box"><div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.95);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div><div style="font-size:20px;font-weight:900;color:#fff;line-height:1.15;margin:3px 0 2px">${w.feels}<span style="font-size:12px">°</span></div><div style="font-size:9px;color:rgba(255,255,255,0.8);line-height:1.2">${stageLabel}</div></div><!--[if mso]></td><![endif]-->`;
    }).join('');

    const zid = ZONE_ID[zone] ?? '';
    const icon = ZONE_ICON[zone] ?? '🌡';
    return `
      <tr><td id="${zid}" style="padding:14px 0 4px;border-top:2px solid #e5e7eb">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:14px;font-weight:800;color:#111827">${icon} ${zone}</td>
          <td style="text-align:right;font-size:11px;color:#9ca3af">${cities.length}개 지역 &nbsp;·&nbsp; 최고체감 <strong style="color:${tileBg(zoneMax)}">${zoneMax}°C</strong></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:4px 0 0;font-size:0;line-height:0">${tiles}</td></tr>`;
  }).join('');

  // ── 범례 ────────────────────────────────────────────────────────────────
  const legendItems = [
    ['#1e40af','~24°C'],['#3f6212','25~27°C'],['#a16207','28~30°C'],
    ['#b45309','31~32°C 관심'],['#c2410c','33~34°C 주의'],
    ['#991b1b','35~37°C 경보'],['#7f1d1d','38°C↑'],
  ].map(([c,l]) => `<span style="display:inline-flex;align-items:center;gap:3px;white-space:nowrap;margin:2px 8px 2px 0;font-size:10px;color:#374151"><span style="width:12px;height:12px;border-radius:3px;background:${c};display:inline-block;flex-shrink:0"></span>${l}</span>`).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:12px;background:#f1f5f9;font-family:'Malgun Gothic','Apple SD Gothic Neo',Arial,sans-serif">
<div style="max-width:720px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.10)">

  <!-- 헤더 -->
  <div style="background:linear-gradient(135deg,#ea580c 0%,#dc2626 100%);padding:20px 24px 16px">
    <div style="font-size:10px;letter-spacing:1.5px;color:rgba(255,255,255,0.70);font-weight:600;text-transform:uppercase">KT MOS 안전보건팀 · SafeBoard</div>
    <div style="margin:6px 0 3px;font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.3px">🌡&nbsp; 폭염 일일 현황</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.80)">${dateStr} 기준 &nbsp;·&nbsp; 기상청 단기예보 기반</div>
  </div>

  ${reportUrl ? `
  <!-- 인터랙티브 3D 지도 보기 버튼 -->
  <div style="background:#111827;padding:14px 20px;text-align:center;border-bottom:1px solid #1f2937">
    <a href="${reportUrl}" style="display:inline-block;padding:10px 28px;background:linear-gradient(135deg,#ea580c 0%,#dc2626 100%);color:#fff;text-decoration:none;border-radius:9px;font-size:13px;font-weight:800;letter-spacing:0.3px;box-shadow:0 4px 12px rgba(234,88,12,0.35)">
      🗺️&nbsp; 3D 지도로 보기
    </a>
    <div style="margin-top:7px;font-size:10px;color:#6b7280">전체·대구경북·충청권·호남권·부산권 &nbsp;|&nbsp; 클릭 → 온도 확인 &nbsp;|&nbsp; 스크롤 → 확대/축소 &nbsp;|&nbsp; 링크 유효기간 7일</div>
  </div>
  ` : ''}

  <!-- 권역 탭 네비게이션 -->
  <div style="background:#1f2937;padding:0">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tr>
        <td style="text-align:center;padding:0"><a href="#zone-summary" style="display:block;padding:11px 4px;font-size:11px;font-weight:700;color:#f9fafb;text-decoration:none;border-right:1px solid #374151;background:#374151">📊<br>전체</a></td>
        <td style="text-align:center;padding:0"><a href="#zone-daegubuk" style="display:block;padding:11px 4px;font-size:11px;font-weight:700;color:#d1d5db;text-decoration:none;border-right:1px solid #374151">🏔<br>대구·경북</a></td>
        <td style="text-align:center;padding:0"><a href="#zone-chungcheong" style="display:block;padding:11px 4px;font-size:11px;font-weight:700;color:#d1d5db;text-decoration:none;border-right:1px solid #374151">🌾<br>충청권</a></td>
        <td style="text-align:center;padding:0"><a href="#zone-honam" style="display:block;padding:11px 4px;font-size:11px;font-weight:700;color:#d1d5db;text-decoration:none;border-right:1px solid #374151">🌊<br>호남권</a></td>
        <td style="text-align:center;padding:0"><a href="#zone-buulgyeong" style="display:block;padding:11px 4px;font-size:11px;font-weight:700;color:#d1d5db;text-decoration:none">⚓<br>부산권</a></td>
      </tr>
    </table>
  </div>

  <!-- 핵심 지표 -->
  <table id="zone-summary" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-bottom:1px solid #f3f4f6">
    <tr>
      <td width="25%" style="padding:14px 10px;text-align:center;border-right:1px solid #f3f4f6">
        <div style="font-size:10px;font-weight:700;color:#9a3412;margin-bottom:4px">최고 체감온도</div>
        <div style="font-size:28px;font-weight:900;color:${tileBg(maxEntry[1].feels)};line-height:1">${maxEntry[1].feels}<span style="font-size:14px">°C</span></div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">${maxEntry[0]}</div>
      </td>
      <td width="25%" style="padding:14px 10px;text-align:center;border-right:1px solid #f3f4f6">
        <div style="font-size:10px;font-weight:700;color:#991b1b;margin-bottom:4px">폭염 경보</div>
        <div style="font-size:28px;font-weight:900;color:#dc2626;line-height:1">${alertCnt}<span style="font-size:14px">개소</span></div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">체감 35°C 이상</div>
      </td>
      <td width="25%" style="padding:14px 10px;text-align:center;border-right:1px solid #f3f4f6">
        <div style="font-size:10px;font-weight:700;color:#9a3412;margin-bottom:4px">폭염 주의보</div>
        <div style="font-size:28px;font-weight:900;color:#ea580c;line-height:1">${watchCnt}<span style="font-size:14px">개소</span></div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">체감 33~34°C</div>
      </td>
      <td width="25%" style="padding:14px 10px;text-align:center">
        <div style="font-size:10px;font-weight:700;color:#854d0e;margin-bottom:4px">폭염 관심</div>
        <div style="font-size:28px;font-weight:900;color:#d97706;line-height:1">${careCnt}<span style="font-size:14px">개소</span></div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">체감 31~32°C</div>
      </td>
    </tr>
  </table>

  <!-- 권역별 체감온도 타일 지도 -->
  <div style="padding:16px 18px 6px">
    <div style="font-size:15px;font-weight:800;color:#111827;margin-bottom:2px">권역별 체감온도 현황</div>
    <div style="font-size:11px;color:#9ca3af;margin-bottom:8px">높을수록 진한 빨간색</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      ${zoneSections}
    </table>
  </div>

  <!-- 범례 -->
  <div style="padding:8px 18px 16px;display:flex;flex-wrap:wrap;align-items:center">
    <span style="font-size:10px;font-weight:700;color:#6b7280;margin-right:4px">범례:</span>
    ${legendItems}
  </div>

  <!-- 푸터 -->
  <div style="padding:12px 18px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;font-size:10px;color:#9ca3af;line-height:1.8">
    이 메일은 <strong>SafeBoard</strong> 시스템에서 매일 <strong>08:30</strong>에 자동 발송됩니다.<br>
    총 <strong>${entries.length}개 지역</strong> 기상청 단기예보 데이터 기준
  </div>
</div>
</body></html>`;
}

// ── 권역명 CSV 형식 매핑 (호남, 대구(경북), 부산(경남), 충청) ─────────────
const ZONE_TO_CSV: Record<string, string> = {
  '대구·경북':     '대구(경북)',
  '부산·울산·경남': '부산(경남)',
  '충청권':        '충청',
  '호남권':        '호남',
};

// ── Excel 첨부 빌드 (CSV 형식: 권역/지역/예보일자/예보시간/기온/습도/체감온도/폭염단계) ──
export async function buildExcelBuffer(weather: Record<string, WeatherEntry>, dateStr: string, dateDash: string): Promise<Buffer | null> {
  try {
    const ExcelJS = (await import('exceljs')).default;

    const STAGE_FILL: Record<string, string> = {
      '폭염경보': 'FFE0E0', '폭염주의보': 'FFE8CC',
      '폭염관심': 'FFF5CC', '해당없음': 'FFFFFF',
    };
    const STAGE_FONT: Record<string, string> = {
      '폭염경보': 'CC0000', '폭염주의보': 'D05000',
      '폭염관심': 'A07000', '해당없음': '666666',
    };

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('폭염현황');

    // 제목 행 (12컬럼)
    ws.mergeCells('A1:L1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `폭염 일일 현황 (${dateStr})`;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEA580C' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    // 컬럼 정의 (12개)
    ws.columns = [
      { key: '권역',    width: 12 },
      { key: '지역',    width: 12 },
      { key: '예보일자', width: 14 },
      { key: '예보시간', width: 12 },
      { key: '기온',    width: 10 },
      { key: '습도',    width: 10 },
      { key: '체감온도', width: 13 },
      { key: '폭염단계', width: 13 },
      { key: '강수형태', width: 12 },
      { key: '강수량',  width: 14 },
      { key: '풍속',    width: 13 },
      { key: '풍속단계', width: 12 },
    ];

    // 헤더 행
    const hdrRow = ws.getRow(2);
    hdrRow.values = ['권역', '지역', '예보일자', '예보시간', '기온(°C)', '습도(%)', '체감온도(°C)', '폭염단계', '강수형태', '강수량(mm)', '풍속(m/s)', '풍속단계'];
    hdrRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE06000' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
    });
    hdrRow.height = 22;

    // 데이터 행 — 체감온도 내림차순 정렬
    const rows = Object.entries(weather)
      .map(([name, d]) => {
        const zone = CITY_TO_ZONE[name] ?? '기타';
        return {
          권역:    ZONE_TO_CSV[zone] ?? zone,
          지역:    name,
          예보일자: dateDash,
          예보시간: d.time ?? '',
          기온:    d.temp,
          습도:    d.hum,
          체감온도: d.feels,
          폭염단계: d.stage ?? '해당없음',
          강수형태: d.rainType ?? '없음',
          강수량:  d.rain ?? '강수없음',
          풍속:    d.wind ?? '',
          풍속단계: d.windLevel ?? '정상',
        };
      })
      .sort((a, b) => b.체감온도 - a.체감온도);

    rows.forEach(r => {
      const row = ws.addRow(r);
      const stage = r.폭염단계 || '해당없음';
      const fill = STAGE_FILL[stage] ?? 'FFFFFF';
      const fontColor = STAGE_FONT[stage] ?? '333333';
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + fill } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFDDDDDD' } } };
      });
      // 폭염단계 컬럼(8번째)만 굵은 색상 폰트
      row.getCell(8).font = { bold: true, color: { argb: 'FF' + fontColor } };
      row.height = 18;
    });

    return await wb.xlsx.writeBuffer() as Buffer;
  } catch (e) {
    console.warn('[HeatwaveEmail] 엑셀 생성 실패:', e);
    return null;
  }
}

// ── 상태 ───────────────────────────────────────────────────────────────────
export interface HeatwaveDailyEmailStatus {
  lastRun: string | null;
  lastResult: 'sent' | 'no_data' | 'error' | null;
  lastMessage: string | null;
  nextRun: string;
}

const status: HeatwaveDailyEmailStatus = {
  lastRun: null, lastResult: null, lastMessage: null, nextRun: '매일 08:30 KST',
};

export function getHeatwaveDailyEmailStatus(): HeatwaveDailyEmailStatus {
  return { ...status };
}

// ── 메인 발송 함수 ─────────────────────────────────────────────────────────
// weatherOverride: 클라이언트가 현재 화면 데이터를 직접 전달할 때 사용 (수동 발송)
// baseUrl: 배포 URL (예: https://xxx.replit.app). 없으면 env에서 추출 시도.
export async function runHeatwaveDailyEmail(
  weatherOverride?: Record<string, WeatherEntry>,
  baseUrl?: string
): Promise<void> {
  const sender      = process.env.GMAIL_SENDER;
  const appPassword = process.env.GMAIL_APP_PASSWORD;
  const recipients  = (process.env.GMAIL_RECIPIENTS || '').trim();

  if (!sender || !appPassword || !recipients) {
    status.lastResult  = 'error';
    status.lastMessage = 'GMAIL_SENDER / GMAIL_APP_PASSWORD / GMAIL_RECIPIENTS 환경변수 미설정';
    console.warn('[HeatwaveEmail]', status.lastMessage);
    return;
  }

  try {
    let weather = weatherOverride;

    if (!weather || Object.keys(weather).length === 0) {
      // 수동 발송 시 클라이언트 데이터가 없거나, 자동 발송 시 DB에서 읽음
      const setting = await storage.getSetting('heatwave_map_data');
      if (setting?.value) {
        const parsed = JSON.parse(setting.value);
        weather = parsed.weather;
      }
    }

    if (!weather || Object.keys(weather).length === 0) {
      status.lastResult  = 'no_data';
      status.lastMessage = '저장된 폭염 날씨 데이터 없음 (실시간 날씨 조회 또는 CSV 업로드 필요)';
      console.warn('[HeatwaveEmail]', status.lastMessage);
      return;
    }

    const now      = new Date();
    const kst      = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const y        = kst.getUTCFullYear();
    const m        = kst.getUTCMonth() + 1;
    const d        = kst.getUTCDate();
    const day      = ['일','월','화','수','목','금','토'][kst.getUTCDay()];
    const dateStr  = `${y}년 ${m}월 ${d}일 (${day})`;
    const fileDate = `${y}${String(m).padStart(2,'0')}${String(d).padStart(2,'0')}`;

    const dateDash    = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

    // 토큰 생성 및 저장 (7일 유효)
    const { randomUUID } = await import('crypto');
    const reportToken = randomUUID();
    const reportExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await storage.setSetting('heatwave_report_token', JSON.stringify({
      token: reportToken, weather, dateStr, expiresAt: reportExpiresAt,
    })).catch(() => {});

    // 보고서 URL 조합 (baseUrl 우선, 그 다음 Replit 환경변수)
    const resolvedBase = baseUrl
      ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
      ?? null;
    const reportUrl = resolvedBase ? `${resolvedBase}/heatwave-report?token=${reportToken}` : undefined;

    const html        = buildHtmlEmail(weather, dateStr, reportUrl);
    const excelBuffer = await buildExcelBuffer(weather, dateStr, dateDash);

    const allEntries  = Object.entries(weather).sort((a, b) => b[1].feels - a[1].feels);
    const maxEntry    = allEntries[0];
    const alertCount  = allEntries.filter(([, w]) => w.feels >= 35).length;

    const nodemailer = (await import('nodemailer')).default;
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: sender, pass: appPassword },
      tls: { rejectUnauthorized: true },
    });

    // GMAIL_RECIPIENTS에 추가 수신자 합산
    const extraRecipient = 'jaeha.ryu@ktmos.co.kr';
    const toList = [recipients, extraRecipient]
      .map(r => r.trim()).filter(Boolean)
      .filter((r, i, arr) => arr.indexOf(r) === i) // 중복 제거
      .join(', ');

    const mailOptions: any = {
      from: `"SafeBoard 폭염현황" <${sender}>`,
      to: toList,
      subject: `🌡 폭염 일일현황 ${dateStr} · 최고체감 ${maxEntry?.[1].feels ?? '-'}°C${alertCount > 0 ? ` · 경보 ${alertCount}개소` : ''}`,
      html,
      attachments: [] as any[],
    };

    if (excelBuffer) {
      mailOptions.attachments.push({
        filename: `폭염현황_${fileDate}.xlsx`,
        content: excelBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    }

    await transporter.sendMail(mailOptions);

    status.lastRun     = now.toISOString();
    status.lastResult  = 'sent';
    status.lastMessage = `${recipients}로 발송 완료 (${Object.keys(weather).length}개 지역${excelBuffer ? ', 엑셀 첨부' : ''})`;
    console.log('[HeatwaveEmail]', status.lastMessage);

  } catch (e: any) {
    status.lastRun     = new Date().toISOString();
    status.lastResult  = 'error';
    status.lastMessage = String(e?.message ?? e);
    console.error('[HeatwaveEmail] 발송 실패:', e);
  }
}

// ── 자동 발송 스케줄 (매일 08:30 KST) ────────────────────────────────────
cron.schedule(
  '30 8 * * *',
  () => { runHeatwaveDailyEmail().catch(console.error); },
  { timezone: 'Asia/Seoul' }
);

console.log('[HeatwaveEmail] 폭염 일일 메일 스케줄러 시작 (매일 08:30 KST)');
