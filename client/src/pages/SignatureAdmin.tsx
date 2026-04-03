import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, Search, Copy, Trash2, Eye, CheckCircle2,
  XCircle, Monitor, MapPin, Hash, Clock, Users, BookOpen,
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface SignatureRecord {
  id: number;
  sessionId: number;
  sessionTitle: string;
  sessionDate: string;
  sessionDepartment: string;
  signerName: string;
  signerDepartment: string | null;
  signatureData: string;
  signedAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  consentAgreed: boolean | null;
  integrityHash: string | null;
}

function parseUA(ua: string | null) {
  if (!ua) return "알 수 없음";
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS/i.test(ua)) return "macOS";
  return ua.slice(0, 30) + "…";
}

function SignaturePreviewDialog({ sig, open, onClose }: { sig: SignatureRecord; open: boolean; onClose: () => void }) {
  const { toast } = useToast();

  const copyHash = () => {
    if (!sig.integrityHash) return;
    navigator.clipboard.writeText(sig.integrityHash);
    toast({ title: "해시값 복사됨" });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            서명 상세 정보
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border bg-muted/30 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">교육명</span>
              <span className="font-medium">{sig.sessionTitle || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">교육 일자</span>
              <span className="font-medium">{sig.sessionDate || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">교육 팀</span>
              <span className="font-medium">{sig.sessionDepartment || "-"}</span>
            </div>
            <div className="border-t border-border/50 my-1" />
            <div className="flex justify-between">
              <span className="text-muted-foreground">서명자</span>
              <span className="font-semibold">{sig.signerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">소속팀</span>
              <span className="font-medium">{sig.signerDepartment || sig.sessionDepartment || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">서명 일시</span>
              <span className="font-medium text-xs">
                {sig.signedAt ? format(new Date(sig.signedAt), "yyyy-MM-dd HH:mm:ss", { locale: ko }) : "-"}
              </span>
            </div>
            <div className="border-t border-border/50 my-1" />
            <div className="flex justify-between">
              <span className="text-muted-foreground">개인정보 동의</span>
              {sig.consentAgreed
                ? <Badge className="gap-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0"><CheckCircle2 className="w-3 h-3" />동의함</Badge>
                : <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />미동의</Badge>}
            </div>
            <div className="flex justify-between items-start gap-2">
              <span className="text-muted-foreground shrink-0">IP 주소</span>
              <span className="font-mono text-xs text-right">{sig.ipAddress || "알 수 없음"}</span>
            </div>
            <div className="flex justify-between items-start gap-2">
              <span className="text-muted-foreground shrink-0">브라우저</span>
              <span className="text-xs text-right max-w-[220px] break-words">{sig.userAgent || "알 수 없음"}</span>
            </div>
          </div>

          {sig.integrityHash && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Hash className="w-3.5 h-3.5" /> 무결성 해시 (SHA-256)
              </p>
              <div className="flex items-center gap-2 rounded-lg bg-muted p-2">
                <span className="font-mono text-xs flex-1 break-all">{sig.integrityHash}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copyHash} data-testid="button-copy-hash">
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          {sig.signatureData && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">서명 이미지</p>
              <div className="border rounded-xl bg-white p-3 flex justify-center">
                <img src={sig.signatureData} alt="서명" className="max-h-24 object-contain" />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SignatureAdmin() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SignatureRecord | null>(null);

  const { data: signatures = [], isLoading } = useQuery<SignatureRecord[]>({
    queryKey: ["/api/admin/signatures"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/signatures/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/signatures"] });
      toast({ title: "서명 기록이 삭제되었습니다." });
    },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const filtered = signatures.filter(s => {
    const q = search.toLowerCase();
    return !q ||
      s.signerName.toLowerCase().includes(q) ||
      (s.signerDepartment ?? "").toLowerCase().includes(q) ||
      (s.sessionTitle ?? "").toLowerCase().includes(q) ||
      (s.ipAddress ?? "").includes(q);
  });

  const consentCount = signatures.filter(s => s.consentAgreed).length;
  const todayCount = signatures.filter(s => {
    if (!s.signedAt) return false;
    const d = new Date(s.signedAt);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          서명 관리
        </h1>
        <p className="text-sm text-muted-foreground mt-1">교육 이수 서명 기록 및 법적 증빙 메타데이터</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">전체 서명</p>
              <p className="text-xl font-bold">{signatures.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">동의 완료</p>
              <p className="text-xl font-bold">{consentCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">오늘 서명</p>
              <p className="text-xl font-bold">{todayCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">미동의</p>
              <p className="text-xl font-bold">{signatures.length - consentCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 검색 + 테이블 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">서명 기록 목록</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="이름, 팀, 교육명, IP 검색..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
                data-testid="input-signature-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <ShieldCheck className="w-10 h-10 opacity-20" />
              <p className="text-sm">서명 기록이 없습니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs whitespace-nowrap">교육명</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs whitespace-nowrap">서명자</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs whitespace-nowrap">소속팀</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs whitespace-nowrap">서명 일시</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs whitespace-nowrap">동의</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs whitespace-nowrap">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />IP</span>
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs whitespace-nowrap">
                      <span className="flex items-center gap-1"><Monitor className="w-3 h-3" />기기</span>
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs whitespace-nowrap">
                      <span className="flex items-center gap-1"><Hash className="w-3 h-3" />해시</span>
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(sig => (
                    <tr
                      key={sig.id}
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                      data-testid={`row-signature-${sig.id}`}
                    >
                      <td className="px-4 py-3 max-w-[160px]">
                        <p className="font-medium truncate" title={sig.sessionTitle}>{sig.sessionTitle || "-"}</p>
                        <p className="text-xs text-muted-foreground">{sig.sessionDate || ""}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold whitespace-nowrap">{sig.signerName}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{sig.signerDepartment || sig.sessionDepartment || "-"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {sig.signedAt ? format(new Date(sig.signedAt), "MM-dd HH:mm", { locale: ko }) : "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {sig.consentAgreed
                          ? <Badge className="gap-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 text-xs"><CheckCircle2 className="w-3 h-3" />동의</Badge>
                          : <Badge variant="outline" className="text-xs text-muted-foreground">-</Badge>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{sig.ipAddress || "-"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default">{parseUA(sig.userAgent)}</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs break-all">
                              <p>{sig.userAgent || "알 수 없음"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </td>
                      <td className="px-4 py-3">
                        {sig.integrityHash ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="font-mono text-xs text-muted-foreground cursor-default">
                                  {sig.integrityHash.slice(0, 8)}…
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs break-all">
                                <p>{sig.integrityHash}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : <span className="text-muted-foreground text-xs">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setSelected(sig)}
                            data-testid={`button-view-sig-${sig.id}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm(`${sig.signerName}님의 서명 기록을 삭제하시겠습니까?`)) {
                                deleteMutation.mutate(sig.id);
                              }
                            }}
                            data-testid={`button-delete-sig-${sig.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <SignaturePreviewDialog
          sig={selected}
          open={!!selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
