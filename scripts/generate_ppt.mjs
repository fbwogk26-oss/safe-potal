import PptxGenJS from "pptxgenjs";

const prs = new PptxGenJS();
prs.layout = "LAYOUT_WIDE";

// ─── 색상 팔레트 ──────────────────────────────────────────────────────────────
const C = {
  navy:   "1E3A5F",
  blue:   "2563EB",
  sky:    "38BDF8",
  white:  "FFFFFF",
  gray:   "F1F5F9",
  dark:   "0F172A",
  text:   "1E293B",
  muted:  "64748B",
  green:  "16A34A",
  orange: "EA580C",
  red:    "DC2626",
  yellow: "D97706",
};

// ─── 공통 배경 렌더 ───────────────────────────────────────────────────────────
function addBg(slide, type = "content") {
  if (type === "cover") {
    slide.background = { color: C.navy };
    // 우측 장식 블록
    slide.addShape(prs.ShapeType.rect, { x: 8.5, y: 0, w: 3.5, h: 5.63, fill: { color: C.blue, transparency: 20 } });
    slide.addShape(prs.ShapeType.rect, { x: 9.2, y: 0, w: 2.8, h: 5.63, fill: { color: C.sky, transparency: 40 } });
  } else if (type === "section") {
    slide.background = { color: C.blue };
    slide.addShape(prs.ShapeType.rect, { x: 0, y: 4.5, w: 12, h: 1.13, fill: { color: C.sky, transparency: 50 } });
  } else {
    slide.background = { color: C.white };
    // 좌측 액센트 바
    slide.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: 5.63, fill: { color: C.blue } });
    // 헤더 밑줄
    slide.addShape(prs.ShapeType.rect, { x: 0.12, y: 0.82, w: 11.88, h: 0.04, fill: { color: C.gray } });
    // 푸터
    slide.addShape(prs.ShapeType.rect, { x: 0, y: 5.35, w: 12, h: 0.28, fill: { color: C.navy } });
    slide.addText("SafeBoard 안전관리 포털 사용 설명서", {
      x: 0.2, y: 5.35, w: 8, h: 0.28, fontSize: 8, color: C.white, valign: "middle",
    });
    slide.addText("KTMOS남부", {
      x: 8, y: 5.35, w: 3.8, h: 0.28, fontSize: 8, color: C.white, align: "right", valign: "middle",
    });
  }
}

function addTitle(slide, title, subtitle) {
  slide.addText(title, {
    x: 0.25, y: 0.1, w: 11.5, h: 0.65,
    fontSize: 20, bold: true, color: C.navy, valign: "middle",
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.25, y: 0.72, w: 11.5, h: 0.22,
      fontSize: 10, color: C.muted, valign: "middle",
    });
  }
}

function addBullets(slide, items, x, y, w, h) {
  const rows = items.map(item => {
    if (typeof item === "string") {
      return [{ text: "• " + item, options: { fontSize: 11, color: C.text, breakLine: true } }];
    }
    return [
      { text: "▶ " + item.title + "\n", options: { bold: true, fontSize: 12, color: C.blue, breakLine: false } },
      { text: "   " + item.desc + "\n", options: { fontSize: 10, color: C.muted, breakLine: true } },
    ];
  }).flat();
  slide.addText(rows, { x, y, w, h, valign: "top", lineSpacingMultiple: 1.3 });
}

function addInfoBox(slide, x, y, w, h, title, content, color) {
  slide.addShape(prs.ShapeType.roundRect, { x, y, w, h, fill: { color: color || C.gray }, line: { color: C.blue, width: 1.5 }, rectRadius: 0.08 });
  if (title) {
    slide.addText(title, { x: x+0.12, y: y+0.08, w: w-0.24, h: 0.3, fontSize: 11, bold: true, color: C.navy });
  }
  slide.addText(content, { x: x+0.12, y: y+(title?0.38:0.1), w: w-0.24, h: h-(title?0.46:0.2), fontSize: 10, color: C.text, valign: "top", lineSpacingMultiple: 1.4 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 슬라이드 1 — 표지
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = prs.addSlide();
  addBg(s, "cover");
  s.addText("SafeBoard", { x: 0.6, y: 1.0, w: 7.5, h: 0.8, fontSize: 52, bold: true, color: C.white });
  s.addText("안전관리 포털 시스템", { x: 0.6, y: 1.8, w: 7.5, h: 0.55, fontSize: 26, color: C.sky });
  s.addText("사용자 설명서", { x: 0.6, y: 2.38, w: 7.5, h: 0.45, fontSize: 22, color: "BFDBFE" });
  s.addShape(prs.ShapeType.rect, { x: 0.6, y: 2.95, w: 3.2, h: 0.05, fill: { color: C.sky } });
  s.addText("산업안전보건법에 따른 통합 안전관리 솔루션", { x: 0.6, y: 3.1, w: 7, h: 0.3, fontSize: 12, color: "94A3B8" });
  s.addText("KTMOS 남부 안전관리팀", { x: 0.6, y: 3.6, w: 7, h: 0.28, fontSize: 11, color: "94A3B8" });
  s.addText("2026", { x: 0.6, y: 3.95, w: 7, h: 0.3, fontSize: 11, color: "94A3B8" });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 슬라이드 2 — 목차
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = prs.addSlide();
  addBg(s);
  addTitle(s, "목차", "Contents");
  const cols = [
    [
      { n:"01", t:"시스템 개요 및 로그인" },
      { n:"02", t:"홈 · 공지사항 · 전자게시판" },
      { n:"03", t:"안전성평가제 (대시보드)" },
      { n:"04", t:"사고보고 · 아차사고 관리" },
      { n:"05", t:"위험성평가 (KRAS)" },
      { n:"06", t:"안전점검" },
    ],
    [
      { n:"07", t:"교육업무 관리" },
      { n:"08", t:"보호구 현황 · 안전용품 신청" },
      { n:"09", t:"MSDS 화학물질 검색" },
      { n:"10", t:"근골격계질환 유해요인조사" },
      { n:"11", t:"폭염 일일 체크리스트" },
      { n:"12", t:"보건관리자 보고서" },
    ],
    [
      { n:"13", t:"산업안전보건관리비" },
      { n:"14", t:"AIS 안전이행률" },
      { n:"15", t:"하도급 관리" },
      { n:"16", t:"차량관리 · 과태료" },
      { n:"17", t:"비상대응 훈련" },
      { n:"18", t:"시스템 관리 (관리자)" },
    ],
  ];
  cols.forEach((col, ci) => {
    col.forEach((item, ri) => {
      const x = 0.25 + ci * 3.9;
      const y = 1.0 + ri * 0.72;
      s.addShape(prs.ShapeType.rect, { x, y, w: 0.42, h: 0.42, fill: { color: C.blue } });
      s.addText(item.n, { x, y, w: 0.42, h: 0.42, fontSize: 11, bold: true, color: C.white, align: "center", valign: "middle" });
      s.addText(item.t, { x: x+0.5, y: y+0.05, w: 3.3, h: 0.34, fontSize: 11, color: C.text, valign: "middle" });
    });
  });
}

// ─── 섹션 구분 슬라이드 헬퍼 ─────────────────────────────────────────────────
function addSection(prs, no, title, sub) {
  const s = prs.addSlide();
  addBg(s, "section");
  s.addText(no, { x: 0.5, y: 0.8, w: 2, h: 1.2, fontSize: 72, bold: true, color: "BFDBFE", align: "center" });
  s.addText(title, { x: 2.5, y: 1.3, w: 9, h: 0.8, fontSize: 32, bold: true, color: C.white });
  s.addText(sub || "", { x: 2.5, y: 2.15, w: 9, h: 0.35, fontSize: 14, color: "BFDBFE" });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 슬라이드 3 — 시스템 개요 및 로그인
// ═══════════════════════════════════════════════════════════════════════════════
addSection(prs, "01", "시스템 개요 및 로그인", "System Overview & Login");
{
  const s = prs.addSlide();
  addBg(s);
  addTitle(s, "01  시스템 개요 및 로그인", "SafeBoard는 산업안전보건법 기반 통합 안전관리 포털입니다");

  addInfoBox(s, 0.25, 1.0, 3.5, 1.35, "🔐 로그인", "• 아이디/비밀번호 입력\n• 로그인 상태 유지 체크박스\n• 최초 로그인 시 비밀번호 변경 강제\n• 5회 실패 시 15분 잠금", C.gray);
  addInfoBox(s, 3.95, 1.0, 3.8, 1.35, "🛡️ 권한 체계", "• admin / manager / user / viewer\n• 부서장(deptHead) 특별 역할\n• 48개 세분화 권한 키 개별 설정\n• 메뉴 표시·등록·업로드·다운로드 분리", C.gray);
  addInfoBox(s, 7.95, 1.0, 3.8, 1.35, "🔒 보안 기능", "• 30분 무활동 시 자동 로그아웃\n• 세션 기반 인증 (24시간 TTL)\n• HTTPS 통신 (배포 시 자동 적용)\n• 보안 감사 로그 전체 기록", C.gray);

  addInfoBox(s, 0.25, 2.55, 5.5, 1.1, "👤 사용자 관리 (관리자 전용)", "• 신규 계정 생성 시 임시 비밀번호 + 최초 변경 강제\n• 활성/비활성 전환 가능 (90일 미접속 시 휴면 표시)\n• 역할 프리셋: 일반사용자 / 부서장 / 담당자 3종\n• 비밀번호: 8자 이상, 영문+숫자+특수문자 조합", C.gray);
  addInfoBox(s, 5.95, 2.55, 5.8, 1.1, "🔑 비밀번호 정책", "• 자체 비밀번호 변경: 우측 상단 메뉴\n• 관리자 재설정: 관리자 → 사용자 관리에서 초기화\n• 강도 지표 표시 (약함/보통/강함)\n• 잠금 계정 해제: 관리자 전용", C.gray);

  addInfoBox(s, 0.25, 3.85, 11.5, 1.25, "⚠️ 주의 사항", "• 시스템 전체 잠금 시 일반 사용자의 등록/수정/삭제 불가 — 관리자가 잠금 해제 후 작업 가능\n• 콘텐츠 소유권: 본인이 등록한 항목만 수정/삭제 가능 (관리자는 모든 항목 접근)\n• 데이터 보호: 모든 파일 업로드 및 API 접근은 로그인 인증 필요", "FFF7ED");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 슬라이드 5 — 홈 · 공지사항 · 전자게시판 · 안전수칙
// ═══════════════════════════════════════════════════════════════════════════════
addSection(prs, "02", "홈 · 공지사항 · 전자게시판 · 안전수칙", "Home / Notices / Digital Board / Rules");
{
  const s = prs.addSlide();
  addBg(s);
  addTitle(s, "02  홈 · 공지사항 · 전자게시판 · 안전수칙", "사이트 진입 시 첫 화면 및 공지 관련 메뉴");

  addInfoBox(s, 0.25, 1.0, 5.6, 2.0, "🏠 홈 (/)","• 로그인 후 메인 화면\n• 오늘 날씨 · PM10 미세먼지 등급 표시\n• 최신 공지사항 요약 카드\n• 부서별 안전점수 현황 미리보기\n• 우측 하단: AI 챗봇 플로팅 버튼", C.gray);
  addInfoBox(s, 6.05, 1.0, 5.7, 2.0, "📢 공지사항 (/notices)","• 공지/안전규정/교육자료/장비/차량/출입 6개 카테고리\n• 파일 첨부 (이미지·PDF·Word 등 다중 파일)\n• 카테고리별 필터링 및 키워드 검색\n• 본인 작성 항목만 수정/삭제 가능\n• 다운로드 권한 별도 관리", C.gray);

  addInfoBox(s, 0.25, 3.2, 3.6, 1.55, "📺 전자게시판\n(/digital-board)","• TV/모니터 표출용 전광판 모드\n• 안전 슬로건·날씨·미세먼지 실시간\n• 배경음악 시간대별 자동 재생\n• 전체 화면 전환 버튼", C.gray);
  addInfoBox(s, 4.05, 3.2, 3.6, 1.55, "🛡️ 안전수칙 (/rules)","• 안전수칙 문서 등록 및 열람\n• PDF·이미지·Word 파일 업로드\n• 카테고리별 분류\n• 다운로드 권한 설정 가능", C.gray);
  addInfoBox(s, 7.85, 3.2, 3.9, 1.55, "🤖 AI 챗봇","• 자연어로 교육 등록·점검 등록 요청\n• 사진 최대 10장 첨부 가능\n• 권한에 따라 이용 가능 기능 제한\n• 대화 내역 최근 6개 유지", C.gray);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 슬라이드 — 안전성평가제
// ═══════════════════════════════════════════════════════════════════════════════
addSection(prs, "03", "안전성평가제 (대시보드)", "Safety Score Dashboard");
{
  const s = prs.addSlide();
  addBg(s);
  addTitle(s, "03  안전성평가제 (/safety-scores)", "팀별 안전점수를 점수 기준으로 산출·시각화합니다");

  addInfoBox(s, 0.25, 1.0, 7.4, 1.6, "📊 점수 산출 기준", "• 기본 100점에서 차감/가산 방식으로 자동 계산\n• 사고 발생: -40점 | 교통법규 위반: -1점\n• 아차사고·안전제안 등록: +3점\n• 차량 보유 수·정기점검 이행 여부 반영\n• 막대 차트로 팀별 순위 시각화 (Recharts)", C.gray);
  addInfoBox(s, 7.85, 1.0, 3.9, 1.6, "🏆 팀 관리", "• 팀별 안전점수 카드 목록\n• 차량 수·사고 건수·벌금 직접 입력\n• CSV/Excel 일괄 업로드 지원\n• 최고·최저 점수 팀 자동 강조", C.gray);

  addInfoBox(s, 0.25, 2.8, 5.5, 1.4, "📋 평가항목 관리 (/safety-score-items)", "• 점수 산출에 사용되는 평가항목 직접 설정\n• 가중치·차감값·카테고리 관리\n• 관리자 또는 editSafetyScores 권한 필요", C.gray);
  addInfoBox(s, 5.95, 2.8, 5.8, 1.4, "📈 안전관리자 보고서 (/safety-manager-reports)", "• 기간별 안전 활동 현황 통계\n• 점검·교육·사고 건수 집계\n• PDF 또는 Excel 출력 지원", C.gray);

  addInfoBox(s, 0.25, 4.4, 11.5, 0.88, "💡 사용 팁", "• 전체 잠금 상태에서는 점수 수정 불가 — 관리자가 잠금 해제 필요\n• 업로드 권한(uploadDashboardData)이 있어야 CSV 일괄 업로드 가능\n• 점수 변동 이력은 보안 감사 로그에서 확인 가능", "FFF7ED");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 슬라이드 — 사고보고 · 아차사고
// ═══════════════════════════════════════════════════════════════════════════════
addSection(prs, "04", "사고보고 · 아차사고 관리", "Accident Reports / Near-Miss");
{
  const s = prs.addSlide();
  addBg(s);
  addTitle(s, "04  사고보고 · 아차사고 관리", "사고 발생 시 즉시 등록하고 경위서를 자동 생성합니다");

  addInfoBox(s, 0.25, 1.0, 5.6, 2.2, "🚨 사고보고서 (/accidents)", "• 사고 유형·원인·심각도·부서·날짜 입력\n• 보고자 정보: 이름·직급·동승자·차량 정보\n• 사고경위·원인분석·재발방지 대책 작성\n• 전자서명 첨부 (canvas 기반)\n• 사진 다중 첨부\n• ▶ DOCX 사고경위서 자동 생성 · 다운로드\n• 진행 상황(진행중/완료 등) 단계별 관리", C.gray);
  addInfoBox(s, 6.05, 1.0, 5.7, 2.2, "⚠️ 아차사고 관리 (/near-miss)", "• 아차사고 유형·위치·부서·날짜 입력\n• 위험 상황 설명 및 재발방지 조치 기록\n• 사진 첨부 지원\n• 전자서명으로 보고자 확인\n• 안전성평가제 점수에 반영 (+3점)\n• 통계 차트로 발생 추이 시각화", C.gray);

  addInfoBox(s, 0.25, 3.4, 5.5, 1.38, "📊 통계 기능", "• 월별·분기별·연간 사고 발생 현황\n• 유형별·원인별 분포 차트\n• 다운로드 권한(downloadAccidentReport) 필요\n• Excel 내보내기 지원", C.gray);
  addInfoBox(s, 5.95, 3.4, 5.8, 1.38, "✅ 처리 절차 안내", "① 사고 발생 즉시 앱에서 보고서 등록\n② 사진·서명 첨부 후 저장\n③ DOCX 경위서 자동 생성 → 인쇄\n④ 관리자가 진행 상태 갱신 및 완료 처리", C.gray);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 슬라이드 — 위험성평가
// ═══════════════════════════════════════════════════════════════════════════════
addSection(prs, "05", "위험성평가 (KRAS)", "Korean Risk Assessment System");
{
  const s = prs.addSlide();
  addBg(s);
  addTitle(s, "05  위험성평가 (/risk-assessment)", "KRAS 기반 위험요인 평가 및 개선 이행 관리");

  addInfoBox(s, 0.25, 1.0, 3.7, 2.6, "📝 평가 등록", "• 기간 유형·부서·유해요인 입력\n• 가능성(1~5) × 중대성(1~4) = 위험도\n• 위험등급 자동 산출:\n   A등급(≥8) / B등급 / C등급\n• 현황·문제점·관련법규 기록\n• 개선 전 사진 첨부\n• 승인 상태: 임시저장→승인대기\n  →승인완료 / 자동종결", C.gray);
  addInfoBox(s, 4.15, 1.0, 3.7, 2.6, "🔧 개선 이행 (A등급)", "• A등급(고위험) 항목만 개선 프로세스\n• 개선 조치·계획일·완료일 입력\n• 개선 후 가능성·중대성 재평가\n• 개선 후 위험도 자동 재산출\n• 개선 후 사진 첨부\n• 개선 상태: 미완료→진행중→완료\n• 부서장: 개선+승인 한번에 처리", C.gray);
  addInfoBox(s, 8.05, 1.0, 3.7, 2.6, "✅ 승인 절차", "• 임시저장: 언제든 수정 가능\n• 승인대기: 검토 요청 상태\n• 승인완료: 최종 확정 (수정 잠금)\n• 자동종결: 기간 만료 시 자동 처리\n• 부서장(deptHead): 개선·승인\n  동시 처리 권한\n• 관리자: 모든 상태 수정 가능", C.gray);

  addInfoBox(s, 0.25, 3.8, 11.5, 0.88, "📊 위험도 매트릭스", "가능성 5점 × 중대성 4점 = 최대 20점  |  A등급(≥8점): 즉시 개선 필요  |  B등급(4~7점): 계획적 개선  |  C등급(≤3점): 허용 가능 수준\n결과 조회(/risk-assessment/results)에서 등급별 현황 및 통계 확인 가능", "EFF6FF");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 슬라이드 — 안전점검
// ═══════════════════════════════════════════════════════════════════════════════
addSection(prs, "06", "안전점검", "Safety Inspections");
{
  const s = prs.addSlide();
  addBg(s);
  addTitle(s, "06  안전점검 (/inspections)", "현장 안전점검 체크리스트 등록 및 사진 기록");

  addInfoBox(s, 0.25, 1.0, 5.6, 1.8, "📋 점검 등록", "• 점검 날짜·부서·점검자 입력\n• 항목별 체크리스트 (양호/불량/해당없음)\n• 불량 항목 지적 사항 메모\n• 사진 첨부 (uploadInspectionPhotos 권한)\n• 본인 등록 항목만 수정/삭제", C.gray);
  addInfoBox(s, 6.05, 1.0, 5.7, 1.8, "📁 점검 이력 관리", "• 날짜·부서별 필터링 검색\n• 점검 완료율 통계\n• Excel 다운로드 (downloadInspectionExcel 권한)\n• 사진 갤러리 뷰\n• 불량 항목 추이 분석", C.gray);

  addInfoBox(s, 0.25, 3.0, 11.5, 0.88, "🏗️ 합동안전보건점검 (/joint-inspection) — 하도급 메뉴", "• 원청·하청 합동으로 실시하는 안전보건점검 기록\n• 점검 일자·참석자·지적사항·개선계획 등록\n• Word 문서 미리보기 및 다운로드 지원", "EFF6FF");

  addInfoBox(s, 0.25, 4.05, 5.5, 1.2, "💡 사용 팁", "• 현장에서 모바일로 바로 등록 가능\n• 사진은 업로드 후 점검 현황에서 갤러리로 확인\n• 분기별 점검 결과를 Excel로 추출하여 보고 자료 활용", C.gray);
  addInfoBox(s, 5.95, 4.05, 5.8, 1.2, "🔐 권한 안내", "• editInspections: 등록·수정·삭제\n• uploadInspectionPhotos: 사진 업로드\n• downloadInspectionExcel: Excel 내보내기\n• viewInspections: 열람 전용", C.gray);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 슬라이드 — 교육업무 관리
// ═══════════════════════════════════════════════════════════════════════════════
addSection(prs, "07", "교육업무 관리", "Education Management");
{
  const s = prs.addSlide();
  addBg(s);
  addTitle(s, "07  교육업무 관리 (/education-management)", "안전교육 계획·실시·일지·서명까지 통합 관리");

  addInfoBox(s, 0.25, 1.0, 3.7, 2.4, "📚 교육 계획 등록", "• 교육 제목·날짜·부서·강사 입력\n• 참석 대상 인원 등록\n• 교육 자료 파일 다중 첨부\n• 교육 유형 (정기/특별/신규입사 등)\n• registerEducation 권한 필요", C.gray);
  addInfoBox(s, 4.15, 1.0, 3.7, 2.4, "✍️ 전자서명 수집", "• 교육 참석자 이름·부서·서명 입력\n• Canvas 기반 전자서명 패드\n• 서명 완료 목록 관리\n• 서명 로그 관리자 열람\n• (/admin/signatures)", C.gray);
  addInfoBox(s, 8.05, 1.0, 3.7, 2.4, "📊 교육일지 조회", "• 교육 실시 이력 목록\n• 날짜·부서별 필터\n• 참석자 명단 및 서명 확인\n• Excel 다운로드\n  (downloadEducationExcel 권한)\n• editEducationLogs 권한으로 수정", C.gray);

  addInfoBox(s, 0.25, 3.6, 5.5, 1.1, "📈 온라인 교육 진도 관리", "• 온라인 교육 플랫폼 연동 진도율 관리\n• 개인별 이수 현황 및 진도 추적\n• 교육 이수 완료 확인서 발급", C.gray);
  addInfoBox(s, 5.95, 3.6, 5.8, 1.1, "🤖 AI 챗봇 연동", "• '7월 15일 전기안전교육 10명 등록해줘' 등\n• 자연어로 교육 일지 등록 요청 가능\n• registerEducation 권한 보유 시 실행", C.gray);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 슬라이드 — 보호구·안전용품
// ═══════════════════════════════════════════════════════════════════════════════
addSection(prs, "08", "보호구 현황 · 안전용품 신청", "Equipment Status / Safety Supply Requests");
{
  const s = prs.addSlide();
  addBg(s);
  addTitle(s, "08  보호구 현황 · 안전용품 신청", "보호구 재고 관리 및 신규 안전용품 구매 요청");

  addInfoBox(s, 0.25, 1.0, 5.6, 2.0, "🦺 보호구 현황 (/equipment/status)", "• 안전모·안전화·안전조끼 등 품목별 재고\n• 입고·출고·잔량 실시간 관리\n• 부서별 보유 현황 조회\n• 수량 부족 경고 알림\n• editEquipmentStatus 권한 필요\n• Excel 다운로드 지원", C.gray);
  addInfoBox(s, 6.05, 1.0, 5.7, 2.0, "🛒 안전용품 신청 (/equipment)", "• 신규 안전용품 구매 요청 등록\n• 품목명·수량·필요 사유·우선순위 입력\n• 요청 상태: 대기중→검토중→승인/반려\n• 미확인 요청 건수 사이드바 배지 표시\n• manageEquipmentRequests 권한으로 처리", C.gray);

  addInfoBox(s, 0.25, 3.2, 11.5, 1.0, "🧪 안전용품 설문 (/safety-supply-survey)", "• 현장 작업자 대상 보호구 필요 현황 설문\n• 품목별 만족도 및 추가 필요 수량 응답 수집\n• 결과 집계로 구매 계획 수립에 활용", C.gray);

  addInfoBox(s, 0.25, 4.38, 11.5, 0.88, "💡 신청 절차 안내", "① 안전용품 신청 메뉴에서 품목·수량·사유 작성 → ② 관리자/담당자가 검토 후 승인·반려 → ③ 승인 시 보호구 현황에 재고 반영 → ④ 출고 처리", "FFF7ED");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 슬라이드 — MSDS
// ═══════════════════════════════════════════════════════════════════════════════
addSection(prs, "09", "MSDS 화학물질 검색", "Material Safety Data Sheet");
{
  const s = prs.addSlide();
  addBg(s);
  addTitle(s, "09  MSDS 화학물질 검색 (/msds)", "물질안전보건자료 통합 검색 및 PDF 관리");

  addInfoBox(s, 0.25, 1.0, 5.6, 2.1, "🔬 화학물질 등록", "• 물질명·CAS번호·카테고리 입력\n• 유해성·보호구(PPE) 정보 기록\n• 응급처치 방법 작성\n• PDF 파일 첨부 (MSDS 원문)\n• editMsds 권한 필요\n• 본인 등록 항목만 수정/삭제", C.gray);
  addInfoBox(s, 6.05, 1.0, 5.7, 2.1, "🔍 검색 및 조회", "• 물질명·CAS번호·카테고리 키워드 검색\n• 카테고리별 필터링\n• 목록 선택 후 일괄 PDF 다운로드\n• PDF 미리보기 다이얼로그 (새 탭 열기)\n• 이미지 파일은 인라인 미리보기\n• downloadMsdsPdf 권한 필요", C.gray);

  addInfoBox(s, 0.25, 3.3, 3.7, 1.55, "📦 카테고리", "• 산업용 화학물질\n• 세정제·용제\n• 도료·접착제\n• 가스류\n• 기타 위험물질\n• 관리자 설정으로 추가 가능", C.gray);
  addInfoBox(s, 4.15, 3.3, 3.7, 1.55, "📥 일괄 다운로드", "• 목록에서 여러 항목 체크박스 선택\n• 하단 플로팅 바에서 일괄 다운로드\n• 각 파일이 순서대로 자동 저장\n• PDF·이미지 모두 지원", C.gray);
  addInfoBox(s, 8.05, 3.3, 3.7, 1.55, "💡 PDF 미리보기", "• 눈 모양 버튼 클릭\n• 브라우저 내 PDF 뷰어 표시\n• 새 탭 열기로 전체 화면 확인\n• 이미지 파일은 img 태그로 표시", C.gray);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 슬라이드 — 근골격계
// ═══════════════════════════════════════════════════════════════════════════════
addSection(prs, "10", "근골격계질환 유해요인조사", "Musculoskeletal Hazard Assessment");
{
  const s = prs.addSlide();
  addBg(s);
  addTitle(s, "10  근골격계질환 유해요인조사 (/musculoskeletal)", "작업별 근골격계 유해요인 평가 및 개선계획 관리");

  addInfoBox(s, 0.25, 1.0, 5.6, 2.4, "📝 조사 등록", "• 부서·작업명·유해요인 항목 입력\n• 위험수준 평가 (낮음/보통/높음/매우높음)\n• 현재 조치 사항 기록\n• 개선 계획 작성\n• 조사 일자·조사자 명 입력\n• 처리 상태 관리 (미처리/처리중/완료)\n• editMusculoskeletal 권한 필요", C.gray);
  addInfoBox(s, 6.05, 1.0, 5.7, 2.4, "📊 현황 조회", "• 부서별·위험수준별 필터링\n• 처리 상태별 분류 조회\n• 개선 이행 현황 추적\n• 조사 결과 통계 차트\n• 공개 서명 링크 생성\n  (/public/musculoskeletal/:id)\n• 작업자가 직접 서명 가능", C.gray);

  addInfoBox(s, 0.25, 3.6, 11.5, 1.65, "📋 법적 근거 및 주기", "• 산업안전보건법 제39조(작업환경측정), 고용노동부 고시 '근골격계부담작업 유해요인조사 지침'\n• 신규·추가 작업 시 즉시 실시 / 정기조사: 3년마다 실시\n• 조사 결과 5년 이상 보존 의무\n• 현장 작업자 의견 수렴 절차 포함 (공개 링크 서명 기능 활용)", "EFF6FF");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 슬라이드 — 폭염 체크리스트
// ═══════════════════════════════════════════════════════════════════════════════
addSection(prs, "11", "폭염 일일 체크리스트", "Heat Wave Daily Checklist");
{
  const s = prs.addSlide();
  addBg(s);
  addTitle(s, "11  폭염 일일 체크리스트 (/heat-wave-checklist)", "대구·경북 31개 지역 실시간 폭염 현황 및 일일 점검");

  addInfoBox(s, 0.25, 1.0, 3.7, 2.55, "🌡️ 3D 지도", "• 대구·경북·울릉도 3D 입체 지도\n• 지역별 체감온도에 따른 색상 변화\n  (녹색→주황→빨강)\n• 마우스 패닝·휠 줌 지원\n• 지역 클릭 시 상세 정보 표시\n• 실시간 날씨 버튼: Open-Meteo API\n• 반영 데이터 서버 저장 (기기 공유)", C.gray);
  addInfoBox(s, 4.15, 1.0, 3.7, 2.55, "📋 일일 체크리스트", "• 31개 폭염 점검 항목 체크\n  (음수 제공·그늘막·휴식시간 등)\n• 폭염 경보 단계별 점검 기준\n• 담당자 전자서명\n• 체감온도 자동 기록\n• 날짜별 이력 조회\n• Excel·PDF 출력 지원", C.gray);
  addInfoBox(s, 8.05, 1.0, 3.7, 2.55, "📊 폭염 데이터", "• 실시간 날씨 버튼:\n  31개 지역 동시 수신\n• CSV 파일 업로드:\n  기상청 데이터 직접 반영\n• 엑셀 저장 버튼:\n  현재 지도 데이터 Excel 다운\n• 폭염단계별 색상 강조\n• 대구/경북/울릉도 구분 정렬", C.gray);

  addInfoBox(s, 0.25, 3.75, 11.5, 0.9, "🌡️ 폭염 단계 기준  (체감온도 기준)", "해당없음 (~31°C 미만)  |  폭염관심 (31°C 이상)  |  폭염주의보 (33°C 이상)  |  폭염경보 (35°C 이상)\n3D 지도 색상: 녹색(낮음) → 주황(보통) → 빨강(위험) 단계별 자동 변경", "FFF1F2");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 슬라이드 — 산업안전보건관리비
// ═══════════════════════════════════════════════════════════════════════════════
addSection(prs, "13", "산업안전보건관리비", "Safety & Health Management Cost");
{
  const s = prs.addSlide();
  addBg(s);
  addTitle(s, "13  산업안전보건관리비 (/safety-cost-budget)", "법정 안전관리비 지출 관리 및 세금계산서 첨부");

  addInfoBox(s, 0.25, 1.0, 3.7, 2.4, "💰 사용내역 등록", "• 9개 항목별 지출 분류:\n  안전관리자/시설/보호구/교육\n  /환경/건강/기술지도/기타 등\n• 품목명·규격·수량·단가 입력\n• 수량×단가 자동 계산\n• 구매일자·업체명 기록\n• 견적서·거래명세서 파일 첨부", C.gray);
  addInfoBox(s, 4.15, 1.0, 3.7, 2.4, "🤖 AI 자동 추출", "• 견적서/거래명세서 이미지 업로드\n• GPT-4o Vision AI가 항목 자동 인식\n• 품목명·수량·단가·금액 자동 입력\n• 다중 품목 동시 선택 가능\n• 수정 후 저장 (검토 필수)\n• 오류 시 수동 입력으로 보완", C.gray);
  addInfoBox(s, 8.05, 1.0, 3.7, 2.4, "🧾 세금계산서 관리", "• 월별 세금계산서 등록\n• 이미지·PDF 파일 첨부\n• 발행일·공급가·부가세 입력\n• 월별 탭으로 분류 조회\n• 법정경비 Excel 내보내기:\n  사용내역+세금계산서 시트\n  첨부 이미지 임베딩 포함", C.gray);

  addInfoBox(s, 0.25, 3.6, 11.5, 1.65, "📊 항목별 요약 및 Excel 다운로드", "• 9개 항목별 카드+진행바+월별 미니차트로 예산 집행 현황 시각화\n• /api/safety-cost-records/export — 사용내역 + 세금계산서 시트 + 첨부 이미지 임베딩 Excel\n• 연간 예산 대비 집행률 자동 계산\n• 월별 필터링으로 기간별 조회 가능", "EFF6FF");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 슬라이드 — AIS 안전이행률
// ═══════════════════════════════════════════════════════════════════════════════
addSection(prs, "14", "AIS 안전이행률", "AIS Safety Compliance Rate");
{
  const s = prs.addSlide();
  addBg(s);
  addTitle(s, "14  AIS 안전이행률 (/ais-safety-rate)", "TBM 및 작업허가서 이행률 모니터링 및 자동 보고");

  addInfoBox(s, 0.25, 1.0, 3.7, 2.4, "📈 이행률 대시보드", "• 전체·허가서·TBM 이행률 핵심지표\n• 운용팀별 TBM 활동 내역 표\n• 월별·일자별 이행률 그래프\n• 90%/70% 미만 경고 강조 표시\n• 이행률 기준 색상 자동 변경", C.gray);
  addInfoBox(s, 4.15, 1.0, 3.7, 2.4, "📧 자동 보고 메일", "• 매일 08:40 KST 자동 발송\n• 일일 이행률 현황 HTML 메일\n• 4시트 Excel 리포트 자동 첨부:\n  ①현황 ②세부내역\n  ③부적합(소명포함)\n  ④작업번호별 사진\n• '일일 보고 메일' 버튼으로 수동 발송", C.gray);
  addInfoBox(s, 8.05, 1.0, 3.7, 2.4, "⚠️ 부적합 소명 관리", "• TBM 부적합 항목 자동 감지\n• 소명 메일 자동 접수 (10분 간격)\n• 이메일에서 사진 자동 추출·등록\n• 담당자가 사유 입력 후 소명 처리:\n  소명완료/소명불가\n• '부적합 상태로 되돌리기' 초기화\n• 사진 최대 3장 관리", C.gray);

  addInfoBox(s, 0.25, 3.6, 11.5, 1.65, "📊 4시트 Excel 리포트 구성", "①현황 시트: 핵심지표 + 운용팀별 TBM 내역 + 월별/일자별 이행률 표 (데이터바 시각화)\n②세부내역 시트: 전체 업로드 기록 누적 목록  |  ③부적합 시트: 부적합 사유 + 소명 내용/상태\n④사진 시트: 작업번호별 부적합 사진 최대 3장 임베딩 | 수동 다운로드: '엑셀 리포트 다운로드' 버튼", "EFF6FF");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 슬라이드 — 하도급관리
// ═══════════════════════════════════════════════════════════════════════════════
addSection(prs, "15", "하도급 관리", "Subcontract Management");
{
  const s = prs.addSlide();
  addBg(s);
  addTitle(s, "15  하도급 관리", "작업계획·협의체·합동점검·입회 관리 통합");

  addInfoBox(s, 0.25, 1.0, 3.7, 2.2, "📋 작업계획 (/work-plan)", "• Excel 파일 업로드 → 자동 포맷팅\n• ExcelJS 테두리·색·헤더 스타일 적용\n• 이메일 초안 자동 생성 (AI 활용)\n• 시트 요약 자동 추출\n• 처리된 파일 다운로드\n• canViewWorkPlan 권한 필요", C.gray);
  addInfoBox(s, 4.15, 1.0, 3.7, 2.2, "👥 산업안전보건협의체\n(/safety-committee)", "• 협의체 회의록 등록·관리\n• 회의 일자·참석자·안건 기록\n• Word 문서 미리보기\n• DOMPurify 보안 새니타이징 적용\n• canViewSafetyCommittee 권한", C.gray);
  addInfoBox(s, 8.05, 1.0, 3.7, 2.2, "🚪 입회 관리 (/attendance)", "• 외부 작업자 입회 신청 등록\n• 입회 일자·목적·업체 기록\n• 승인/반려 처리\n• 출입 이력 Excel 다운로드\n• canViewAttendance 권한", C.gray);

  addInfoBox(s, 0.25, 3.4, 5.5, 1.38, "🔍 합동안전보건점검\n(/joint-inspection)", "• 원청·하청 합동 점검 기록\n• 점검자 명단·지적 사항·개선계획 등록\n• 사진 첨부 및 조치 완료 확인\n• Word 문서 출력 지원", C.gray);
  addInfoBox(s, 5.95, 3.4, 5.8, 1.38, "💡 하도급 관리 운영 팁", "• 작업 전 작업계획서 업로드 → 이메일 초안 자동 생성 후 발송\n• 월 1회 협의체 회의록 등록 권장\n• 입회 신청은 작업 1일 전 등록 원칙\n• 합동점검 결과는 3개월 이력 보관", C.gray);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 슬라이드 — 차량관리
// ═══════════════════════════════════════════════════════════════════════════════
addSection(prs, "16", "차량관리 · 과태료 현황", "Vehicle Management / Traffic Fines");
{
  const s = prs.addSlide();
  addBg(s);
  addTitle(s, "16  차량관리 · 과태료 현황", "법인 차량 연료비 및 교통 과태료 통합 관리");

  addInfoBox(s, 0.25, 1.0, 5.6, 2.2, "🚗 차량 관리 (/admin/fuel-costs)", "• 차량별 연료 주유 기록\n• 주유일·금액·주유소·주행거리 입력\n• 부서별 차량 배정 현황\n• 월별 유류비 집계 통계\n• Excel 다운로드 (downloadVehicleExcel)\n• 차량 일지 연동 조회\n• canViewVehicle 권한 필요", C.gray);
  addInfoBox(s, 6.05, 1.0, 5.7, 2.2, "🚦 과태료 현황 (/traffic-fines)", "• 교통법규 위반 과태료 등록\n• 위반일·부서·차량번호·위반유형 입력\n• 위반 장소·발부일·납부기한 기록\n• 납부 상태: 미납 / 납부완료\n• PDF 고지서 첨부\n• 안전성평가 점수 자동 연동 (-1점)\n• canViewTrafficFines 권한", C.gray);

  addInfoBox(s, 0.25, 3.4, 11.5, 0.88, "💡 과태료 처리 절차", "① 과태료 통보서 수령 → ② 시스템에 위반 내역 등록 + PDF 첨부 → ③ 납부 완료 후 상태 '납부완료'로 변경\n→ ④ 안전성평가 점수 자동 차감 (-1점) 반영 확인", "FFF7ED");

  addInfoBox(s, 0.25, 4.45, 5.5, 0.82, "🚌 차량일지 관리", "• 차량별 운행 일지 등록\n• 출발지·목적지·주행거리·목적 기록\n• Excel 다운로드 (downloadVehicleLogExcel)", C.gray);
  addInfoBox(s, 5.95, 4.45, 5.8, 0.82, "📊 통계 활용", "• 월별 유류비 추이 분석\n• 과태료 발생 빈도·부서별 분포\n• 연간 차량 운영 비용 집계", C.gray);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 슬라이드 — 비상훈련
// ═══════════════════════════════════════════════════════════════════════════════
addSection(prs, "17", "비상대응 훈련 · 보건관리자 보고서", "Drill Training / Health Manager Reports");
{
  const s = prs.addSlide();
  addBg(s);
  addTitle(s, "17  비상대응 훈련 · 보건관리자 보고서", "훈련 시나리오 관리 및 보건 통계 보고");

  addInfoBox(s, 0.25, 1.0, 5.6, 2.0, "🚨 비상대응 훈련 (/drill-training)", "• 화재·지진·화학물질 등 훈련 시나리오 등록\n• 훈련 일정·참가자·훈련 결과 기록\n• 시나리오 HTML 콘텐츠 작성\n  (DOMPurify 보안 새니타이징 적용)\n• 훈련 사진 첨부\n• canViewDrillTraining 권한 필요", C.gray);
  addInfoBox(s, 6.05, 1.0, 5.7, 2.0, "🩺 보건관리자 보고서 (/health-manager-reports)", "• 건강 이상 현황·질병 통계 보고\n• 작업환경 측정 결과 기록\n• 건강검진 이행 현황\n• 보건 교육 실시 현황\n• canViewHealthManagerReports 권한\n• PDF·Excel 출력 지원", C.gray);

  addInfoBox(s, 0.25, 3.2, 11.5, 0.72, "📋 훈련 주기 권장 사항", "화재 대피훈련: 연 2회 이상 (소방시설법)  |  화학물질 대응훈련: 연 1회 이상  |  지진 대응: 연 1회\n훈련 실시 후 반드시 결과 기록 및 개선사항 도출 → 시스템 등록", "EFF6FF");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 슬라이드 — 시스템 관리
// ═══════════════════════════════════════════════════════════════════════════════
addSection(prs, "18", "시스템 관리 (관리자 전용)", "System Administration");
{
  const s = prs.addSlide();
  addBg(s);
  addTitle(s, "18  시스템 관리 — 관리자 전용", "사용자·보안·로그·데이터 관리 전반");

  addInfoBox(s, 0.25, 1.0, 2.7, 2.55, "👥 사용자 관리\n(/admin/users)", "• 계정 생성·수정·삭제\n• 역할 및 48개 권한 설정\n• 프리셋 일괄 적용\n• 활성/비활성 전환\n• 잠금 계정 해제\n• 비밀번호 초기화", C.gray);
  addInfoBox(s, 3.15, 1.0, 2.7, 2.55, "🔍 보안 감사 로그\n(/admin/security)", "• 로그인/로그아웃 기록\n• 등록·수정·삭제 이력\n• 파일 업로드·다운로드\n• 권한 변경 이력\n• IP·User-Agent 기록\n• 기간별 필터 조회", C.gray);
  addInfoBox(s, 6.05, 1.0, 2.7, 2.55, "📡 API 호출 내역\n(/admin/api-logs)", "• 전체 API 요청 기록\n• 응답 코드·처리 시간\n• 사용자별 호출 패턴\n• 오류 요청 필터\n• 성능 모니터링 활용", C.gray);
  addInfoBox(s, 9.0, 1.0, 2.75, 2.55, "🎵 음악·기타 관리", "• 전자게시판 배경음악\n  업로드·스케줄 관리\n• 서명 관리 로그\n• 데이터 백업 관리\n• 음주운전 카드뉴스\n  콘텐츠 관리", C.gray);

  addInfoBox(s, 0.25, 3.75, 11.5, 1.55, "🛠️ 관리자 주요 업무 흐름", "• 신규 직원 입사: 계정 생성 → 역할·권한 설정 → 임시 비밀번호 부여 (최초 로그인 시 변경 강제)\n• 퇴직 처리: 계정 비활성화 (삭제 권장하지 않음, 이력 보존)\n• 잠금 해제: 보안 감사 로그에서 잠금 사유 확인 후 해제\n• 데이터 이상 발생: API 호출 내역 + 보안 로그 교차 분석 → 원인 특정", "EFF6FF");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 마지막 슬라이드 — 문의 및 지원
// ═══════════════════════════════════════════════════════════════════════════════
{
  const s = prs.addSlide();
  addBg(s, "cover");
  s.addText("감사합니다", { x: 0.6, y: 1.2, w: 7.5, h: 0.9, fontSize: 48, bold: true, color: C.white });
  s.addText("SafeBoard 안전관리 포털", { x: 0.6, y: 2.15, w: 7.5, h: 0.45, fontSize: 20, color: C.sky });
  s.addShape(prs.ShapeType.rect, { x: 0.6, y: 2.72, w: 3, h: 0.05, fill: { color: C.sky } });
  s.addText("문의 및 지원", { x: 0.6, y: 2.9, w: 7, h: 0.3, fontSize: 14, bold: true, color: "BFDBFE" });
  s.addText("• 시스템 문의: 안전관리팀 담당자에게 문의\n• 권한 신청: 관리자에게 요청\n• 오류 발생 시: 화면 캡처 후 담당자 공유", {
    x: 0.6, y: 3.28, w: 7.5, h: 0.9, fontSize: 12, color: "94A3B8", lineSpacingMultiple: 1.6,
  });
  s.addText("KTMOS 남부 안전관리팀  ·  2026", { x: 0.6, y: 4.5, w: 7.5, h: 0.28, fontSize: 10, color: "475569" });
}

// ─── 저장 ─────────────────────────────────────────────────────────────────────
await prs.writeFile({ fileName: "SafeBoard_사용설명서.pptx" });
console.log("✅ 생성 완료: SafeBoard_사용설명서.pptx");
