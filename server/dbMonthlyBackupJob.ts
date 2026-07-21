/**
 * DB 월별 자동 백업 메일
 * - 매월 1일 09:00 KST에 전체 DB를 Excel로 추출해 메일 발송
 */
import cron from "node-cron";
import { buildDbExcelBuffer } from "./dbExcelExport";

interface BackupJobStatus {
  lastRun: string | null;
  lastResult: "sent" | "error" | null;
  lastMessage: string | null;
  nextRun: string;
}

const status: BackupJobStatus = {
  lastRun: null,
  lastResult: null,
  lastMessage: null,
  nextRun: "매월 1일 09:00 KST",
};

export function getDbBackupJobStatus(): BackupJobStatus {
  return { ...status };
}

export async function runDbMonthlyBackup(): Promise<void> {
  const sender      = process.env.GMAIL_SENDER;
  const appPassword = process.env.GMAIL_APP_PASSWORD;

  if (!sender || !appPassword) {
    status.lastResult  = "error";
    status.lastMessage = "GMAIL_SENDER / GMAIL_APP_PASSWORD 환경변수 미설정";
    console.warn("[DbBackupEmail]", status.lastMessage);
    return;
  }

  try {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 3600 * 1000);
    const y   = kst.getUTCFullYear();
    const m   = String(kst.getUTCMonth() + 1).padStart(2, "0");
    const d   = String(kst.getUTCDate()).padStart(2, "0");
    const dateLabel = `${y}년 ${m}월 ${d}일`;
    const fileDate  = `${y}${m}${d}`;

    console.log("[DbBackupEmail] Excel 생성 시작...");
    const excelBuffer = await buildDbExcelBuffer();

    if (!excelBuffer) {
      status.lastResult  = "error";
      status.lastMessage = "Excel 생성 실패";
      console.error("[DbBackupEmail]", status.lastMessage);
      return;
    }

    // 수신자: 발신자 본인 + GMAIL_RECIPIENTS
    const envRecipients = (process.env.GMAIL_RECIPIENTS ?? "")
      .split(",").map(s => s.trim()).filter(Boolean);
    const toSet  = new Set([sender, ...envRecipients]);
    const toList = [...toSet].join(", ");

    const nodemailer = (await import("nodemailer")).default;
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: sender, pass: appPassword },
      tls: { rejectUnauthorized: true },
      connectionTimeout: 15_000,
      greetingTimeout:   10_000,
      socketTimeout:     30_000,
    });

    const html = `
<div style="font-family:맑은고딕,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;padding:24px;border-radius:12px;">
  <div style="background:#1e3a5f;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
    <h2 style="margin:0;font-size:18px;">🗄️ SafeBoard DB 월별 자동 백업</h2>
    <p style="margin:6px 0 0;font-size:13px;opacity:0.85;">${dateLabel} 기준 전체 데이터 내보내기</p>
  </div>
  <div style="background:#fff;padding:20px 24px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;border-top:none;">
    <p style="font-size:14px;color:#374151;line-height:1.7;">
      이 메일에는 <strong>SafeBoard 전체 DB 데이터</strong>가 Excel 파일로 첨부되어 있습니다.<br>
      안전하게 보관하시고 외부 유출에 주의해 주세요.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px;">
      <tr style="background:#f3f4f6;">
        <td style="padding:8px 12px;font-weight:600;color:#374151;">포함 항목</td>
        <td style="padding:8px 12px;color:#6b7280;">팀 안전점수, 교육일지, 위험성평가, 사고보고서, MSDS, 근골격계, 과태료, 산업안전보건관리비, 안전게시판, 안전점검, 장비신청, 작업계획, 차량, 폭염 체크리스트, 사용자</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;font-weight:600;color:#374151;">민감 정보</td>
        <td style="padding:8px 12px;color:#6b7280;">비밀번호·토큰 컬럼은 자동 제외됨</td>
      </tr>
      <tr style="background:#f3f4f6;">
        <td style="padding:8px 12px;font-weight:600;color:#374151;">발송 주기</td>
        <td style="padding:8px 12px;color:#6b7280;">매월 1일 09:00 KST 자동 발송</td>
      </tr>
    </table>
    <p style="margin-top:16px;font-size:12px;color:#9ca3af;">
      이 메일은 SafeBoard 시스템에서 자동 발송됩니다.<br>
      수동 다운로드: 관리자 메뉴 → 데이터 백업 → Excel 전체 내보내기
    </p>
  </div>
</div>`;

    await transporter.sendMail({
      from: `"SafeBoard 백업" <${sender}>`,
      to: toList,
      subject: `[SafeBoard] DB 월별 자동 백업 — ${y}년 ${m}월`,
      html,
      attachments: [{
        filename: `SafeBoard_DB_백업_${fileDate}.xlsx`,
        content: excelBuffer,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }],
    });

    status.lastRun     = now.toISOString();
    status.lastResult  = "sent";
    status.lastMessage = `${toList}로 발송 완료 (${y}년 ${m}월 백업)`;
    console.log("[DbBackupEmail]", status.lastMessage);

  } catch (e: any) {
    status.lastResult  = "error";
    status.lastMessage = e?.message ?? "알 수 없는 오류";
    console.error("[DbBackupEmail] 발송 실패:", e);
  }
}

// 매월 1일 09:00 KST 자동 실행
cron.schedule(
  "0 9 1 * *",
  () => {
    console.log("[DbBackupEmail] 📅 매월 1일 자동 DB 백업 메일 시작");
    runDbMonthlyBackup().catch(console.error);
  },
  { timezone: "Asia/Seoul" }
);

console.log("[DbBackupEmail] DB 월별 자동 백업 스케줄러 시작 (매월 1일 09:00 KST)");
