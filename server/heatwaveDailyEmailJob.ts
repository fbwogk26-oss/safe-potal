/**
 * 폭염 일일 현황 메일 자동 발송
 * 매일 08:30 KST에 실행되며, DB에 저장된 최신 폭염 날씨 데이터를 기반으로
 * HTML 지도 + 엑셀 첨부파일을 GMAIL_RECIPIENTS에 자동 발송합니다.
 */
import cron from "node-cron";
import { storage } from "./storage";

const CITY_REGION_MAP: Record<string, string> = {
  '대구': '대구(경북)', '군위': '대구(경북)',
  '포항': '대구(경북)', '경주': '대구(경북)', '김천': '대구(경북)', '안동': '대구(경북)',
  '구미': '대구(경북)', '영주': '대구(경북)', '영천': '대구(경북)', '상주': '대구(경북)',
  '문경': '대구(경북)', '경산': '대구(경북)', '의성': '대구(경북)', '청송': '대구(경북)',
  '영양': '대구(경북)', '영덕': '대구(경북)', '청도': '대구(경북)', '고령': '대구(경북)',
  '성주': '대구(경북)', '칠곡': '대구(경북)', '예천': '대구(경북)', '봉화': '대구(경북)',
  '울진': '대구(경북)', '울릉': '대구(경북)',
  '부산': '부산(경남)', '울산': '부산(경남)', '창원': '부산(경남)', '진주': '부산(경남)',
  '통영': '부산(경남)', '사천': '부산(경남)', '김해': '부산(경남)', '밀양': '부산(경남)',
  '거제': '부산(경남)', '양산': '부산(경남)', '의령': '부산(경남)', '함안': '부산(경남)',
  '창녕': '부산(경남)', '고성': '부산(경남)', '남해': '부산(경남)', '하동': '부산(경남)',
  '산청': '부산(경남)', '함양': '부산(경남)', '거창': '부산(경남)', '합천': '부산(경남)',
  '마산': '부산(경남)', '진해': '부산(경남)',
  '대전': '충청', '세종': '충청', '청주': '충청', '충주': '충청', '제천': '충청',
  '보은': '충청', '옥천': '충청', '영동': '충청', '증평': '충청', '진천': '충청',
  '괴산': '충청', '음성': '충청', '단양': '충청',
  '천안': '충청', '공주': '충청', '보령': '충청', '아산': '충청', '서산': '충청',
  '논산': '충청', '계룡': '충청', '당진': '충청', '금산': '충청', '부여': '충청',
  '서천': '충청', '청양': '충청', '홍성': '충청', '예산': '충청', '태안': '충청',
  '광주': '호남', '전주': '호남', '군산': '호남', '익산': '호남', '정읍': '호남',
  '남원': '호남', '김제': '호남', '완주': '호남', '진안': '호남', '무주': '호남',
  '장수': '호남', '임실': '호남', '순창': '호남', '고창': '호남', '부안': '호남',
  '목포': '호남', '여수': '호남', '순천': '호남', '나주': '호남', '광양': '호남',
  '담양': '호남', '곡성': '호남', '구례': '호남', '고흥': '호남', '보성': '호남',
  '화순': '호남', '장흥': '호남', '강진': '호남', '해남': '호남', '영암': '호남',
  '무안': '호남', '함평': '호남', '영광': '호남', '장성': '호남', '완도': '호남',
  '진도': '호남', '신안': '호남', '제주시': '호남', '서귀포': '호남',
};

const REGION_ORDER = ['대구(경북)', '부산(경남)', '충청', '호남'];
const REGION_LABEL: Record<string, string> = {
  '대구(경북)': '🌡 대구·경북',
  '부산(경남)': '🌡 부산·울산·경남',
  '충청': '🌡 충청권',
  '호남': '🌡 호남권',
};

type WeatherEntry = { feels: number; temp: number; hum: number; stage: string; time: string };

function heatBgColor(feels: number): string {
  if (feels >= 38) return '#7f1d1d';
  if (feels >= 35) return '#991b1b';
  if (feels >= 33) return '#c2410c';
  if (feels >= 31) return '#b45309';
  if (feels >= 28) return '#a16207';
  if (feels >= 25) return '#3f6212';
  return '#1e40af';
}

function stageBgColor(feels: number): string {
  if (feels >= 35) return '#fee2e2';
  if (feels >= 33) return '#ffedd5';
  if (feels >= 31) return '#fef3c7';
  return '#f0fdf4';
}

function stageTextColor(feels: number): string {
  if (feels >= 35) return '#991b1b';
  if (feels >= 33) return '#9a3412';
  if (feels >= 31) return '#854d0e';
  return '#166534';
}

function buildHtmlEmail(
  weather: Record<string, WeatherEntry>,
  dateStr: string
): string {
  const allEntries = Object.entries(weather).sort((a, b) => b[1].feels - a[1].feels);
  if (allEntries.length === 0) return '<p>날씨 데이터가 없습니다.</p>';

  const maxEntry = allEntries[0];
  const alertCount = allEntries.filter(([, w]) => w.feels >= 35).length;
  const watchCount = allEntries.filter(([, w]) => w.feels >= 33 && w.feels < 35).length;
  const careCount  = allEntries.filter(([, w]) => w.feels >= 31 && w.feels < 33).length;

  const byRegion: Record<string, [string, WeatherEntry][]> = {};
  allEntries.forEach(([name, w]) => {
    const r = CITY_REGION_MAP[name] ?? '기타';
    if (!byRegion[r]) byRegion[r] = [];
    byRegion[r].push([name, w]);
  });

  const regionSections = REGION_ORDER.filter(r => byRegion[r])
    .map(region => {
      const cities = byRegion[region].sort((a, b) => b[1].feels - a[1].feels);
      const cells = cities.map(([name, w]) => `
        <td style="padding:0; vertical-align:top;">
          <div style="margin:3px; background:${heatBgColor(w.feels)}; border-radius:6px; padding:7px 8px; text-align:center; min-width:54px;">
            <div style="font-size:11px; font-weight:700; color:rgba(255,255,255,0.95); white-space:nowrap;">${name}</div>
            <div style="font-size:18px; font-weight:900; color:#fff; line-height:1.2; margin:2px 0;">${w.feels}<span style="font-size:11px;">°</span></div>
            <div style="font-size:9px; color:rgba(255,255,255,0.8);">${w.stage || '-'}</div>
          </div>
        </td>`).join('');

      return `
        <tr>
          <td colspan="99" style="padding:14px 0 6px 2px;">
            <span style="font-size:13px; font-weight:700; color:#374151;">${REGION_LABEL[region] ?? region}</span>
            <span style="font-size:11px; color:#9ca3af; margin-left:8px;">${cities.length}개 지역</span>
          </td>
        </tr>
        <tr>${cells}</tr>`;
    }).join('');

  const tableRows = allEntries.map(([name, w]) => {
    const region = CITY_REGION_MAP[name] ?? '기타';
    const bg = stageBgColor(w.feels);
    const fc = stageTextColor(w.feels);
    return `
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:6px 10px; font-size:11px; color:#6b7280; white-space:nowrap;">${region}</td>
        <td style="padding:6px 10px; font-size:12px; font-weight:600; color:#111827; white-space:nowrap;">${name}</td>
        <td style="padding:6px 10px; font-size:12px; text-align:center; color:#374151;">${w.temp != null ? w.temp + '°C' : '-'}</td>
        <td style="padding:6px 10px; font-size:13px; font-weight:800; text-align:center; color:${heatBgColor(w.feels)};">${w.feels}°C</td>
        <td style="padding:6px 10px; font-size:12px; text-align:center; color:#1d4ed8;">${w.hum != null ? w.hum + '%' : '-'}</td>
        <td style="padding:5px 10px; text-align:center;">
          <span style="display:inline-block; background:${bg}; color:${fc}; font-size:10px; font-weight:700; padding:2px 8px; border-radius:4px; white-space:nowrap;">${w.stage || '해당없음'}</span>
        </td>
        <td style="padding:6px 10px; font-size:10px; text-align:center; color:#9ca3af;">${w.time || '-'}</td>
      </tr>`;
  }).join('');

  const legend = [
    ['#1e40af', '~24°C'],
    ['#3f6212', '25~27°C'],
    ['#a16207', '28~30°C'],
    ['#b45309', '31~32°C 관심'],
    ['#c2410c', '33~34°C 주의'],
    ['#991b1b', '35~37°C 경보'],
    ['#7f1d1d', '38°C↑'],
  ].map(([color, label]) => `
    <span style="display:inline-flex; align-items:center; gap:4px; font-size:10px; margin:2px 6px 2px 0; white-space:nowrap;">
      <span style="width:13px; height:13px; border-radius:3px; background:${color}; display:inline-block; flex-shrink:0;"></span>
      <span style="color:#374151;">${label}</span>
    </span>`).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0; padding:16px; background:#f1f5f9; font-family:'Malgun Gothic','Apple SD Gothic Neo',Arial,sans-serif;">
<div style="max-width:780px; margin:0 auto; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.10);">

  <!-- 헤더 -->
  <div style="background:linear-gradient(135deg,#ea580c 0%,#dc2626 100%); padding:22px 28px 18px;">
    <div style="font-size:10px; letter-spacing:1.5px; color:rgba(255,255,255,0.75); font-weight:600; text-transform:uppercase;">KT MOS 안전보건팀 · SafeBoard</div>
    <div style="margin:6px 0 4px; font-size:22px; font-weight:900; color:#fff; letter-spacing:-0.3px;">🌡&nbsp; 폭염 일일 현황</div>
    <div style="font-size:12px; color:rgba(255,255,255,0.85);">${dateStr} 기준&nbsp;·&nbsp;기상청 단기예보 자동 수집</div>
  </div>

  <!-- 핵심 지표 3개 -->
  <div style="display:flex; gap:0; border-bottom:1px solid #f3f4f6;">
    <div style="flex:1; padding:16px 14px; text-align:center; border-right:1px solid #f3f4f6;">
      <div style="font-size:10px; font-weight:700; color:#9a3412; margin-bottom:4px; letter-spacing:0.5px;">최고 체감온도</div>
      <div style="font-size:30px; font-weight:900; color:${heatBgColor(maxEntry[1].feels)}; line-height:1;">${maxEntry[1].feels}<span style="font-size:16px;">°C</span></div>
      <div style="font-size:11px; color:#6b7280; margin-top:3px;">${maxEntry[0]}</div>
    </div>
    <div style="flex:1; padding:16px 14px; text-align:center; border-right:1px solid #f3f4f6;">
      <div style="font-size:10px; font-weight:700; color:#991b1b; margin-bottom:4px; letter-spacing:0.5px;">폭염 경보</div>
      <div style="font-size:30px; font-weight:900; color:#dc2626; line-height:1;">${alertCount}<span style="font-size:14px;">개소</span></div>
      <div style="font-size:11px; color:#6b7280; margin-top:3px;">체감 35°C 이상</div>
    </div>
    <div style="flex:1; padding:16px 14px; text-align:center; border-right:1px solid #f3f4f6;">
      <div style="font-size:10px; font-weight:700; color:#9a3412; margin-bottom:4px; letter-spacing:0.5px;">폭염 주의보</div>
      <div style="font-size:30px; font-weight:900; color:#ea580c; line-height:1;">${watchCount}<span style="font-size:14px;">개소</span></div>
      <div style="font-size:11px; color:#6b7280; margin-top:3px;">체감 33~34°C</div>
    </div>
    <div style="flex:1; padding:16px 14px; text-align:center;">
      <div style="font-size:10px; font-weight:700; color:#854d0e; margin-bottom:4px; letter-spacing:0.5px;">폭염 관심</div>
      <div style="font-size:30px; font-weight:900; color:#d97706; line-height:1;">${careCount}<span style="font-size:14px;">개소</span></div>
      <div style="font-size:11px; color:#6b7280; margin-top:3px;">체감 31~32°C</div>
    </div>
  </div>

  <!-- 권역별 체감온도 색상 지도 -->
  <div style="padding:18px 20px 8px;">
    <div style="font-size:14px; font-weight:700; color:#111827; margin-bottom:2px;">📍 권역별 체감온도 현황</div>
    <div style="font-size:11px; color:#9ca3af; margin-bottom:4px;">높을수록 진한 빨간색</div>
    <table style="border-collapse:separate; border-spacing:0; width:100%;">
      ${regionSections}
    </table>
  </div>

  <!-- 범례 -->
  <div style="padding:4px 20px 14px; display:flex; flex-wrap:wrap; align-items:center; gap:2px;">
    <span style="font-size:10px; font-weight:700; color:#6b7280; margin-right:4px;">범례:</span>
    ${legend}
  </div>

  <!-- 구분선 -->
  <div style="height:1px; background:#f3f4f6; margin:0 20px;"></div>

  <!-- 전체 데이터 테이블 -->
  <div style="padding:16px 20px 20px;">
    <div style="font-size:14px; font-weight:700; color:#111827; margin-bottom:10px;">📊 지역별 상세 데이터</div>
    <table style="width:100%; border-collapse:collapse; font-size:12px;">
      <thead>
        <tr style="background:#f97316;">
          <th style="padding:8px 10px; color:#fff; font-weight:700; text-align:left; font-size:11px;">권역</th>
          <th style="padding:8px 10px; color:#fff; font-weight:700; text-align:left; font-size:11px;">지역</th>
          <th style="padding:8px 10px; color:#fff; font-weight:700; text-align:center; font-size:11px;">기온</th>
          <th style="padding:8px 10px; color:#fff; font-weight:700; text-align:center; font-size:11px;">체감온도</th>
          <th style="padding:8px 10px; color:#fff; font-weight:700; text-align:center; font-size:11px;">습도</th>
          <th style="padding:8px 10px; color:#fff; font-weight:700; text-align:center; font-size:11px;">폭염단계</th>
          <th style="padding:8px 10px; color:#fff; font-weight:700; text-align:center; font-size:11px;">기준시간</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  <!-- 푸터 -->
  <div style="padding:14px 20px; background:#f8fafc; border-top:1px solid #e5e7eb; text-align:center; font-size:10px; color:#9ca3af; line-height:1.8;">
    이 메일은 <strong>SafeBoard</strong> 시스템에서 매일 <strong>08:30</strong>에 자동 발송됩니다.<br>
    문의: 안전보건팀 | 기상청 단기예보 API 기준
  </div>
</div>
</body>
</html>`;
}

async function buildExcelBuffer(
  weather: Record<string, WeatherEntry>,
  dateStr: string
): Promise<Buffer | null> {
  try {
    const ExcelJS = (await import('exceljs')).default;
    const CITY_REGION_DETAIL: Record<string, string> = {
      '대구': '대구', '군위': '경북',
      '포항': '경북', '경주': '경북', '김천': '경북', '안동': '경북', '구미': '경북',
      '영주': '경북', '영천': '경북', '상주': '경북', '문경': '경북', '경산': '경북',
      '의성': '경북', '청송': '경북', '영양': '경북', '영덕': '경북', '청도': '경북',
      '고령': '경북', '성주': '경북', '칠곡': '경북', '예천': '경북', '봉화': '경북',
      '울진': '경북', '울릉': '울릉',
      '부산': '부산', '울산': '울산', '창원': '경남', '진주': '경남', '통영': '경남',
      '사천': '경남', '김해': '경남', '밀양': '경남', '거제': '경남', '양산': '경남',
      '의령': '경남', '함안': '경남', '창녕': '경남', '고성': '경남', '남해': '경남',
      '하동': '경남', '산청': '경남', '함양': '경남', '거창': '경남', '합천': '경남',
      '마산': '경남', '진해': '경남',
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
    const REGION_ORDER_DETAIL: Record<string, number> = {
      '대구': 0, '경북': 1, '울릉': 2,
      '부산': 3, '울산': 4, '경남': 5,
      '대전': 6, '세종': 7, '충북': 8, '충남': 9,
      '광주': 10, '전북': 11, '전남': 12, '제주': 13,
    };
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

    // 제목 행
    ws.mergeCells('A1:G1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `폭염 일일 현황 (${dateStr})`;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEA580C' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    ws.columns = [
      { key: '구분',    width: 10 },
      { key: '지역',    width: 12 },
      { key: '기온',    width: 12 },
      { key: '체감온도', width: 14 },
      { key: '습도',    width: 10 },
      { key: '폭염단계', width: 14 },
      { key: '조회시간', width: 22 },
    ];

    const hdrRow = ws.getRow(2);
    hdrRow.values = ['구분', '지역', '기온(°C)', '체감온도(°C)', '습도(%)', '폭염단계', '조회시간'];
    hdrRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE06000' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
    });
    hdrRow.height = 22;

    const rows = Object.entries(weather).map(([name, d]) => ({
      구분: CITY_REGION_DETAIL[name] ?? '기타',
      지역: name,
      기온: d.temp,
      체감온도: d.feels,
      습도: d.hum,
      폭염단계: d.stage,
      조회시간: d.time ?? '',
    }));
    rows.sort((a, b) => (REGION_ORDER_DETAIL[a.구분] ?? 99) - (REGION_ORDER_DETAIL[b.구분] ?? 99));

    rows.forEach(r => {
      const row = ws.addRow(r);
      const fill = STAGE_FILL[r.폭염단계] ?? 'FFFFFF';
      const fontColor = STAGE_FONT[r.폭염단계] ?? '333333';
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + fill } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFDDDDDD' } } };
      });
      row.getCell(6).font = { bold: true, color: { argb: 'FF' + fontColor } };
      row.height = 18;
    });

    // 요약 행
    ws.addRow([]);
    if (rows.length > 0) {
      const temps    = rows.map(r => r.기온).filter(v => v != null) as number[];
      const feels    = rows.map(r => r.체감온도);
      const hums     = rows.map(r => r.습도).filter(v => v != null) as number[];
      const sumRow   = ws.addRow({
        구분: '요약', 지역: `${rows.length}개 지역`,
        기온: Math.round(temps.reduce((a, b) => a + b, 0) / (temps.length || 1) * 10) / 10,
        체감온도: Math.max(...feels),
        습도: Math.round(hums.reduce((a, b) => a + b, 0) / (hums.length || 1)),
        폭염단계: `최고체감 ${Math.max(...feels)}°C`,
        조회시간: rows[0]?.조회시간 ?? '',
      });
      sumRow.eachCell(cell => {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      sumRow.height = 20;
    }

    return await wb.xlsx.writeBuffer() as Buffer;
  } catch (e) {
    console.warn('[HeatwaveEmail] 엑셀 생성 실패:', e);
    return null;
  }
}

export interface HeatwaveDailyEmailStatus {
  lastRun: string | null;
  lastResult: 'sent' | 'no_data' | 'error' | null;
  lastMessage: string | null;
  nextRun: string;
}

const status: HeatwaveDailyEmailStatus = {
  lastRun: null, lastResult: null, lastMessage: null,
  nextRun: '매일 08:30 KST',
};

export function getHeatwaveDailyEmailStatus(): HeatwaveDailyEmailStatus {
  return { ...status };
}

export async function runHeatwaveDailyEmail(): Promise<void> {
  const sender     = process.env.GMAIL_SENDER;
  const appPassword = process.env.GMAIL_APP_PASSWORD;
  const recipients  = (process.env.GMAIL_RECIPIENTS || '').trim();

  if (!sender || !appPassword || !recipients) {
    status.lastResult  = 'error';
    status.lastMessage = 'GMAIL_SENDER / GMAIL_APP_PASSWORD / GMAIL_RECIPIENTS 환경변수 미설정';
    console.warn('[HeatwaveEmail]', status.lastMessage);
    return;
  }

  try {
    const setting = await storage.getSetting('heatwave_map_data');
    if (!setting?.value) {
      status.lastResult  = 'no_data';
      status.lastMessage = '저장된 폭염 날씨 데이터 없음 (실시간 날씨 조회 또는 CSV 업로드 필요)';
      console.warn('[HeatwaveEmail]', status.lastMessage);
      return;
    }

    const { weather } = JSON.parse(setting.value) as {
      weather?: Record<string, WeatherEntry>;
    };
    if (!weather || Object.keys(weather).length === 0) {
      status.lastResult  = 'no_data';
      status.lastMessage = '날씨 데이터가 비어 있음';
      console.warn('[HeatwaveEmail]', status.lastMessage);
      return;
    }

    const now  = new Date();
    const kst  = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const y    = kst.getUTCFullYear();
    const m    = kst.getUTCMonth() + 1;
    const d    = kst.getUTCDate();
    const weekday = ['일', '월', '화', '수', '목', '금', '토'][kst.getUTCDay()];
    const dateStr     = `${y}년 ${m}월 ${d}일 (${weekday})`;
    const dateFileStr = `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;

    const html         = buildHtmlEmail(weather, dateStr);
    const excelBuffer  = await buildExcelBuffer(weather, dateStr);

    const allEntries   = Object.entries(weather).sort((a, b) => b[1].feels - a[1].feels);
    const maxEntry     = allEntries[0];
    const alertCount   = allEntries.filter(([, w]) => w.feels >= 35).length;

    const nodemailer   = (await import('nodemailer')).default;
    const transporter  = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: sender, pass: appPassword },
      tls: { rejectUnauthorized: true },
    });

    const mailOptions: any = {
      from: `"SafeBoard 폭염현황" <${sender}>`,
      to: recipients,
      subject: `🌡 폭염 일일현황 ${dateStr} · 최고체감 ${maxEntry?.[1].feels ?? '-'}°C${alertCount > 0 ? ` · 경보 ${alertCount}개소` : ''}`,
      html,
      attachments: [] as any[],
    };

    if (excelBuffer) {
      mailOptions.attachments.push({
        filename: `폭염현황_${dateFileStr}.xlsx`,
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

// 매일 08:30 KST 자동 발송
cron.schedule(
  '30 8 * * *',
  () => { runHeatwaveDailyEmail().catch(console.error); },
  { timezone: 'Asia/Seoul' }
);

console.log('[HeatwaveEmail] 폭염 일일 메일 스케줄러 시작 (매일 08:30 KST)');
