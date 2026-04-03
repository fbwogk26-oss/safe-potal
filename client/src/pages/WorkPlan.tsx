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
import {
  Upload, CalendarCheck, CheckCircle2, X, Loader2, Copy, Check, Mail, Trash2, Clock, Send, RefreshCw, Inbox
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

export default function WorkPlan() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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

  // Gmail 받은편지함
  const [gmailEmails, setGmailEmails] = useState<{uid:number;subject:string;from:string;fromAddr:string;date:string}[]>([]);
  const [gmailOpen, setGmailOpen] = useState(false);
  const [processingUid, setProcessingUid] = useState<number|null>(null);

  const { data: workPlans = [], isLoading } = useQuery<WorkPlan[]>({
    queryKey: ["/api/work-plans"],
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
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <CardTitle className="text-base text-green-700 dark:text-green-400">
                    초안 생성 완료 — {result.parsed.company} · {result.parsed.workDate} · {result.itemCount}건
                  </CardTitle>
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
                  {/* HTML 미리보기 */}
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

        {/* 오른쪽: 이력 */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                생성 이력
              </CardTitle>
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
                <div className="flex flex-col gap-1.5 max-h-[600px] overflow-y-auto">
                  {workPlans.map((plan) => (
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
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
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
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 이력 상세 다이얼로그 */}
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
    </div>
  );
}
