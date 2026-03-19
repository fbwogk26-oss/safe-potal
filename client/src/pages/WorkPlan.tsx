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
import { Separator } from "@/components/ui/separator";
import {
  Upload, FileSpreadsheet, Mail, Download, Trash2, CalendarCheck,
  Clock, CheckCircle2, ChevronRight, X, Loader2, Copy, Check
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
  processedFileUrl: string;
}

export default function WorkPlan() {
  const { canEditSubcontract } = usePermissions();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [planTitle, setPlanTitle] = useState("");
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [editedDraft, setEditedDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<WorkPlan | null>(null);

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
      setEditedDraft(data.emailDraft);
      queryClient.invalidateQueries({ queryKey: ["/api/work-plans"] });
      toast({ title: "처리 완료", description: "엑셀 파일이 포맷되고 이메일 초안이 생성되었습니다." });
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

  const handleFileSelect = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast({ title: "형식 오류", description: "엑셀 파일(.xlsx, .xls)만 업로드 가능합니다", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
    setUploadResult(null);
    setEditedDraft("");
    if (!planTitle) {
      const baseName = file.name.replace(/\.[^.]+$/, "");
      setPlanTitle(baseName);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const handleUpload = () => {
    if (!selectedFile) return;
    uploadMutation.mutate({ file: selectedFile, title: planTitle });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editedDraft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "복사 완료", description: "이메일 초안이 클립보드에 복사되었습니다." });
  };

  const handleReset = () => {
    setSelectedFile(null);
    setUploadResult(null);
    setEditedDraft("");
    setPlanTitle("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50">
            <CalendarCheck className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">작업계획</h1>
            <p className="text-sm text-muted-foreground">엑셀 파일을 업로드하면 자동으로 포맷팅하고 이메일 초안을 생성합니다</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 왼쪽: 업로드 + 결과 */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          {/* 업로드 영역 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-green-600" />
                엑셀 파일 업로드
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* 제목 입력 */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="plan-title" className="text-sm font-medium">작업계획 제목</Label>
                <Input
                  id="plan-title"
                  data-testid="input-plan-title"
                  placeholder="예: 2026년 1분기 작업계획"
                  value={planTitle}
                  onChange={(e) => setPlanTitle(e.target.value)}
                />
              </div>

              {/* 드래그 앤 드롭 영역 */}
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
                  accept=".xlsx,.xls"
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
                    <p className="font-medium">엑셀 파일을 드래그하거나 클릭하여 선택</p>
                    <p className="text-xs">.xlsx, .xls 파일 지원 (최대 50MB)</p>
                  </div>
                )}
              </div>

              {/* 액션 버튼 */}
              <div className="flex gap-2">
                <Button
                  data-testid="button-upload-excel"
                  disabled={!selectedFile || uploadMutation.isPending}
                  onClick={handleUpload}
                  className="flex-1"
                >
                  {uploadMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />처리 중...</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-2" />포맷팅 + 이메일 초안 생성</>
                  )}
                </Button>
                {(selectedFile || uploadResult) && (
                  <Button variant="outline" size="icon" onClick={handleReset} data-testid="button-reset">
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 이메일 초안 결과 */}
          {uploadResult && (
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
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleCopy} data-testid="button-copy-draft">
                      {copied ? <><Check className="w-3.5 h-3.5 mr-1 text-green-600" />복사됨</> : <><Copy className="w-3.5 h-3.5 mr-1" />복사</>}
                    </Button>
                    <a href={uploadResult.processedFileUrl} download target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline" data-testid="button-download-excel">
                        <Download className="w-3.5 h-3.5 mr-1" />포맷 엑셀
                      </Button>
                    </a>
                  </div>
                </div>
                {uploadResult.plan.sheetSummary && (
                  <p className="text-xs text-muted-foreground mt-1">{uploadResult.plan.sheetSummary}</p>
                )}
              </CardHeader>
              <CardContent>
                <Textarea
                  data-testid="textarea-email-draft"
                  value={editedDraft}
                  onChange={(e) => setEditedDraft(e.target.value)}
                  rows={16}
                  className="font-mono text-xs resize-y"
                  placeholder="이메일 초안이 여기에 표시됩니다"
                />
                <p className="text-xs text-muted-foreground mt-2">내용을 직접 수정한 후 복사하여 사용하세요.</p>
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
                          <a
                            href={plan.processedFileUrl}
                            download
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
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
    </div>
  );
}
