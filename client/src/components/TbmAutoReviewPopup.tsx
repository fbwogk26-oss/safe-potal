import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, CheckCircle2, XCircle, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

type PendingNote = {
  id: number;
  recordId: number;
  noteType: string;
  reason: string | null;
  photoUrls: string[] | null;
  photoFileNames: string[] | null;
  photoUrl: string | null;
  justificationStatus: string | null;
  pendingReview: boolean;
  record?: {
    id: number;
    workOrderNo: string | null;
    team: string | null;
    startDate: string | null;
    taskContent: string | null;
    worker: string | null;
    tbmAiResult: string | null;
    tbmResult: string | null;
  };
};

export function TbmAutoReviewPopup() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [justifStatus, setJustifStatus] = useState<"소명완료" | "소명불가" | null>(null);
  const [reason, setReason] = useState("");
  const [photoIdx, setPhotoIdx] = useState(0);
  const [saving, setSaving] = useState(false);

  const { data: pending = [] } = useQuery<PendingNote[]>({
    queryKey: ["/api/ais-inbox-email/pending-reviews"],
    refetchInterval: 30000,
    enabled: !!user,
    staleTime: 20000,
  });

  const dismissMutation = useMutation({
    mutationFn: (noteId: number) =>
      fetch(`/api/ais-inbox-email/pending-reviews/${noteId}/dismiss`, {
        method: "PUT",
        credentials: "include",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ais-inbox-email/pending-reviews"] });
    },
  });

  const current = pending[currentIdx];
  const total = pending.length;
  const isOpen = total > 0;

  const photos = current?.photoUrls && current.photoUrls.length > 0
    ? current.photoUrls
    : current?.photoUrl ? [current.photoUrl] : [];

  const handleClose = async () => {
    if (!current) return;
    await dismissMutation.mutateAsync(current.id);
    setCurrentIdx(prev => Math.max(0, Math.min(prev, pending.length - 2)));
    setJustifStatus(null);
    setReason("");
    setPhotoIdx(0);
  };

  const handleSave = async () => {
    if (!current || !justifStatus) return;
    setSaving(true);
    try {
      await fetch(`/api/ais-safety/records/${current.recordId}/justification`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ justificationStatus: justifStatus, justificationReason: reason || null }),
      });
      await fetch(`/api/ais-inbox-email/pending-reviews/${current.id}/dismiss`, {
        method: "PUT",
        credentials: "include",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/ais-safety/tbm-notes"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/ais-inbox-email/pending-reviews"] });
      toast({
        title: justifStatus === "소명완료" ? "소명 완료로 처리했습니다 ✓" : "소명 불가로 처리했습니다",
        description: current.record?.workOrderNo ? `작업번호: ${current.record.workOrderNo}` : undefined,
      });
      setCurrentIdx(prev => Math.max(0, Math.min(prev, pending.length - 2)));
      setJustifStatus(null);
      setReason("");
      setPhotoIdx(0);
    } catch {
      toast({ title: "저장에 실패했습니다", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !current) return null;

  const rec = current.record;

  return (
    <Dialog open={true} onOpenChange={() => handleClose()}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-red-500 px-5 py-4 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white text-base font-bold">
              <Mail className="w-4 h-4 flex-shrink-0" />
              소명 메일 자동접수 알림
              {total > 1 && (
                <Badge className="ml-auto bg-white/20 text-white border-0 text-xs">
                  {currentIdx + 1} / {total}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="text-orange-100 text-xs mt-0.5">
              메일로 접수된 소명 사진을 확인하고 소명 여부를 선택하세요.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-5 space-y-4">
          {/* 작업 정보 */}
          <div className="rounded-lg bg-muted/50 border border-border p-3 space-y-1.5 text-sm">
            {rec?.workOrderNo && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-16 flex-shrink-0">작업번호</span>
                <span className="font-mono font-semibold text-xs break-all">{rec.workOrderNo}</span>
              </div>
            )}
            {rec?.team && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-16 flex-shrink-0">팀</span>
                <span>{rec.team}</span>
              </div>
            )}
            {rec?.startDate && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-16 flex-shrink-0">작업일</span>
                <span>{rec.startDate}</span>
              </div>
            )}
            {rec?.taskContent && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-16 flex-shrink-0">작업내용</span>
                <span className="line-clamp-2">{rec.taskContent}</span>
              </div>
            )}
            <div className="flex gap-2 items-center">
              <span className="text-muted-foreground w-16 flex-shrink-0">AI 판정</span>
              <Badge variant="destructive" className="text-xs py-0 px-1.5">
                <AlertTriangle className="w-2.5 h-2.5 mr-1" />
                {rec?.tbmAiResult ?? "부적합"}
              </Badge>
            </div>
          </div>

          {/* 소명 사진 */}
          {photos.length > 0 ? (
            <div className="space-y-2">
              <Label className="text-sm font-medium">소명 사진 ({photos.length}장)</Label>
              <div className="relative rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center">
                <img
                  src={photos[photoIdx]}
                  alt={`소명 사진 ${photoIdx + 1}`}
                  className="max-h-48 w-full object-contain"
                />
                {photos.length > 1 && (
                  <>
                    <button
                      onClick={() => setPhotoIdx(i => Math.max(0, i - 1))}
                      disabled={photoIdx === 0}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-0.5 disabled:opacity-30"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPhotoIdx(i => Math.min(photos.length - 1, i + 1))}
                      disabled={photoIdx === photos.length - 1}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-0.5 disabled:opacity-30"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                      {photos.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setPhotoIdx(i)}
                          className={`w-1.5 h-1.5 rounded-full transition-colors ${i === photoIdx ? "bg-white" : "bg-white/40"}`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 py-6 text-center text-sm text-muted-foreground">
              첨부된 사진이 없습니다
            </div>
          )}

          {/* 기존 사유 */}
          {current.reason && (
            <div className="rounded-md bg-muted/40 border border-border px-3 py-2 text-sm">
              <span className="text-muted-foreground text-xs">기존 사유: </span>
              {current.reason}
            </div>
          )}

          {/* 소명 사유 입력 */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">소명 사유 (선택)</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="소명 사유를 입력하세요. (예: 안전모 착용 확인됨, 사다리 고정 완료 등)"
              rows={2}
              className="resize-none text-sm"
            />
          </div>

          {/* 소명 판정 버튼 */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setJustifStatus(s => s === "소명완료" ? null : "소명완료")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                justifStatus === "소명완료"
                  ? "border-green-500 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400"
                  : "border-border bg-muted/30 text-muted-foreground hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-950/20"
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              소명 가능
            </button>
            <button
              type="button"
              onClick={() => setJustifStatus(s => s === "소명불가" ? null : "소명불가")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                justifStatus === "소명불가"
                  ? "border-red-500 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                  : "border-border bg-muted/30 text-muted-foreground hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-950/20"
              }`}
            >
              <XCircle className="w-4 h-4" />
              소명 불가
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex items-center gap-2">
          {total > 1 && (
            <div className="flex gap-1 mr-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setCurrentIdx(i => Math.max(0, i - 1)); setJustifStatus(null); setReason(""); setPhotoIdx(0); }}
                disabled={currentIdx === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setCurrentIdx(i => Math.min(total - 1, i + 1)); setJustifStatus(null); setReason(""); setPhotoIdx(0); }}
                disabled={currentIdx === total - 1}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={handleClose} className="text-muted-foreground">
            나중에 처리
          </Button>
          <Button
            onClick={handleSave}
            disabled={!justifStatus || saving}
            className={`font-semibold ${
              justifStatus === "소명완료"
                ? "bg-green-600 hover:bg-green-700"
                : justifStatus === "소명불가"
                ? "bg-red-600 hover:bg-red-700"
                : ""
            }`}
          >
            {saving ? "저장 중..." : justifStatus ? `${justifStatus}로 저장` : "판정 선택 후 저장"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
