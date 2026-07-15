import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { maskName } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, Search, Copy, Trash2, Eye, CheckCircle2,
  Monitor, MapPin, Hash, Clock, Users, BookOpen,
  GraduationCap, ShoppingCart, ClipboardCheck, CalendarDays,
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface SignatureRecord {
  id: string;
  rawId: number;
  type: "education" | "equipment" | "inspection";
  sessionTitle: string;
  signerRole?: string;
  sessionDate: string;
  sessionDepartment: string;
  signerName: string;
  signerDepartment: string;
  signatureData: string;
  signedAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  consentAgreed: boolean | null;
  integrityHash: string | null;
}

function parseUA(ua: string | null): string | null {
  if (!ua) return null;
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS/i.test(ua)) return "macOS";
  return ua.slice(0, 24) + "…";
}

function groupByDate(records: SignatureRecord[]): [string, SignatureRecord[]][] {
  const map = new Map<string, SignatureRecord[]>();
  for (const r of records) {
    const key = r.signedAt
      ? new Date(r.signedAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
      : "날짜 없음";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return Array.from(map.entries());
}

function getDateLabel(key: string): string {
  const fmt = (d: Date) => d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const today = fmt(new Date());
  const yesterday = fmt(new Date(Date.now() - 86_400_000));
  if (key === today) return "오늘";
  if (key === yesterday) return "어제";
  return key;
}

function TypeChip({ type, signerRole }: { type: "education" | "equipment" | "inspection"; signerRole?: string }) {
  if (type === "education") return (
    <Badge className="gap-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-0 text-xs">
      <GraduationCap className="w-3 h-3" />교육
    </Badge>
  );
  if (type === "inspection") return (
    <div className="flex flex-col gap-0.5 items-start">
      <Badge className="gap-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-0 text-xs">
        <ClipboardCheck className="w-3 h-3" />합동점검
      </Badge>
      {signerRole && (
        <span className={`text-[10px] font-medium px-1.5 rounded-full ${signerRole === "도급인" ? "text-blue-600" : "text-orange-600"}`}>
          {signerRole}
        </span>
      )}
    </div>
  );
  return (
    <Badge className="gap-1 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-0 text-xs">
      <ShoppingCart className="w-3 h-3" />보호구
    </Badge>
  );
}

/** 서명 이미지 미니 썸네일 */
function SigThumb({ data }: { data: string }) {
  if (!data) return <div className="w-14 h-8 rounded border bg-muted flex items-center justify-center text-[9px] text-muted-foreground">없음</div>;
  return (
    <div className="w-14 h-8 rounded border bg-white flex items-center justify-center overflow-hidden">
      <img src={data} alt="서명" className="max-w-full max-h-full object-contain" />
    </div>
  );
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
            <TypeChip type={sig.type} />
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border bg-muted/30 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">구분</span>
              <span className="font-medium">{sig.type === "education" ? "교육 이수 서명" : sig.type === "inspection" ? "합동점검 서명" : "보호구 지급 서명"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{sig.type === "education" ? "교육명" : "지급 항목"}</span>
              <span className="font-medium text-right max-w-[220px]">{sig.sessionTitle || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">일자</span>
              <span className="font-medium">{sig.sessionDate || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">팀</span>
              <span className="font-medium">{sig.sessionDepartment || "—"}</span>
            </div>
            <div className="border-t border-border/50 my-1" />
            <div className="flex justify-between">
              <span className="text-muted-foreground">서명자</span>
              <span className="font-semibold">{sig.signerName ? maskName(sig.signerName) : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">소속팀</span>
              <span className="font-medium">{sig.signerDepartment || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">서명 일시</span>
              <span className="font-medium text-xs">
                {sig.signedAt ? format(new Date(sig.signedAt), "yyyy-MM-dd HH:mm:ss", { locale: ko }) : "—"}
              </span>
            </div>
            {sig.type === "education" && (
              <>
                <div className="border-t border-border/50 my-1" />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">개인정보 동의</span>
                  {sig.consentAgreed
                    ? <Badge className="gap-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0"><CheckCircle2 className="w-3 h-3" />동의함</Badge>
                    : <Badge variant="outline" className="text-muted-foreground text-xs">정보 없음</Badge>}
                </div>
                <div className="flex justify-between items-start gap-2">
                  <span className="text-muted-foreground shrink-0">IP 주소</span>
                  <span className="font-mono text-xs text-right">{sig.ipAddress || "알 수 없음"}</span>
                </div>
                <div className="flex justify-between items-start gap-2">
                  <span className="text-muted-foreground shrink-0">브라우저</span>
                  <span className="text-xs text-right max-w-[220px] break-words">{parseUA(sig.userAgent) || "알 수 없음"}</span>
                </div>
              </>
            )}
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
  const [typeFilter, setTypeFilter] = useState<"all" | "education" | "equipment" | "inspection">("all");
  const [selected, setSelected] = useState<SignatureRecord | null>(null);

  const { data: signatures = [], isLoading } = useQuery<SignatureRecord[]>({
    queryKey: ["/api/admin/signatures"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/signatures/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/signatures"] });
      toast({ title: "서명 기록이 삭제되었습니다." });
    },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const filtered = useMemo(() => signatures.filter(s => {
    if (typeFilter !== "all" && s.type !== typeFilter) return false;
    const q = search.toLowerCase();
    return !q ||
      s.signerName.toLowerCase().includes(q) ||
      s.signerDepartment.toLowerCase().includes(q) ||
      s.sessionTitle.toLowerCase().includes(q) ||
      (s.ipAddress ?? "").includes(q);
  }), [signatures, search, typeFilter]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  const eduCount  = signatures.filter(s => s.type === "education").length;
  const equipCount = signatures.filter(s => s.type === "equipment").length;
  const inspCount = signatures.filter(s => s.type === "inspection").length;
  const todayCount = signatures.filter(s => {
    if (!s.signedAt) return false;
    const d = new Date(s.signedAt), now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }).length;

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" />서명 관리 로그
        </h1>
        <p className="text-sm text-muted-foreground mt-1">교육 이수 · 보호구 지급 · 합동점검 서명 통합 관리</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "전체 서명",    value: signatures.length, icon: Users,         bg: "bg-primary/10",         color: "text-primary" },
          { label: "교육 서명",    value: eduCount,           icon: GraduationCap, bg: "bg-blue-500/10",        color: "text-blue-600" },
          { label: "보호구 서명",  value: equipCount,         icon: ShoppingCart,  bg: "bg-orange-500/10",      color: "text-orange-600" },
          { label: "합동점검",     value: inspCount,          icon: ClipboardCheck, bg: "bg-green-500/10",      color: "text-green-600" },
        ].map(({ label, value, icon: Icon, bg, color }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold leading-tight">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 오늘 서명 + 검색/필터 */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* 오늘 서명 배지 */}
            <div className="flex items-center gap-2 text-sm font-medium">
              <CalendarDays className="w-4 h-4 text-violet-600" />
              오늘 서명
              <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-0">{todayCount}건</Badge>
            </div>
            <div className="h-4 w-px bg-border hidden sm:block" />
            {/* 유형 필터 */}
            <div className="flex rounded-lg border bg-muted/40 p-0.5 text-xs">
              {(["all", "education", "equipment", "inspection"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${typeFilter === t ? "bg-white dark:bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  data-testid={`button-filter-${t}`}
                >
                  {t === "all" ? "전체" : t === "education" ? "교육" : t === "equipment" ? "보호구" : "합동점검"}
                </button>
              ))}
            </div>
            {/* 검색 */}
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="이름, 팀, 교육명, IP 검색..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
                data-testid="input-signature-search"
              />
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap ml-auto">{filtered.length.toLocaleString()}건</span>
          </div>
        </CardContent>
      </Card>

      {/* 날짜별 그룹 목록 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">불러오는 중…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
          <ShieldCheck className="w-10 h-10 opacity-20" />
          <p className="text-sm">서명 기록이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {groups.map(([dateKey, dateSigs]) => (
            <div key={dateKey}>
              {/* 날짜 구분 헤더 */}
              <div className="flex items-center gap-3 py-3">
                <div className="h-px flex-1 bg-border" />
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-background px-2">
                  <CalendarDays className="w-3 h-3" />
                  {getDateLabel(dateKey)}
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{dateSigs.length}건</Badge>
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* 서명 행 목록 */}
              <div className="space-y-1.5">
                {dateSigs.map(sig => (
                  <div
                    key={sig.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-card hover:bg-muted/30 transition-colors"
                    data-testid={`row-signature-${sig.id}`}
                  >
                    {/* 서명 썸네일 */}
                    <SigThumb data={sig.signatureData} />

                    {/* 구분 배지 */}
                    <div className="w-20 flex-shrink-0">
                      <TypeChip type={sig.type} signerRole={sig.signerRole} />
                    </div>

                    {/* 메인 정보 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" title={sig.sessionTitle}>
                        {sig.sessionTitle || "—"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        <span className="font-medium text-foreground/80">{sig.signerName ? maskName(sig.signerName) : "—"}</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span>{sig.signerDepartment || sig.sessionDepartment || "—"}</span>
                        {sig.sessionDate && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <span>{sig.sessionDate}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 동의 + 기기 + IP (sm 이상) */}
                    <div className="hidden md:flex flex-col items-end gap-1 text-xs text-muted-foreground flex-shrink-0">
                      {sig.type === "education" && (
                        sig.consentAgreed
                          ? <Badge className="gap-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 text-[10px] px-1.5 py-0"><CheckCircle2 className="w-2.5 h-2.5" />동의</Badge>
                          : null
                      )}
                      {sig.userAgent && (
                        <span className="flex items-center gap-1">
                          <Monitor className="w-3 h-3" />{parseUA(sig.userAgent)}
                        </span>
                      )}
                      {sig.ipAddress && (
                        <span className="flex items-center gap-1 font-mono text-[11px]">
                          <MapPin className="w-3 h-3" />{sig.ipAddress}
                        </span>
                      )}
                    </div>

                    {/* 해시 */}
                    <div className="hidden lg:block flex-shrink-0 w-20 text-right">
                      {sig.integrityHash ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="font-mono text-xs text-muted-foreground/60 cursor-default hover:text-muted-foreground transition-colors">
                                <Hash className="w-3 h-3 inline mr-0.5" />{sig.integrityHash.slice(0, 6)}…
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs break-all"><p>{sig.integrityHash}</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : null}
                    </div>

                    {/* 서명 시간 */}
                    <div className="text-xs text-muted-foreground text-right flex-shrink-0 w-16">
                      {sig.signedAt ? (
                        <span className="font-mono">{format(new Date(sig.signedAt), "HH:mm", { locale: ko })}</span>
                      ) : "—"}
                    </div>

                    {/* 액션 버튼 */}
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => setSelected(sig)}
                        data-testid={`button-view-sig-${sig.id}`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => {
                          const label = sig.type === "education"
                            ? `${maskName(sig.signerName)}님의 교육 서명`
                            : sig.type === "inspection"
                              ? `${maskName(sig.signerName)}님의 합동점검 서명`
                              : `${maskName(sig.signerName)}님의 보호구 지급 서명`;
                          if (confirm(`${label} 기록을 삭제하시겠습니까?`)) deleteMutation.mutate(sig.id);
                        }}
                        data-testid={`button-delete-sig-${sig.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <SignaturePreviewDialog sig={selected} open={!!selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
