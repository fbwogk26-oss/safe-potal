import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { maskName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, Search, Copy, Trash2, Eye, CheckCircle2,
  Monitor, MapPin, Hash, Users, GraduationCap, ShoppingCart, ClipboardCheck, CalendarDays,
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

function parseUA(ua: string | null) {
  if (!ua) return null;
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS/i.test(ua)) return "macOS";
  return ua.slice(0, 20) + "…";
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

function getDateLabel(key: string) {
  const fmt = (d: Date) => d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  if (key === fmt(new Date())) return "오늘";
  if (key === fmt(new Date(Date.now() - 86_400_000))) return "어제";
  return key;
}

const TYPE_CONFIG = {
  education:  { label: "교육",    icon: GraduationCap, dot: "bg-blue-500" },
  equipment:  { label: "보호구",  icon: ShoppingCart,  dot: "bg-orange-500" },
  inspection: { label: "합동점검", icon: ClipboardCheck, dot: "bg-emerald-500" },
};

function TypePill({ type, signerRole }: { type: "education" | "equipment" | "inspection"; signerRole?: string }) {
  const cfg = TYPE_CONFIG[type];
  const Icon = cfg.icon;
  return (
    <div className="flex flex-col gap-0.5 items-start">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </span>
      {type === "inspection" && signerRole && (
        <span className="text-[10px] text-muted-foreground/60 pl-2.5">{signerRole}</span>
      )}
    </div>
  );
}

function SigThumb({ data }: { data: string }) {
  if (!data) return (
    <div className="w-16 h-9 rounded-lg border bg-muted flex items-center justify-center">
      <span className="text-[9px] text-muted-foreground/40">없음</span>
    </div>
  );
  return (
    <div className="w-16 h-9 rounded-lg border bg-white overflow-hidden flex items-center justify-center">
      <img src={data} alt="서명" className="max-w-full max-h-full object-contain" />
    </div>
  );
}

function DetailDialog({ sig, open, onClose }: { sig: SignatureRecord; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const cfg = TYPE_CONFIG[sig.type];
  const Icon = cfg.icon;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            {cfg.label} 서명 상세
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* 서명 이미지 */}
          {sig.signatureData && (
            <div className="border rounded-xl bg-white p-4 flex justify-center">
              <img src={sig.signatureData} alt="서명" className="max-h-28 object-contain" />
            </div>
          )}

          {/* 정보 */}
          <div className="space-y-2.5 text-sm">
            {[
              { label: sig.type === "education" ? "교육명" : "항목", value: sig.sessionTitle },
              { label: "일자", value: sig.sessionDate },
              { label: "팀", value: sig.sessionDepartment },
              { label: "서명자", value: sig.signerName ? maskName(sig.signerName) : null, bold: true },
              { label: "소속", value: sig.signerDepartment || sig.sessionDepartment },
              { label: "서명 일시", value: sig.signedAt ? format(new Date(sig.signedAt), "yyyy-MM-dd HH:mm:ss", { locale: ko }) : null, mono: true },
            ].map(({ label, value, bold, mono }) => value ? (
              <div key={label} className="flex justify-between gap-4">
                <span className="text-muted-foreground flex-shrink-0">{label}</span>
                <span className={`text-right ${bold ? "font-semibold" : ""} ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
              </div>
            ) : null)}

            {sig.type === "education" && (
              <>
                {sig.consentAgreed !== null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">개인정보 동의</span>
                    {sig.consentAgreed
                      ? <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0 gap-1"><CheckCircle2 className="w-3 h-3" />동의함</Badge>
                      : <span className="text-xs text-muted-foreground">정보 없음</span>}
                  </div>
                )}
                {sig.ipAddress && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IP 주소</span>
                    <span className="font-mono text-xs">{sig.ipAddress}</span>
                  </div>
                )}
                {sig.userAgent && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">기기</span>
                    <span className="text-xs">{parseUA(sig.userAgent)}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 해시 */}
          {sig.integrityHash && (
            <div className="rounded-xl bg-muted p-3 space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Hash className="w-3 h-3" />무결성 해시 (SHA-256)
              </p>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs flex-1 break-all text-muted-foreground">{sig.integrityHash}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0"
                  onClick={() => { navigator.clipboard.writeText(sig.integrityHash!); toast({ title: "해시 복사됨" }); }}
                  data-testid="button-copy-hash">
                  <Copy className="w-3 h-3" />
                </Button>
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/signatures"] }); toast({ title: "삭제되었습니다." }); },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const filtered = useMemo(() => signatures.filter(s => {
    if (typeFilter !== "all" && s.type !== typeFilter) return false;
    const q = search.toLowerCase();
    return !q || s.signerName.toLowerCase().includes(q) || s.signerDepartment.toLowerCase().includes(q) || s.sessionTitle.toLowerCase().includes(q) || (s.ipAddress ?? "").includes(q);
  }), [signatures, search, typeFilter]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  const counts = {
    edu: signatures.filter(s => s.type === "education").length,
    eq:  signatures.filter(s => s.type === "equipment").length,
    ins: signatures.filter(s => s.type === "inspection").length,
    today: signatures.filter(s => {
      if (!s.signedAt) return false;
      const d = new Date(s.signedAt), n = new Date();
      return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
    }).length,
  };

  return (
    <div className="space-y-5">

      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-none">서명 관리 로그</h1>
          <p className="text-xs text-muted-foreground mt-0.5">교육 이수 · 보호구 지급 · 합동점검 서명 통합 관리</p>
        </div>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "전체",      value: signatures.length, dot: "bg-primary" },
          { label: "교육",      value: counts.edu,        dot: "bg-blue-500" },
          { label: "보호구",    value: counts.eq,         dot: "bg-orange-500" },
          { label: "합동점검",  value: counts.ins,        dot: "bg-emerald-500" },
        ].map(({ label, value, dot }) => (
          <div key={label} className="rounded-xl border bg-card p-4 flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold tabular-nums">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 검색 + 필터 */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* 유형 탭 */}
        <div className="flex rounded-xl border bg-muted/40 p-0.5 text-xs">
          {(["all", "education", "equipment", "inspection"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${typeFilter === t ? "bg-white dark:bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid={`button-filter-${t}`}
            >
              {t === "all" ? "전체" : t === "education" ? "교육" : t === "equipment" ? "보호구" : "합동점검"}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="이름, 팀, 교육명 검색…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" data-testid="input-signature-search" />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">오늘 <strong className="text-foreground">{counts.today}</strong>건</span>
          <span className="text-xs text-muted-foreground/40">·</span>
          <span className="text-xs text-muted-foreground">표시 <strong className="text-foreground">{filtered.length}</strong>건</span>
        </div>
      </div>

      {/* 목록 */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">서명 기록이 없습니다.</p>
        </div>
      ) : (
        <div className="rounded-2xl border bg-card overflow-hidden">
          {groups.map(([dateKey, dateSigs], gi) => (
            <div key={dateKey}>
              {/* 날짜 헤더 */}
              <div className={`flex items-center gap-3 px-5 py-3 bg-muted/40 ${gi > 0 ? "border-t" : ""}`}>
                <CalendarDays className="w-3.5 h-3.5 text-muted-foreground/60" />
                <span className="text-xs font-semibold text-muted-foreground">{getDateLabel(dateKey)}</span>
                <div className="h-px flex-1 bg-border/60" />
                <span className="text-xs text-muted-foreground/60">{dateSigs.length}건</span>
              </div>

              {/* 서명 행 */}
              <div className="divide-y">
                {dateSigs.map(sig => (
                  <div key={sig.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/20 transition-colors" data-testid={`row-signature-${sig.id}`}>

                    {/* 서명 썸네일 */}
                    <SigThumb data={sig.signatureData} />

                    {/* 유형 */}
                    <div className="w-16 flex-shrink-0">
                      <TypePill type={sig.type} signerRole={sig.signerRole} />
                    </div>

                    {/* 메인 정보 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" title={sig.sessionTitle}>{sig.sessionTitle || "—"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span className="font-medium text-foreground/70">{sig.signerName ? maskName(sig.signerName) : "—"}</span>
                        {(sig.signerDepartment || sig.sessionDepartment) && <span className="ml-1.5">{sig.signerDepartment || sig.sessionDepartment}</span>}
                      </p>
                    </div>

                    {/* 동의 + IP + 기기 */}
                    <div className="hidden lg:flex flex-col items-end gap-0.5 text-xs text-muted-foreground flex-shrink-0">
                      {sig.type === "education" && sig.consentAgreed && (
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" />동의
                        </span>
                      )}
                      {sig.userAgent && <span className="flex items-center gap-1"><Monitor className="w-3 h-3" />{parseUA(sig.userAgent)}</span>}
                      {sig.ipAddress && <span className="flex items-center gap-1 font-mono text-[10px]"><MapPin className="w-3 h-3" />{sig.ipAddress}</span>}
                    </div>

                    {/* 해시 */}
                    {sig.integrityHash && (
                      <div className="hidden xl:block w-16 text-right flex-shrink-0">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="font-mono text-[10px] text-muted-foreground/40 cursor-default hover:text-muted-foreground transition-colors">
                                {sig.integrityHash.slice(0, 7)}…
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs break-all"><p>{sig.integrityHash}</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    )}

                    {/* 시간 */}
                    <div className="text-xs font-mono text-muted-foreground/60 flex-shrink-0 w-12 text-right">
                      {sig.signedAt ? format(new Date(sig.signedAt), "HH:mm", { locale: ko }) : "—"}
                    </div>

                    {/* 액션 */}
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setSelected(sig)} data-testid={`button-view-sig-${sig.id}`}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          const who = sig.signerName ? maskName(sig.signerName) : "이 사람";
                          const kind = TYPE_CONFIG[sig.type].label;
                          if (confirm(`${who}님의 ${kind} 서명을 삭제하시겠습니까?`)) deleteMutation.mutate(sig.id);
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

      {selected && <DetailDialog sig={selected} open={!!selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
