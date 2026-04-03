import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Upload, FileSpreadsheet, Download, Trash2, CalendarCheck,
  Clock, CheckCircle2, X, Loader2, ClipboardPaste, Copy, Check, Mail, Wand2
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface WorkPlan {
  id: number;
  title: string;
  originalFileName: string | null;
  originalFileUrl: string | null;
  processedFileUrl: string | null;
  emailDraft: string | null;
  sheetSummary: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface UploadResult {
  plan: WorkPlan;
  emailDraft: string;
  processedFileUrl?: string;
}

// 헤더 정규화: 보이지 않는 특수문자·BOM·공백 제거
function normalizeKey(s: string): string {
  return s.replace(/[\u200B-\u200D\uFEFF\u00A0\r]/g, "").trim();
}

// MOSS 붙여넣기 데이터 파싱
// MOSS 복사 형식: 헤더는 탭 구분, 데이터는 "셀값 한 줄 + 빈 줄 구분자" 형식
// 예) col0_value \n (빈줄) \n col1_value \n (빈줄) \n ... → 컬럼N개 × 2줄 = 레코드 1개
function parseMossData(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // 빈 줄 포함 전체 분리 (filter 금지 — 빈 줄이 컬럼 구분자)
  const allLines = text.split(/\r?\n/);
  if (allLines.length < 2) return { headers: [], rows: [] };

  // 첫 줄: 탭 구분 헤더
  const headers = allLines[0].split("\t").map(h => normalizeKey(h)).filter(h => h !== "");
  if (headers.length < 2) return { headers: [], rows: [] };

  const dataLines = allLines.slice(1);

  // 형식 감지: 첫 번째 비어있지 않은 데이터 줄에 탭이 있으면 탭 구분 형식
  const firstNonEmpty = dataLines.find(l => l.trim() !== "") || "";
  const isTabFormat = firstNonEmpty.includes("\t");

  const rows: Record<string, string>[] = [];

  if (isTabFormat) {
    // 탭 구분 형식 (구형): 각 줄 = 레코드 1개
    for (const line of dataLines) {
      if (!line.trim()) continue;
      const cells = line.split("\t").map(c => normalizeKey(c));
      const record: Record<string, string> = {};
      headers.forEach((h, ci) => { record[h] = cells[ci] || ""; });
      if (headers.some(h => h.includes("공사작업번호") && record[h])) rows.push(record);
    }
  } else {
    // 세로 형식 (MOSS 신형): col k 값 = dataLines[recordStart + k*2]
    // MOSS는 마지막 컬럼이 비어있을 때 trailing 구분자(빈줄)를 생략하는 경우가 있어
    // 고정 linesPerRecord 이동 대신, 공사작업번호 패턴으로 각 레코드 시작 위치를 탐색한다.
    const numCols = headers.length;

    // 공사작업번호 패턴: "도급-xxx-YYYYMMDD-XXXX" 형식 (-8자리숫자-4자리숫자 포함)
    const workOrderPattern = /-\d{8}-\d{4}/;
    const recordStarts: number[] = [];
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i]?.trim() || "";
      if (line && workOrderPattern.test(line)) {
        recordStarts.push(i);
      }
    }

    for (const startPos of recordStarts) {
      const record: Record<string, string> = {};
      for (let col = 0; col < numCols; col++) {
        record[headers[col]] = normalizeKey(dataLines[startPos + col * 2] || "");
      }
      if (headers.some(h => h.includes("공사작업번호") && record[h])) rows.push(record);
    }
  }

  return { headers, rows };
}

// 텍스트 초안 → 서식 있는 HTML 변환 (표 + 가이드 이미지 base64 내장)
function buildHtmlFromDraft(draft: string, guideImageDataUrl?: string): string {
  const lines = draft.split("\n");
  const tableStartIdx = lines.findIndex(l => l.startsWith("※"));
  const guideImgHtml = guideImageDataUrl
    ? `<br><br><div style="margin-top:8px"><img src="${guideImageDataUrl}" style="max-width:100%;border:1px solid #ddd;border-radius:4px" alt="안전활동 사진 등록 가이드" /></div>`
    : "";

  if (tableStartIdx === -1) {
    return `<div style="font-family:맑은고딕,sans-serif;font-size:13px">${lines.map(l => l.trim() === "" ? "<br>" : `<p style="margin:2px 0">${l}</p>`).join("")}${guideImgHtml}</div>`;
  }
  const bodyHtml = lines.slice(0, tableStartIdx).map(l =>
    l.trim() === "" ? "<br>" : `<p style="margin:2px 0">${l}</p>`
  ).join("");
  const titleLine = lines[tableStartIdx];
  const tableLines = lines.slice(tableStartIdx + 1).filter(l => l.trim() !== "");
  let tableHtml = "";
  if (tableLines.length >= 2) {
    const thHtml = tableLines[0].split("\t").map(h =>
      `<th style="border:1px solid #999;padding:4px 8px;background:#f0f0f0;white-space:nowrap;font-size:12px">${h}</th>`
    ).join("");
    const tdRows = tableLines.slice(1).map(row =>
      `<tr>${row.split("\t").map(c => `<td style="border:1px solid #999;padding:4px 8px;font-size:12px;white-space:nowrap">${c}</td>`).join("")}</tr>`
    ).join("");
    tableHtml = `<p style="margin:8px 0 4px 0"><strong>${titleLine}</strong></p><table style="border-collapse:collapse"><thead><tr>${thHtml}</tr></thead><tbody>${tdRows}</tbody></table>`;
  }
  return `<div style="font-family:맑은고딕,sans-serif;font-size:13px">${bodyHtml}${tableHtml}${guideImgHtml}</div>`;
}

// 이메일 초안 생성
function buildEmailDraft(rows: Record<string, string>[], title: string): string {
  const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
  const nextBizDay = new Date();
  const todayDay = nextBizDay.getDay();
  const daysToAdd = todayDay === 5 ? 3 : todayDay === 6 ? 2 : 1; // 금→월(+3), 토→월(+2), 그 외→다음날(+1)
  nextBizDay.setDate(nextBizDay.getDate() + daysToAdd);
  const dateStr = `${String(nextBizDay.getFullYear()).slice(2)}.${String(nextBizDay.getMonth() + 1).padStart(2, "0")}.${String(nextBizDay.getDate()).padStart(2, "0")}(${DAYS[nextBizDay.getDay()]})`;

  const emailCols = [
    "공사작업번호",
    "부/팀",
    "작업자",
    "공사내용",
    "공사/작업시작일",
    "공사/작업종료일",
    "주소",
    "순회점검대상자",
  ];

  const hdrLine = emailCols.join("\t");
  const dataLines = rows.map(row =>
    emailCols.map(col => {
      if (col === "공사내용" && !row[col]) return row["공사명"] || "";
      return row[col] || "";
    }).join("\t")
  );

  const tableText = [hdrLine, ...dataLines].join("\n");

  return [
    `안녕하십니까 현장경영팀입니다.`,
    ``,
    `${dateStr} 입회 작업에 대한 MOSS 내 순회점검 등록 요청드립니다.`,
    ``,
    `순회점검 등록방법 확인 필요 시 첨부파일 참조 부탁드리며, TBM 및 순회점검 등록사진 예시 참조하시어 등록 부탁드립니다.`,
    ``,
    `★입회자 변경, 작업 취소 등 변경사항 있으시면 연락 부탁드립니다.★`,
    ``,
    `문의사항 있으시면 연락 부탁드립니다.`,
    ``,
    `감사합니다`,
    ``,
    ``,
    `※ ${dateStr} 작업 계획`,
    tableText,
  ].join("\n");
}

export default function WorkPlan() {
  const { canEditSubcontract } = usePermissions();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"paste" | "file" | "subcontract">("paste");
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [pastedText, setPastedText] = useState("");
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = useState("");
  const [inspectorEdits, setInspectorEdits] = useState<Record<number, string>>({});

  const [planTitle, setPlanTitle] = useState("");
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<WorkPlan | null>(null);

  const [inspectorDialogOpen, setInspectorDialogOpen] = useState(false);

  // 생성된 초안 및 복사 상태
  const [generatedDraft, setGeneratedDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 하도급 메일 파싱
  const [subEmailText, setSubEmailText] = useState("");
  const [subResult, setSubResult] = useState<{ parsed: any; emailDraft: string; subject: string } | null>(null);
  const [subCopied, setSubCopied] = useState(false);
  const [subCopiedDraft, setSubCopiedDraft] = useState(false);

  // 가이드 이미지 base64 (컴포넌트 마운트 시 미리 로드)
  const [guideImageDataUrl, setGuideImageDataUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    fetch("/public-assets/work-plan-guide.png")
      .then(res => res.blob())
      .then(blob => new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      }))
      .then(dataUrl => setGuideImageDataUrl(dataUrl))
      .catch(() => {});
  }, []);

  const { data: workPlans = [], isLoading } = useQuery<WorkPlan[]>({
    queryKey: ["/api/work-plans"],
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, title }: { file: File; title: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      if (title) formData.append("title", title);
      const res = await fetch("/api/work-plans/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "업로드 실패" }));
        throw new Error(err.message || "업로드에 실패했습니다");
      }
      return res.json() as Promise<UploadResult>;
    },
    onSuccess: (data) => {
      setUploadResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/work-plans"] });
      toast({ title: "처리 완료", description: "파일 포맷팅이 완료되었습니다." });
    },
    onError: (err: any) => {
      toast({ title: "오류", description: err.message, variant: "destructive" });
    },
  });

  const pasteMutation = useMutation({
    mutationFn: async ({ rows, title, emailDraft }: { rows: Record<string, string>[]; title: string; emailDraft: string }) => {
      const res = await fetch("/api/work-plans/from-paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rows, title, emailDraft }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "저장 실패" }));
        throw new Error(err.message || "저장에 실패했습니다");
      }
      return res.json() as Promise<UploadResult>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-plans"] });
    },
    onError: (err: any) => {
      toast({ title: "오류", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/work-plans/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-plans"] });
      if (selectedPlan) setSelectedPlan(null);
      toast({ title: "삭제 완료" });
    },
    onError: () => {
      toast({ title: "삭제 실패", variant: "destructive" });
    },
  });

  const handleParse = () => {
    setParseError("");
    if (!pastedText.trim()) {
      setParseError("데이터를 붙여넣어 주세요.");
      return;
    }
    const { headers, rows } = parseMossData(pastedText);
    if (rows.length === 0) {
      setParseError("데이터를 인식할 수 없습니다. MOSS에서 헤더 포함하여 전체 복사 후 붙여넣기 확인해주세요.");
      return;
    }
    setParsedRows(rows);
    setInspectorEdits({});
    if (!planTitle) {
      const now = new Date();
      const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
      setPlanTitle(`${now.getFullYear().toString().slice(2)}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}(${DAYS[now.getDay()]}) 작업계획`);
    }
    setInspectorDialogOpen(true);
  };

  const getMergedRows = () =>
    parsedRows.map((row, i) => ({
      ...row,
      "순회점검대상자": inspectorEdits[i] ?? row["순회점검대상자"] ?? "",
    }));

  const handleFileSelect = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast({ title: "형식 오류", description: "엑셀(.xlsx, .xls) 또는 CSV 파일만 업로드 가능합니다", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
    setUploadResult(null);
    if (!planTitle) setPlanTitle(file.name.replace(/\.[^.]+$/, ""));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const handleReset = () => {
    setSelectedFile(null);
    setPastedText("");
    setParsedRows([]);
    setParseError("");
    setInspectorEdits({});
    setUploadResult(null);
    setGeneratedDraft(null);
    setCopied(false);
    setPlanTitle("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 다이얼로그 확인: 초안 생성 후 DB 저장
  const handleDialogConfirm = () => {
    const title = planTitle || "작업계획";
    const mergedRows = getMergedRows();
    const draft = buildEmailDraft(mergedRows, title);
    pasteMutation.mutate({ rows: mergedRows, title, emailDraft: draft });
    setGeneratedDraft(draft);
    setCopied(false);
    setInspectorDialogOpen(false);
  };

  // 전체 복사 (표 서식 + 가이드 이미지 base64 내장 HTML)
  const handleCopyAll = async () => {
    if (!generatedDraft) return;
    const html = buildHtmlFromDraft(generatedDraft, guideImageDataUrl);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([generatedDraft], { type: "text/plain" }),
        }),
      ]);
      setCopied(true);
      toast({ title: "복사 완료", description: "표 서식과 이미지가 포함된 내용이 복사되었습니다. 이메일에 바로 붙여넣기 하세요." });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // 폴백: 일반 텍스트 복사
      navigator.clipboard.writeText(generatedDraft).then(() => {
        setCopied(true);
        toast({ title: "복사 완료", description: "이메일 내용이 복사되었습니다." });
        setTimeout(() => setCopied(false), 2500);
      });
    }
  };

  // 이력에서 초안 복사 (표 서식 + 이미지 base64 내장)
  const handleCopyPlanDraft = async (draft: string) => {
    const html = buildHtmlFromDraft(draft, guideImageDataUrl);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([draft], { type: "text/plain" }),
        }),
      ]);
      toast({ title: "복사 완료", description: "표 서식과 이미지가 포함된 내용이 복사되었습니다." });
    } catch {
      navigator.clipboard.writeText(draft).then(() => {
        toast({ title: "복사 완료", description: "클립보드에 복사되었습니다." });
      });
    }
  };

  // 하도급 메일 파싱 mutation
  const subEmailMutation = useMutation({
    mutationFn: async (emailText: string) => {
      const res = await fetch("/api/work-plans/parse-subcontract-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emailText }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "처리 실패" }));
        throw new Error(err.message || "처리에 실패했습니다");
      }
      return res.json() as Promise<{ parsed: any; emailDraft: string; subject: string }>;
    },
    onSuccess: (data) => {
      setSubResult(data);
      setSubCopied(false);
      setSubCopiedDraft(false);
      toast({ title: "초안 생성 완료", description: "하도급 작업계획 이메일 초안이 생성되었습니다." });
    },
    onError: (err: any) => {
      toast({ title: "처리 실패", description: err.message, variant: "destructive" });
    },
  });

  const handleSubEmailParse = () => {
    if (!subEmailText.trim()) {
      toast({ title: "메일 내용 없음", description: "하도급 업체 메일 내용을 붙여넣어 주세요.", variant: "destructive" });
      return;
    }
    setSubResult(null);
    subEmailMutation.mutate(subEmailText);
  };

  const handleCopySubSubject = () => {
    if (!subResult) return;
    navigator.clipboard.writeText(subResult.subject).then(() => {
      setSubCopied(true);
      toast({ title: "제목 복사됨" });
      setTimeout(() => setSubCopied(false), 2000);
    });
  };

  const handleCopySubDraft = () => {
    if (!subResult) return;
    navigator.clipboard.writeText(subResult.emailDraft).then(() => {
      setSubCopiedDraft(true);
      toast({ title: "본문 복사됨", description: "이메일에 붙여넣기 하세요." });
      setTimeout(() => setSubCopiedDraft(false), 2000);
    });
  };

  const isPending = uploadMutation.isPending || pasteMutation.isPending;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-50">
          <CalendarCheck className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">작업계획</h1>
          <p className="text-sm text-muted-foreground">MOSS 작업 데이터를 붙여넣으면 순회점검 등록요청 이메일 내용이 자동 생성됩니다</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 왼쪽: 입력 + 결과 */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
                <button
                  onClick={() => setMode("paste")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                    mode === "paste" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="tab-paste-mode"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  붙여넣기
                </button>
                <button
                  onClick={() => setMode("file")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                    mode === "file" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="tab-file-mode"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  파일 업로드
                </button>
                <button
                  onClick={() => setMode("subcontract")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                    mode === "subcontract" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="tab-subcontract-mode"
                >
                  <Mail className="w-3.5 h-3.5" />
                  하도급 메일
                </button>
              </div>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
              {mode !== "subcontract" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="plan-title" className="text-sm font-medium">작업계획 제목</Label>
                  <Input
                    id="plan-title"
                    data-testid="input-plan-title"
                    placeholder="예: 26.03.19(목) 작업계획"
                    value={planTitle}
                    onChange={(e) => setPlanTitle(e.target.value)}
                  />
                </div>
              )}

              {/* 붙여넣기 모드 */}
              {mode === "paste" && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-medium">
                      MOSS 작업 데이터 붙여넣기
                      <span className="ml-2 text-xs font-normal text-muted-foreground">(헤더 포함하여 전체 복사 후 붙여넣기)</span>
                    </Label>
                    <Textarea
                      data-testid="textarea-paste-input"
                      placeholder={"공사작업번호\t합동점검단계\t...\n도급-무선기지국-20260318-0057\t..."}
                      value={pastedText}
                      onChange={(e) => { setPastedText(e.target.value); setParsedRows([]); setParseError(""); setGeneratedDraft(null); }}
                      rows={6}
                      className="font-mono text-xs resize-y"
                    />
                    {parseError && (
                      <p className="text-xs text-destructive">{parseError}</p>
                    )}
                  </div>

                  {parsedRows.length > 0 && !generatedDraft && (
                    <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 flex items-center justify-between">
                      <p className="text-xs font-semibold text-green-700 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        {parsedRows.length}건 인식 완료
                      </p>
                      <Button size="sm" variant="outline" className="h-6 text-[11px] px-2 border-green-400 text-green-700 hover:bg-green-100"
                        onClick={() => setInspectorDialogOpen(true)} data-testid="button-reopen-inspector-dialog">
                        다시 편집
                      </Button>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {parsedRows.length === 0 ? (
                      <Button
                        data-testid="button-parse"
                        onClick={handleParse}
                        className="flex-1"
                        disabled={!pastedText.trim()}
                      >
                        <ClipboardPaste className="w-4 h-4 mr-2" />
                        데이터 분석
                      </Button>
                    ) : (
                      <Button
                        data-testid="button-open-inspector"
                        onClick={() => setInspectorDialogOpen(true)}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <ClipboardPaste className="w-4 h-4 mr-2" />순회점검대상자 입력
                      </Button>
                    )}
                    {(pastedText || parsedRows.length > 0 || uploadResult || generatedDraft) && (
                      <Button variant="outline" size="icon" onClick={handleReset} data-testid="button-reset">
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* 파일 업로드 모드 */}
              {mode === "file" && (
                <div className="flex flex-col gap-3">
                  <div
                    className={cn(
                      "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
                      isDragOver ? "border-blue-500 bg-blue-50" : "border-muted-foreground/25 hover:border-blue-400 hover:bg-muted/30",
                      selectedFile && !uploadResult && "border-green-400 bg-green-50"
                    )}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="dropzone-excel"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                    />
                    {selectedFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <FileSpreadsheet className="w-10 h-10 text-green-600" />
                        <p className="font-semibold text-green-700">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Upload className="w-10 h-10 opacity-40" />
                        <p className="font-medium">파일을 드래그하거나 클릭하여 선택</p>
                        <p className="text-xs">.xlsx, .xls, .csv 파일 지원 (최대 50MB)</p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      data-testid="button-upload-excel"
                      disabled={!selectedFile || isPending}
                      onClick={() => selectedFile && uploadMutation.mutate({ file: selectedFile, title: planTitle })}
                      className="flex-1"
                    >
                      {isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />처리 중...</> : <><Upload className="w-4 h-4 mr-2" />포맷팅 + 초안 생성</>}
                    </Button>
                    {(selectedFile || uploadResult) && (
                      <Button variant="outline" size="icon" onClick={handleReset} data-testid="button-reset-file">
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* 하도급 메일 파싱 모드 */}
              {mode === "subcontract" && (
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 leading-relaxed">
                    <p className="font-semibold mb-1">📧 사용 방법</p>
                    <ol className="list-decimal list-inside space-y-0.5">
                      <li>하도급 업체에서 받은 작업일정 메일 내용을 아래에 붙여넣기</li>
                      <li>"초안 생성" 버튼 클릭 → AI가 자동 분석하여 발송용 이메일 초안 생성</li>
                      <li>제목/본문 복사 후 메일 발송</li>
                    </ol>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-medium">
                      하도급 업체 메일 내용 붙여넣기
                      <span className="ml-2 text-xs font-normal text-muted-foreground">(전달받은 메일 본문 전체)</span>
                    </Label>
                    <Textarea
                      data-testid="textarea-subcontract-email"
                      placeholder={"안녕하십니까.\n스피드이엔지 김태갑 입니다.\n\n26년 04월 06일 작업일정\n\n[포항] 정제파 불량(10:00~12:00)\n  - 국소명: ...\n  ..."}
                      value={subEmailText}
                      onChange={(e) => { setSubEmailText(e.target.value); setSubResult(null); }}
                      rows={10}
                      className="text-xs resize-y"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      data-testid="button-parse-subcontract"
                      onClick={handleSubEmailParse}
                      disabled={!subEmailText.trim() || subEmailMutation.isPending}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      {subEmailMutation.isPending
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />AI 분석 중...</>
                        : <><Wand2 className="w-4 h-4 mr-2" />초안 생성</>}
                    </Button>
                    {(subEmailText || subResult) && (
                      <Button variant="outline" size="icon" onClick={() => { setSubEmailText(""); setSubResult(null); }} data-testid="button-reset-sub">
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  {/* 생성 결과 */}
                  {subResult && (
                    <div className="flex flex-col gap-3 mt-1">
                      {/* 완료 배지 */}
                      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                        <span className="text-xs font-semibold text-green-700">
                          {subResult.parsed.company} · {subResult.parsed.workDate} · 총 {subResult.parsed.items?.length || 0}건 작업 파싱 완료
                        </span>
                      </div>

                      {/* 메일 제목 */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                            메일 제목
                          </Label>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-2.5"
                            onClick={handleCopySubSubject}
                            data-testid="button-copy-sub-subject"
                          >
                            {subCopied
                              ? <><Check className="w-3 h-3 mr-1 text-green-600" />복사됨</>
                              : <><Copy className="w-3 h-3 mr-1" />복사</>}
                          </Button>
                        </div>
                        <div
                          className="rounded border bg-muted/40 px-3 py-2 text-sm select-all cursor-pointer hover:bg-muted/60 transition-colors"
                          onClick={handleCopySubSubject}
                          title="클릭하여 복사"
                          data-testid="display-sub-subject"
                        >
                          {subResult.subject}
                        </div>
                      </div>

                      {/* 메일 본문 */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                            메일 본문
                            <span className="text-xs font-normal text-muted-foreground">(직접 수정 가능)</span>
                          </Label>
                          <Button
                            size="sm"
                            className="h-7 text-xs px-3 bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={handleCopySubDraft}
                            data-testid="button-copy-sub-draft"
                          >
                            {subCopiedDraft
                              ? <><Check className="w-3 h-3 mr-1" />복사됨</>
                              : <><Copy className="w-3 h-3 mr-1" />본문 복사</>}
                          </Button>
                        </div>
                        <Textarea
                          value={subResult.emailDraft}
                          onChange={(e) => setSubResult(prev => prev ? { ...prev, emailDraft: e.target.value } : prev)}
                          rows={18}
                          className="text-xs font-mono resize-y leading-relaxed"
                          data-testid="textarea-sub-draft"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          마지막 줄의 테이블은 탭 구분이므로 이메일 붙여넣기 시 자동으로 표 형식으로 정렬됩니다.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 포맷 엑셀 다운로드 */}
          {uploadResult?.processedFileUrl && (
            <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              <p className="text-sm text-green-700 flex-1">포맷팅 완료</p>
              <a href={uploadResult.processedFileUrl} download target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline" data-testid="button-download-excel"
                  className="border-green-400 text-green-700 hover:bg-green-100">
                  <Download className="w-3.5 h-3.5 mr-1" />포맷 엑셀 다운로드
                </Button>
              </a>
            </div>
          )}

          {/* 생성된 이메일 초안 + 전체 복사 */}
          {generatedDraft && (
            <Card className="border-blue-200">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-700">이메일 초안 생성 완료</span>
                </div>
                <Button
                  onClick={handleCopyAll}
                  data-testid="button-copy-all"
                  className={cn(
                    "gap-2 transition-all",
                    copied
                      ? "bg-green-600 hover:bg-green-600 text-white"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  )}
                >
                  {copied ? <><Check className="w-4 h-4" />복사됨</> : <><Copy className="w-4 h-4" />전체 복사</>}
                </Button>
              </CardHeader>
              <CardContent className="pt-0">
                <Textarea
                  value={generatedDraft}
                  readOnly
                  rows={14}
                  className="font-mono text-xs resize-y bg-muted/30 text-foreground"
                  data-testid="textarea-generated-draft"
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">클릭하여 전체 선택 · 위 버튼으로 한 번에 복사</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* 오른쪽: 이력 목록 */}
        <div className="lg:col-span-2">
          <Card className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                작업계획 이력
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />로딩 중...
                </div>
              ) : workPlans.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  <CalendarCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  등록된 작업계획이 없습니다
                </div>
              ) : (
                <div className="divide-y divide-border/50 max-h-[600px] overflow-y-auto">
                  {workPlans.map((plan) => (
                    <div
                      key={plan.id}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-accent/40 transition-colors group",
                        selectedPlan?.id === plan.id && "bg-accent/60"
                      )}
                      onClick={() => setSelectedPlan(selectedPlan?.id === plan.id ? null : plan)}
                    >
                      <FileSpreadsheet className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{plan.title}</p>
                        {plan.sheetSummary && (
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{plan.sheetSummary}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground">
                            {plan.createdAt ? format(new Date(plan.createdAt), "yy.MM.dd HH:mm") : "-"}
                          </span>
                          {plan.createdBy && (
                            <span className="text-[10px] text-muted-foreground">· {plan.createdBy}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {plan.emailDraft && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="초안 복사"
                            onClick={(e) => { e.stopPropagation(); handleCopyPlanDraft(plan.emailDraft!); }}
                            data-testid={`button-copy-plan-${plan.id}`}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {plan.processedFileUrl && (
                          <a href={plan.processedFileUrl} download target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                          </a>
                        )}
                        {canEditSubcontract && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(plan.id); }}
                            data-testid={`button-delete-plan-${plan.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 순회점검대상자 입력 다이얼로그 */}
      <Dialog open={inspectorDialogOpen} onOpenChange={setInspectorDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardPaste className="w-4 h-4 text-blue-600" />순회점검대상자 입력
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              순회점검대상자가 자동으로 채워집니다. 수정이 필요한 경우 직접 변경 후 <strong>초안 생성</strong>을 클릭하세요.
            </p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <div className="overflow-x-auto">
              <table className="text-[12px] w-full border-collapse">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left py-2 px-3 font-semibold text-muted-foreground whitespace-nowrap border border-border">#</th>
                    {["공사작업번호", "부/팀", "작업자", "공사내용", "공사/작업시작일", "공사/작업종료일", "주소"].map(h => (
                      <th key={h} className="text-left py-2 px-3 font-semibold text-muted-foreground whitespace-nowrap border border-border">{h}</th>
                    ))}
                    <th className="text-left py-2 px-3 font-semibold whitespace-nowrap border border-border">
                      <span className="text-blue-600">순회점검대상자</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                      <td className="py-1.5 px-3 text-muted-foreground border border-border text-center">{i + 1}</td>
                      <td className="py-1.5 px-3 font-mono text-[11px] whitespace-nowrap text-blue-700 border border-border">{row["공사작업번호"] || "-"}</td>
                      <td className="py-1.5 px-3 whitespace-nowrap border border-border">{row["부/팀"] || "-"}</td>
                      <td className="py-1.5 px-3 whitespace-nowrap border border-border">{row["작업자"] || "-"}</td>
                      <td className="py-1.5 px-3 max-w-[180px] truncate border border-border">{row["공사내용"] || row["공사명"] || "-"}</td>
                      <td className="py-1.5 px-3 whitespace-nowrap text-[11px] border border-border">{row["공사/작업시작일"] || "-"}</td>
                      <td className="py-1.5 px-3 whitespace-nowrap text-[11px] border border-border">{row["공사/작업종료일"] || "-"}</td>
                      <td className="py-1.5 px-3 max-w-[160px] truncate text-[11px] border border-border">{row["주소"] || "-"}</td>
                      <td className="py-1.5 px-3 border border-border">
                        <input
                          type="text"
                          value={inspectorEdits[i] ?? row["순회점검대상자"] ?? ""}
                          onChange={e => setInspectorEdits(prev => ({ ...prev, [i]: e.target.value }))}
                          placeholder="이름 입력"
                          className="border border-orange-300 rounded px-2 py-1 text-[12px] w-48 focus:outline-none focus:border-orange-500 bg-orange-50 focus:bg-white"
                          data-testid={`input-inspector-dialog-${i}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter className="pt-4 border-t">
            <div className="flex gap-2 justify-end w-full">
              <Button variant="outline" onClick={() => setInspectorDialogOpen(false)}>취소</Button>
              <Button
                onClick={handleDialogConfirm}
                disabled={pasteMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                data-testid="button-confirm-generate"
              >
                {pasteMutation.isPending
                  ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />저장 중...</>
                  : <><Copy className="w-4 h-4 mr-1.5" />초안 생성</>}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
