import { useQuery, useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Pencil, X, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ApprovalSignatures {
  manager: string | null;
  reviewer: string | null;
  approver: string | null;
}

interface ApprovalStampProps {
  isAdmin?: boolean;
}

const ROLES = [
  { key: "manager" as const, label: "담당자" },
  { key: "reviewer" as const, label: "검토" },
  { key: "approver" as const, label: "결재" },
];

function resizeImageToDataUrl(file: File, maxPx = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ApprovalStamp({ isAdmin = false }: ApprovalStampProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingRole, setEditingRole] = useState<"manager" | "reviewer" | "approver" | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingDataUrl, setPendingDataUrl] = useState<string | null>(null);

  const { data: sigs, isLoading } = useQuery<ApprovalSignatures>({
    queryKey: ["/api/settings/approval-signatures"],
    queryFn: () => fetch("/api/settings/approval-signatures", { credentials: "include" }).then(r => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: (body: Partial<ApprovalSignatures>) =>
      fetch("/api/settings/approval-signatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/approval-signatures"] });
      toast({ title: "서명이 저장되었습니다" });
      setEditingRole(null);
      setPreviewUrl(null);
      setPendingDataUrl(null);
    },
    onError: () => toast({ variant: "destructive", title: "저장 실패" }),
  });

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editingRole) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file, 400);
      setPreviewUrl(dataUrl);
      setPendingDataUrl(dataUrl);
    } catch {
      toast({ variant: "destructive", title: "이미지 처리 실패" });
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleSave() {
    if (!editingRole || !pendingDataUrl) return;
    saveMutation.mutate({ [editingRole]: pendingDataUrl });
  }

  function handleDelete(role: "manager" | "reviewer" | "approver") {
    if (!confirm("이 서명을 삭제하시겠습니까?")) return;
    saveMutation.mutate({ [role]: "" });
  }

  function openEdit(role: "manager" | "reviewer" | "approver") {
    setEditingRole(role);
    setPreviewUrl(sigs?.[role] || null);
    setPendingDataUrl(null);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasAnySig = sigs && (sigs.manager || sigs.reviewer || sigs.approver);

  if (!hasAnySig && !isAdmin) return null;

  return (
    <>
      <div className="mt-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">결재</span>
          {isAdmin && (
            <span className="text-[10px] text-muted-foreground">서명 칸 클릭하여 변경</span>
          )}
        </div>

        <div className="border border-gray-300 dark:border-gray-600 rounded overflow-hidden inline-flex w-full max-w-md">
          {/* 결재 라벨 열 */}
          <div className="flex flex-col items-center justify-center border-r border-gray-300 dark:border-gray-600 px-2.5 bg-gray-50 dark:bg-gray-800 min-w-[2.5rem]">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 leading-tight">결</span>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 leading-tight">재</span>
          </div>

          {/* 빈 칸 (1번째) */}
          <div className="flex-1 border-r border-gray-300 dark:border-gray-600 min-w-[3rem]">
            <div className="h-6 border-b border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800" />
            <div className="h-16" />
          </div>

          {/* 서명 3칸 */}
          {ROLES.map((role) => {
            const url = sigs?.[role.key] || null;
            return (
              <div
                key={role.key}
                className={`flex-1 border-r last:border-r-0 border-gray-300 dark:border-gray-600 ${isAdmin ? "cursor-pointer group" : ""}`}
                onClick={() => isAdmin && openEdit(role.key)}
              >
                <div className="h-6 border-b border-gray-300 dark:border-gray-600 flex items-center justify-center bg-gray-50 dark:bg-gray-800">
                  <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">{role.label}</span>
                </div>
                <div className="h-16 flex items-center justify-center relative p-1">
                  {url ? (
                    <>
                      <img src={url} alt={role.label} className="max-h-full max-w-full object-contain" />
                      {isAdmin && (
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <Pencil className="h-3 w-3 text-gray-600" />
                        </div>
                      )}
                    </>
                  ) : isAdmin ? (
                    <div className="flex flex-col items-center gap-0.5 opacity-40 group-hover:opacity-80 transition-opacity">
                      <Upload className="h-3.5 w-3.5 text-gray-500" />
                      <span className="text-[9px] text-gray-500">업로드</span>
                    </div>
                  ) : (
                    <div className="w-full h-full" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 서명 편집 다이얼로그 */}
      <Dialog open={!!editingRole} onOpenChange={() => { setEditingRole(null); setPreviewUrl(null); setPendingDataUrl(null); }}>
        <DialogContent className="w-[95vw] max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingRole ? ROLES.find(r => r.key === editingRole)?.label : ""} 서명 설정
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {previewUrl ? (
              <div className="border rounded-lg p-3 flex items-center justify-center bg-gray-50 dark:bg-gray-900 min-h-[100px]">
                <img src={previewUrl} alt="미리보기" className="max-h-24 max-w-full object-contain" />
              </div>
            ) : (
              <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 text-muted-foreground">
                <Upload className="h-8 w-8" />
                <span className="text-sm">서명 이미지를 업로드하세요</span>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-1" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" />
                {previewUrl ? "이미지 변경" : "이미지 선택"}
              </Button>
              {(sigs?.[editingRole!] || previewUrl) && (
                <Button variant="outline" size="icon" className="text-destructive hover:text-destructive"
                  onClick={() => { setPreviewUrl(null); setPendingDataUrl(null); }}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            <input ref={fileRef} type="file" className="hidden"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={handleFileSelect} />

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => { setEditingRole(null); setPreviewUrl(null); setPendingDataUrl(null); }}>
                취소
              </Button>
              {sigs?.[editingRole!] && !pendingDataUrl && (
                <Button variant="outline" className="flex-1 text-destructive hover:text-destructive"
                  onClick={() => editingRole && handleDelete(editingRole)}
                  disabled={saveMutation.isPending}>
                  서명 삭제
                </Button>
              )}
              <Button className="flex-1"
                onClick={handleSave}
                disabled={!pendingDataUrl || saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                저장
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
