/**
 * AIS TBM 부적합 소명 메일 자동 접수
 * Gmail INBOX(GMAIL_SENDER/GMAIL_APP_PASSWORD)를 매일 08:30 KST에 확인하여,
 * 제목 또는 본문에 작업지시번호가 포함된 메일을 받으면
 * 첨부 사진과 본문 내용을 해당 AIS 기록의 TBM 부적합 사유/사진으로 자동 등록한다.
 *
 * 소명완료 처리는 자동으로 하지 않는다 — 담당자가 화면에서 사진/사유를 확인한 뒤
 * 직접 소명완료 처리해야 한다.
 *
 * 새 부적합 소명 건이 접수되면 ALERT_RECIPIENT으로 알림 이메일을 발송한다.
 */
import cron from "node-cron";
import path from "path";
import fs from "fs";
import { storage } from "./storage";

const GMAIL_USER = process.env.GMAIL_SENDER;
const LAST_UID_SETTING_KEY = "ais_inbox_last_uid";
const ALLOWED_IMG_EXTS = ["jpeg", "jpg", "png", "gif", "webp"];
const uploadDir = path.join(process.cwd(), "uploads");
const MAX_AUTO_PHOTOS = 3;

/** 부적합 소명 접수 알림을 항상 받을 고정 수신자 */
const ALERT_RECIPIENT = "jaeha.ryu@ktmos.co.kr";

export interface AisInboxJobStatus {
  lastRun: string | null;
  lastResult: "processed" | "no_new_mail" | "no_match" | "error" | null;
  lastMessage: string | null;
  lastMatchedCount: number | null;
  lastScannedCount: number | null;
  lastMatchedRecordIds: number[];
  running: boolean;
  enabled: boolean;
}

const status: AisInboxJobStatus = {
  lastRun: null,
  lastResult: null,
  lastMessage: null,
  lastMatchedCount: null,
  lastScannedCount: null,
  lastMatchedRecordIds: [],
  running: false,
  enabled: true,
};

export function getAisInboxJobStatus(): AisInboxJobStatus {
  return { ...status };
}

function safeExt(originalname: string, allowed: string[]): string {
  const cleaned = (originalname || "").replace(/\0/g, "");
  const ext = path.extname(cleaned).toLowerCase().replace(/[^a-z0-9]/g, "");
  return allowed.includes(ext) ? `.${ext}` : "";
}

async function uploadAttachmentBuffer(buffer: Buffer, filename: string, contentType: string): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (privateDir) {
    try {
      const { objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
      const { setObjectAclPolicy } = await import("./replit_integrations/object_storage/objectAcl");
      const fullPath = `${privateDir.replace(/\/$/, "")}/uploads/${filename}`;
      const parts = fullPath.replace(/^\//, "").split("/");
      const bucketName = parts[0];
      const objectName = parts.slice(1).join("/");
      const fileRef = objectStorageClient.bucket(bucketName).file(objectName);
      await fileRef.save(buffer, { contentType, resumable: false });
      try {
        await setObjectAclPolicy(fileRef, { owner: "system", visibility: "public" });
      } catch (_) {}
      return `/objects/uploads/${filename}`;
    } catch (e: any) {
      console.error("[AisInboxEmail] Object storage 업로드 실패, 로컬 저장으로 대체:", e?.message);
    }
  }
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, filename), buffer);
  return `/uploads/${filename}`;
}

async function sendAlertEmail(matchedCount: number, matchedRecordIds: number[]): Promise<void> {
  if (!GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return;
  try {
    const nodemailer = (await import("nodemailer")).default;
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
    const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    const subject = `[SafeBoard 알림] AIS TBM 부적합 소명 ${matchedCount}건 자동 접수`;
    const html = `
<div style="font-family:맑은고딕,Arial,sans-serif;font-size:11pt;line-height:1.7;color:#111;max-width:560px">
  <p style="margin:0 0 12px;font-size:13pt;font-weight:700;color:#1e3a8a">📬 AIS TBM 부적합 소명 자동 접수 알림</p>
  <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:14px 18px;margin-bottom:14px">
    <p style="margin:0 0 6px"><strong style="color:#dc2626">부적합 소명 ${matchedCount}건</strong>이 Gmail에서 자동 접수되었습니다.</p>
    <p style="margin:0;font-size:10pt;color:#64748b">접수 시각: ${now}</p>
  </div>
  <p style="margin:0 0 6px;font-size:10pt;color:#374151">SafeBoard → <strong>AIS 안전이행률</strong> → 부적합 목록에서 소명 처리하세요.</p>
  <p style="margin:12px 0 0;font-size:9pt;color:#94a3b8">이 메일은 SafeBoard 시스템이 자동 발송한 알림입니다.</p>
</div>`;
    await transporter.sendMail({
      from: `"SafeBoard 알림" <${GMAIL_USER}>`,
      to: ALERT_RECIPIENT,
      subject,
      html,
    });
    console.log(`[AisInboxEmail] 알림 메일 발송 완료 → ${ALERT_RECIPIENT}`);
  } catch (alertErr: any) {
    console.warn("[AisInboxEmail] 알림 메일 발송 실패:", alertErr?.message);
  }
}

export async function runAisInboxEmailJob(): Promise<void> {
  if (status.running) {
    console.log("[AisInboxEmail] 이미 실행 중 - 건너뜀");
    return;
  }
  if (!GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    status.lastResult = "error";
    status.lastMessage = "발신 계정(GMAIL_SENDER/GMAIL_APP_PASSWORD)이 설정되지 않았습니다.";
    return;
  }

  status.running = true;
  status.lastRun = new Date().toISOString();
  status.lastMatchedRecordIds = [];
  console.log("[AisInboxEmail] AIS TBM 소명 메일 자동 확인 시작...");

  try {
    const allRecords = await storage.getAllAisSafetyRecords();
    const workOrderRecords = allRecords.filter(r => (r.workOrderNo || "").trim().length >= 4);
    if (workOrderRecords.length === 0) {
      status.lastResult = "no_match";
      status.lastMessage = "매칭 대상 AIS 작업지시번호 데이터가 없습니다.";
      return;
    }
    // 긴 작업지시번호부터 매칭해서 부분 포함 오탐 방지
    const uniqueWorkOrders = Array.from(new Set(workOrderRecords.map(r => (r.workOrderNo || "").trim())))
      .sort((a, b) => b.length - a.length);

    const { ImapFlow } = await import("imapflow");
    const { simpleParser } = await import("mailparser");
    const client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user: GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    const lastUidRaw = await storage.getSetting(LAST_UID_SETTING_KEY);
    const lastUid = lastUidRaw?.value ? Number(lastUidRaw.value) : 0;

    let maxUid = lastUid;
    let scannedCount = 0;
    let matchedCount = 0;

    try {
      const total = (client.mailbox as any).exists as number;
      if (total > 0) {
        // UID 검색: lastUid보다 큰 메일만 조회
        const range = lastUid > 0 ? `${lastUid + 1}:*` : `${Math.max(1, total - 49)}:*`;
        for await (const msg of client.fetch(range, { envelope: true, uid: true, source: true }, { uid: true })) {
          if (msg.uid <= lastUid) continue;
          scannedCount++;
          if (msg.uid > maxUid) maxUid = msg.uid;

          const subject = msg.envelope?.subject || "";
          const rawSource = msg.source as Buffer;
          if (!rawSource) continue;

          let parsed;
          try {
            parsed = await simpleParser(rawSource);
          } catch (e) {
            console.warn("[AisInboxEmail] 메일 파싱 실패:", (e as any)?.message);
            continue;
          }

          // "Web발신" SMS 알림 메일 등 일부 메일은 text/plain 파트가 없고 HTML만 있는 경우가 있어,
          // parsed.text가 비어있으면 HTML/텍스트-HTML 변환본에서 태그를 제거해 본문 텍스트를 추출한다.
          const stripHtml = (html: string) =>
            html
              .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
              .replace(/<br\s*\/?>/gi, "\n")
              .replace(/<\/(p|div|tr|li)>/gi, "\n")
              .replace(/<[^>]+>/g, " ")
              .replace(/&nbsp;/gi, " ")
              .replace(/&amp;/gi, "&")
              .replace(/&lt;/gi, "<")
              .replace(/&gt;/gi, ">")
              .replace(/[ \t]+/g, " ")
              .trim();
          let bodyText = parsed.text || "";
          if (!bodyText.trim()) {
            if (parsed.html) bodyText = stripHtml(parsed.html as string);
            else if (parsed.textAsHtml) bodyText = stripHtml(parsed.textAsHtml as string);
          }
          const haystack = `${subject}\n${bodyText}`;
          const matchedWorkOrder = uniqueWorkOrders.find(wo => haystack.includes(wo));
          if (!matchedWorkOrder) continue;

          const targetRecords = workOrderRecords.filter(r => (r.workOrderNo || "").trim() === matchedWorkOrder);
          if (targetRecords.length === 0) continue;

          const imageAttachments = (parsed.attachments || []).filter(a =>
            (a.contentType || "").startsWith("image/") && a.content && a.content.length > 0
          ).slice(0, MAX_AUTO_PHOTOS);

          const photoUrls: string[] = [];
          const photoFileNames: string[] = [];
          for (const att of imageAttachments) {
            const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
            const ext = safeExt(att.filename || "photo.jpg", ALLOWED_IMG_EXTS) || ".jpg";
            const filename = `email-${uniqueSuffix}${ext}`;
            try {
              const url = await uploadAttachmentBuffer(att.content as Buffer, filename, att.contentType || "image/jpeg");
              photoUrls.push(url);
              photoFileNames.push(att.filename || filename);
            } catch (e: any) {
              console.error("[AisInboxEmail] 사진 업로드 실패:", e?.message);
            }
          }

          if (photoUrls.length === 0) {
            console.log(`[AisInboxEmail] 작업번호(${matchedWorkOrder}) 일치하나 첨부 사진이 없어 건너뜀`);
            continue;
          }

          const fromAddr = parsed.from?.value?.[0]?.address || "메일자동접수";

          for (const rec of targetRecords) {
            try {
              // 사진만 자동 등록한다(최대 3장) — 사유(reason)는 담당자가 화면에서 직접 확인/작성하도록 건드리지 않음
              const existing = await storage.getAisTbmBadNote(rec.id);
              const baseUrls = existing?.photoUrls && existing.photoUrls.length > 0 ? existing.photoUrls : (existing?.photoUrl ? [existing.photoUrl] : []);
              const baseNames = existing?.photoFileNames && existing.photoFileNames.length > 0 ? existing.photoFileNames : (existing?.photoFileName ? [existing.photoFileName] : []);
              const mergedUrls = [...baseUrls, ...photoUrls].slice(0, MAX_AUTO_PHOTOS);
              const mergedNames = [...baseNames, ...photoFileNames].slice(0, MAX_AUTO_PHOTOS);
              await storage.upsertAisTbmBadNote(rec.id, {
                noteType: "bad",
                photoUrls: mergedUrls,
                photoFileNames: mergedNames,
                createdBy: `email:${fromAddr}`,
                pendingReview: true,
              });
            } catch (e: any) {
              console.error(`[AisInboxEmail] 기록(${rec.id}) 저장 실패:`, e?.message);
            }
          }
          matchedCount++;
          status.lastMatchedRecordIds.push(...targetRecords.map(r => r.id));
          console.log(`[AisInboxEmail] 매칭 완료: 작업번호=${matchedWorkOrder} (${targetRecords.length}건, 사진 ${photoUrls.length}장 반영)`);
        }
      }
    } finally {
      lock.release();
      await client.logout();
    }

    if (maxUid > lastUid) {
      await storage.setSetting(LAST_UID_SETTING_KEY, String(maxUid));
    }

    if (scannedCount === 0) {
      status.lastResult = "no_new_mail";
      status.lastMessage = "새로운 메일이 없습니다.";
    } else if (matchedCount === 0) {
      status.lastResult = "no_match";
      status.lastMessage = `새 메일 ${scannedCount}건 확인, 작업지시번호와 일치하는 메일 없음`;
    } else {
      status.lastResult = "processed";
      status.lastMessage = `새 메일 ${scannedCount}건 중 ${matchedCount}건 자동 접수 완료`;
    }
    status.lastScannedCount = scannedCount;
    status.lastMatchedCount = matchedCount;
    console.log(`[AisInboxEmail] ${status.lastMessage}`);

    // 새 소명 건 접수 시 알림 이메일 발송
    if (matchedCount > 0) {
      await sendAlertEmail(matchedCount, status.lastMatchedRecordIds);
    }
  } catch (e: any) {
    status.lastResult = "error";
    status.lastMessage = `오류: ${e.message}`;
    console.error("[AisInboxEmail] 자동 접수 오류:", e.message);
  } finally {
    status.running = false;
  }
}

// 매일 08:30 KST 자동 실행
cron.schedule(
  "30 8 * * *",
  () => {
    runAisInboxEmailJob().catch(console.error);
  },
  { timezone: "Asia/Seoul" }
);

console.log("[AisInboxEmail] AIS TBM 소명 메일 자동 접수 스케줄러 시작 (매일 08:30 KST)");
