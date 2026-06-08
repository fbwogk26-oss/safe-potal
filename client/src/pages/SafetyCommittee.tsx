import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Users, Trash2, Presentation, FileText, Eye, Upload, Loader2, Plus, ExternalLink } from "lucide-react";
import type { SafetyCommittee } from "@shared/schema";

export default function SafetyCommitteePage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const [materialUrl, setMaterialUrl] = useState("");
  const [materialName, setMaterialName] = useState("");
  const [minutesUrl, setMinutesUrl] = useState("");
  const [minutesName, setMinutesName] = useState("");

  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const [uploadingMinutes, setUploadingMinutes] = useState(false);

  // 미리보기 상태
  const [officeViewerUrl, setOfficeViewerUrl] = useState<string | null>(null); // PPT Office Online
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [pdfModal, setPdfModal] = useState<{ viewerUrl: string; directUrl: string } | null>(null);

  const { data: committees = [], isLoading } = useQuery<SafetyCommittee[]>({
    queryKey: ["/api/safety-committees"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/safety-committees", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-committees"] });
      toast({ title: "등록됐습니다" });
      setDialogOpen(false);
    },
    onError: () => toast({ title: "저장 실패", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/safety-committees/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-committees"] });
      toast({ title: "수정됐습니다" });
      setDialogOpen(false);
    },
    onError: () => toast({ title: "수정 실패", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/safety-committees/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-committees"] });
      toast({ title: "삭제됐습니다" });
    },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const openCreate = () => {
    setEditId(null);
    setMaterialUrl(""); setMaterialName("");
    setMinutesUrl(""); setMinutesName("");
    setDialogOpen(true);
  };

  const openEdit = (c: SafetyCommittee) => {
    setEditId(c.id);
    setMaterialUrl(c.meetingMaterialUrl ?? "");
    setMaterialName(c.meetingMaterialName ?? "");
    setMinutesUrl(c.meetingMinutesUrl ?? "");
    setMinutesName(c.meetingMinutesName ?? "");
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const today = new Date().toISOString().slice(0, 10);
    const payload = {
      meetingDate: today,
      location: "-",
      meetingType: "정기",
      principalCount: 0,
      subcontractorCount: 0,
      meetingMaterialUrl: materialUrl,
      meetingMaterialName: materialName,
      meetingMinutesUrl: minutesUrl,
      meetingMinutesName: minutesName,
    };
    if (editId) updateMutation.mutate({ id: editId, data: payload });
    else createMutation.mutate(payload);
  };

  const uploadFile = async (file: File, endpoint: string, setter: (url: string, name: string) => void) => {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      const data = await res.json();
      setter(data.url, data.name);
      toast({ title: "업로드됐습니다" });
    } catch (e: any) {
      toast({ title: e.message || "업로드 실패", variant: "destructive" });
    }
  };

  const getExt = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

  const openMaterialPreview = (url: string, name: string) => {
    const ext = getExt(name);
    const fullUrl = `${window.location.origin}${url}`;
    if (ext === "pdf") {
      const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(fullUrl)}&embedded=true`;
      setPdfModal({ viewerUrl, directUrl: fullUrl });
    } else {
      setOfficeViewerUrl(`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fullUrl)}`);
    }
  };

  const openMinutesPreview = async (c: SafetyCommittee) => {
    const ext = getExt(c.meetingMinutesName ?? "");
    if (ext === "pdf") {
      const fullUrl = `${window.location.origin}${c.meetingMinutesUrl}`;
      const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(fullUrl)}&embedded=true`;
      setPdfModal({ viewerUrl, directUrl: fullUrl });
    } else {
      setDocLoading(true);
      setDocHtml("");
      try {
        const res = await fetch(`/api/safety-committees/${c.id}/preview-minutes`, { credentials: "include" });
        if (!res.ok) throw new Error("미리보기 불가");
        const data = await res.json();
        setDocHtml(data.html);
      } catch {
        toast({ title: "회의록 미리보기 실패", variant: "destructive" });
        setDocHtml(null);
      } finally { setDocLoading(false); }
    }
  };

  const formatDate = (c: SafetyCommittee) => {
    try {
      return new Date(c.createdAt!).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
    } catch { return c.meetingDate; }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600 shrink-0" />
            산업안전보건협의체
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">회의자료 및 회의록 관리</p>
        </div>
        <Button onClick={openCreate} size="sm" data-testid="button-create-committee">
          <Plus className="w-4 h-4 mr-1" />등록
        </Button>
      </div>

      {/* 목록 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />불러오는 중...
        </div>
      ) : committees.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Users className="w-9 h-9 mx-auto mb-2 opacity-30" />
            <p className="text-sm">등록된 항목이 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {committees.map((c) => (
            <Card key={c.id} className="p-4" data-testid={`card-committee-${c.id}`}>
              {/* 날짜 + 관리 버튼 */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-muted-foreground">{formatDate(c)}</span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => openEdit(c)} data-testid={`button-edit-committee-${c.id}`}>수정</Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => { if (confirm("삭제하시겠습니까?")) deleteMutation.mutate(c.id); }} data-testid={`button-delete-committee-${c.id}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* 회의자료 */}
              <div className="space-y-2">
                <FileRow
                  icon={<Presentation className="w-4 h-4 text-orange-500 shrink-0" />}
                  label="회의자료"
                  name={c.meetingMaterialName}
                  hasFile={!!c.meetingMaterialUrl}
                  color="orange"
                  onPreview={() => openMaterialPreview(c.meetingMaterialUrl!, c.meetingMaterialName ?? "")}
                  previewTestId={`button-preview-material-${c.id}`}
                />
                <FileRow
                  icon={<FileText className="w-4 h-4 text-blue-500 shrink-0" />}
                  label="회의록"
                  name={c.meetingMinutesName}
                  hasFile={!!c.meetingMinutesUrl}
                  color="blue"
                  onPreview={() => openMinutesPreview(c)}
                  previewTestId={`button-preview-minutes-${c.id}`}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 등록/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "수정" : "회의자료/회의록 등록"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* 회의자료 */}
            <UploadBox
              icon={<Presentation className="w-4 h-4" />}
              label="회의자료"
              accept=".ppt,.pptx,.pdf"
              hint="PPT · PPTX · PDF"
              color="orange"
              fileName={materialName}
              uploading={uploadingMaterial}
              onSelect={(f) => { setUploadingMaterial(true); uploadFile(f, "/api/safety-committees/upload-material", (u, n) => { setMaterialUrl(u); setMaterialName(n); }).finally(() => setUploadingMaterial(false)); }}
              onRemove={() => { setMaterialUrl(""); setMaterialName(""); }}
              testId="input-material-file"
            />
            {/* 회의록 */}
            <UploadBox
              icon={<FileText className="w-4 h-4" />}
              label="회의록"
              accept=".doc,.docx,.pdf"
              hint="DOC · DOCX · PDF"
              color="blue"
              fileName={minutesName}
              uploading={uploadingMinutes}
              onSelect={(f) => { setUploadingMinutes(true); uploadFile(f, "/api/safety-committees/upload-minutes", (u, n) => { setMinutesUrl(u); setMinutesName(n); }).finally(() => setUploadingMinutes(false)); }}
              onRemove={() => { setMinutesUrl(""); setMinutesName(""); }}
              testId="input-minutes-file"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-committee">
              {createMutation.isPending || updateMutation.isPending ? "저장 중..." : (editId ? "수정" : "등록")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PPT 미리보기 (Office Online) */}
      <Dialog open={!!officeViewerUrl} onOpenChange={() => setOfficeViewerUrl(null)}>
        <DialogContent className="max-w-5xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-3 pb-2 shrink-0 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Presentation className="w-4 h-4 text-orange-500" />회의자료 미리보기
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden p-2">
            {officeViewerUrl && <iframe src={officeViewerUrl} className="w-full h-full rounded border" title="PPT 미리보기" allowFullScreen />}
          </div>
        </DialogContent>
      </Dialog>

      {/* PDF 미리보기 (Google Docs Viewer) */}
      <Dialog open={!!pdfModal} onOpenChange={() => setPdfModal(null)}>
        <DialogContent className="max-w-3xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-3 pb-2 shrink-0 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileText className="w-4 h-4 text-red-500" />PDF 미리보기
              </DialogTitle>
              {pdfModal && (
                <a href={pdfModal.directUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mr-6">
                  <ExternalLink className="w-3.5 h-3.5" />새 탭
                </a>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-hidden p-2">
            {pdfModal && (
              <iframe
                src={pdfModal.viewerUrl}
                className="w-full h-full rounded border bg-muted/20"
                title="PDF 미리보기"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Word 미리보기 (mammoth HTML) */}
      <Dialog open={docHtml !== null} onOpenChange={() => setDocHtml(null)}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-3 pb-2 shrink-0 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4 text-blue-500" />회의록 미리보기
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {docLoading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />불러오는 중...
              </div>
            ) : (
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: docHtml || "" }} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── 파일 행 컴포넌트 ── */
function FileRow({ icon, label, name, hasFile, color, onPreview, previewTestId }: {
  icon: React.ReactNode; label: string; name?: string | null;
  hasFile: boolean; color: "orange" | "blue";
  onPreview: () => void; previewTestId: string;
}) {
  const colors = {
    orange: { bg: "bg-orange-50 border-orange-200", text: "text-orange-700", btn: "text-orange-600 border-orange-300 hover:bg-orange-50", empty: "text-orange-300" },
    blue: { bg: "bg-blue-50 border-blue-200", text: "text-blue-700", btn: "text-blue-600 border-blue-300 hover:bg-blue-50", empty: "text-blue-300" },
  }[color];

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${hasFile ? colors.bg : "bg-muted/20 border-dashed border-muted"}`}>
      <span className={hasFile ? colors.text : "text-muted-foreground/40"}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium ${hasFile ? colors.text : "text-muted-foreground"}`}>{label}</p>
        {name ? (
          <p className={`text-xs truncate ${colors.text} opacity-80`}>{name}</p>
        ) : (
          <p className="text-xs text-muted-foreground/60">파일 없음</p>
        )}
      </div>
      {hasFile && (
        <Button size="sm" variant="outline" className={`shrink-0 h-7 px-2 text-xs gap-1 ${colors.btn}`} onClick={onPreview} data-testid={previewTestId}>
          <Eye className="w-3 h-3" />보기
        </Button>
      )}
    </div>
  );
}

/* ── 업로드 박스 컴포넌트 ── */
function UploadBox({ icon, label, accept, hint, color, fileName, uploading, onSelect, onRemove, testId }: {
  icon: React.ReactNode; label: string; accept: string; hint: string;
  color: "orange" | "blue"; fileName: string; uploading: boolean;
  onSelect: (f: File) => void; onRemove: () => void; testId: string;
}) {
  const colors = {
    orange: { bg: "bg-orange-50/60", border: "border-orange-200", label: "text-orange-700", dashed: "border-orange-300 text-orange-600 hover:bg-orange-50" },
    blue: { bg: "bg-blue-50/60", border: "border-blue-200", label: "text-blue-700", dashed: "border-blue-300 text-blue-600 hover:bg-blue-50" },
  }[color];

  return (
    <div className={`space-y-2 border rounded-lg p-3 ${colors.bg} ${colors.border}`}>
      <p className={`flex items-center gap-2 text-sm font-semibold ${colors.label}`}>
        {icon}{label} <span className="font-normal opacity-60 text-xs">({hint})</span>
      </p>
      {fileName ? (
        <div className="flex items-center gap-2 bg-white border rounded p-2 text-sm">
          <span className={`flex-1 truncate text-xs ${colors.label}`}>{fileName}</span>
          <button type="button" className="text-muted-foreground hover:text-destructive text-xs shrink-0" onClick={onRemove}>삭제</button>
        </div>
      ) : (
        <label className={`flex items-center gap-2 border-2 border-dashed rounded-lg p-3 cursor-pointer ${colors.dashed}`}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Upload className="w-4 h-4 shrink-0" />}
          <span className="text-sm">{uploading ? "업로드 중..." : "파일 선택"}</span>
          <input type="file" accept={accept} className="hidden" disabled={uploading}
            onChange={e => { if (e.target.files?.[0]) onSelect(e.target.files[0]); e.target.value = ""; }}
            data-testid={testId} />
        </label>
      )}
    </div>
  );
}
