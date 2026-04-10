import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, Trash2, Plus, FileSpreadsheet, Search,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  RotateCcw, X, Pencil, Link2,
  ChevronDown, ChevronUp, Users, Calendar, Clock,
  Copy, ExternalLink, Send, QrCode, GraduationCap, Download, Eye,
  ImagePlus, Camera, Save, PenTool, X as XIcon, Files,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { EducationTask, EducationSession } from "@shared/schema";

type EducationTaskWithLinked = EducationTask & { linkedSessionCount?: number; totalParticipantsSum?: number };

const FIELDS = ["안전/보건", "법령", "이벤트"] as const;
const SCOPES = ["전사", "본부", "지정", "안전보건업무 부서"] as const;
const FIELD_TYPES = ["Text", "Date", "Number", "Select"] as const;
const PAGE_SIZE_OPTIONS = [10, 20, 50];
const TEAMS_BY_HQ: Record<string, string[]> = {
  "대구본부": [
    "현장경영팀",
    "운용계획팀", "운용지원팀", "사업지원팀",
    "동대구운용팀", "서대구운용팀", "남대구운용팀",
    "포항운용팀", "안동운용팀", "구미운용팀", "문경운용팀",
    "공공망관제팀",
  ],
  "부산본부": [
    "현장경영팀",
    "운용계획팀", "운용지원팀", "사업지원팀",
    "동부산운용팀", "중부산운용팀", "서부산운용팀", "울산운용팀", "지하철운용팀",
    "김해운용팀", "창원운용팀", "진주운용팀", "통영운용팀",
    "고객케어팀",
  ],
  "충청본부": [
    "현장경영팀",
    "운용계획팀", "운용지원팀", "사업지원팀",
    "천안운용팀", "서대전운용팀", "서산운용팀", "홍성운용팀", "논산운용팀",
    "청주운용팀", "충주운용팀", "동대전운용팀", "세종운용팀",
  ],
  "호남본부": [
    "현장경영팀",
    "운용계획팀", "운용지원팀", "사업지원팀",
    "서광주운용팀", "북광주운용팀", "목포운용팀", "해남운용팀", "제주운용팀",
    "전주운용팀", "익산운용팀", "남원운용팀", "정읍운용팀", "순천운용팀",
  ],
  "경영총괄": ["현장경영팀", "운용계획팀", "운용지원팀", "사업지원팀"],
  "사업총괄": ["공공망관제팀"],
  "품질지원센터": [],
  "감사실": [],
};

// 전체 부서 목록 (모든 HQ의 팀 중복 제거)
const DEPARTMENTS: string[] = (() => {
  const all: string[] = [];
  for (const teams of Object.values(TEAMS_BY_HQ)) {
    for (const t of teams) { if (!all.includes(t)) all.push(t); }
  }
  return all;
})();

const HQ_OPTIONS = ["대구본부", "부산본부", "충청본부", "호남본부", "경영총괄", "품질지원센터", "사업총괄", "감사실"];
const EDUCATION_TYPES = ["정기교육", "신규교육", "특별교육", "안전교육", "직무교육"];

type TaskField = { type: string; title: string };
type SessionWithSigs = EducationSession & { signedCount: number };

interface FormState {
  title: string;
  startDate: string;
  endDate: string;
  field: string;
  requestScope: string;
  isRecurring: boolean;
  taskFields: TaskField[];
  headquarters: string;
  department: string;
  requestedBy: string;
  selectedHqs: string[];   // 본부 scope: 체크박스 다중선택
  selectedTeams: string[]; // 지정 scope: 팀 다중선택
}


const emptyForm = (): FormState => ({
  title: "",
  startDate: "",
  endDate: "",
  field: "안전/보건",
  requestScope: "전사",
  isRecurring: false,
  taskFields: [{ type: "Text", title: "" }],
  headquarters: "",
  department: "",
  requestedBy: "",
  selectedHqs: [],
  selectedTeams: [],
});

// 업무 범위(scope/HQ/dept)에 따른 예상 부서 목록 계산
function getExpectedDepts(task: EducationTaskWithLinked): string[] {
  const scope = task.requestScope;
  if (scope === "전사" || scope === "안전보건업무 부서") return DEPARTMENTS;
  if (scope === "본부") {
    const hqs = (task.headquarters || "").split(",").map(s => s.trim()).filter(Boolean);
    const depts: string[] = [];
    for (const hq of hqs) {
      for (const t of (TEAMS_BY_HQ[hq] ?? [])) { if (!depts.includes(t)) depts.push(t); }
    }
    return depts.length ? depts : DEPARTMENTS;
  }
  if (scope === "지정") {
    const teams = (task.department || "").split(",").map(s => s.trim()).filter(Boolean);
    return teams.length ? teams : DEPARTMENTS;
  }
  return DEPARTMENTS;
}

function SignaturePad({ onSave, onClear, padKey }: { onSave: (data: string) => void; onClear: () => void; padKey?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = canvas.getBoundingClientRect().width || 400;
    canvas.height = 140;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasContent(false);
  }, [padKey]);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    setHasContent(true);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, [getPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1e293b";
    ctx.lineTo(x, y);
    ctx.stroke();
  }, [isDrawing, getPos]);

  const endDraw = useCallback(() => setIsDrawing(false), []);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasContent(false);
    onClear();
  }, [onClear]);

  const save = useCallback(() => {
    if (!hasContent || !canvasRef.current) return;
    onSave(canvasRef.current.toDataURL("image/png"));
  }, [hasContent, onSave]);

  return (
    <div className="space-y-2">
      <div className="border-2 border-dashed border-primary/40 rounded-xl overflow-hidden bg-white shadow-inner">
        <canvas
          ref={canvasRef}
          className="w-full touch-none cursor-crosshair"
          style={{ height: "140px", display: "block" }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={clear} className="gap-1.5">
          <XIcon className="w-3.5 h-3.5" /> 지우기
        </Button>
        <Button size="sm" disabled={!hasContent} onClick={save} className="gap-1.5 bg-indigo-600 hover:bg-indigo-700">
          <PenTool className="w-3.5 h-3.5" /> 서명 완료
        </Button>
      </div>
    </div>
  );
}

// 연결된 세션을 보여주는 인라인 패널 컴포넌트 (카드형 행 리스트)
function LinkedSessionsPanel({ taskId, task }: { taskId: number; task: EducationTaskWithLinked }) {
  const { toast } = useToast();
  const { data: sessions = [], isLoading, refetch } = useQuery<SessionWithSigs[]>({
    queryKey: ["/api/education-tasks", taskId, "sessions"],
    queryFn: () => fetch(`/api/education-tasks/${taskId}/sessions`, { credentials: "include" }).then(r => r.json()),
  });

  // 패널 열릴 때 누락된 세션 자동 생성 (업무 범위 기반)
  const expectedDeptsForTask = getExpectedDepts(task);
  const expectedLen = expectedDeptsForTask.length;
  const [autoCreating, setAutoCreating] = useState(false);
  const autoCreatedRef = useRef(false);
  const prevExpectedLenRef = useRef(expectedLen);
  // expectedLen이 바뀌면(팀 구조 변경 등) autoCreatedRef 초기화
  if (prevExpectedLenRef.current !== expectedLen) {
    prevExpectedLenRef.current = expectedLen;
    autoCreatedRef.current = false;
  }
  useEffect(() => {
    if (!isLoading && sessions.length < expectedLen && !autoCreatedRef.current) {
      autoCreatedRef.current = true;
      setAutoCreating(true);
      fetch(`/api/education-tasks/${taskId}/auto-sessions`, { method: "POST", credentials: "include" })
        .then(r => r.json())
        .then(data => { if (data.created > 0) refetch(); })
        .catch(() => { autoCreatedRef.current = false; })
        .finally(() => setAutoCreating(false));
    }
  }, [isLoading, sessions.length, taskId, expectedLen]);

  // 부서별 체크박스 선택 다운로드
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<number>>(new Set());
  const [batchDownloading, setBatchDownloading] = useState(false);

  const toggleSession = (id: number) => {
    setSelectedSessionIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllSessions = () => {
    const allIds = sessions.filter(s => s.id).map(s => s.id);
    if (selectedSessionIds.size === allIds.length) {
      setSelectedSessionIds(new Set());
    } else {
      setSelectedSessionIds(new Set(allIds));
    }
  };

  const handleBatchDownload = async () => {
    if (selectedSessionIds.size === 0) {
      toast({ title: "다운로드할 부서를 선택해주세요.", variant: "destructive" }); return;
    }
    setBatchDownloading(true);
    try {
      const res = await fetch(`/api/education-tasks/${taskId}/sessions/batch-excel`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionIds: Array.from(selectedSessionIds) }),
      });
      if (!res.ok) { toast({ title: "다운로드 실패", variant: "destructive" }); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `선택부서_교육일지_${selectedSessionIds.size}개.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `${selectedSessionIds.size}개 부서 엑셀 다운로드 완료` });
    } catch { toast({ title: "다운로드 실패", variant: "destructive" }); }
    finally { setBatchDownloading(false); }
  };

  // 편집 다이얼로그 상태
  const [editingSession, setEditingSession] = useState<SessionWithSigs | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editImages, setEditImages] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoEditRef = useRef<HTMLInputElement>(null);

  const openEdit = (s: SessionWithSigs) => {
    setEditingSession(s);
    setEditDesc(s.description || "");
    setEditImages([...(s.images || [])]);
  };

  const handlePhotoUpload = async (files: FileList) => {
    if (editImages.length >= 4) {
      toast({ title: "사진은 최대 4장까지 등록 가능합니다.", variant: "destructive" });
      return;
    }
    setUploadingPhoto(true);
    try {
      const newImages = [...editImages];
      for (const file of Array.from(files)) {
        if (newImages.length >= 4) break;
        const res = await apiRequest("POST", "/api/uploads/request-url", {
          name: file.name, size: file.size, contentType: file.type,
        });
        const { uploadURL, objectPath } = await res.json();
        await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        newImages.push(objectPath);
      }
      setEditImages(newImages);
    } catch {
      toast({ title: "사진 업로드 실패", variant: "destructive" });
    } finally {
      setUploadingPhoto(false);
      if (photoEditRef.current) photoEditRef.current.value = "";
    }
  };

  const handleSaveEdit = async () => {
    if (!editingSession) return;
    setSavingEdit(true);
    try {
      await apiRequest("PATCH", `/api/education-sessions/${editingSession.id}`, {
        description: editDesc,
        images: editImages,
      });
      await refetch();
      toast({ title: "저장되었습니다." });
      setEditingSession(null);
    } catch {
      toast({ title: "저장 실패", variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  const copyLink = (_sessionId: number) => {
    const url = `${window.location.origin}/sign/task/${taskId}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "서명 링크가 복사되었습니다.", description: "참석자가 부서를 직접 선택할 수 있는 통합 링크입니다." });
    });
  };

  const updateParticipants = async (sessionId: number, count: number) => {
    try {
      await apiRequest("PATCH", `/api/education-sessions/${sessionId}`, { totalParticipants: count });
      await refetch();
      toast({ title: `인원수가 ${count}명으로 저장되었습니다.` });
    } catch {
      toast({ title: "인원수 저장 실패", variant: "destructive" });
    }
  };

  // 서명자 목록 확인 다이얼로그
  const [viewSigSession, setViewSigSession] = useState<SessionWithSigs | null>(null);
  const { data: viewSigs = [], isLoading: sigsLoading } = useQuery<any[]>({
    queryKey: ["/api/education-sessions", viewSigSession?.id, "signatures"],
    queryFn: () => fetch(`/api/education-sessions/${viewSigSession!.id}/signatures`, { credentials: "include" }).then(r => r.json()),
    enabled: !!viewSigSession,
  });

  // 통합 상세/서명 다이얼로그
  const [detailSession, setDetailSession] = useState<SessionWithSigs | null>(null);
  const [detailDesc, setDetailDesc] = useState("");
  const [detailImages, setDetailImages] = useState<string[]>([]);
  const [detailSaving, setDetailSaving] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signerDept, setSignerDept] = useState("");
  const [sigData, setSigData] = useState("");
  const [sigPadKey, setSigPadKey] = useState(0);
  const [signing, setSigning] = useState(false);
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [detailSigs, setDetailSigs] = useState<any[]>([]);
  const detailPhotoRef = useRef<HTMLInputElement>(null);
  const [detailUploadingPhoto, setDetailUploadingPhoto] = useState(false);

  const openDetail = (s: SessionWithSigs) => {
    setDetailSession(s);
    setDetailDesc(s.description || "");
    setDetailImages([...(s.images || [])]);
    setSignerName("");
    setSignerDept("");
    setSigData("");
    setSigPadKey(k => k + 1);
    setConsentAgreed(false);
    setDetailSigs([]);
    setSignError(null);
    fetch(`/api/education-sessions/${s.id}/signatures`, { credentials: "include" })
      .then(r => r.json()).then(setDetailSigs).catch(() => {});
  };

  const handleDetailPhotoUpload = async (files: FileList) => {
    if (detailImages.length >= 4) {
      toast({ title: "사진은 최대 4장까지 등록 가능합니다.", variant: "destructive" }); return;
    }
    setDetailUploadingPhoto(true);
    try {
      const newImages = [...detailImages];
      for (const file of Array.from(files)) {
        if (newImages.length >= 4) break;
        const res = await apiRequest("POST", "/api/uploads/request-url", { name: file.name, size: file.size, contentType: file.type });
        const { uploadURL, objectPath } = await res.json();
        await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        newImages.push(objectPath);
      }
      setDetailImages(newImages);
    } catch { toast({ title: "사진 업로드 실패", variant: "destructive" }); }
    finally { setDetailUploadingPhoto(false); if (detailPhotoRef.current) detailPhotoRef.current.value = ""; }
  };

  const handleDetailSave = async () => {
    if (!detailSession) return;
    setDetailSaving(true);
    try {
      await apiRequest("PATCH", `/api/education-sessions/${detailSession.id}`, { description: detailDesc, images: detailImages });
      await refetch();
      toast({ title: "저장되었습니다." });
    } catch { toast({ title: "저장 실패", variant: "destructive" }); }
    finally { setDetailSaving(false); }
  };

  const [signError, setSignError] = useState<string | null>(null);

  const handleInlineSign = async () => {
    if (!detailSession || !signerName.trim() || !sigData) {
      toast({ title: "이름과 서명을 입력해주세요.", variant: "destructive" }); return;
    }
    if (!consentAgreed) {
      toast({ title: "개인정보 수집 및 전자서명에 동의해주세요.", variant: "destructive" }); return;
    }
    setSigning(true);
    setSignError(null);
    try {
      const effectiveDept = signerDept === "none" ? "" : signerDept.trim();
      const res = await fetch(`/api/public/education/${detailSession.id}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerName: signerName.trim(), signerDepartment: effectiveDept, signatureData: sigData, consentAgreed }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg = errBody.message || "서명 등록에 실패했습니다. 다시 시도해주세요.";
        setSignError(msg);
        return;
      }
      toast({ title: "서명이 완료되었습니다." });
      setSignerName("");
      setSignerDept("");
      setSigData("");
      setSigPadKey(k => k + 1);
      setConsentAgreed(false);
      setSignError(null);
      await refetch();
      const updated = await fetch(`/api/education-sessions/${detailSession.id}/signatures`, { credentials: "include" }).then(r => r.json());
      setDetailSigs(updated);
      const updatedSession = (await fetch(`/api/education-tasks/${taskId}/sessions`, { credentials: "include" }).then(r => r.json()) as SessionWithSigs[]).find(ss => ss.id === detailSession.id);
      if (updatedSession) setDetailSession(updatedSession);
    } catch {
      setSignError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    } finally { setSigning(false); }
  };

  if (isLoading || autoCreating) {
    return (
      <div className="border-t px-5 py-3 bg-muted/10 flex items-center gap-2 text-xs text-muted-foreground">
        <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        {autoCreating ? "부서별 교육일지 생성 중..." : "교육일지 로딩 중..."}
      </div>
    );
  }

  const expectedDepts = getExpectedDepts(task);

  const SessionRow = ({ s }: { s: SessionWithSigs }) => {
    const signedRate = s.totalParticipants > 0 ? Math.round((s.signedCount / s.totalParticipants) * 100) : 0;
    const isDone = s.status === "완료" || signedRate >= 100;
    const hasContent = !!(s.description || (s.images && s.images.length > 0));
    return (
      <div className="flex items-center gap-2 px-5 py-2.5 hover:bg-muted/20 transition-colors">
        {/* 체크박스 */}
        <div onClick={e => e.stopPropagation()}>
          <Checkbox
            checked={selectedSessionIds.has(s.id)}
            onCheckedChange={() => toggleSession(s.id)}
            className="w-3.5 h-3.5"
            data-testid={`checkbox-session-${s.id}`}
          />
        </div>
        {isDone
          ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          : <Clock className="w-4 h-4 text-amber-400 shrink-0" />
        }
        <button
          className="w-28 shrink-0 text-sm font-medium text-left hover:text-primary hover:underline underline-offset-2 transition-colors"
          onClick={() => openDetail(s)}
          data-testid={`button-detail-${s.id}`}
          title="상세 보기 / 서명"
        >
          {s.department}
        </button>

        {/* 진행율 바 */}
        <div className="flex-1 flex flex-col gap-0.5 min-w-0">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isDone ? "bg-emerald-500" : "bg-primary"}`}
              style={{ width: `${signedRate}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">{signedRate}%</span>
        </div>

        {hasContent && (
          <span className="text-[10px] text-primary/60 flex items-center gap-0.5 shrink-0">
            <Camera className="w-3 h-3" />{(s.images || []).length}
          </span>
        )}
        <Badge
          className={`text-[10px] shrink-0 ${isDone ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-amber-50 text-amber-600 border-amber-300"}`}
          variant={isDone ? "default" : "outline"}
        >
          {isDone ? "완료" : "진행중"}
        </Badge>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-indigo-500 shrink-0"
          onClick={() => setViewSigSession(s)} title="서명자 확인" data-testid={`button-view-sigs-${s.id}`}>
          <Eye className="w-3.5 h-3.5" />
        </Button>

        {/* 서명수 / 인원수(편집 가능) */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0" onClick={e => e.stopPropagation()}>
          <Users className="w-3.5 h-3.5 shrink-0" />
          <span>{s.signedCount}/</span>
          <input
            type="number"
            min={0}
            key={s.totalParticipants}
            defaultValue={s.totalParticipants}
            onFocus={e => e.target.select()}
            onKeyDown={e => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            onBlur={e => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 0 && v !== s.totalParticipants) {
                updateParticipants(s.id, v);
              }
            }}
            className="w-10 text-xs border rounded px-1 py-0.5 bg-background text-center focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid={`input-participants-${s.id}`}
          />
          <span>명</span>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* 패널 헤더: 체크박스 + 카운터 + 다운로드 */}
      <div className="flex items-center gap-2 px-5 py-2 border-t bg-muted/20" onClick={e => e.stopPropagation()}>
        <Checkbox
          checked={sessions.length > 0 && selectedSessionIds.size === sessions.length}
          onCheckedChange={toggleAllSessions}
          className="w-3.5 h-3.5"
          data-testid="checkbox-session-all"
        />
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {selectedSessionIds.size > 0
            ? <span className="text-primary font-medium">{selectedSessionIds.size}</span>
            : <span>0</span>
          }
          <span className="mx-0.5">/</span>
          {sessions.length}개 부서
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50 ml-auto"
          onClick={handleBatchDownload}
          disabled={selectedSessionIds.size === 0 || batchDownloading}
          data-testid="button-batch-session-excel"
        >
          {batchDownloading
            ? <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            : <Download className="w-3.5 h-3.5" />
          }
          엑셀 다운로드{selectedSessionIds.size > 0 ? ` (${selectedSessionIds.size}개)` : ""}
        </Button>
      </div>

      <div className="divide-y">
        {expectedDepts.map(dept => {
          const s = sessions.find(ss => ss.department === dept);
          if (s) return <SessionRow key={dept} s={s} />;
          return (
            <div key={dept} className="flex items-center gap-2 px-5 py-2.5 text-muted-foreground/60">
              <div className="w-3.5 h-3.5 shrink-0" />
              <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/25 shrink-0" />
              <span className="flex-1 text-sm">{dept}</span>
              <Badge variant="outline" className="text-[10px] text-muted-foreground/50 border-muted-foreground/20">미등록</Badge>
              <div className="w-7" /><div className="w-7" />
              <span className="text-xs text-muted-foreground/40 min-w-[48px] text-right">-</span>
            </div>
          );
        })}
        {sessions.filter(s => !expectedDepts.includes(s.department)).map(s => (
          <SessionRow key={s.id} s={s} />
        ))}
      </div>

      {/* 교육내용/사진 편집 다이얼로그 */}
      <Dialog open={!!editingSession} onOpenChange={open => { if (!open) setEditingSession(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingSession?.department} — 교육내용 등록
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* 교육내용 */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">교육내용</Label>
              <Textarea
                placeholder="교육 내용을 입력하세요..."
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                className="resize-none min-h-[90px] text-sm"
                data-testid="textarea-edit-desc"
              />
            </div>

            {/* 교육사진 (최대 4장) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">교육사진 ({editImages.length}/4장)</Label>
                {editImages.length < 4 && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                    onClick={() => photoEditRef.current?.click()}
                    disabled={uploadingPhoto}
                    data-testid="button-add-photo"
                  >
                    {uploadingPhoto
                      ? <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      : <ImagePlus className="w-3.5 h-3.5" />
                    }
                    {uploadingPhoto ? "업로드 중..." : "사진 추가"}
                  </Button>
                )}
              </div>
              <input
                ref={photoEditRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => e.target.files && e.target.files.length > 0 && handlePhotoUpload(e.target.files)}
              />
              {editImages.length === 0 ? (
                <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center text-muted-foreground cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => photoEditRef.current?.click()}>
                  <Camera className="w-7 h-7 mx-auto mb-1.5 opacity-30" />
                  <p className="text-xs">클릭하여 교육 사진을 추가하세요 (최대 4장)</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {editImages.map((img, idx) => (
                    <div key={idx} className="relative group rounded-lg overflow-hidden border aspect-video bg-muted">
                      <img src={img} alt={`사진 ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setEditImages(prev => prev.filter((_, i) => i !== idx))}
                        data-testid={`button-remove-photo-${idx}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <span className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] px-1 rounded">{idx + 1}</span>
                    </div>
                  ))}
                  {editImages.length < 4 && (
                    <div className="border-2 border-dashed border-muted rounded-lg aspect-video flex items-center justify-center cursor-pointer hover:border-primary/40 transition-colors"
                      onClick={() => photoEditRef.current?.click()}>
                      <ImagePlus className="w-5 h-5 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 참석자 서명 링크 */}
            {editingSession && (
              <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground">
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span>서명 현황: <strong className="text-foreground">{editingSession.signedCount}/{editingSession.totalParticipants}명</strong></span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingSession(null)}>취소</Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit} className="gap-1.5" data-testid="button-save-session">
              {savingEdit ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 서명자 목록 확인 다이얼로그 */}
      <Dialog open={!!viewSigSession} onOpenChange={open => { if (!open) setViewSigSession(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Eye className="w-4 h-4 text-indigo-500" />
              서명 현황 — {viewSigSession?.department}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {sigsLoading ? (
              <div className="py-10 text-center text-muted-foreground text-xs">불러오는 중...</div>
            ) : (
              <div className="bg-white text-black text-[10px] p-3 space-y-2">
                {/* 제목 */}
                <div className="text-center font-bold text-[13px] border border-black py-1">
                  "{viewSigSession?.title || task.title}" 참석자 명단
                </div>
                {/* 헤더 정보 */}
                <div className="flex justify-between text-[10px] px-1">
                  <span>□ 시행일시: {viewSigSession?.educationDate}</span>
                  <span>□ 부서명: {viewSigSession?.department}</span>
                </div>
                {/* 2단 서명 테이블 */}
                {(() => {
                  const ROWS = 20;
                  const slots = Array.from({ length: ROWS }, (_, i) => ({
                    left: viewSigs[i] ?? null,
                    right: viewSigs[i + ROWS] ?? null,
                  }));
                  return (
                    <table className="w-full border-collapse border border-black text-[10px]">
                      <thead>
                        <tr className="bg-gray-200">
                          <th className="border border-black px-1 py-1 text-center w-8">순번</th>
                          <th className="border border-black px-1 py-1 text-center w-16">이름</th>
                          <th className="border border-black px-1 py-1 text-center w-16">서명</th>
                          <th className="border border-black px-1 py-1 text-center w-8">순번</th>
                          <th className="border border-black px-1 py-1 text-center w-16">이름</th>
                          <th className="border border-black px-1 py-1 text-center w-16">서명</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slots.map(({ left, right }, i) => (
                          <tr key={i}>
                            <td className="border border-black px-1 py-0.5 text-center">{i + 1}</td>
                            <td className="border border-black px-1 py-0.5 text-center">{left?.signerName ?? ""}</td>
                            <td className="border border-black px-1 py-0 text-center" style={{ height: "22px" }}>
                              {left?.signatureData
                                ? <img src={left.signatureData} alt="서명" className="h-5 mx-auto object-contain" />
                                : ""}
                            </td>
                            <td className="border border-black px-1 py-0.5 text-center">{i + ROWS + 1}</td>
                            <td className="border border-black px-1 py-0.5 text-center">{right?.signerName ?? ""}</td>
                            <td className="border border-black px-1 py-0 text-center" style={{ height: "22px" }}>
                              {right?.signatureData
                                ? <img src={right.signatureData} alt="서명" className="h-5 mx-auto object-contain" />
                                : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
                <div className="flex justify-end gap-6 pt-0.5 text-[10px] text-gray-600">
                  <span>대상인원: <strong className="text-black">{viewSigSession?.totalParticipants}명</strong></span>
                  <span>서명완료: <strong className="text-black">{viewSigs.length}명</strong></span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => copyLink(viewSigSession!.id)} className="gap-1.5 text-xs">
              <Copy className="w-3.5 h-3.5" /> 서명 링크 복사
            </Button>
            <Button size="sm" onClick={() => setViewSigSession(null)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 통합 상세/서명 다이얼로그 */}
      <Dialog open={!!detailSession} onOpenChange={open => { if (!open) setDetailSession(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="text-base font-semibold">
              {detailSession?.department}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {detailSession?.educationType} · {detailSession?.educationDate} ~ {detailSession?.educationEndDate || detailSession?.educationDate} · 강사: {detailSession?.instructor || "-"}
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* 교육내용 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">교육내용</Label>
              <Textarea
                value={detailDesc}
                onChange={e => setDetailDesc(e.target.value)}
                placeholder="교육 내용을 입력하세요..."
                className="min-h-[80px] resize-none text-sm"
                data-testid="textarea-detail-desc"
              />
            </div>

            {/* 교육사진 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">교육사진</Label>
                <span className="text-[10px] text-muted-foreground">{detailImages.length}/4장</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {detailImages.map((img, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden border bg-muted/20 group">
                    <img src={img} alt={`교육사진 ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      onClick={() => setDetailImages(imgs => imgs.filter((_, idx) => idx !== i))}
                    >
                      <XIcon className="w-4 h-4 text-white" />
                    </button>
                  </div>
                ))}
                {detailImages.length < 4 && (
                  <button
                    className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    onClick={() => detailPhotoRef.current?.click()}
                    disabled={detailUploadingPhoto}
                  >
                    {detailUploadingPhoto
                      ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      : <><ImagePlus className="w-4 h-4 text-muted-foreground" /><span className="text-[10px] text-muted-foreground">추가</span></>
                    }
                  </button>
                )}
              </div>
              <input ref={detailPhotoRef} type="file" accept="image/*" multiple className="hidden"
                onChange={e => e.target.files && handleDetailPhotoUpload(e.target.files)} />
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={handleDetailSave} disabled={detailSaving} className="gap-1.5" data-testid="button-detail-save">
                {detailSaving ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                내용 저장
              </Button>
            </div>

            {/* 구분선 */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <PenTool className="w-3.5 h-3.5" /> 서명 ({detailSigs.length}명 완료)
                </Label>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground"
                  onClick={() => copyLink(detailSession!.id)}>
                  <Copy className="w-3 h-3" /> 링크 복사
                </Button>
              </div>

              {/* 서명 입력 */}
              <div className="space-y-2 bg-muted/10 rounded-lg p-3 border">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">이름 *</Label>
                    <Input value={signerName} onChange={e => setSignerName(e.target.value)}
                      placeholder="성명 입력" className="h-8 text-sm" data-testid="input-signer-name" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">소속 (선택)</Label>
                    <Select value={signerDept} onValueChange={setSignerDept}>
                      <SelectTrigger className="h-8 text-sm" data-testid="select-signer-dept">
                        <SelectValue placeholder="소속 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">선택 안함</SelectItem>
                        {(task.headquarters && TEAMS_BY_HQ[task.headquarters]
                          ? TEAMS_BY_HQ[task.headquarters]
                          : DEPARTMENTS
                        ).map(d => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">서명</Label>
                  {sigData ? (
                    <div className="flex items-center gap-3 p-2 border rounded-lg bg-white">
                      <img src={sigData} alt="서명" className="h-12 object-contain flex-1" />
                      <Button variant="outline" size="sm" className="h-7 text-xs shrink-0"
                        onClick={() => { setSigData(""); setSigPadKey(k => k + 1); }}>다시</Button>
                    </div>
                  ) : (
                    <SignaturePad padKey={sigPadKey} onSave={data => setSigData(data)} onClear={() => setSigData("")} />
                  )}
                </div>
                {/* 개인정보 수집·이용 동의 */}
                <div className="space-y-2">
                  <div className="max-h-28 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
                    <p className="font-semibold text-foreground mb-1">개인정보 수집·이용 동의 (필수)</p>
                    <p>본 전자서명은 「개인정보 보호법」 및 「산업안전보건법」에 따라 교육 이수 증빙을 목적으로 다음 정보를 수집합니다.</p>
                    <ul className="mt-1 space-y-0.5 list-disc list-inside">
                      <li>수집 항목: 성명, 소속팀, 서명 이미지, 서명 일시</li>
                      <li>수집 목적: 안전교육 이수 증빙 (중대재해처벌법 대응)</li>
                      <li>보존 기간: 서명일로부터 <strong>3년</strong> (산업안전보건법 제165조)</li>
                      <li>제3자 제공: 관계 법령에 의한 경우 외 제공 없음</li>
                    </ul>
                    <p className="mt-1">귀하는 동의를 거부할 권리가 있으나, 거부 시 교육 서명 등록이 불가합니다.</p>
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer select-none" data-testid="label-consent-inline">
                    <input
                      type="checkbox"
                      checked={consentAgreed}
                      onChange={e => setConsentAgreed(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-primary shrink-0"
                      data-testid="checkbox-consent-inline"
                    />
                    <span className="text-xs text-foreground">
                      위 내용을 숙지하였으며, 본인의 필적으로 전자서명함에 동의합니다. <span className="text-destructive font-medium">(필수)</span>
                    </span>
                  </label>
                </div>

                {signError && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    <span className="mt-0.5 shrink-0">⚠️</span>
                    <span>{signError}</span>
                  </div>
                )}
                <Button className="w-full gap-1.5" disabled={signing || !signerName.trim() || !sigData || !consentAgreed}
                  onClick={handleInlineSign} data-testid="button-inline-sign">
                  {signing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <PenTool className="w-4 h-4" />}
                  서명 제출
                </Button>
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t px-5 py-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setDetailSession(null)}>닫기</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function EducationManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isEditor = user?.role === "admin" || user?.role === "deptHead" || user?.role === "manager";

  const [filterScope, setFilterScope] = useState("전체");
  const [filterField, setFilterField] = useState("전체");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editTask, setEditTask] = useState<EducationTask | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [deleteConfirmIds, setDeleteConfirmIds] = useState<number[]>([]);
  const [confirmConfirmIds, setConfirmConfirmIds] = useState<number[]>([]);
  // 확장 행
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);

  const { data: tasks = [], isLoading } = useQuery<EducationTaskWithLinked[]>({
    queryKey: ["/api/education-tasks"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/education-tasks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/education-tasks"] });
      setRegisterOpen(false);
      setForm(emptyForm());
      toast({ title: "업무가 등록되었습니다." });
    },
    onError: (e: any) => toast({ title: "등록 실패", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PUT", `/api/education-tasks/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/education-tasks"] });
      setEditTask(null);
      setRegisterOpen(false);
      setForm(emptyForm());
      toast({ title: "업무가 수정되었습니다." });
    },
    onError: (e: any) => toast({ title: "수정 실패", description: e.message, variant: "destructive" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("POST", "/api/education-tasks/bulk-delete", { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/education-tasks"] });
      setSelectedIds(new Set());
      setDeleteConfirmIds([]);
      toast({ title: "삭제되었습니다." });
    },
    onError: (e: any) => toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
  });

  const bulkConfirmMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("POST", "/api/education-tasks/bulk-confirm", { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/education-tasks"] });
      setSelectedIds(new Set());
      setConfirmConfirmIds([]);
      toast({ title: "완료 처리되었습니다." });
    },
    onError: (e: any) => toast({ title: "처리 실패", description: e.message, variant: "destructive" }),
  });

  const [bulkCopying, setBulkCopying] = useState(false);
  const handleBulkCopy = async () => {
    const ids = Array.from(selectedIds);
    setBulkCopying(true);
    try {
      for (const id of ids) {
        await fetch(`/api/education-tasks/${id}/copy`, { method: "POST", credentials: "include" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/education-tasks"] });
      toast({ title: `${ids.length}개 교육이 복사되었습니다.` });
    } catch { toast({ title: "복사 실패", variant: "destructive" }); }
    finally { setBulkCopying(false); }
  };

  const filtered = tasks.filter(t => {
    if (filterScope !== "전체" && t.requestScope !== filterScope) return false;
    if (filterField !== "전체" && t.field !== filterField) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const allChecked = paged.length > 0 && paged.every(t => selectedIds.has(t.id));
  const toggleAll = () => {
    const s = new Set(selectedIds);
    if (allChecked) paged.forEach(t => s.delete(t.id));
    else paged.forEach(t => s.add(t.id));
    setSelectedIds(s);
  };
  const toggleOne = (id: number) => {
    const s = new Set(selectedIds);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedIds(s);
  };

  const openRegister = () => {
    setEditTask(null);
    setForm(emptyForm());
    setRegisterOpen(true);
  };
  const openEdit = (t: EducationTask) => {
    setEditTask(t);
    const hqRaw = t.headquarters || "";
    const deptRaw = t.department || "";
    const isHqScope = t.requestScope === "본부";
    const isDesignated = t.requestScope === "지정";
    setForm({
      title: t.title,
      startDate: t.startDate,
      endDate: t.endDate,
      field: t.field,
      requestScope: t.requestScope,
      isRecurring: t.isRecurring,
      taskFields: (t.taskFields as TaskField[]) || [{ type: "Text", title: "" }],
      headquarters: isHqScope ? "" : hqRaw,
      department: isDesignated ? "" : deptRaw,
      requestedBy: t.requestedBy || "",
      selectedHqs: isHqScope ? hqRaw.split(",").filter(Boolean) : [],
      selectedTeams: isDesignated ? deptRaw.split(",").filter(Boolean) : [],
    });
    setRegisterOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title.trim() || !form.startDate || !form.endDate) {
      toast({ title: "업무명, 시작일, 종료일은 필수입니다.", variant: "destructive" });
      return;
    }
    // scope에 따라 headquarters/department 조립
    let hq = form.headquarters;
    let dept = form.department;
    if (form.requestScope === "본부") {
      hq = form.selectedHqs.join(",");
      dept = "";
    } else if (form.requestScope === "지정") {
      // headquarters = 단일 본부 드롭다운, department = 팀 다중선택
      dept = form.selectedTeams.join(",");
    }
    const payload = { ...form, headquarters: hq, department: dept };
    if (editTask) {
      updateMutation.mutate({ id: editTask.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const addTaskField = () => setForm(f => ({ ...f, taskFields: [...f.taskFields, { type: "Text", title: "" }] }));
  const removeTaskField = (i: number) => setForm(f => ({ ...f, taskFields: f.taskFields.filter((_, idx) => idx !== i) }));
  const updateTaskField = (i: number, key: keyof TaskField, value: string) => {
    setForm(f => ({ ...f, taskFields: f.taskFields.map((tf, idx) => idx === i ? { ...tf, [key]: value } : tf) }));
  };

  const handleExport = () => { window.location.href = "/api/education-tasks/export"; };

  const [downloadingTaskId, setDownloadingTaskId] = useState<number | null>(null);
  const handleTaskDownload = async (t: EducationTaskWithLinked) => {
    setDownloadingTaskId(t.id);
    try {
      const res = await fetch(`/api/education-tasks/${t.id}/excel`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "다운로드 실패");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${t.title}_안전보건교육_${t.startDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "교육일지 엑셀이 다운로드되었습니다." });
    } catch (e: any) {
      toast({ title: "다운로드 실패", description: e.message, variant: "destructive" });
    } finally {
      setDownloadingTaskId(null);
    }
  };

  // 행 확장 토글
  const toggleExpand = (id: number) => {
    setExpandedTaskId(prev => prev === id ? null : id);
  };

  const statusBadge = (t: EducationTask) => {
    if (t.status === "완료") return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">완료</Badge>;
    return <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px]">미완료</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <CheckCircle2 className="w-6 h-6 text-primary" />
          교육업무 관리
        </h1>
      </div>

      {/* 기능 안내 배너 */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5 text-primary" /><strong className="text-foreground">자동 연동</strong> — 🔗 아이콘은 서명률이 완료율로 자동 반영됨을 표시</span>
        <span className="flex items-center gap-1.5"><ChevronDown className="w-3.5 h-3.5 text-primary" /><strong className="text-foreground">세션 보기</strong> — 행 클릭으로 연결된 교육일지 현황 인라인 확인</span>
      </div>

      {/* 필터 영역 */}
      <div className="bg-card border rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">요청 범위</Label>
            <Select value={filterScope} onValueChange={v => { setFilterScope(v); setPage(1); }}>
              <SelectTrigger className="w-32 h-9" data-testid="select-filter-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="전체">전체</SelectItem>
                {SCOPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">업무 분야</Label>
            <Select value={filterField} onValueChange={v => { setFilterField(v); setPage(1); }}>
              <SelectTrigger className="w-32 h-9" data-testid="select-filter-field">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="전체">전체</SelectItem>
                {FIELDS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-48">
            <Label className="text-xs text-muted-foreground">업무 검색</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-9"
                placeholder="업무명을 입력하세요"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                data-testid="input-search"
              />
            </div>
          </div>
          {(filterScope !== "전체" || filterField !== "전체" || search) && (
            <Button variant="ghost" size="sm" className="h-9" onClick={() => { setFilterScope("전체"); setFilterField("전체"); setSearch(""); setPage(1); }}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> 초기화
            </Button>
          )}
        </div>
      </div>

      {/* 액션 바 + 테이블 */}
      <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
        <div className="flex flex-wrap gap-2 items-center justify-between px-4 py-3 border-b bg-muted/30">
          {/* 왼쪽: 전체 선택 */}
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allChecked}
              onCheckedChange={toggleAll}
              data-testid="checkbox-all"
            />
            <span className="text-xs text-muted-foreground">
              {selectedIds.size > 0 ? `${selectedIds.size}개 선택됨` : "전체 선택"}
            </span>
          </div>

          {/* 오른쪽: 액션 버튼 */}
          <div className="flex flex-wrap gap-2 items-center">
            {isEditor && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1"
                  disabled={selectedIds.size === 0}
                  onClick={() => setConfirmConfirmIds(Array.from(selectedIds))}
                  data-testid="button-bulk-confirm"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Confirm
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1 text-violet-600 border-violet-300 hover:bg-violet-50"
                  disabled={selectedIds.size === 0 || bulkCopying}
                  onClick={handleBulkCopy}
                  data-testid="button-bulk-copy"
                >
                  {bulkCopying
                    ? <div className="w-3.5 h-3.5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                    : <Files className="w-3.5 h-3.5" />
                  }
                  복사하기
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1 text-destructive hover:text-destructive"
                  disabled={selectedIds.size === 0}
                  onClick={() => setDeleteConfirmIds(Array.from(selectedIds))}
                  data-testid="button-bulk-delete"
                >
                  <Trash2 className="w-3.5 h-3.5" /> 삭제
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={openRegister}
                  data-testid="button-register"
                >
                  <Plus className="w-3.5 h-3.5" /> 등록
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
              onClick={handleExport}
              data-testid="button-excel-export"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel 다운로드
            </Button>
          </div>
        </div>

        {/* 테이블 헤더 */}
        <div className="flex items-center px-4 py-2 border-b bg-muted/40 text-[11px] font-semibold text-muted-foreground select-none">
          <div className="w-5 shrink-0" />
          <div className="w-10 shrink-0 text-center">ID</div>
          <div className="flex-1 min-w-0 pl-2">제목</div>
          <div className="w-[84px] shrink-0 text-center">시작일</div>
          <div className="w-[84px] shrink-0 text-center">종료일</div>
          <div className="w-12 shrink-0 text-center">완료율</div>
          <div className="w-[68px] shrink-0 text-center">분야</div>
          <div className="w-[72px] shrink-0 text-center">본부</div>
          <div className="w-[60px] shrink-0 text-center">대상인원</div>
          <div className="w-14 shrink-0 text-center">요청자</div>
          <div className="w-8 shrink-0 text-center">반복</div>
          <div className="w-[76px] shrink-0 text-center">등록일</div>
          <div className="w-[88px] shrink-0" />
        </div>

        {/* 리스트 */}
        <div className="divide-y">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3">
                <div className="w-5 h-4 bg-muted rounded animate-pulse" />
                <div className="w-8 h-4 bg-muted rounded animate-pulse" />
                <div className="flex-1 h-4 bg-muted rounded animate-pulse" />
                <div className="w-40 h-4 bg-muted rounded animate-pulse" />
              </div>
            ))
          ) : paged.length === 0 ? (
            <div className="px-4 py-16 text-center text-muted-foreground text-sm">
              등록된 업무가 없습니다.
            </div>
          ) : (
            paged.map(t => {
              const isExpanded = expandedTaskId === t.id;
              const createdAtStr = (t as any).createdAt
                ? new Date((t as any).createdAt).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })
                : '-';
              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  data-testid={`card-task-${t.id}`}
                  className="group"
                >
                  {/* 행 */}
                  <div
                    className={`flex items-center px-4 py-2.5 cursor-pointer transition-colors ${isExpanded ? "bg-primary/5" : "hover:bg-muted/20"}`}
                    onClick={() => toggleExpand(t.id)}
                  >
                    {/* 체크박스 */}
                    <div className="w-5 shrink-0" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(t.id)}
                        onCheckedChange={() => toggleOne(t.id)}
                        data-testid={`checkbox-task-${t.id}`}
                      />
                    </div>

                    {/* ID */}
                    <div className="w-10 shrink-0 text-center text-xs text-muted-foreground">{t.id}</div>

                    {/* 제목 */}
                    <div className="flex-1 min-w-0 pl-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium leading-snug truncate max-w-[240px]">{t.title}</span>
                        {statusBadge(t)}
                        {(t.linkedSessionCount ?? 0) > 0 && (
                          <Badge variant="outline" className="text-[10px] text-primary border-primary/40 gap-0.5 shrink-0">
                            <Link2 className="w-2.5 h-2.5" />
                            서명 {t.completionRate}%
                          </Badge>
                        )}
                      </div>
                      {(t.linkedSessionCount ?? 0) > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {t.linkedSessionCount}개 부서
                        </div>
                      )}
                    </div>

                    {/* 시작일 */}
                    <div className="w-[84px] shrink-0 text-center text-xs text-muted-foreground">{t.startDate}</div>

                    {/* 종료일 */}
                    <div className="w-[84px] shrink-0 text-center text-xs text-muted-foreground">{t.endDate}</div>

                    {/* 완료율 */}
                    <div className="w-12 shrink-0 text-center text-xs font-semibold text-foreground">{t.completionRate ?? 0}%</div>

                    {/* 분야 */}
                    <div className="w-[68px] shrink-0 text-center text-xs text-muted-foreground truncate px-0.5">{t.field || '-'}</div>

                    {/* 본부 */}
                    <div className="w-[72px] shrink-0 text-center text-xs text-muted-foreground truncate px-0.5">{(t.headquarters || t.requestScope || '-').replace('본부', '')}</div>

                    {/* 대상인원 */}
                    <div className="w-[60px] shrink-0 text-center text-xs font-semibold text-primary">{t.totalParticipantsSum ?? 0}명</div>

                    {/* 요청자 */}
                    <div className="w-14 shrink-0 text-center text-xs text-muted-foreground truncate">{t.requestedBy || '-'}</div>

                    {/* 반복 */}
                    <div className="w-8 shrink-0 text-center text-xs">
                      {t.isRecurring ? <span className="text-primary font-semibold">Y</span> : <span className="text-muted-foreground">-</span>}
                    </div>

                    {/* 등록일 */}
                    <div className="w-[76px] shrink-0 text-center text-[10px] text-muted-foreground">{createdAtStr}</div>

                    {/* 액션 버튼들 */}
                    <div
                      className="w-[88px] shrink-0 flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={e => e.stopPropagation()}
                    >
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-emerald-600"
                        title="교육일지 엑셀 다운로드"
                        onClick={() => handleTaskDownload(t)}
                        disabled={downloadingTaskId === t.id}
                        data-testid={`button-download-task-${t.id}`}
                      >
                        {downloadingTaskId === t.id
                          ? <div className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                          : <Download className="w-3.5 h-3.5" />
                        }
                      </Button>
                      {isEditor && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-blue-500"
                            title="수정"
                            onClick={() => openEdit(t)}
                            data-testid={`button-edit-task-${t.id}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground"
                        data-testid={`button-expand-task-${t.id}`}
                        onClick={() => toggleExpand(t.id)}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  {/* 확장 패널: 연결된 교육일지 부서 리스트 */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                      >
                        <LinkedSessionsPanel taskId={t.id} task={t} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}
        </div>

        {/* 페이지네이션 */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t bg-muted/10 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="text-xs">Page Size:</span>
            <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-7 w-16 text-xs" data-testid="select-page-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs mr-2">
              {filtered.length > 0 ? `${(page - 1) * pageSize + 1} to ${Math.min(page * pageSize, filtered.length)} of ${filtered.length}` : "0 건"}
            </span>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page === 1} onClick={() => setPage(1)} data-testid="button-page-first"><ChevronsLeft className="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page === 1} onClick={() => setPage(p => p - 1)} data-testid="button-page-prev"><ChevronLeft className="w-3.5 h-3.5" /></Button>
            <span className="text-xs px-2">Page {page} of {totalPages}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-page-next"><ChevronRight className="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page === totalPages} onClick={() => setPage(totalPages)} data-testid="button-page-last"><ChevronsRight className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      </div>

      {/* 등록/수정 모달 */}
      <Dialog open={registerOpen} onOpenChange={v => { if (!v) { setRegisterOpen(false); setEditTask(null); setForm(emptyForm()); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              {editTask ? "업무 수정" : "업무 등록"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* 업무명 */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 font-semibold text-sm">
                <Pencil className="w-3.5 h-3.5 text-primary" /> 업무명 <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="업무 이름을 입력하세요"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                data-testid="input-task-title"
              />
            </div>

            {/* 시행기간 */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 font-semibold text-sm">
                📅 시행기간 <span className="text-destructive">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">시작일</Label>
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    data-testid="input-start-date"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">종료일</Label>
                  <Input
                    type="date"
                    value={form.endDate}
                    onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                    data-testid="input-end-date"
                  />
                </div>
              </div>
            </div>

            {/* 업무 분야 */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 font-semibold text-sm">
                🏷️ 업무 분야 <span className="text-destructive">*</span>
              </Label>
              <RadioGroup
                value={form.field}
                onValueChange={v => setForm(f => ({ ...f, field: v }))}
                className="flex flex-wrap gap-x-6 gap-y-2"
                data-testid="radio-field"
              >
                {FIELDS.map(fd => (
                  <div key={fd} className="flex items-center gap-2">
                    <RadioGroupItem value={fd} id={`field-${fd}`} data-testid={`radio-field-${fd}`} />
                    <Label htmlFor={`field-${fd}`} className="cursor-pointer text-sm">{fd}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* 요청 구분 */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 font-semibold text-sm">
                👥 요청 구분 <span className="text-destructive">*</span>
              </Label>
              <RadioGroup
                value={form.requestScope}
                onValueChange={v => setForm(f => ({ ...f, requestScope: v }))}
                className="flex flex-wrap gap-x-5 gap-y-2"
                data-testid="radio-scope"
              >
                {SCOPES.map(sc => (
                  <div key={sc} className="flex items-center gap-2">
                    <RadioGroupItem value={sc} id={`scope-${sc}`} data-testid={`radio-scope-${sc}`} />
                    <Label htmlFor={`scope-${sc}`} className="cursor-pointer text-sm">{sc}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* 대상 선택 — requestScope에 따라 동적 UI */}
            {form.requestScope === "본부" && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 font-semibold text-sm">
                  <span className="w-3 h-3 bg-primary rounded-sm inline-block" />
                  대상 본부 선택<span className="text-destructive">*</span>
                  <span className="font-normal text-muted-foreground text-xs">(2개 이상 선택 가능)</span>
                </Label>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                  {HQ_OPTIONS.map(hq => (
                    <div key={hq} className="flex items-center gap-2">
                      <Checkbox
                        id={`hq-${hq}`}
                        checked={form.selectedHqs.includes(hq)}
                        onCheckedChange={checked => setForm(f => ({
                          ...f,
                          selectedHqs: checked
                            ? [...f.selectedHqs, hq]
                            : f.selectedHqs.filter(h => h !== hq),
                        }))}
                        data-testid={`checkbox-hq-${hq}`}
                      />
                      <Label htmlFor={`hq-${hq}`} className="cursor-pointer text-sm">{hq}</Label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">✓ 선택된 본부의 모든 사용자에게 업무가 생성됩니다.</p>
              </div>
            )}

            {form.requestScope === "지정" && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 font-semibold text-sm">
                  대상 본부 및 팀 선택<span className="text-destructive">*</span>
                </Label>
                <div className="grid grid-cols-2 gap-4">
                  {/* 본부 드롭다운 */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">본부</Label>
                    <Select
                      value={form.headquarters}
                      onValueChange={v => setForm(f => ({ ...f, headquarters: v, selectedTeams: [] }))}
                    >
                      <SelectTrigger data-testid="select-hq-designated">
                        <SelectValue placeholder="본부를 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        {HQ_OPTIONS.map(hq => <SelectItem key={hq} value={hq}>{hq}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* 팀 다중선택 listbox */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">팀(다중 선택 가능)</Label>
                    <div
                      className="border rounded-md h-36 overflow-y-auto bg-background"
                      data-testid="listbox-teams"
                    >
                      {!form.headquarters ? (
                        <p className="text-xs text-muted-foreground p-3">본부를 먼저 선택하세요</p>
                      ) : (TEAMS_BY_HQ[form.headquarters] || []).length === 0 ? (
                        <p className="text-xs text-muted-foreground p-3">해당 본부에 팀 정보가 없습니다</p>
                      ) : (
                        (TEAMS_BY_HQ[form.headquarters] || []).map(team => (
                          <div
                            key={team}
                            onClick={() => setForm(f => ({
                              ...f,
                              selectedTeams: f.selectedTeams.includes(team)
                                ? f.selectedTeams.filter(t => t !== team)
                                : [...f.selectedTeams, team],
                            }))}
                            className={`px-3 py-1.5 text-sm cursor-pointer select-none transition-colors ${
                              form.selectedTeams.includes(team)
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-muted/60"
                            }`}
                            data-testid={`team-option-${team}`}
                          >
                            {team}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">✓ Ctrl+클릭 또는 Shift+클릭으로 여러 팀을 선택할 수 있습니다.</p>
              </div>
            )}

            {/* 요청자 (전사/안전보건업무 부서/지정 공통) */}
            <div className={`grid gap-3 ${form.requestScope === "본부" ? "grid-cols-1" : "grid-cols-2"}`}>
              {(form.requestScope === "전사" || form.requestScope === "안전보건업무 부서") && (
                <div className="space-y-1.5">
                  <Label className="text-sm">본부/부서</Label>
                  <Input
                    placeholder="예: 대구본부"
                    value={form.headquarters}
                    onChange={e => setForm(f => ({ ...f, headquarters: e.target.value }))}
                    data-testid="input-headquarters"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-sm">요청자</Label>
                <Input
                  placeholder="이름"
                  value={form.requestedBy}
                  onChange={e => setForm(f => ({ ...f, requestedBy: e.target.value }))}
                  data-testid="input-requested-by"
                />
              </div>
            </div>

            {/* 반복 여부 */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="recurring"
                checked={form.isRecurring}
                onCheckedChange={v => setForm(f => ({ ...f, isRecurring: !!v }))}
                data-testid="checkbox-recurring"
              />
              <Label htmlFor="recurring" className="cursor-pointer text-sm flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" /> 반복 업무로 등록
              </Label>
            </div>

            {/* 요청 내역 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 font-semibold text-sm">
                  ≡ 요청 내역
                </Label>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addTaskField} data-testid="button-add-field">
                  <Plus className="w-3 h-3" /> 행 추가
                </Button>
              </div>
              <div className="space-y-2">
                <AnimatePresence>
                  {form.taskFields.map((tf, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="flex gap-2 items-start p-3 border rounded-lg bg-muted/20"
                    >
                      <div className="flex flex-col gap-1 shrink-0">
                        <Label className="text-[10px] text-muted-foreground">타입</Label>
                        <Select value={tf.type} onValueChange={v => updateTaskField(i, "type", v)}>
                          <SelectTrigger className="h-8 w-24 text-xs" data-testid={`select-field-type-${i}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FIELD_TYPES.map(ft => <SelectItem key={ft} value={ft}>{ft}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1 flex flex-col gap-1">
                        <Label className="text-[10px] text-muted-foreground">입력 필드</Label>
                        <Input
                          className="h-8 text-sm"
                          placeholder="질문 제목을 입력하세요"
                          value={tf.title}
                          onChange={e => updateTaskField(i, "title", e.target.value)}
                          data-testid={`input-field-title-${i}`}
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="destructive"
                        className="h-8 w-8 shrink-0 mt-5"
                        onClick={() => removeTaskField(i)}
                        data-testid={`button-remove-field-${i}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setRegisterOpen(false); setEditTask(null); setForm(emptyForm()); }} data-testid="button-cancel">
              <X className="w-4 h-4 mr-1" /> 취소
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit"
            >
              <CheckCircle2 className="w-4 h-4 mr-1" />
              {editTask ? "수정 완료" : "업무 등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 */}
      <AlertDialog open={deleteConfirmIds.length > 0} onOpenChange={v => { if (!v) setDeleteConfirmIds([]); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>업무 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {deleteConfirmIds.length}개 업무를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => bulkDeleteMutation.mutate(deleteConfirmIds)}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm 확인 */}
      <AlertDialog open={confirmConfirmIds.length > 0} onOpenChange={v => { if (!v) setConfirmConfirmIds([]); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>업무 완료 처리</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {confirmConfirmIds.length}개 업무를 완료 처리하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => bulkConfirmMutation.mutate(confirmConfirmIds)}>
              완료 처리
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
