import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Upload, FileSpreadsheet, Mail, Download, Trash2, CalendarCheck,
  Clock, CheckCircle2, X, Loader2, Copy, Check, ClipboardPaste, MousePointerClick, Send, Plus
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

// MOSS 붙여넣기 데이터 파싱
// 형식: 첫 줄 = 탭 구분 헤더, 이후 각 줄 = 한 레코드 (탭 구분 TSV)
function parseMossData(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  // 첫 줄 = 헤더 (탭 구분)
  const headers = lines[0].split("\t").map(h => h.trim());
  if (headers.length < 2) return { headers: [], rows: [] };

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split("\t").map(c => c.trim());
    const record: Record<string, string> = {};
    headers.forEach((h, ci) => {
      record[h] = cells[ci] || "";
    });
    // 공사작업번호가 있는 행만 포함
    if (record["공사작업번호"]) {
      rows.push(record);
    }
  }

  return { headers, rows };
}

// 이메일 초안 생성 (클라이언트 사이드)
function buildEmailDraft(rows: Record<string, string>[], title: string): string {
  // 내일 날짜 사용
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
  const dateStr = `${String(tomorrow.getFullYear()).slice(2)}.${String(tomorrow.getMonth() + 1).padStart(2, "0")}.${String(tomorrow.getDate()).padStart(2, "0")}(${DAYS[tomorrow.getDay()]})`;

  // 필요한 열만 추출 (이메일 표에 표시할 항목)
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

  // 탭 구분 텍스트 표 (선 없음, 붙여넣기 친화적)
  const hdrLine = emailCols.join("\t");
  const dataLines = rows.map(row =>
    emailCols.map(col => {
      // 공사내용이 없으면 공사명으로 폴백
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

  // 탭
  const [mode, setMode] = useState<"paste" | "file">("paste");

  // 파일 모드
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // 붙여넣기 모드
  const [pastedText, setPastedText] = useState("");
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = useState("");
  const [inspectorEdits, setInspectorEdits] = useState<Record<number, string>>({}); // 순회점검대상자 편집값

  // 공통
  const [planTitle, setPlanTitle] = useState("");
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [editedDraft, setEditedDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [tableCopied, setTableCopied] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<WorkPlan | null>(null);
  const draftTextareaRef = useRef<HTMLTextAreaElement>(null);

  // 이메일 발송 다이얼로그
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [recipientInput, setRecipientInput] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);

  const { data: workPlans = [], isLoading } = useQuery<WorkPlan[]>({
    queryKey: ["/api/work-plans"],
  });

  // 파일 업로드 mutation
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
      setEditedDraft(data.emailDraft);
      queryClient.invalidateQueries({ queryKey: ["/api/work-plans"] });
      toast({ title: "처리 완료", description: "파일이 포맷되고 이메일 초안이 생성되었습니다." });
    },
    onError: (err: any) => {
      toast({ title: "오류", description: err.message, variant: "destructive" });
    },
  });

  // 붙여넣기 저장 mutation
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
    onSuccess: (data) => {
      setUploadResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/work-plans"] });
      toast({ title: "이메일 초안 생성 완료" });
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

  // 붙여넣기 파싱
  const handleParse = () => {
    setParseError("");
    if (!pastedText.trim()) {
      setParseError("데이터를 붙여넣어 주세요.");
      return;
    }
    const { headers, rows } = parseMossData(pastedText);
    if (rows.length === 0) {
      setParseError("데이터를 인식할 수 없습니다. MOSS에서 헤더 포함하여 복사하셨는지 확인해주세요.");
      return;
    }
    setParsedRows(rows);
    setInspectorEdits({}); // 새 데이터 파싱 시 편집값 초기화
    if (!planTitle) {
      const now = new Date();
      const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
      setPlanTitle(`${now.getFullYear().toString().slice(2)}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}(${DAYS[now.getDay()]}) 작업계획`);
    }
    toast({ title: `${rows.length}건 인식 완료`, description: "순회점검대상자를 입력한 후 이메일 초안을 생성하세요." });
  };

  // 순회점검대상자 편집값이 반영된 rows 반환
  const getMergedRows = () =>
    parsedRows.map((row, i) => ({
      ...row,
      "순회점검대상자": inspectorEdits[i] ?? row["순회점검대상자"] ?? "",
    }));

  // 붙여넣기 → 이메일 생성 + 저장
  const handleGenerateFromPaste = () => {
    const title = planTitle || "작업계획";
    const mergedRows = getMergedRows();
    const draft = buildEmailDraft(mergedRows, title);
    setEditedDraft(draft);
    pasteMutation.mutate({ rows: mergedRows, title, emailDraft: draft });
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast({ title: "형식 오류", description: "엑셀(.xlsx, .xls) 또는 CSV 파일만 업로드 가능합니다", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
    setUploadResult(null);
    setEditedDraft("");
    if (!planTitle) setPlanTitle(file.name.replace(/\.[^.]+$/, ""));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const handleCopy = () => {
    // 표 구분선 찾기 (※로 시작하는 줄 이후가 표)
    const lines = editedDraft.split("\n");
    const tableStartIdx = lines.findIndex(l => l.startsWith("※"));

    let htmlContent: string;

    if (tableStartIdx !== -1) {
      const bodyLines = lines.slice(0, tableStartIdx);
      const tableLines = lines.slice(tableStartIdx + 1).filter(l => l.trim() !== "");
      const titleLine = lines[tableStartIdx];

      // 텍스트 본문 → HTML
      const bodyHtml = bodyLines.map(l =>
        l.trim() === "" ? "<br>" : `<p style="margin:2px 0">${l}</p>`
      ).join("");

      // 표 → HTML table
      let tableHtml = "";
      if (tableLines.length >= 2) {
        const headers = tableLines[0].split("\t");
        const thHtml = headers.map(h =>
          `<th style="border:1px solid #999;padding:4px 8px;background:#f0f0f0;white-space:nowrap;font-size:12px">${h}</th>`
        ).join("");
        const dataRows = tableLines.slice(1).map(row => {
          const cells = row.split("\t");
          const tdHtml = cells.map(c =>
            `<td style="border:1px solid #999;padding:4px 8px;font-size:12px;white-space:nowrap">${c}</td>`
          ).join("");
          return `<tr>${tdHtml}</tr>`;
        }).join("");
        tableHtml = `<p style="margin:8px 0 4px 0"><strong>${titleLine}</strong></p><table style="border-collapse:collapse"><thead><tr>${thHtml}</tr></thead><tbody>${dataRows}</tbody></table>`;
      }

      htmlContent = `<div style="font-family:맑은고딕,sans-serif;font-size:13px">${bodyHtml}${tableHtml}</div>`;
    } else {
      // 표가 없으면 텍스트만
      htmlContent = `<div style="font-family:맑은고딕,sans-serif;font-size:13px">${editedDraft.split("\n").map(l => l.trim() === "" ? "<br>" : `<p style="margin:2px 0">${l}</p>`).join("")}</div>`;
    }

    try {
      const htmlBlob = new Blob([htmlContent], { type: "text/html" });
      const textBlob = new Blob([editedDraft], { type: "text/plain" });
      navigator.clipboard.write([new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob })]);
    } catch {
      navigator.clipboard.writeText(editedDraft);
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "복사 완료", description: "아웃룩에 붙여넣으면 표가 그대로 나타납니다." });
  };

  const handleSelectAll = () => {
    if (draftTextareaRef.current) {
      draftTextareaRef.current.focus();
      draftTextareaRef.current.select();
    }
  };

  const TABLE_COLS = ["공사작업번호", "부/팀", "작업자", "공사내용", "공사/작업시작일", "공사/작업종료일", "주소", "순회점검대상자"];

  const handleTableCopy = () => {
    const getVal = (row: Record<string, string>, col: string) => {
      if (col === "공사내용" && !row[col]) return row["공사명"] || "";
      return row[col] || "";
    };

    const mergedRows = getMergedRows();

    // TSV (plain text 폴백)
    const tsvText = [
      TABLE_COLS.join("\t"),
      ...mergedRows.map(row => TABLE_COLS.map(col => getVal(row, col)).join("\t"))
    ].join("\n");

    // HTML 표 (아웃룩/워드 붙여넣기 시 표 그대로)
    const thHtml = TABLE_COLS.map(h =>
      `<th style="border:1px solid #999;padding:4px 8px;background:#f0f0f0;white-space:nowrap;font-size:12px">${h}</th>`
    ).join("");
    const tdRows = mergedRows.map(row =>
      `<tr>${TABLE_COLS.map(col =>
        `<td style="border:1px solid #999;padding:4px 8px;font-size:12px;white-space:nowrap">${getVal(row, col)}</td>`
      ).join("")}</tr>`
    ).join("");
    const htmlText = `<table style="border-collapse:collapse"><thead><tr>${thHtml}</tr></thead><tbody>${tdRows}</tbody></table>`;

    try {
      const htmlBlob = new Blob([htmlText], { type: "text/html" });
      const textBlob = new Blob([tsvText], { type: "text/plain" });
      navigator.clipboard.write([new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob })]);
    } catch {
      navigator.clipboard.writeText(tsvText);
    }

    setTableCopied(true);
    setTimeout(() => setTableCopied(false), 2000);
    toast({ title: "표 복사 완료", description: "아웃룩/엑셀에 붙여넣으면 표 형태로 나타납니다." });
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPastedText("");
    setParsedRows([]);
    setParseError("");
    setInspectorEdits({});
    setUploadResult(null);
    setEditedDraft("");
    setPlanTitle("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // editedDraft를 HTML로 변환 (이메일 발송용)
  const buildHtmlFromDraft = (draft: string) => {
    const lines = draft.split("\n");
    const tableStartIdx = lines.findIndex(l => l.startsWith("※"));
    if (tableStartIdx === -1) {
      return `<div style="font-family:맑은고딕,sans-serif;font-size:13px">${lines.map(l => l.trim() === "" ? "<br>" : `<p style="margin:2px 0">${l}</p>`).join("")}</div>`;
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
    return `<div style="font-family:맑은고딕,sans-serif;font-size:13px">${bodyHtml}${tableHtml}</div>`;
  };

  // 이메일 발송 mutation
  const sendEmailMutation = useMutation({
    mutationFn: async ({ to, subject, htmlContent, textContent }: { to: string[]; subject: string; htmlContent: string; textContent: string }) => {
      const res = await fetch("/api/work-plans/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, htmlContent, textContent }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "발송 실패" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "발송 완료", description: `${recipients.length}명에게 이메일이 발송되었습니다.` });
      setSendDialogOpen(false);
      setRecipients([]);
      setRecipientInput("");
    },
    onError: (err: any) => {
      toast({ title: "발송 실패", description: err.message, variant: "destructive" });
    },
  });

  const handleAddRecipient = () => {
    const email = recipientInput.trim();
    if (!email) return;
    const emails = email.split(/[,;\s]+/).map(e => e.trim()).filter(e => e.includes("@"));
    setRecipients(prev => [...new Set([...prev, ...emails])]);
    setRecipientInput("");
  };

  const handleOpenSendDialog = () => {
    // 제목 자동 생성 (초안의 날짜로)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
    const dateStr = `${String(tomorrow.getFullYear()).slice(2)}.${String(tomorrow.getMonth() + 1).padStart(2, "0")}.${String(tomorrow.getDate()).padStart(2, "0")}(${DAYS[tomorrow.getDay()]})`;
    setEmailSubject(`[순회점검 등록 요청] ${dateStr} 입회 작업`);
    setSendDialogOpen(true);
  };

  const handleSendEmail = () => {
    if (recipients.length === 0) {
      toast({ title: "수신자 없음", description: "이메일 주소를 추가해주세요", variant: "destructive" });
      return;
    }
    sendEmailMutation.mutate({
      to: recipients,
      subject: emailSubject,
      htmlContent: buildHtmlFromDraft(editedDraft),
      textContent: editedDraft,
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
          <p className="text-sm text-muted-foreground">MOSS 작업 데이터를 붙여넣거나 파일로 업로드하면 입회작업 TBM / 순회점검 등록요청 이메일 초안이 자동 생성됩니다</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 왼쪽: 입력 + 결과 */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          {/* 입력 방식 탭 */}
          <Card>
            <CardHeader className="pb-2">
              {/* 탭 전환 */}
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
              </div>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
              {/* 제목 입력 */}
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

              {/* === 붙여넣기 모드 === */}
              {mode === "paste" && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-medium">
                      MOSS 작업 데이터 붙여넣기
                      <span className="ml-2 text-xs font-normal text-muted-foreground">(헤더 포함하여 전체 복사 후 붙여넣기)</span>
                    </Label>
                    <Textarea
                      data-testid="textarea-paste-input"
                      placeholder={"공사작업번호\t합동점검단계\t순회점검단계\t공사상태\t...\n도급-무선기지국-20260318-0057\n\n점검전\n승인완료\n..."}
                      value={pastedText}
                      onChange={(e) => { setPastedText(e.target.value); setParsedRows([]); setParseError(""); }}
                      rows={6}
                      className="font-mono text-xs resize-y"
                    />
                    {parseError && (
                      <p className="text-xs text-destructive">{parseError}</p>
                    )}
                  </div>

                  {/* 파싱 결과 미리보기 */}
                  {parsedRows.length > 0 && (
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-green-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {parsedRows.length}건 인식됨
                        </p>
                        <Button
                          size="sm"
                          variant={tableCopied ? "default" : "outline"}
                          onClick={handleTableCopy}
                          data-testid="button-copy-table"
                          className={`h-6 text-[11px] px-2 ${tableCopied ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
                        >
                          {tableCopied
                            ? <><Check className="w-3 h-3 mr-1" />복사됨</>
                            : <><Copy className="w-3 h-3 mr-1" />표 복사</>}
                        </Button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="text-[11px] w-full">
                          <thead>
                            <tr className="border-b">
                              {["공사작업번호", "부/팀", "작업자", "공사내용", "시작일", "종료일", "주소"].map(h => (
                                <th key={h} className="text-left py-1 pr-3 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                              ))}
                              <th className="text-left py-1 pr-3 font-semibold whitespace-nowrap">
                                <span className="text-orange-600">순회점검대상자</span>
                                <span className="ml-1 text-[10px] font-normal text-orange-500">(직접 입력)</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {parsedRows.map((row, i) => (
                              <tr key={i} className="border-b border-dashed last:border-0">
                                <td className="py-1 pr-3 font-mono text-[10px] whitespace-nowrap text-blue-700">{row["공사작업번호"] || "-"}</td>
                                <td className="py-1 pr-3 whitespace-nowrap">{row["부/팀"] || "-"}</td>
                                <td className="py-1 pr-3 whitespace-nowrap">{row["작업자"] || "-"}</td>
                                <td className="py-1 pr-3 max-w-[180px] truncate">{row["공사내용"] || row["공사명"] || "-"}</td>
                                <td className="py-1 pr-3 whitespace-nowrap text-[10px]">{row["공사/작업시작일"] || "-"}</td>
                                <td className="py-1 pr-3 whitespace-nowrap text-[10px]">{row["공사/작업종료일"] || "-"}</td>
                                <td className="py-1 pr-3 max-w-[150px] truncate">{row["주소"] || "-"}</td>
                                <td className="py-1">
                                  <input
                                    type="text"
                                    value={inspectorEdits[i] ?? row["순회점검대상자"] ?? ""}
                                    onChange={e => setInspectorEdits(prev => ({ ...prev, [i]: e.target.value }))}
                                    placeholder="이름 입력"
                                    className="border border-orange-300 rounded px-1.5 py-0.5 text-[11px] w-28 focus:outline-none focus:border-orange-500 bg-orange-50"
                                    data-testid={`input-inspector-${i}`}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
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
                        data-testid="button-generate-email"
                        onClick={handleGenerateFromPaste}
                        className="flex-1"
                        disabled={isPending}
                      >
                        {isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />생성 중...</> : <><Mail className="w-4 h-4 mr-2" />이메일 초안 생성</>}
                      </Button>
                    )}
                    {(pastedText || parsedRows.length > 0 || uploadResult) && (
                      <Button variant="outline" size="icon" onClick={handleReset} data-testid="button-reset">
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* === 파일 업로드 모드 === */}
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
                      {isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />처리 중...</> : <><Upload className="w-4 h-4 mr-2" />포맷팅 + 이메일 초안 생성</>}
                    </Button>
                    {(selectedFile || uploadResult) && (
                      <Button variant="outline" size="icon" onClick={handleReset} data-testid="button-reset-file">
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 이메일 초안 결과 */}
          {(uploadResult || editedDraft) && (
            <Card className="border-blue-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Mail className="w-4 h-4 text-blue-600" />
                    이메일 초안
                    <Badge variant="outline" className="text-[10px] border-green-400 text-green-600 ml-1">
                      <CheckCircle2 className="w-3 h-3 mr-1" />자동 생성
                    </Badge>
                  </CardTitle>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={handleSelectAll} data-testid="button-select-all">
                      <MousePointerClick className="w-3.5 h-3.5 mr-1" />전체 선택
                    </Button>
                    <Button size="sm" variant={copied ? "default" : "outline"} onClick={handleCopy} data-testid="button-copy-draft"
                      className={copied ? "bg-green-600 hover:bg-green-700 text-white" : ""}>
                      {copied ? <><Check className="w-3.5 h-3.5 mr-1" />복사됨</> : <><Copy className="w-3.5 h-3.5 mr-1" />복사</>}
                    </Button>
                    <Button size="sm" variant="default" onClick={handleOpenSendDialog} data-testid="button-send-email"
                      className="bg-blue-600 hover:bg-blue-700 text-white">
                      <Send className="w-3.5 h-3.5 mr-1" />이메일 보내기
                    </Button>
                    {uploadResult?.processedFileUrl && (
                      <a href={uploadResult.processedFileUrl} download target="_blank" rel="noreferrer">
                        <Button size="sm" variant="outline" data-testid="button-download-excel">
                          <Download className="w-3.5 h-3.5 mr-1" />포맷 엑셀
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
                {uploadResult?.plan?.sheetSummary && (
                  <p className="text-xs text-muted-foreground mt-1">{uploadResult.plan.sheetSummary}</p>
                )}
              </CardHeader>
              <CardContent>
                <Textarea
                  ref={draftTextareaRef}
                  data-testid="textarea-email-draft"
                  value={editedDraft}
                  onChange={(e) => setEditedDraft(e.target.value)}
                  rows={22}
                  className="font-mono text-xs resize-y bg-muted/20"
                  placeholder="이메일 초안이 여기에 표시됩니다"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium">전체 선택</span> 후 <span className="font-medium">복사</span>하여 이메일에 붙여넣으면 표가 자동 정렬됩니다.
                </p>
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
                <Badge variant="secondary" className="ml-auto text-xs">{workPlans.length}건</Badge>
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

          {/* 선택된 이력 이메일 초안 보기 */}
          {selectedPlan && selectedPlan.emailDraft && (
            <Card className="mt-4 border-blue-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-500" />
                  {selectedPlan.title}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-6 w-6 p-0"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedPlan.emailDraft || "");
                      toast({ title: "복사 완료" });
                    }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-[11px] whitespace-pre-wrap font-mono bg-muted/30 rounded p-3 max-h-64 overflow-y-auto leading-relaxed">
                  {selectedPlan.emailDraft}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* 이메일 발송 다이얼로그 */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-4 h-4 text-blue-600" />이메일 발송
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* 제목 */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">제목</Label>
              <Input
                value={emailSubject}
                onChange={e => setEmailSubject(e.target.value)}
                placeholder="이메일 제목"
                data-testid="input-email-subject"
              />
            </div>

            {/* 수신자 입력 */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">수신자</Label>
              <div className="flex gap-2">
                <Input
                  value={recipientInput}
                  onChange={e => setRecipientInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddRecipient(); } }}
                  placeholder="이메일 주소 입력 후 Enter"
                  data-testid="input-recipient"
                  className="flex-1"
                />
                <Button size="sm" variant="outline" onClick={handleAddRecipient} data-testid="button-add-recipient">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {/* 추가된 수신자 목록 */}
              {recipients.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {recipients.map(email => (
                    <span key={email} className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5 text-xs text-blue-800">
                      {email}
                      <button onClick={() => setRecipients(prev => prev.filter(e => e !== email))} className="ml-0.5 text-blue-500 hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {recipients.length === 0 && (
                <p className="text-xs text-muted-foreground">쉼표(,)나 세미콜론(;)으로 여러 주소를 한번에 입력할 수 있습니다</p>
              )}
            </div>

            {/* 내용 미리보기 */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-muted-foreground">발송 내용 미리보기</Label>
              <pre className="text-[10px] whitespace-pre-wrap font-mono bg-muted/40 rounded p-2 max-h-32 overflow-y-auto leading-relaxed border">
                {editedDraft.slice(0, 300)}{editedDraft.length > 300 ? "\n..." : ""}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>취소</Button>
            <Button
              onClick={handleSendEmail}
              disabled={sendEmailMutation.isPending || recipients.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-confirm-send"
            >
              {sendEmailMutation.isPending
                ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />발송 중...</>
                : <><Send className="w-4 h-4 mr-1" />{recipients.length}명에게 발송</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
