import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Plus, Trash2, ChevronRight, CheckCircle2, Circle, AlertTriangle, Upload,
  FileText, ImageIcon, Users, ClipboardList, Eye, X, Siren, Building2, Shuffle,
  Search, MapPin,
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

// HTML 여부 감지 + 텍스트 미리보기 추출
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function isHtml(s: string): boolean {
  return s.trimStart().startsWith("<");
}

// 시나리오 전체 렌더링 (HTML → dangerouslySetInnerHTML, 텍스트 → 단락 분리)
function ScenarioFull({ text, className = "" }: { text: string; className?: string }) {
  if (isHtml(text)) {
    return (
      <div
        className={`prose prose-sm max-w-none dark:prose-invert leading-relaxed ${className}`}
        dangerouslySetInnerHTML={{ __html: text }}
      />
    );
  }
  // plain text: 빈줄(\n\n) 기준 단락 분리 → 없으면 단일 \n으로 분리
  const byDouble = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  if (byDouble.length > 1) {
    return (
      <div className={`space-y-2 text-sm leading-relaxed ${className}`}>
        {byDouble.map((p, i) => <p key={i} className="whitespace-pre-wrap">{p}</p>)}
      </div>
    );
  }
  const bySingle = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  if (bySingle.length > 3) {
    return (
      <div className={`space-y-1 text-sm leading-relaxed ${className}`}>
        {bySingle.map((l, i) => <p key={i}>{l}</p>)}
      </div>
    );
  }
  return <p className={`text-sm whitespace-pre-wrap leading-relaxed ${className}`}>{text}</p>;
}

// 시나리오 접기/펼치기 래퍼 (상세 다이얼로그용) - PDF/JPG 업로드 파일 우선 표시
function ScenarioCollapsible({ assignment, isAdmin, onFileUploaded }: {
  assignment: DrillAssignment; isAdmin: boolean; onFileUploaded?: (url: string, name: string) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const text = assignment.scenario;
  const plain = isHtml(text) ? stripHtml(text) : text.replace(/\n+/g, " ");
  const hasFile = !!assignment.scenarioFileUrl;

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/drill-assignments/${assignment.id}/scenario-file`, {
        method: "PUT", body: fd, credentials: "include",
      });
      if (!res.ok) throw new Error("업로드 실패");
      const updated = await res.json();
      onFileUploaded?.(updated.scenarioFileUrl, updated.scenarioFileName);
      toast({ title: "시나리오 파일 업로드 완료" });
      setOpen(true);
    } catch { toast({ title: "업로드 오류", variant: "destructive" }); }
    finally { setUploading(false); }
  }

  return (
    <div className="bg-muted/40 rounded-lg border text-sm">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/60 transition-colors rounded-lg"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-xs text-muted-foreground flex-1 mr-2 line-clamp-1">
          {hasFile
            ? <span className="flex items-center gap-1"><FileText className="w-3 h-3 inline" />{assignment.scenarioFileName}</span>
            : <>{plain.slice(0, 100)}{plain.length > 100 ? "…" : ""}</>}
        </span>
        <span className="text-xs text-primary whitespace-nowrap">{open ? "접기 ▲" : "시나리오 전체 보기 ▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 border-t mt-0">
          {hasFile ? (
            <div className="mt-2">
              {assignment.scenarioFileName?.toLowerCase().endsWith('.pdf') ? (
                <iframe src={assignment.scenarioFileUrl!} className="w-full h-96 rounded border" title="시나리오" />
              ) : (
                <img src={assignment.scenarioFileUrl!} alt="시나리오" className="max-w-full rounded border mx-auto" />
              )}
              <a href={assignment.scenarioFileUrl!} target="_blank" rel="noreferrer"
                className="text-xs text-primary underline mt-1 block text-center">새 탭에서 열기</a>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              <ScenarioFull text={text} className="mt-2" />
            </div>
          )}
          {isAdmin && (
            <div className="mt-2 pt-2 border-t flex items-center gap-2">
              <label className="cursor-pointer">
                <span className="text-xs text-primary border border-primary/30 rounded px-2 py-1 hover:bg-primary/5">
                  {uploading ? "업로드 중..." : hasFile ? "📎 파일 교체 (PDF/JPG)" : "📎 PDF/JPG 파일 업로드"}
                </span>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                  onChange={uploadFile} disabled={uploading} />
              </label>
              <span className="text-xs text-muted-foreground">Word 파일을 PDF나 이미지로 변환 후 업로드하세요</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 시나리오 짧은 미리보기 - 첫 줄(제목 부분)만 표시
function ScenarioPreview({ text }: { text: string }) {
  const plain = isHtml(text) ? stripHtml(text) : text;
  // 첫 줄만 추출 (빈 줄 제거 후 첫 번째 줄)
  const firstLine = plain.split(/\n/).map(l => l.trim()).find(l => l.length > 0) || plain.slice(0, 60);
  return <span className="text-xs text-muted-foreground truncate">{firstLine}</span>;
}

type DrillSession = {
  id: number;
  title: string;
  year: number;
  period: string;
  drillDate: string | null;
  description: string | null;
  status: string;
  createdBy: string | null;
  createdAt: string;
};

type DrillAssignment = {
  id: number;
  sessionId: number;
  department: string;
  scenario: string;
  accidentType: string | null;
  step1Status: string;
  step1Data: any;
  step1SubmittedAt: string | null;
  step1SubmittedBy: string | null;
  step2Status: string;
  step2Data: any;
  step2SubmittedAt: string | null;
  step2SubmittedBy: string | null;
  step3Status: string;
  step3Data: any;
  step3SubmittedAt: string | null;
  step3SubmittedBy: string | null;
  preEduData: any; // { attendees: [{no,name}], photos: [url,...] }
  scenarioFileUrl: string | null;
  scenarioFileName: string | null;
};

const DEPT_LIST = [
  "스탭", "남대구운용팀", "포항운용팀",
  "동대구운용팀", "안동운용팀", "문경운용팀", "구미운용팀", "서대구운용팀",
];

const ACCIDENT_TYPES = [
  "빙판길 낙상사고", "추락사고", "발목 접지름 사고", "중량물 낙하사고",
  "전기 화상사고", "차량사고", "기타",
];

const CURRENT_YEAR = new Date().getFullYear();

// 영어 키 → 한글 레이블 변환
const FIELD_LABELS: Record<string, string> = {
  victimName: "사고직원 성명", victimPosition: "직위", victimDept: "소속부서",
  occurredAt: "발생일시", location: "사고장소", injuryDetail: "재해정도",
  content: "사고내용", cause: "사고원인", note: "참고사항",
  companion: "동행자", vehicleInfo: "차량정보",
  timeline: "경과 및 조치사항", overview: "사고 개요", prevention: "사고 방지 대책",
  drillDate: "훈련일시", participantCount: "참석인원",
  situation: "상황설정", situationOccur: "상황발생", response: "상황대응",
  totalComment: "훈련결과 총평", opinion: "참석자 의견 및 개선사항",
  eduAttendees: "사전 교육 참석자 명단", drillAttendees: "훈련 참석자 명단",
};

// 시나리오 plain text / HTML에서 상황설정/발생/대응 섹션 파싱
function parseScenarioSections(scenario: string) {
  // HTML인 경우: 헤딩 태그 기준으로 섹션 분리
  if (isHtml(scenario)) {
    const section = (html: string, keyword: string): string | null => {
      const re = new RegExp(`<h[1-6][^>]*>[^<]*${keyword}[^<]*<\\/h[1-6]>([\\s\\S]*?)(?=<h[1-6]|$)`, 'i');
      const m = html.match(re);
      return m ? stripHtml(m[1]).trim() : null;
    };
    const situ = section(scenario, '상황.?설정');
    const occur = section(scenario, '상황.?발생');
    const resp = section(scenario, '상황.?대응');
    if (situ !== null || occur !== null || resp !== null) {
      return { situation: situ ?? "", situationOccur: occur ?? "", response: resp ?? "" };
    }
    // 헤딩 없이 plain text로 한번 더 시도
    const plain2 = stripHtml(scenario);
    const sm = plain2.match(/상황\s*설정[:\s]*([\s\S]+?)(?=상황\s*발생|상황\s*대응|$)/);
    const om = plain2.match(/상황\s*발생[:\s]*([\s\S]+?)(?=상황\s*대응|$)/);
    const rm = plain2.match(/상황\s*대응[:\s]*([\s\S]+?)(?=$)/);
    if (sm || om || rm) {
      return { situation: sm?.[1]?.trim() ?? "", situationOccur: om?.[1]?.trim() ?? "", response: rm?.[1]?.trim() ?? "" };
    }
    return { situation: stripHtml(scenario).slice(0, 400), situationOccur: "", response: "" };
  }
  // plain text
  const plain = scenario;
  const sMatch = plain.match(/상황\s*설정[:\s]*([\s\S]+?)(?=상황\s*발생|상황\s*대응|$)/);
  const oMatch = plain.match(/상황\s*발생[:\s]*([\s\S]+?)(?=상황\s*대응|$)/);
  const rMatch = plain.match(/상황\s*대응[:\s]*([\s\S]+?)(?=$)/);
  if (sMatch || oMatch || rMatch) {
    return { situation: sMatch?.[1]?.trim() ?? "", situationOccur: oMatch?.[1]?.trim() ?? "", response: rMatch?.[1]?.trim() ?? "" };
  }
  return { situation: plain.slice(0, 400), situationOccur: "", response: "" };
}

// 다음 우편번호 API로 주소 검색
function openAddressSearch(cb: (addr: string) => void) {
  function open() {
    new (window as any).daum.Postcode({ oncomplete: (d: any) => cb(d.roadAddress || d.jibunAddress) }).open();
  }
  if ((window as any).daum?.Postcode) { open(); return; }
  const s = document.createElement("script");
  s.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
  s.onload = open;
  document.head.appendChild(s);
}

// 사진 미리보기 컴포넌트
function PhotoPreviews({ files }: { files: File[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const u = files.map(f => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach(URL.revokeObjectURL);
  }, [files]);
  if (!urls.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {urls.map((url, i) => (
        <img key={i} src={url} alt={`사진${i + 1}`} className="h-20 w-20 object-cover rounded border shadow-sm" />
      ))}
    </div>
  );
}

function stepBadge(status: string) {
  if (status === "제출완료") return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">제출완료</Badge>;
  return <Badge variant="outline" className="text-gray-500 text-xs">미제출</Badge>;
}

function progressCount(a: DrillAssignment) {
  let done = 0;
  if (a.step1Status === "제출완료") done++;
  if (a.step2Status === "제출완료") done++;
  if (a.step3Status === "제출완료") done++;
  return done;
}

// ─── Step 1 Form: SNS 보고 ───────────────────────────────────────────────────
function Step1Form({ assignment, onClose }: { assignment: DrillAssignment; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const scenarioPlain = isHtml(assignment.scenario) ? stripHtml(assignment.scenario) : assignment.scenario;
  const [form, setForm] = useState({
    victimName: "", victimPosition: "",
    victimDept: assignment.department,
    occurredAt: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    location: "", injuryDetail: "",
    content: scenarioPlain.slice(0, 200),
    cause: "", note: "",
  });
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const set = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }));

  async function submit() {
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("data", JSON.stringify(form));
      photos.forEach(f => fd.append("photos", f));
      await fetch(`/api/drill-assignments/${assignment.id}/step/1`, {
        method: "POST", body: fd, credentials: "include",
      });
      await qc.invalidateQueries({ queryKey: ["/api/drill-sessions", assignment.sessionId, "assignments"] });
      toast({ title: "1단계 SNS보고 제출 완료" });
      onClose();
    } catch { toast({ title: "오류", variant: "destructive" }); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
        <strong>보고제목 예시:</strong> [대응훈련] {assignment.department} 안전사고 1단계 보고
      </div>
      <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-2.5 text-xs text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
        ✅ 소속부서와 사고내용이 배정된 시나리오로 자동 입력되었습니다. 내용을 확인·보완하세요.
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label>사고직원 성명</Label><Input value={form.victimName} onChange={set("victimName")} placeholder="홍길동" /></div>
        <div><Label>직위</Label><Input value={form.victimPosition} onChange={set("victimPosition")} placeholder="대리" /></div>
        <div>
          <Label>소속부서</Label>
          <Select value={form.victimDept} onValueChange={v => setForm(p => ({ ...p, victimDept: v }))}>
            <SelectTrigger><SelectValue placeholder="부서 선택" /></SelectTrigger>
            <SelectContent>{DEPT_LIST.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>발생일시</Label><Input type="datetime-local" value={form.occurredAt} onChange={set("occurredAt")} /></div>
        <div>
          <Label>사고장소</Label>
          <div className="flex gap-1 mt-1">
            <Input value={form.location} onChange={set("location")} placeholder="OO시 OO동 OO번지 OO기지국" className="flex-1" />
            <Button type="button" variant="outline" size="icon" className="shrink-0"
              onClick={() => openAddressSearch(addr => setForm(p => ({ ...p, location: addr })))}>
              <MapPin className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
      <div><Label>재해정도</Label><Input value={form.injuryDetail} onChange={set("injuryDetail")} placeholder="오른쪽 발목 찰과상, 이동 제한없음" /></div>
      <div><Label>사고내용</Label><Textarea value={form.content} onChange={set("content")} rows={3} placeholder="사고 발생 경위를 상세히 기술..." /></div>
      <div><Label>사고원인</Label><Textarea value={form.cause} onChange={set("cause")} rows={2} placeholder="사고 발생 원인..." /></div>
      <div><Label>참고사항</Label><Textarea value={form.note} onChange={set("note")} rows={2} placeholder="동행자, 병원 이동 계획 등..." /></div>
      <div>
        <Label>첨부사진 (연출사진·현장사진·위험요소 사진)</Label>
        <Input type="file" accept="image/*" multiple className="mt-1"
          onChange={e => setPhotos(Array.from(e.target.files || []))} />
        <PhotoPreviews files={photos} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>취소</Button>
        <Button onClick={submit} disabled={submitting}>{submitting ? "제출 중..." : "1단계 제출"}</Button>
      </DialogFooter>
    </div>
  );
}

// ─── Step 2 Form: 사고경위서 ────────────────────────────────────────────────
function Step2Form({ assignment, onClose }: { assignment: DrillAssignment; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const s1 = assignment.step1Data as any;
  const [form, setForm] = useState({
    occurredAt:     s1?.occurredAt     ?? "",
    victimName:     s1?.victimName     ?? "",
    victimPosition: s1?.victimPosition ?? "",
    victimDept:     s1?.victimDept     ?? "",
    companion: "", vehicleInfo: "",
    timeline: s1?.location ? [{ time: s1?.occurredAt ?? "", content: `장소: ${s1.location}` }] : [{ time: "", content: "" }],
    overview:  s1?.content  ?? "",
    cause:     s1?.cause    ?? "",
    prevention: "",
  });
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const set = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }));

  function updateTimeline(i: number, k: string, v: string) {
    setForm(p => {
      const tl = [...p.timeline];
      tl[i] = { ...tl[i], [k]: v };
      return { ...p, timeline: tl };
    });
  }
  function addTimeline() { setForm(p => ({ ...p, timeline: [...p.timeline, { time: "", content: "" }] })); }
  function removeTimeline(i: number) { setForm(p => ({ ...p, timeline: p.timeline.filter((_, idx) => idx !== i) })); }

  async function submit() {
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("data", JSON.stringify(form));
      photos.forEach(f => fd.append("photos", f));
      await fetch(`/api/drill-assignments/${assignment.id}/step/2`, {
        method: "POST", body: fd, credentials: "include",
      });
      qc.invalidateQueries({ queryKey: ["/api/drill-sessions", assignment.sessionId, "assignments"] });
      toast({ title: "2단계 사고경위서 제출 완료" });
      onClose();
    } catch { toast({ title: "오류", variant: "destructive" }); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 text-sm text-amber-700 dark:text-amber-300 border border-amber-200">
        <strong>제출시한:</strong> 사고 발생 후 3시간 이내 현장경영팀 이메일 보고
      </div>
      {s1 && (
        <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-2.5 text-xs text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 flex items-center gap-2">
          <span>✅</span>
          <span>1단계 SNS보고 내용이 자동으로 채워졌습니다. 내용을 확인하고 보완해 주세요.</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div><Label>발생일시</Label><Input type="datetime-local" value={form.occurredAt} onChange={set("occurredAt")} /></div>
        <div><Label>차종/차량번호</Label><Input value={form.vehicleInfo} onChange={set("vehicleInfo")} placeholder="스포티지/123가4567" /></div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div><Label>사고자 성명</Label><Input value={form.victimName} onChange={set("victimName")} /></div>
        <div><Label>직위</Label><Input value={form.victimPosition} onChange={set("victimPosition")} /></div>
        <div><Label>소속부서</Label><Input value={form.victimDept} onChange={set("victimDept")} /></div>
        <div><Label>동행자</Label><Input value={form.companion} onChange={set("companion")} /></div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>경과 및 조치 사항 (시간대별)</Label>
          <Button variant="outline" size="sm" onClick={addTimeline}><Plus className="w-3 h-3 mr-1" />추가</Button>
        </div>
        <div className="space-y-2">
          {form.timeline.map((row, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input className="w-28 text-sm" placeholder="HH:MM" value={row.time} onChange={e => updateTimeline(i, "time", e.target.value)} />
              <Input className="flex-1 text-sm" placeholder="내용" value={row.content} onChange={e => updateTimeline(i, "content", e.target.value)} />
              {form.timeline.length > 1 && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeTimeline(i)}><X className="w-3 h-3" /></Button>}
            </div>
          ))}
        </div>
      </div>
      <div><Label>사고 개요</Label><Textarea value={form.overview} onChange={set("overview")} rows={3} placeholder="사고 개요를 상세히 기술..." /></div>
      <div><Label>사고 원인</Label><Textarea value={form.cause} onChange={set("cause")} rows={2} placeholder="사고 발생 원인..." /></div>
      <div><Label>사고 방지 대책</Label><Textarea value={form.prevention} onChange={set("prevention")} rows={2} placeholder="재발 방지 대책..." /></div>
      <div>
        <Label>첨부사진</Label>
        {/* 1단계에서 올린 사진 자동 연동 */}
        {s1?.photos?.length > 0 && (
          <div className="mb-2">
            <p className="text-xs text-muted-foreground mb-1">1단계(SNS보고)에서 첨부된 사진</p>
            <div className="flex flex-wrap gap-2">
              {(s1.photos as string[]).map((url: string, i: number) => (
                <a key={i} href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt={`1단계사진${i+1}`} className="h-16 w-16 object-cover rounded border shadow-sm" />
                </a>
              ))}
            </div>
          </div>
        )}
        <Input type="file" accept="image/*" multiple onChange={e => setPhotos(Array.from(e.target.files || []))} className="mt-1" />
        <PhotoPreviews files={photos} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>취소</Button>
        <Button onClick={submit} disabled={submitting}>{submitting ? "제출 중..." : "2단계 제출"}</Button>
      </DialogFooter>
    </div>
  );
}

// ─── Step 3 Form: 최종 결과보고 ─────────────────────────────────────────────
function Step3Form({
  assignment, onClose, session,
}: {
  assignment: DrillAssignment;
  onClose: () => void;
  session?: DrillSession;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const s1 = assignment.step1Data as any;
  const s2 = assignment.step2Data as any;
  const scenarioSections = parseScenarioSections(assignment.scenario);
  const savedEdu = (assignment.preEduData as any) || {};

  // 훈련일시 우선순위: 세션 drillDate > 1단계 사고일시 > 빈값
  const defaultDrillDate =
    session?.drillDate?.slice(0, 10) ??
    s1?.occurredAt?.slice(0, 10) ??
    "";

  const [form, setForm] = useState({
    drillDate: defaultDrillDate,
    participantCount: "",
    situation: scenarioSections.situation,
    situationOccur: scenarioSections.situationOccur || (s2?.overview ?? s1?.content ?? ""),
    response: scenarioSections.response || (s2?.prevention ?? s1?.cause ?? ""),
    totalComment: "", opinion: "",
    drillAttendees: [{ no: "1", name: s1?.victimName ?? "" }],
  });
  const [drillPhotos, setDrillPhotos] = useState<Record<string, File[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const set = (k: string) => (e: any) => setForm(p => ({ ...p, [k]: e.target.value }));

  function updateAttendee(i: number, k: string, v: string) {
    setForm(p => {
      const arr = [...p.drillAttendees];
      arr[i] = { ...arr[i], [k]: v };
      return { ...p, drillAttendees: arr };
    });
  }
  function addAttendee() {
    setForm(p => ({ ...p, drillAttendees: [...p.drillAttendees, { no: String(p.drillAttendees.length + 1), name: "" }] }));
  }
  function removeAttendee(i: number) {
    setForm(p => ({ ...p, drillAttendees: p.drillAttendees.filter((_: any, idx: number) => idx !== i) }));
  }

  async function submit() {
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("data", JSON.stringify(form));
      // 4가지 슬롯별 사진 업로드 (fieldName: slotKey_photos)
      Object.entries(drillPhotos).forEach(([key, files]) => {
        files.forEach(f => fd.append(`${key}_photos`, f));
      });
      await fetch(`/api/drill-assignments/${assignment.id}/step/3`, {
        method: "POST", body: fd, credentials: "include",
      });
      await qc.invalidateQueries({ queryKey: ["/api/drill-sessions", assignment.sessionId, "assignments"] });
      toast({ title: "최종 결과보고 제출 완료" });
      onClose();
    } catch { toast({ title: "오류", variant: "destructive" }); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-5">
      {s1 && (
        <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-2.5 text-xs text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
          ✅ 1단계 보고 내용과 시나리오 내용이 자동으로 채워졌습니다. 확인 후 보완해주세요.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div><Label>훈련일시</Label><Input type="date" value={form.drillDate} onChange={set("drillDate")} /></div>
        <div>
          <Label>참석인원</Label>
          <Input value={form.participantCount}
            onChange={e => {
              const val = e.target.value;
              setForm(p => ({ ...p, participantCount: val }));
              // 숫자 파싱 → 훈련 참석자 명단 자동 생성
              const n = parseInt(val.replace(/[^0-9]/g, ""), 10);
              if (n > 0 && n <= 100) {
                setForm(p => ({
                  ...p,
                  participantCount: val,
                  drillAttendees: Array.from({ length: n }, (_, i) => ({ no: String(i + 1), name: "" })),
                }));
              }
            }}
            placeholder="예: 12명 (입력 시 명단 자동 생성)" />
        </div>
      </div>
      <div><Label>상황설정</Label><Textarea value={form.situation} onChange={set("situation")} rows={3} placeholder="훈련 상황 설정 내용..." /></div>
      <div><Label>상황발생</Label><Textarea value={form.situationOccur} onChange={set("situationOccur")} rows={2} placeholder="사고 발생 내용..." /></div>
      <div><Label>상황대응</Label><Textarea value={form.response} onChange={set("response")} rows={3} placeholder="대응 절차 내용..." /></div>
      <div><Label>훈련결과 총평</Label><Textarea value={form.totalComment} onChange={set("totalComment")} rows={2} /></div>
      <div><Label>참석자 의견 및 개선/보완사항</Label><Textarea value={form.opinion} onChange={set("opinion")} rows={2} /></div>

      {/* 훈련 참석자 명단 */}
      <div className="border rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <Label className="flex items-center gap-1"><Users className="w-4 h-4" />훈련 참석자 명단</Label>
          <Button variant="outline" size="sm" onClick={() => addAttendee()}><Plus className="w-3 h-3 mr-1" />추가</Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {form.drillAttendees.map((row, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input className="w-12 text-sm" placeholder="번호" value={row.no} onChange={e => updateAttendee(i, "no", e.target.value)} />
              <Input className="flex-1 text-sm" placeholder="이름" value={row.name} onChange={e => updateAttendee(i, "name", e.target.value)} />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeAttendee(i)}><X className="w-3 h-3" /></Button>
            </div>
          ))}
        </div>
      </div>

      {/* 훈련 사진 – 4가지 상황별 */}
      {(() => {
        const PHOTO_SLOTS = [
          { key: "accident", label: "① 사고발생", desc: "사고 직후 현장 사진" },
          { key: "rescue",   label: "② 구호조치", desc: "응급처치 또는 구호 장면" },
          { key: "report",   label: "③ 부서장 보고", desc: "부서장에게 보고하는 장면" },
          { key: "hospital", label: "④ 병원방문", desc: "병원 이송 또는 방문 사진" },
        ] as const;
        return (
          <div className="border rounded-lg p-3 space-y-3">
            <Label className="flex items-center gap-1 text-sm font-semibold">
              📷 훈련 사진 <span className="text-xs font-normal text-muted-foreground">(4가지 상황별로 각각 업로드)</span>
            </Label>
            <div className="grid grid-cols-2 gap-3">
              {PHOTO_SLOTS.map(slot => {
                const files = drillPhotos[slot.key] || [];
                return (
                  <div key={slot.key} className="border rounded p-2 bg-muted/30">
                    <p className="text-xs font-semibold mb-0.5">{slot.label}</p>
                    <p className="text-xs text-muted-foreground mb-1.5">{slot.desc}</p>
                    <Input type="file" accept="image/*" multiple className="h-8 text-xs"
                      onChange={e => setDrillPhotos(p => ({ ...p, [slot.key]: Array.from(e.target.files || []) }))} />
                    {files.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {files.map((f, i) => (
                          <img key={i} src={URL.createObjectURL(f)} alt={`${slot.label}-${i+1}`}
                            className="h-14 w-14 object-cover rounded border" />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>취소</Button>
        <Button onClick={submit} disabled={submitting}>{submitting ? "제출 중..." : "최종 결과보고 제출"}</Button>
      </DialogFooter>
    </div>
  );
}

// ─── 사전교육 다이얼로그 (참석자 명단 + 사진 DB 저장) ─────────────────────
function PreEduDialog({ assignment, open, onClose, onSaved }: {
  assignment: DrillAssignment; open: boolean; onClose: () => void;
  onSaved?: (data: any) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const saved = (assignment.preEduData as any) || {};
  const [attendees, setAttendees] = useState<{ no: string; name: string }[]>(
    saved.attendees?.length ? saved.attendees : [{ no: "1", name: "" }]
  );
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const existingPhotos: string[] = saved.photos || [];

  async function save() {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("data", JSON.stringify({ attendees }));
      photos.forEach(f => fd.append("photos", f));
      const res = await fetch(`/api/drill-assignments/${assignment.id}/pre-edu`, {
        method: "PUT", body: fd, credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "저장 실패" }));
        throw new Error(err.message || "저장 실패");
      }
      const updated = await res.json();
      // 로컬 상태 즉시 반영
      onSaved?.(updated.preEduData ?? { attendees, photos: existingPhotos });
      await qc.invalidateQueries({ queryKey: ["/api/drill-sessions", assignment.sessionId, "assignments"] });
      toast({ title: "사전교육 내용 저장 완료" });
      setPhotos([]);
      onClose();
    } catch (e: any) {
      toast({ title: "저장 오류", description: e?.message || "다시 시도해주세요.", variant: "destructive" });
    }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-600" />사전교육 참석자 명단 및 사진
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>참석자 명단(부서 전체)</Label>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm"
                  onClick={() => setAttendees(p => {
                    const start = p.length;
                    const batch = Array.from({ length: 20 }, (_, i) => ({ no: String(start + i + 1), name: "" }));
                    return [...p, ...batch];
                  })}>
                  <Plus className="w-3 h-3 mr-1" />20명 추가
                </Button>
                <Button variant="outline" size="sm"
                  onClick={() => setAttendees(p => [...p, { no: String(p.length + 1), name: "" }])}>
                  <Plus className="w-3 h-3 mr-1" />1명 추가
                </Button>
                <Button variant="outline" size="sm" className="text-red-500 border-red-200 hover:bg-red-50"
                  onClick={() => setAttendees([{ no: "1", name: "" }])}>
                  <Trash2 className="w-3 h-3 mr-1" />전체 삭제
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-1">
              {attendees.map((row, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <Input className="w-10 text-xs h-8" placeholder="번호" value={row.no}
                    onChange={e => setAttendees(p => { const a = [...p]; a[i] = { ...a[i], no: e.target.value }; return a; })} />
                  <Input className="flex-1 text-xs h-8" placeholder="이름" value={row.name}
                    onChange={e => setAttendees(p => { const a = [...p]; a[i] = { ...a[i], name: e.target.value }; return a; })} />
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => setAttendees(p => p.filter((_, j) => j !== i))}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>교육 사진</Label>
            {existingPhotos.length > 0 && (
              <div className="flex flex-wrap gap-2 my-2">
                {existingPhotos.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt={`교육사진${i + 1}`} className="h-16 w-16 object-cover rounded border" />
                  </a>
                ))}
              </div>
            )}
            <Input type="file" accept="image/*" multiple className="mt-1"
              onChange={e => setPhotos(Array.from(e.target.files || []))} />
            <PhotoPreviews files={photos} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={save} disabled={saving}>{saving ? "저장 중..." : "저장"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 상세보기 ─────────────────────────────────────────────────────────────
function AssignmentDetail({ assignment, sessionId, isAdmin, session, onClose }: {
  assignment: DrillAssignment; sessionId: number; isAdmin: boolean;
  session?: DrillSession; onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | null>(null);
  const [viewStep, setViewStep] = useState<1 | 2 | 3 | null>(null);
  const [preEduOpen, setPreEduOpen] = useState(false);
  // 저장 즉시 반영을 위한 로컬 상태 (query refetch 기다리지 않음)
  const [preEduData, setPreEduData] = useState<any>(assignment.preEduData);
  const [localAssignment, setLocalAssignment] = useState<DrillAssignment>(assignment);

  const resetStep = useMutation({
    mutationFn: (step: number) => apiRequest("DELETE", `/api/drill-assignments/${assignment.id}/step/${step}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/drill-sessions", sessionId, "assignments"] });
      toast({ title: "단계 초기화 완료" });
    },
  });

  const done1 = assignment.step1Status === "제출완료";
  const done2 = assignment.step2Status === "제출완료";
  const done3 = assignment.step3Status === "제출완료";

  // 영어 키 → 한글, timeline 배열 → 읽기 좋은 표시
  function renderStepData(step: 1 | 2 | 3) {
    const data = step === 1 ? assignment.step1Data : step === 2 ? assignment.step2Data : assignment.step3Data;
    if (!data) return <p className="text-muted-foreground text-sm">데이터 없음</p>;
    const photos: string[] = data.photos || [];
    const TIMELINE_ITEM_LABELS: Record<string, string> = { time: "시간", content: "내용", no: "번호", name: "이름" };
    return (
      <div className="space-y-3 text-sm">
        {Object.entries(data).filter(([k]) => k !== "photos").map(([k, v]) => {
          const label = FIELD_LABELS[k] || k;
          if (Array.isArray(v)) {
            return (
              <div key={k}>
                <p className="font-medium text-xs text-muted-foreground mb-1">{label}</p>
                {(v as any[]).map((item, i) => (
                  <div key={i} className="text-xs bg-muted/40 rounded px-2 py-1 mt-1">
                    {typeof item === "object"
                      ? Object.entries(item).map(([ik, iv]) => `${TIMELINE_ITEM_LABELS[ik] ?? ik}: ${iv}`).join("  |  ")
                      : String(item)}
                  </div>
                ))}
              </div>
            );
          }
          return (
            <div key={k}>
              <p className="font-medium text-xs text-muted-foreground">{label}</p>
              <p className="mt-0.5 whitespace-pre-wrap">{String(v)}</p>
            </div>
          );
        })}
        {photos.length > 0 && (
          <div>
            <p className="font-medium text-xs text-muted-foreground mb-1">첨부사진 ({photos.length}장)</p>
            <div className="flex flex-wrap gap-2">
              {photos.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt={`사진${i + 1}`} className="h-20 w-20 object-cover rounded border" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const steps = [
    { n: 1 as const, label: "1단계: SNS 보고", done: done1, submittedAt: assignment.step1SubmittedAt, desc: "사고 발생 즉시 Teams 채널에 SNS 양식으로 보고" },
    { n: 2 as const, label: "2단계: 사고경위서", done: done2, submittedAt: assignment.step2SubmittedAt, desc: "사고 발생 후 3시간 이내 현장경영팀 메일 보고" },
    { n: 3 as const, label: "최종: 결과보고서", done: done3, submittedAt: assignment.step3SubmittedAt, desc: "훈련 사진·참석자 명단·총평 포함 최종 결과 보고" },
  ];

  return (
    <div className="space-y-4">
      {/* 시나리오 (접기/펼치기) */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm">{assignment.department}</p>
          {assignment.accidentType && <Badge variant="outline" className="text-xs">{assignment.accidentType}</Badge>}
        </div>
        <ScenarioCollapsible assignment={localAssignment} isAdmin={isAdmin}
          onFileUploaded={(url, name) => setLocalAssignment(p => ({ ...p, scenarioFileUrl: url, scenarioFileName: name }))} />
      </div>

      {/* ── 사전교육 참석자 명단 + 사진 (DB 저장, 항상 표시) ── */}
      {(() => {
        const edu = preEduData as any;
        const attendeeCount = edu?.attendees?.length ?? 0;
        const photoCount = edu?.photos?.length ?? 0;
        const isRegistered = attendeeCount > 0 || photoCount > 0;
        return (
          <div className={`border-2 rounded-lg p-3 ${isRegistered
            ? "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20"
            : "border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20"}`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                {isRegistered
                  ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                  : <Circle className="w-4 h-4 text-amber-500" />}
                <span>사전교육 참석자 명단 및 사진</span>
                {isRegistered && (
                  <span className="text-xs font-normal text-green-600 dark:text-green-400">
                    ✅ 등록 완료 ({attendeeCount > 0 ? `${attendeeCount}명` : ""}
                    {attendeeCount > 0 && photoCount > 0 ? " · " : ""}
                    {photoCount > 0 ? `사진 ${photoCount}장` : ""})
                  </span>
                )}
              </p>
              <Button size="sm" variant="outline"
                className={`h-7 text-xs ${isRegistered
                  ? "border-green-400 text-green-700 hover:bg-green-100"
                  : "border-amber-400 text-amber-700 hover:bg-amber-100"}`}
                onClick={() => setPreEduOpen(true)}>
                <FileText className="w-3 h-3 mr-1" />{isRegistered ? "수정" : "작성"}
              </Button>
            </div>
            {isRegistered ? (
              <div className="mt-2 space-y-1.5">
                {attendeeCount > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(edu.attendees as {no:string;name:string}[]).map((a, i) => (
                      <span key={i} className="text-xs bg-white dark:bg-gray-800 border rounded px-2 py-0.5">{a.no}. {a.name}</span>
                    ))}
                  </div>
                )}
                {photoCount > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {(edu.photos as string[]).map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt={`교육사진${i+1}`} className="h-14 w-14 object-cover rounded border" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">아직 작성되지 않았습니다. "작성" 버튼을 눌러 입력하세요.</p>
            )}
          </div>
        );
      })()}
      <PreEduDialog assignment={assignment} open={preEduOpen}
        onClose={() => setPreEduOpen(false)}
        onSaved={(data) => setPreEduData(data)} />

      {/* 단계별 진행 */}
      <div className="space-y-3">
        {steps.map(step => (
          <div key={step.n} className={`border rounded-lg p-3 ${step.done ? "border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800" : "border-border"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {step.done
                  ? <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                  : <Circle className="w-5 h-5 text-muted-foreground flex-shrink-0" />}
                <div>
                  <p className="font-medium text-sm">{step.label}</p>
                  <p className="text-xs text-muted-foreground">{step.desc}</p>
                  {step.done && step.submittedAt && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                      제출: {format(new Date(step.submittedAt), "MM/dd HH:mm", { locale: ko })}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-1.5">
                {step.done && (
                  <Button variant="outline" size="sm" onClick={() => setViewStep(viewStep === step.n ? null : step.n)}>
                    <Eye className="w-3 h-3 mr-1" />{viewStep === step.n ? "닫기" : "보기"}
                  </Button>
                )}
                {!step.done && (
                  <Button size="sm" onClick={() => { setActiveStep(step.n); setViewStep(null); }}>
                    <FileText className="w-3 h-3 mr-1" />보고 작성
                  </Button>
                )}
                {step.done && isAdmin && (
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => resetStep.mutate(step.n)}>
                    초기화
                  </Button>
                )}
              </div>
            </div>
            {viewStep === step.n && (
              <div className="mt-3 border-t pt-3">
                {renderStepData(step.n)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 인라인 폼 */}
      {activeStep === 1 && (
        <div className="border rounded-lg p-4 bg-blue-50/50 dark:bg-blue-950/20">
          <h4 className="font-semibold mb-3 text-sm">1단계: SNS 보고 작성</h4>
          <Step1Form assignment={assignment} onClose={() => { setActiveStep(null); setViewStep(1); }} />
        </div>
      )}
      {activeStep === 2 && (
        <div className="border rounded-lg p-4 bg-amber-50/50 dark:bg-amber-950/20">
          <h4 className="font-semibold mb-3 text-sm">2단계: 사고경위서 작성</h4>
          <Step2Form assignment={assignment} onClose={() => { setActiveStep(null); setViewStep(2); }} />
        </div>
      )}
      {activeStep === 3 && (
        <div className="border rounded-lg p-4 bg-purple-50/50 dark:bg-purple-950/20">
          <h4 className="font-semibold mb-3 text-sm">최종 결과보고서 작성</h4>
          <Step3Form assignment={assignment} session={session} onClose={() => { setActiveStep(null); setViewStep(3); }} />
        </div>
      )}
    </div>
  );
}

// ─── 세션 생성 다이얼로그 ──────────────────────────────────────────────────
function CreateSessionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: `${CURRENT_YEAR}년 하반기 안전사고 발생 대응훈련`,
    year: CURRENT_YEAR,
    period: "하반기",
    drillDate: "",
    description: "",
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/drill-sessions", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/drill-sessions"] });
      toast({ title: "훈련 세션 생성 완료" });
      onClose();
    },
  });

  function handlePeriodChange(v: string) {
    const half = v === "상반기" ? "상반기" : "하반기";
    setForm(p => ({ ...p, period: half, title: `${form.year}년 ${half} 안전사고 발생 대응훈련` }));
  }
  function handleYearChange(e: any) {
    const yr = Number(e.target.value);
    setForm(p => ({ ...p, year: yr, title: `${yr}년 ${p.period} 안전사고 발생 대응훈련` }));
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>새 훈련 세션 생성</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>연도</Label>
              <Input type="number" value={form.year} onChange={handleYearChange} />
            </div>
            <div>
              <Label>기간</Label>
              <Select value={form.period} onValueChange={handlePeriodChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="상반기">상반기</SelectItem>
                  <SelectItem value="하반기">하반기</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>훈련명</Label>
            <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
          </div>
          <div>
            <Label>훈련일</Label>
            <Input type="date" value={form.drillDate} onChange={e => setForm(p => ({ ...p, drillDate: e.target.value }))} />
          </div>
          <div>
            <Label>비고</Label>
            <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={() => createMut.mutate(form)} disabled={createMut.isPending}>생성</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 부서 시나리오 할당 다이얼로그 ─────────────────────────────────────────
function AddAssignmentDialog({ open, sessionId, onClose }: { open: boolean; sessionId: number; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dept, setDept] = useState("");
  const [scenario, setScenario] = useState("");
  const [accidentType, setAccidentType] = useState("");

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/drill-sessions/${sessionId}/assignments`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/drill-sessions", sessionId, "assignments"] });
      toast({ title: "시나리오 부여 완료" });
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>부서별 시나리오 부여</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>부서</Label>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger><SelectValue placeholder="부서 선택" /></SelectTrigger>
              <SelectContent>
                {DEPT_LIST.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>사고 유형</Label>
            <Select value={accidentType} onValueChange={v => { setAccidentType(v); }}>
              <SelectTrigger><SelectValue placeholder="사고 유형 선택" /></SelectTrigger>
              <SelectContent>
                {ACCIDENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>시나리오 내용</Label>
            <Textarea
              value={scenario}
              onChange={e => setScenario(e.target.value)}
              rows={4}
              placeholder="예: 전주에서 이동식 사다리를 이용하여 등주 중 장비발판 고정불량으로 인한 사다리 전도로 추락하는 사고"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button
            onClick={() => createMut.mutate({ department: dept, scenario, accidentType })}
            disabled={!dept || !scenario || createMut.isPending}
          >부여</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 시나리오 일괄 배정 다이얼로그 ────────────────────────────────────────
type PlanAssignment = { team: string; department: string; scenario: string; accidentType: string };

function AssignPreviewTable({ assignments, onBack, onSubmit, isPending, backLabel }: {
  assignments: PlanAssignment[];
  onBack: () => void;
  onSubmit: () => void;
  isPending: boolean;
  backLabel: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-2">배정 결과 미리보기 ({assignments.length}개 부서)</h3>
        <div className="border rounded-lg overflow-hidden text-xs max-h-80 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left p-2 border-b font-medium w-28">부서</th>
                <th className="text-left p-2 border-b font-medium w-28">사고 유형</th>
                <th className="text-left p-2 border-b font-medium">시나리오</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="p-2 font-medium whitespace-nowrap">{a.department}</td>
                  <td className="p-2"><Badge variant="outline" className="text-xs whitespace-nowrap">{a.accidentType}</Badge></td>
                  <td className="p-2 text-muted-foreground"><ScenarioPreview text={a.scenario} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onBack}>{backLabel}</Button>
        <Button onClick={onSubmit} disabled={isPending}>
          {isPending ? "등록 중..." : `일괄 등록 (${assignments.length}개)`}
        </Button>
      </DialogFooter>
    </div>
  );
}

function BulkAssignDialog({ open, sessionId, onClose }: { open: boolean; sessionId: number; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [mode, setMode] = useState<"plan" | "random">("plan");
  // plan mode
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [planAssignments, setPlanAssignments] = useState<PlanAssignment[]>([]);
  const [planParsed, setPlanParsed] = useState(false);
  // random mode
  const [randomFiles, setRandomFiles] = useState<File[]>([]);
  const [randomAssignments, setRandomAssignments] = useState<PlanAssignment[]>([]);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([...DEPT_LIST]);
  const [randomParsed, setRandomParsed] = useState(false);

  const [parsing, setParsing] = useState(false);

  // 공통 제출
  const finalAssignments = mode === "plan" ? planAssignments : randomAssignments;

  const bulkMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/drill-sessions/${sessionId}/bulk-assign`, {
      assignments: finalAssignments.map(a => ({ department: a.department, scenario: a.scenario, accidentType: a.accidentType })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/drill-sessions", sessionId, "assignments"] });
      toast({ title: `${finalAssignments.length}개 부서 시나리오 배정 완료` });
      handleClose();
    },
    onError: (e: any) => toast({ title: "오류", description: e.message, variant: "destructive" }),
  });

  // ── 계획서 자동 추출 ──
  async function handleParsePlan() {
    if (!planFile) return;
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", planFile);
      const res = await fetch("/api/drill-docx/parse-plan", { method: "POST", credentials: "include", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "파싱 오류");
      setPlanAssignments(body);
      setPlanParsed(true);
    } catch (e: any) {
      toast({ title: "파싱 오류", description: e.message, variant: "destructive" });
    } finally {
      setParsing(false);
    }
  }

  // ── 랜덤 배정 ──
  function detectAccidentType(text: string): string {
    const t = stripHtml(text).toLowerCase();
    if (t.includes("낙상") || t.includes("빙판")) return "빙판길 낙상사고";
    if (t.includes("추락")) return "추락사고";
    if (t.includes("발목") || t.includes("접지")) return "발목 접지름 사고";
    if (t.includes("중량물") || t.includes("낙하")) return "중량물 낙하사고";
    if (t.includes("전기") || t.includes("화상")) return "전기 화상사고";
    if (t.includes("차량") || t.includes("교통")) return "차량사고";
    if (t.includes("쏘임") || t.includes("벌")) return "쏘임사고";
    return "기타";
  }

  async function handleParseRandom() {
    if (randomFiles.length === 0) return;
    setParsing(true);
    try {
      const fd = new FormData();
      randomFiles.forEach(f => fd.append("files", f));
      const res = await fetch("/api/drill-docx/parse", { method: "POST", credentials: "include", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "파싱 오류");
      const shuffled = [...body].sort(() => Math.random() - 0.5);
      setRandomAssignments(selectedDepts.map((dept, i) => {
        const sc = shuffled[i % shuffled.length];
        return { team: "", department: dept, scenario: sc.text, accidentType: detectAccidentType(sc.text) };
      }));
      setRandomParsed(true);
    } catch (e: any) {
      toast({ title: "파싱 오류", description: e.message, variant: "destructive" });
    } finally {
      setParsing(false);
    }
  }

  function handleClose() {
    setMode("plan"); setPlanFile(null); setPlanAssignments([]); setPlanParsed(false);
    setRandomFiles([]); setRandomAssignments([]); setRandomParsed(false);
    setSelectedDepts([...DEPT_LIST]);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shuffle className="w-4 h-4" />시나리오 일괄 배정
          </DialogTitle>
        </DialogHeader>

        <Tabs value={mode} onValueChange={v => { setMode(v as any); setPlanParsed(false); setRandomParsed(false); }}>
          <TabsList className="w-full mb-4">
            <TabsTrigger value="plan" className="flex-1">📄 계획서 자동 추출</TabsTrigger>
            <TabsTrigger value="random" className="flex-1">🔀 파일 랜덤 배정</TabsTrigger>
          </TabsList>

          {/* ── 계획서 자동 추출 탭 ── */}
          <TabsContent value="plan" className="space-y-4 mt-0">
            {!planParsed ? (
              <>
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
                  <p className="font-semibold">대응훈련 계획 문서를 업로드하세요</p>
                  <p>"훈련 시나리오" 표에 있는 팀별 시나리오를 자동으로 읽어 각 부서에 바로 배정합니다.</p>
                </div>
                <div className="border-2 border-dashed rounded-lg p-5 text-center">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-60" />
                  {planFile ? (
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <FileText className="w-3 h-3 text-blue-500 shrink-0" />
                      <span className="font-medium truncate max-w-xs">{planFile.name}</span>
                      <button onClick={() => setPlanFile(null)} className="text-muted-foreground hover:text-red-500 ml-1"><X className="w-3 h-3" /></button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground mb-3">훈련 계획 워드 파일(.docx) 선택</p>
                      <input type="file" accept=".doc,.docx" onChange={e => setPlanFile(e.target.files?.[0] ?? null)} className="hidden" id="plan-docx-upload" />
                      <label htmlFor="plan-docx-upload">
                        <Button variant="outline" size="sm" asChild>
                          <span className="cursor-pointer"><Upload className="w-4 h-4 mr-2" />파일 선택</span>
                        </Button>
                      </label>
                    </>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={handleClose}>취소</Button>
                  <Button onClick={handleParsePlan} disabled={!planFile || parsing}>
                    {parsing ? "분석 중..." : "시나리오 자동 추출"}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <AssignPreviewTable
                assignments={planAssignments}
                onBack={() => setPlanParsed(false)}
                onSubmit={() => bulkMut.mutate()}
                isPending={bulkMut.isPending}
                backLabel="← 파일 변경"
              />
            )}
          </TabsContent>

          {/* ── 파일 랜덤 배정 탭 ── */}
          <TabsContent value="random" className="space-y-4 mt-0">
            {!randomParsed ? (
              <>
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-300 space-y-1">
                  <p className="font-semibold">시나리오 파일을 여러 개 올리면 부서마다 다르게 랜덤 배정됩니다</p>
                  <p>파일 1개 → 전 부서 동일, 파일 여러 개 → 부서별 랜덤</p>
                </div>
                <div className="border-2 border-dashed rounded-lg p-5 text-center">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-60" />
                  <p className="text-sm text-muted-foreground mb-3">시나리오 .docx 파일 선택 (여러 개 가능)</p>
                  <input type="file" multiple accept=".doc,.docx" onChange={e => setRandomFiles(Array.from(e.target.files || []))} className="hidden" id="random-docx-upload" />
                  <label htmlFor="random-docx-upload">
                    <Button variant="outline" size="sm" asChild>
                      <span className="cursor-pointer"><Upload className="w-4 h-4 mr-2" />파일 선택</span>
                    </Button>
                  </label>
                </div>
                {randomFiles.length > 0 && (
                  <div className="space-y-1">
                    {randomFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm bg-muted/40 rounded px-3 py-1.5">
                        <FileText className="w-3 h-3 text-blue-500 shrink-0" />
                        <span className="flex-1 truncate">{f.name}</span>
                        <button onClick={() => setRandomFiles(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-500"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">배정 부서</h3>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => setSelectedDepts([...DEPT_LIST])}>전체</Button>
                      <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => setSelectedDepts([])}>해제</Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {DEPT_LIST.map(dept => (
                      <label key={dept} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/40 rounded px-2 py-1.5">
                        <input type="checkbox" checked={selectedDepts.includes(dept)}
                          onChange={e => {
                            if (e.target.checked) setSelectedDepts(prev => [...prev, dept]);
                            else setSelectedDepts(prev => prev.filter(d => d !== dept));
                          }} className="rounded" />
                        {dept}
                      </label>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={handleClose}>취소</Button>
                  <Button onClick={handleParseRandom} disabled={randomFiles.length === 0 || selectedDepts.length === 0 || parsing}>
                    {parsing ? "배정 중..." : `랜덤 배정 (${selectedDepts.length}개 부서)`}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <AssignPreviewTable
                assignments={randomAssignments}
                onBack={() => setRandomParsed(false)}
                onSubmit={() => bulkMut.mutate()}
                isPending={bulkMut.isPending}
                backLabel="← 다시 배정"
              />
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────
export default function DrillTraining() {
  const { user } = useAuth();
  const { isAdmin: isAdminPerm } = usePermissions();
  const isAdmin = isAdminPerm || user?.role === "admin";
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [addAssignOpen, setAddAssignOpen] = useState(false);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [detailAssignmentId, setDetailAssignmentId] = useState<number | null>(null);

  const { data: sessions = [], isLoading } = useQuery<DrillSession[]>({
    queryKey: ["/api/drill-sessions"],
  });

  const { data: assignments = [] } = useQuery<DrillAssignment[]>({
    queryKey: ["/api/drill-sessions", selectedSession, "assignments"],
    queryFn: () => fetch(`/api/drill-sessions/${selectedSession}/assignments`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedSession,
  });

  const deleteSession = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/drill-sessions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/drill-sessions"] });
      if (selectedSession) setSelectedSession(null);
      toast({ title: "삭제 완료" });
    },
  });

  const deleteAssignment = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/drill-assignments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/drill-sessions", selectedSession, "assignments"] });
      toast({ title: "삭제 완료" });
    },
  });

  const currentSession = sessions.find(s => s.id === selectedSession);
  const myDept = (user as any)?.department;

  // 내 부서 할당 (부서장용)
  const myAssignment = myDept ? assignments.find(a => a.department === myDept) : null;

  const totalCompleted = assignments.filter(a => progressCount(a) === 3).length;

  // ID 기반으로 detailAssignment를 실시간 조회 (제출 후 자동 갱신)
  const detailAssignment = detailAssignmentId ? assignments.find(a => a.id === detailAssignmentId) ?? null : null;

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <Siren className="w-4 h-4 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">안전사고 발생 대응훈련</h1>
            <p className="text-xs text-muted-foreground">부서별 사고 대응 훈련 관리 및 보고 시스템</p>
          </div>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />새 훈련 세션
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 훈련 세션 목록 */}
        <div className="lg:col-span-1 space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">훈련 세션</h2>
          {isLoading && <div className="text-center text-muted-foreground text-sm py-8">불러오는 중...</div>}
          {!isLoading && sessions.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm border border-dashed rounded-lg">
              <Siren className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>등록된 훈련 세션이 없습니다</p>
              {isAdmin && <p className="text-xs mt-1">상단 버튼으로 세션을 생성하세요</p>}
            </div>
          )}
          {sessions.map(s => (
            <div
              key={s.id}
              onClick={() => setSelectedSession(s.id === selectedSession ? null : s.id)}
              className={`cursor-pointer border rounded-lg p-3 transition-all ${
                selectedSession === s.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/40"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{s.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">{s.year}년 {s.period}</Badge>
                    <Badge className={s.status === "완료" ? "bg-green-100 text-green-700 text-xs" : "bg-blue-100 text-blue-700 text-xs"}>
                      {s.status}
                    </Badge>
                  </div>
                  {s.drillDate && (
                    <p className="text-xs text-muted-foreground mt-1">훈련일: {s.drillDate}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${selectedSession === s.id ? "rotate-90" : ""}`} />
                  {isAdmin && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); deleteSession.mutate(s.id); }}>
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 세션 상세: 부서별 할당 현황 */}
        <div className="lg:col-span-2">
          {!selectedSession ? (
            <div className="flex items-center justify-center h-64 border border-dashed rounded-lg text-muted-foreground text-sm">
              <div className="text-center">
                <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>왼쪽에서 훈련 세션을 선택하세요</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 세션 헤더 */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">{currentSession?.title}</h2>
                  <p className="text-xs text-muted-foreground">
                    총 {assignments.length}개 부서 · 완료 {totalCompleted}개
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => {
                      if (currentSession?.status === "완료") {
                        apiRequest("PUT", `/api/drill-sessions/${selectedSession}`, { status: "진행중" })
                          .then(() => qc.invalidateQueries({ queryKey: ["/api/drill-sessions"] }));
                      } else {
                        apiRequest("PUT", `/api/drill-sessions/${selectedSession}`, { status: "완료" })
                          .then(() => qc.invalidateQueries({ queryKey: ["/api/drill-sessions"] }));
                      }
                    }}>
                      {currentSession?.status === "완료" ? "진행중으로 변경" : "훈련 완료 처리"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setBulkAssignOpen(true)}>
                      <Shuffle className="w-3 h-3 mr-1" />랜덤 일괄 배정
                    </Button>
                    <Button size="sm" onClick={() => setAddAssignOpen(true)}>
                      <Plus className="w-3 h-3 mr-1" />부서 추가
                    </Button>
                  </div>
                )}
              </div>

              {/* 내 부서 할당 (부서장 강조) */}
              {!isAdmin && myAssignment && (
                <div className="border-2 border-primary rounded-lg p-4 bg-primary/5">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm">우리 부서 훈련 ({myAssignment.department})</span>
                    <Badge className="ml-auto">{progressCount(myAssignment)}/3 완료</Badge>
                  </div>
                  <ScenarioPreview text={myAssignment.scenario} />
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { step: 1, label: "1단계: SNS보고", status: myAssignment.step1Status },
                      { step: 2, label: "2단계: 경위서", status: myAssignment.step2Status },
                      { step: 3, label: "최종: 결과보고", status: myAssignment.step3Status },
                    ].map(s => (
                      <div key={s.step} className="flex items-center gap-1 text-xs">
                        {s.status === "제출완료"
                          ? <CheckCircle2 className="w-3 h-3 text-green-500" />
                          : <Circle className="w-3 h-3 text-muted-foreground" />}
                        <span>{s.label}</span>
                        {stepBadge(s.status)}
                      </div>
                    ))}
                  </div>
                  <Button className="mt-3 w-full" size="sm" onClick={() => setDetailAssignmentId(myAssignment.id)}>
                    훈련 보고 진행하기 <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              )}

              {/* 전체 부서 목록 */}
              {assignments.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm border border-dashed rounded-lg">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>부여된 부서가 없습니다</p>
                  {isAdmin && <p className="text-xs mt-1">상단 버튼으로 부서별 시나리오를 부여하세요</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  {assignments.map(a => {
                    const done = progressCount(a);
                    return (
                      <div
                        key={a.id}
                        className="border rounded-lg p-3 hover:border-primary/50 hover:bg-muted/30 cursor-pointer transition-all"
                        onClick={() => setDetailAssignmentId(a.id)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{a.department}</span>
                              {a.accidentType && <Badge variant="outline" className="text-xs">{a.accidentType}</Badge>}
                              <span className="text-xs text-muted-foreground ml-auto">
                                {done === 3
                                  ? <span className="text-green-600 font-medium">완료 ✓</span>
                                  : <span className="text-amber-600">{done}/3 완료</span>}
                              </span>
                            </div>
                            <div className="mt-1 overflow-hidden"><ScenarioPreview text={a.scenario} /></div>
                            <div className="flex gap-3 mt-1.5">
                              {[
                                { label: "SNS", status: a.step1Status },
                                { label: "경위서", status: a.step2Status },
                                { label: "결과보고", status: a.step3Status },
                              ].map(s => (
                                <div key={s.label} className="flex items-center gap-1 text-xs">
                                  {s.status === "제출완료"
                                    ? <CheckCircle2 className="w-3 h-3 text-green-500" />
                                    : <Circle className="w-3 h-3 text-gray-300" />}
                                  <span className="text-muted-foreground">{s.label}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold"
                              style={{ borderColor: done === 3 ? "#22c55e" : done > 0 ? "#f59e0b" : "#e5e7eb" }}>
                              {done}/3
                            </div>
                            {isAdmin && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); deleteAssignment.mutate(a.id); }}>
                                <Trash2 className="w-3 h-3 text-red-400" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 상세 다이얼로그 */}
      {detailAssignment && (
        <Dialog open={!!detailAssignment} onOpenChange={() => setDetailAssignmentId(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Siren className="w-4 h-4 text-red-500" />
                {detailAssignment.department} · 훈련 보고
              </DialogTitle>
            </DialogHeader>
            <AssignmentDetail
              assignment={detailAssignment}
              sessionId={selectedSession!}
              isAdmin={isAdmin}
              session={currentSession}
              onClose={() => setDetailAssignmentId(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* 세션 생성 다이얼로그 */}
      <CreateSessionDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      {/* 부서 할당 다이얼로그 */}
      {selectedSession && (
        <AddAssignmentDialog open={addAssignOpen} sessionId={selectedSession} onClose={() => setAddAssignOpen(false)} />
      )}

      {/* 랜덤 일괄 배정 다이얼로그 */}
      {selectedSession && (
        <BulkAssignDialog open={bulkAssignOpen} sessionId={selectedSession} onClose={() => setBulkAssignOpen(false)} />
      )}
    </div>
  );
}
