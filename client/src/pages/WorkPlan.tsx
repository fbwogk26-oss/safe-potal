import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload, CalendarCheck, CheckCircle2, X, Loader2, Copy, Check, Mail, Trash2, Clock, Send, RefreshCw, Inbox, FileText, ChevronRight, Bot, Play, AlertCircle, Timer, CheckSquare
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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

interface AutoJobStatus {
  lastRun: string | null;
  lastResult: "sent" | "not_found" | "error" | null;
  lastMessage: string | null;
  lastSentTo: string | null;
  lastItemCount: number | null;
  nextRun: string;
  running: boolean;
  enabled: boolean;
}

export default function WorkPlan() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState("drafts");

  const [result, setResult] = useState<{
    parsed: any;
    htmlDraft: string;
    subject: string;
    itemCount: number;
  } | null>(null);

  const [subjectCopied, setSubjectCopied] = useState(false);
  const [bodyCopied, setBodyCopied] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<WorkPlan | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("jaeha.ryu@ktmos.co.kr");
  const [sendSuccess, setSendSuccess] = useState(false);
  const [expandedPlanId, setExpandedPlanId] = useState<number | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Gmail 받은편지함
  const [gmailEmails, setGmailEmails] = useState<{uid:number;subject:string;from:string;fromAddr:string;date:string}[]>([]);
  const [gmailOpen, setGmailOpen] = useState(false);
  const [processingUid, setProcessingUid] = useState<number|null>(null);

  const { data: workPlans = [], isLoading } = useQuery<WorkPlan[]>({
    queryKey: ["/api/work-plans"],
  });

  const { data: autoJobStatus, refetch: refetchAutoStatus } = useQuery<AutoJobStatus>({
    queryKey: ["/api/auto-email/status"],
    refetchInterval: 5000,
  });

  const runNowMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auto-email/run-now", { method: "POST", credentials: "include" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || "실행 실패"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "자동 발송 수동 실행 시작", description: "잠시 후 결과를 확인하세요." });
      setTimeout(() => refetchAutoStatus(), 3000);
    },
    onError: (err: any) => toast({ title: "실행 실패", description: err.message, variant: "destructive" }),
  });

  const parseMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("emlFile", file);
      const res = await fetch("/api/work-plans/parse-subcontract-email", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "처리 실패" }));
        throw new Error(err.message || "처리에 실패했습니다");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      setSubjectCopied(false);
      setBodyCopied(false);
      queryClient.invalidateQueries({ queryKey: ["/api/work-plans"] });
      toast({ title: "초안 생성 완료", description: `${data.itemCount}건의 작업 항목이 추출되었습니다.` });
    },
    onError: (err: any) => {
      toast({ title: "처리 실패", description: err.message, variant: "destructive" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async ({ subject, htmlDraft, to }: { subject: string; htmlDraft: string; to: string }) => {
      const res = await fetch("/api/work-plans/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subject, htmlDraft, to }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "발송 실패" }));
        throw new Error(err.message || "발송에 실패했습니다");
      }
      return res.json();
    },
    onSuccess: () => {
      setSendSuccess(true);
      toast({ title: "발송 완료", description: `${recipientEmail}로 이메일이 발송되었습니다.` });
      setTimeout(() => setSendSuccess(false), 4000);
    },
    onError: (err: any) => {
      toast({ title: "발송 실패", description: err.message, variant: "destructive" });
    },
  });

  const listGmailMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/work-plans/list-gmail", { credentials: "include" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || "연결 실패"); }
      return res.json();
    },
    onSuccess: (data) => {
      setGmailEmails(data.emails || []);
      setGmailOpen(true);
    },
    onError: (err: any) => {
      toast({ title: "Gmail 연결 실패", description: err.message, variant: "destructive" });
    },
  });

  const processGmailMutation = useMutation({
    mutationFn: async (uid: number) => {
      const res = await fetch("/api/work-plans/process-gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ uid }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || "처리 실패"); }
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      setSubjectCopied(false);
      setBodyCopied(false);
      setGmailOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/work-plans"] });
      toast({ title: "초안 생성 완료", description: `${data.itemCount}건의 작업 항목이 추출되었습니다.` });
    },
    onError: (err: any) => {
      toast({ title: "처리 실패", description: err.message, variant: "destructive" });
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

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("POST", "/api/work-plans/bulk-delete", { ids }),
    onSuccess: async (res) => {
      const data = await (res as any).json();
      queryClient.invalidateQueries({ queryKey: ["/api/work-plans"] });
      setSelectedIds(new Set()); setSelectionMode(false);
      toast({ title: `${data.deleted}건 삭제 완료` });
    },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const toggleSelect = (id: number) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleFileSelect = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".eml")) {
      toast({ title: "형식 오류", description: ".eml 파일만 업로드 가능합니다", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
    setResult(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const handleReset = () => {
    setSelectedFile(null);
    setResult(null);
    setSubjectCopied(false);
    setBodyCopied(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleGenerate = () => {
    if (!selectedFile) return;
    parseMutation.mutate(selectedFile);
  };

  const handleCopySubject = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.subject).then(() => {
      setSubjectCopied(true);
      toast({ title: "제목 복사됨" });
      setTimeout(() => setSubjectCopied(false), 2500);
    });
  };

  const handleCopyBody = async () => {
    if (!result) return;
    const html = result.htmlDraft;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([result.subject], { type: "text/plain" }),
        }),
      ]);
      setBodyCopied(true);
      toast({ title: "본문 복사 완료", description: "이메일 클라이언트에 붙여넣기 하세요. 표와 이미지가 포함됩니다." });
      setTimeout(() => setBodyCopied(false), 3000);
    } catch {
      navigator.clipboard.writeText(html).then(() => {
        setBodyCopied(true);
        toast({ title: "본문 복사됨" });
        setTimeout(() => setBodyCopied(false), 2500);
      });
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950">
          <CalendarCheck className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">하도급 작업계획 메일</h1>
          <p className="text-sm text-muted-foreground">하도급 업체 받은 .eml 파일을 업로드하면 순회점검 등록요청 이메일 초안을 자동 생성합니다</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-2">
          <TabsTrigger value="drafts" className="flex items-center gap-1.5" data-testid="tab-drafts">
            <FileText className="w-4 h-4" />
            작업계획
            {workPlans.length > 0 && (
              <span className="ml-1 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[10px] font-semibold px-1.5 py-0.5 leading-none">
                {workPlans.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="upload" className="flex items-center gap-1.5" data-testid="tab-upload">
            <Upload className="w-4 h-4" />
            업로드
          </TabsTrigger>
          <TabsTrigger value="auto" className="flex items-center gap-1.5" data-testid="tab-auto">
            <Bot className="w-4 h-4" />
            자동발송
            {autoJobStatus?.lastResult === "sent" && (
              <span className="ml-1 w-2 h-2 rounded-full bg-green-500 shrink-0" />
            )}
            {autoJobStatus?.running && (
              <Loader2 className="ml-1 w-3 h-3 animate-spin text-blue-500 shrink-0" />
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── 탭1: 업로드 ── */}
        <TabsContent value="upload">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* 왼쪽: 업로드 + 결과 */}
            <div className="lg:col-span-3 flex flex-col gap-4">

              {/* 파일 업로드 카드 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Upload className="w-4 h-4 text-blue-500" />
                    .eml 파일 업로드
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {/* 드래그드롭 영역 */}
                  <div
                    className={cn(
                      "relative border-2 border-dashed rounded-xl transition-all cursor-pointer",
                      isDragOver
                        ? "border-blue-400 bg-blue-50 dark:bg-blue-950/40"
                        : "border-muted-foreground/30 hover:border-blue-300 hover:bg-muted/30"
                    )}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="dropzone-eml"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".eml"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                      data-testid="input-eml-file"
                    />
                    <div className="flex flex-col items-center justify-center gap-2 py-10 px-4 text-center">
                      {selectedFile ? (
                        <>
                          <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{selectedFile.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                          </div>
                          <p className="text-xs text-muted-foreground">다른 파일을 선택하려면 클릭하세요</p>
                        </>
                      ) : (
                        <>
                          <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
                            <Mail className="w-5 h-5 text-blue-500" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">하도급 업체 메일 (.eml) 업로드</p>
                            <p className="text-xs text-muted-foreground mt-0.5">클릭하거나 파일을 여기에 끌어다 놓으세요</p>
                          </div>
                          <p className="text-[11px] text-muted-foreground bg-muted/50 rounded px-3 py-1.5">
                            받은편지함에서 메일을 선택 → 파일로 저장(.eml) → 업로드
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 버튼 */}
                  <div className="flex gap-2">
                    <Button
                      data-testid="button-generate-email"
                      onClick={handleGenerate}
                      disabled={!selectedFile || parseMutation.isPending}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {parseMutation.isPending
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />AI 분석 중...</>
                        : <><Mail className="w-4 h-4 mr-2" />이메일 초안 생성</>}
                    </Button>
                    {(selectedFile || result) && (
                      <Button variant="outline" size="icon" onClick={handleReset} data-testid="button-reset">
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  {/* 구분선 */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 border-t border-muted-foreground/20" />
                    <span className="text-xs text-muted-foreground">또는</span>
                    <div className="flex-1 border-t border-muted-foreground/20" />
                  </div>

                  {/* Gmail 받은편지함 불러오기 */}
                  <Button
                    variant="outline"
                    className="w-full border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                    onClick={() => listGmailMutation.mutate()}
                    disabled={listGmailMutation.isPending}
                    data-testid="button-open-gmail"
                  >
                    {listGmailMutation.isPending
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gmail 연결 중...</>
                      : <><Inbox className="w-4 h-4 mr-2" />Gmail 받은편지함에서 불러오기</>}
                  </Button>
                </CardContent>
              </Card>

              {/* 결과 섹션 */}
              {result && (
                <Card className="border-green-200 dark:border-green-800">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <CardTitle className="text-base text-green-700 dark:text-green-400">
                          초안 생성 완료 — {result.parsed.company} · {result.parsed.workDate} · {result.itemCount}건
                        </CardTitle>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        onClick={() => setActiveTab("drafts")}
                        data-testid="button-goto-drafts"
                      >
                        <FileText className="w-3.5 h-3.5 mr-1" />
                        이력 보기
                        <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">

                    {/* 메일 제목 */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">메일 제목</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2.5"
                          onClick={handleCopySubject}
                          data-testid="button-copy-subject"
                        >
                          {subjectCopied
                            ? <><Check className="w-3 h-3 mr-1 text-green-600" />복사됨</>
                            : <><Copy className="w-3 h-3 mr-1" />복사</>}
                        </Button>
                      </div>
                      <div
                        className="rounded border bg-muted/40 px-3 py-2 text-sm cursor-pointer select-all hover:bg-muted/60 transition-colors"
                        onClick={handleCopySubject}
                        data-testid="display-subject"
                        title="클릭하여 복사"
                      >
                        {result.subject}
                      </div>
                    </div>

                    {/* 메일 본문 미리보기 + 복사 */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          메일 본문
                          <span className="ml-2 text-xs font-normal text-muted-foreground">(표 + 사진 포함)</span>
                        </span>
                        <Button
                          size="sm"
                          className="h-7 text-xs px-3 bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={handleCopyBody}
                          data-testid="button-copy-body"
                        >
                          {bodyCopied
                            ? <><Check className="w-3 h-3 mr-1" />복사됨</>
                            : <><Copy className="w-3 h-3 mr-1" />본문 복사</>}
                        </Button>
                      </div>
                      <div className="rounded border overflow-hidden bg-white dark:bg-white" style={{ height: 640 }}>
                        <iframe
                          srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:16px 20px;padding:0;background:#fff}</style></head><body>${result.htmlDraft}</body></html>`}
                          className="w-full h-full border-0"
                          sandbox="allow-same-origin"
                          title="이메일 미리보기"
                          data-testid="iframe-email-preview"
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        위 미리보기 확인 후 "본문 복사" → 이메일 클라이언트에서 붙여넣기 하세요. 표 서식과 사진이 그대로 붙여넣어집니다.
                      </p>
                    </div>

                    {/* 이메일 직접 발송 */}
                    <div className="flex flex-col gap-2 rounded-lg border border-blue-100 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 px-4 py-3">
                      <Label className="text-sm font-medium flex items-center gap-1.5">
                        <Send className="w-3.5 h-3.5 text-blue-500" />
                        이메일 직접 발송
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          type="email"
                          value={recipientEmail}
                          onChange={(e) => setRecipientEmail(e.target.value)}
                          placeholder="수신자 이메일"
                          className="flex-1 text-sm h-9"
                          data-testid="input-recipient-email"
                        />
                        <Button
                          className={cn(
                            "h-9 px-4 text-sm font-medium transition-all",
                            sendSuccess
                              ? "bg-green-600 hover:bg-green-600 text-white"
                              : "bg-blue-600 hover:bg-blue-700 text-white"
                          )}
                          onClick={() => {
                            if (!result || !recipientEmail.trim()) return;
                            sendMutation.mutate({
                              subject: result.subject,
                              htmlDraft: result.htmlDraft,
                              to: recipientEmail.trim(),
                            });
                          }}
                          disabled={!recipientEmail.trim() || sendMutation.isPending}
                          data-testid="button-send-email"
                        >
                          {sendMutation.isPending
                            ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />발송 중...</>
                            : sendSuccess
                              ? <><Check className="w-3.5 h-3.5 mr-1.5" />발송 완료</>
                              : <><Send className="w-3.5 h-3.5 mr-1.5" />발송</>}
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        발송자: fbwogk26@gmail.com → 위 주소로 이메일이 즉시 발송됩니다
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* 오른쪽: 최근 이력 미니 패널 */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      최근 생성 이력
                    </CardTitle>
                    {workPlans.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-blue-600 hover:text-blue-700"
                        onClick={() => setActiveTab("drafts")}
                        data-testid="button-viewall-drafts"
                      >
                        전체 보기 <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : workPlans.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <CalendarCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>생성 이력이 없습니다</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5 max-h-[500px] overflow-y-auto">
                      {workPlans.slice(0, 8).map((plan) => (
                        <div
                          key={plan.id}
                          className="flex items-start gap-2 rounded-lg border px-3 py-2.5 hover:bg-muted/40 transition-colors cursor-pointer group"
                          onClick={() => setSelectedPlan(plan)}
                          data-testid={`card-workplan-${plan.id}`}
                        >
                          <CalendarCheck className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{plan.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(plan.createdAt), "yyyy.MM.dd HH:mm")}
                              {plan.createdBy && ` · ${plan.createdBy}`}
                            </p>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMutation.mutate(plan.id);
                            }}
                            data-testid={`button-delete-plan-${plan.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      ))}
                      {workPlans.length > 8 && (
                        <button
                          className="text-xs text-blue-600 hover:underline text-center py-2"
                          onClick={() => setActiveTab("drafts")}
                        >
                          +{workPlans.length - 8}건 더 보기
                        </button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── 탭2: 메일 초안 이력 ── */}
        <TabsContent value="drafts">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                업로드 시 자동 저장된 작업계획 메일 초안 목록입니다. 항목을 클릭하면 본문을 확인할 수 있습니다.
              </p>
              <div className="flex items-center gap-2">
                {selectionMode && selectedIds.size > 0 && (
                  <span className="text-sm text-muted-foreground">{selectedIds.size}건 선택됨</span>
                )}
                <span className="text-sm font-semibold text-foreground">총 {workPlans.length}건</span>
                <Button
                  variant={selectionMode ? "default" : "outline"}
                  size="sm"
                  className={`gap-1.5 ${selectionMode ? "bg-red-500 hover:bg-red-600 text-white" : ""}`}
                  onClick={() => { setSelectionMode(v => !v); setSelectedIds(new Set()); }}
                  data-testid="button-toggle-selection"
                >
                  <CheckSquare className="w-4 h-4" />
                  {selectionMode ? "취소" : "선택"}
                </Button>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : workPlans.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">아직 생성된 작업계획이 없습니다.</p>
                <p className="text-xs mt-1">업로드 탭에서 .eml 파일을 업로드하면 여기에 자동으로 저장됩니다.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {workPlans.map((plan) => (
                  <Card key={plan.id} className={cn(
                    "transition-all",
                    selectionMode && selectedIds.has(plan.id) && "border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-900/10",
                    expandedPlanId === plan.id && !selectionMode && "border-blue-300 dark:border-blue-700 shadow-sm"
                  )}>
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg"
                      onClick={() => selectionMode ? toggleSelect(plan.id) : setExpandedPlanId(expandedPlanId === plan.id ? null : plan.id)}
                      data-testid={`row-draft-${plan.id}`}
                    >
                      {selectionMode && (
                        <Checkbox
                          checked={selectedIds.has(plan.id)}
                          onCheckedChange={() => toggleSelect(plan.id)}
                          onClick={e => e.stopPropagation()}
                          data-testid={`checkbox-plan-${plan.id}`}
                        />
                      )}
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                        expandedPlanId === plan.id && !selectionMode
                          ? "bg-blue-100 dark:bg-blue-900"
                          : "bg-muted"
                      )}>
                        <Mail className={cn("w-4 h-4", expandedPlanId === plan.id && !selectionMode ? "text-blue-600" : "text-muted-foreground")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{plan.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(plan.createdAt), "yyyy년 MM월 dd일 HH:mm")}
                          {plan.createdBy && ` · ${plan.createdBy}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!selectionMode && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMutation.mutate(plan.id);
                            }}
                            data-testid={`button-delete-draft-${plan.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {!selectionMode && <ChevronRight className={cn(
                          "w-4 h-4 text-muted-foreground transition-transform",
                          expandedPlanId === plan.id && "rotate-90"
                        )} />}
                      </div>
                    </div>

                    {/* 인라인 펼침 미리보기 */}
                    {expandedPlanId === plan.id && (
                      <CardContent className="pt-0 pb-4 px-4 border-t border-muted">
                        {plan.emailDraft ? (
                          <div className="mt-3">
                            <div className="rounded border overflow-hidden bg-white dark:bg-white" style={{ height: 560 }}>
                              <iframe
                                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:16px 20px;padding:0;background:#fff}</style></head><body>${plan.emailDraft.startsWith("<") ? plan.emailDraft : `<pre style="font-family:sans-serif;white-space:pre-wrap">${plan.emailDraft}</pre>`}</body></html>`}
                                className="w-full h-full border-0"
                                sandbox="allow-same-origin"
                                title={`${plan.title} 미리보기`}
                                data-testid={`iframe-draft-${plan.id}`}
                              />
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground py-4 text-center">저장된 내역이 없습니다.</p>
                        )}
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── 탭3: 자동발송 ── */}
        <TabsContent value="auto">
          <div className="flex flex-col gap-4 max-w-2xl">
            {/* 스케줄 정보 카드 */}
            <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-sm">스피드이엔지 자동 이메일 발송</span>
                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 font-medium">활성화</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Timer className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-muted-foreground text-xs">실행 일정</p>
                      <p className="font-medium">평일(월~금) 오후 17:00 KST</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Send className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-muted-foreground text-xs">자동 발송 대상</p>
                      <p className="font-medium">jaeha.ryu@ktmos.co.kr</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Inbox className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-muted-foreground text-xs">감지 키워드</p>
                      <p className="font-medium">스피드이엔지 (당일 수신 메일)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-muted-foreground text-xs">다음 실행 예정</p>
                      <p className="font-medium">
                        {autoJobStatus?.nextRun
                          ? format(new Date(autoJobStatus.nextRun), "yyyy년 MM월 dd일 HH:mm")
                          : "-"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="pt-1 border-t border-blue-200 dark:border-blue-800 flex items-center gap-2">
                  <p className="text-xs text-muted-foreground flex-1">
                    매일 17시에 Gmail을 확인하여 스피드이엔지 작업일정 메일이 있으면 AI로 파싱하여 자동 발송합니다. 메일이 없으면 아무것도 발송하지 않습니다.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1.5"
                    onClick={() => runNowMutation.mutate()}
                    disabled={runNowMutation.isPending || autoJobStatus?.running}
                    data-testid="btn-run-auto-now"
                  >
                    {autoJobStatus?.running ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" />실행 중...</>
                    ) : (
                      <><Play className="w-3.5 h-3.5" />지금 실행</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 마지막 실행 결과 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  마지막 실행 결과
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {!autoJobStatus?.lastRun ? (
                  <p className="text-sm text-muted-foreground py-2">아직 실행 이력이 없습니다.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      {autoJobStatus.lastResult === "sent" && <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />}
                      {autoJobStatus.lastResult === "not_found" && <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />}
                      {autoJobStatus.lastResult === "error" && <X className="w-5 h-5 text-destructive shrink-0" />}
                      {!autoJobStatus.lastResult && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-medium",
                          autoJobStatus.lastResult === "sent" && "text-green-700 dark:text-green-400",
                          autoJobStatus.lastResult === "not_found" && "text-amber-700 dark:text-amber-400",
                          autoJobStatus.lastResult === "error" && "text-destructive",
                        )}>
                          {autoJobStatus.lastResult === "sent" && "발송 완료"}
                          {autoJobStatus.lastResult === "not_found" && "메일 없음 (발송 생략)"}
                          {autoJobStatus.lastResult === "error" && "오류 발생"}
                          {!autoJobStatus.lastResult && "실행 중..."}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {autoJobStatus.lastRun ? format(new Date(autoJobStatus.lastRun), "yyyy년 MM월 dd일 HH:mm:ss") : ""}
                        </p>
                      </div>
                    </div>
                    {autoJobStatus.lastMessage && (
                      <p className="text-xs text-muted-foreground bg-muted rounded px-3 py-2 break-all">
                        {autoJobStatus.lastMessage}
                      </p>
                    )}
                    {autoJobStatus.lastResult === "sent" && autoJobStatus.lastSentTo && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-green-50 dark:bg-green-950/30 rounded px-3 py-2">
                          <p className="text-muted-foreground">발송 대상</p>
                          <p className="font-medium">{autoJobStatus.lastSentTo}</p>
                        </div>
                        <div className="bg-green-50 dark:bg-green-950/30 rounded px-3 py-2">
                          <p className="text-muted-foreground">파싱된 작업</p>
                          <p className="font-medium">{autoJobStatus.lastItemCount ?? 0}건</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 동작 방식 설명 */}
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">동작 방식</p>
                <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                  <li>평일 오후 17:00에 Gmail INBOX를 자동으로 확인합니다</li>
                  <li>당일 수신된 "스피드이엔지" 작업일정 메일을 탐색합니다</li>
                  <li>메일이 없으면 <strong>아무것도 발송하지 않습니다</strong></li>
                  <li>메일이 있으면 AI(GPT-4o)로 작업 내용을 파싱합니다</li>
                  <li>TBM/순회점검 등록 요청 이메일 초안을 자동 생성합니다</li>
                  <li><strong>jaeha.ryu@ktmos.co.kr</strong>로 자동 발송합니다</li>
                </ol>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* 이력 상세 다이얼로그 (업로드 탭 이력 클릭 시) */}
      {selectedPlan && (
        <Dialog open={!!selectedPlan} onOpenChange={() => setSelectedPlan(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>{selectedPlan.title}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto">
              {selectedPlan.emailDraft ? (
                <div className="rounded border overflow-hidden bg-white" style={{ height: 400 }}>
                  <iframe
                    srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:12px;padding:0;background:#fff}</style></head><body>${selectedPlan.emailDraft.startsWith("<") ? selectedPlan.emailDraft : `<pre style="font-family:sans-serif;white-space:pre-wrap">${selectedPlan.emailDraft}</pre>`}</body></html>`}
                    className="w-full h-full border-0"
                    sandbox="allow-same-origin"
                    title="저장된 이메일 미리보기"
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">저장된 내용이 없습니다.</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedPlan(null)}>닫기</Button>
              {selectedPlan.emailDraft && (
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={async () => {
                    const html = selectedPlan.emailDraft!;
                    try {
                      await navigator.clipboard.write([
                        new ClipboardItem({
                          "text/html": new Blob([html], { type: "text/html" }),
                        }),
                      ]);
                    } catch {
                      await navigator.clipboard.writeText(html);
                    }
                    toast({ title: "복사 완료" });
                  }}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  본문 복사
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Gmail 받은편지함 다이얼로그 */}
      <Dialog open={gmailOpen} onOpenChange={setGmailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-red-500" />
              Gmail 받은편지함 — fbwogk26@gmail.com
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto pr-1">
            {gmailEmails.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">받은편지함이 비어 있습니다.</p>
            ) : (
              gmailEmails.map((email) => (
                <button
                  key={email.uid}
                  className={cn(
                    "text-left rounded-lg border px-3 py-2.5 flex flex-col gap-0.5 transition-colors",
                    "hover:border-blue-300 hover:bg-blue-50 dark:hover:border-blue-700 dark:hover:bg-blue-950/40",
                    processingUid === email.uid ? "border-blue-400 bg-blue-50 dark:bg-blue-950/40" : "border-muted"
                  )}
                  disabled={processGmailMutation.isPending}
                  onClick={() => {
                    setProcessingUid(email.uid);
                    processGmailMutation.mutate(email.uid, {
                      onSettled: () => setProcessingUid(null),
                    });
                  }}
                  data-testid={`button-select-gmail-${email.uid}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground line-clamp-1 flex-1">{email.subject}</span>
                    {processingUid === email.uid && processGmailMutation.isPending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 shrink-0" />
                      : null}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{email.from || email.fromAddr}</span>
                    <span>·</span>
                    <span>{email.date ? new Date(email.date).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</span>
                  </div>
                </button>
              ))
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => listGmailMutation.mutate()}
              disabled={listGmailMutation.isPending}
            >
              {listGmailMutation.isPending
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />새로고침</>
                : <><RefreshCw className="w-3.5 h-3.5 mr-1.5" />새로고침</>}
            </Button>
            <Button variant="outline" onClick={() => setGmailOpen(false)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 플로팅 벌크 액션 바 */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border border-border shadow-xl rounded-full px-5 py-3">
          <span className="text-sm font-semibold text-red-600">{selectedIds.size}건 선택됨</span>
          <div className="w-px h-5 bg-border" />
          <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelectedIds(new Set())}>
            <X className="w-3.5 h-3.5 mr-1" />선택 해제
          </Button>
          <Button
            variant="destructive" size="sm" className="h-8"
            disabled={bulkDeleteMutation.isPending}
            onClick={() => { if (confirm(`선택한 ${selectedIds.size}건을 삭제하시겠습니까?`)) bulkDeleteMutation.mutate(Array.from(selectedIds)); }}
            data-testid="button-bulk-delete"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />삭제
          </Button>
        </div>
      )}
    </div>
  );
}
