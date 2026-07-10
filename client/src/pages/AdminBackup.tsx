import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Database, Images, Download, CheckCircle, AlertCircle, Loader2,
  HardDrive, RefreshCw, Trash2, Eye, FileImage, FileVideo, File, FileText, ImageOff, WandSparkles, KeyRound, ShieldCheck
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

interface BackupInfo {
  lastDbBackup: string | null;
  lastFilesBackup: string | null;
  dbSizeKb: number;
  fileCount: number;
  orphanCount: number;
  orphanSizeMb: number;
  totalSizeMb: number;
}

interface OrphanFile {
  name: string;
  sizeMb: number;
  sizeBytes: number;
  contentType: string;
  createdAt: string | null;
  url: string;
}

function fileIcon(contentType: string) {
  if (contentType.startsWith("image/")) return <FileImage className="w-4 h-4 text-blue-500 flex-shrink-0" />;
  if (contentType.startsWith("video/")) return <FileVideo className="w-4 h-4 text-purple-500 flex-shrink-0" />;
  if (contentType === "application/pdf") return <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />;
  return <File className="w-4 h-4 text-gray-400 flex-shrink-0" />;
}

function fileTypeLabel(contentType: string) {
  if (contentType.startsWith("image/")) return "이미지";
  if (contentType.startsWith("video/")) return "동영상";
  if (contentType === "application/pdf") return "PDF";
  if (contentType.includes("word")) return "Word";
  if (contentType.includes("excel") || contentType.includes("spreadsheet")) return "Excel";
  return contentType.split("/").pop() || "파일";
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

export default function AdminBackup() {
  const { toast } = useToast();
  const [dbDownloading, setDbDownloading] = useState(false);
  const [filesDownloading, setFilesDownloading] = useState(false);
  const [showOrphans, setShowOrphans] = useState(false);
  const [dbPasswordOpen, setDbPasswordOpen] = useState(false);
  const [dbPassword, setDbPassword] = useState("");

  const { data: info, isLoading: infoLoading, refetch } = useQuery<BackupInfo>({
    queryKey: ["/api/admin/backup/info"],
  });

  const { data: orphans, isLoading: orphansLoading } = useQuery<OrphanFile[]>({
    queryKey: ["/api/admin/backup/orphans"],
    enabled: showOrphans,
  });

  const [fixResult, setFixResult] = useState<{ recovered: number; removed: number; slides_deleted: number; message: string } | null>(null);

  const cleanupMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/backup/cleanup-orphans"),
    onSuccess: async (res: any) => {
      const data = await res.json();
      toast({
        title: "정리 완료",
        description: `${data.deleted}개 파일 삭제, ${data.freedMb}MB 확보`,
      });
      setShowOrphans(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backup/info"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backup/orphans"] });
    },
    onError: () => toast({ title: "정리 실패", variant: "destructive" }),
  });

  const fixBrokenImagesMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/fix-broken-images"),
    onSuccess: async (res: any) => {
      const data = await res.json();
      setFixResult(data);
      toast({
        title: "사진 복구/정리 완료",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/accidents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notices"] });
    },
    onError: (e: any) => toast({ title: "실패", description: e.message, variant: "destructive" }),
  });

  async function downloadFile(url: string, filename: string, setLoading: (v: boolean) => void) {
    setLoading(true);
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "오류 발생" }));
        throw new Error(err.message || "다운로드 실패");
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast({ title: "백업 다운로드 완료", description: `${filename} 파일이 저장됐습니다.` });
      refetch();
    } catch (e: any) {
      toast({ title: "백업 실패", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function downloadDbWithPassword() {
    if (!dbPassword.trim()) return;
    setDbDownloading(true);
    setDbPasswordOpen(false);
    try {
      const res = await fetch("/api/admin/backup/database", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: dbPassword }),
      });
      setDbPassword("");
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "오류 발생" }));
        throw new Error(err.message || "다운로드 실패");
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `backup_db_${stamp}.sql`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast({ title: "DB 백업 다운로드 완료" });
      refetch();
    } catch (e: any) {
      toast({ title: "백업 실패", description: e.message, variant: "destructive" });
    } finally {
      setDbDownloading(false);
    }
  }

  // Group orphans by type
  const orphanGroups = orphans ? orphans.reduce<Record<string, OrphanFile[]>>((acc, f) => {
    const label = fileTypeLabel(f.contentType);
    if (!acc[label]) acc[label] = [];
    acc[label].push(f);
    return acc;
  }, {}) : {};

  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">데이터 백업</h1>
          <p className="text-muted-foreground mt-1">DB와 사진 파일을 내 컴퓨터에 백업할 수 있습니다</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={infoLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${infoLoading ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">DB 크기</p>
                <p className="text-lg font-bold">
                  {infoLoading ? "..." : info ? `${(info.dbSizeKb / 1024).toFixed(1)} MB` : "-"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <Images className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">클라우드 파일</p>
                <p className="text-lg font-bold">
                  {infoLoading ? "..." : info ? `${info.fileCount}개` : "-"}
                </p>
                <p className="text-xs text-muted-foreground">{info ? `${info.totalSizeMb}MB` : ""}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={info && info.orphanCount > 0 ? "border-amber-300 dark:border-amber-700" : ""}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900 rounded-lg">
                <Trash2 className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">미사용 파일</p>
                <p className="text-lg font-bold">
                  {infoLoading ? "..." : info ? `${info.orphanCount}개` : "-"}
                </p>
                <p className="text-xs text-muted-foreground">{info ? `${info.orphanSizeMb}MB 낭비` : ""}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Orphan Cleanup */}
      {info && info.orphanCount > 0 && (
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-amber-600" />
                <CardTitle className="text-amber-800 dark:text-amber-200">미사용 파일 정리</CardTitle>
              </div>
              <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
                {info.orphanSizeMb}MB 낭비 중
              </Badge>
            </div>
            <CardDescription className="text-amber-700 dark:text-amber-300">
              업로드했다가 저장하지 않은 파일 <strong>{info.orphanCount}개</strong>가 클라우드에 남아있습니다.
              삭제하기 전에 목록을 먼저 확인할 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button
              data-testid="button-view-orphans"
              variant="outline"
              className="flex-1 border-amber-400 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900"
              onClick={() => setShowOrphans(true)}
            >
              <Eye className="w-4 h-4 mr-2" />
              목록 확인 ({info.orphanCount}개)
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  data-testid="button-cleanup-orphans"
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={cleanupMutation.isPending}
                >
                  {cleanupMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 삭제 중...</>
                  ) : (
                    <><Trash2 className="w-4 h-4 mr-2" /> 전체 삭제 ({info.orphanSizeMb}MB 확보)</>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>미사용 파일 삭제</AlertDialogTitle>
                  <AlertDialogDescription>
                    DB에 저장되지 않은 임시 파일 <strong>{info.orphanCount}개 ({info.orphanSizeMb}MB)</strong>를
                    삭제합니다. 실제 사용 중인 사진이나 문서는 삭제되지 않습니다.
                    계속하시겠습니까?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={() => cleanupMutation.mutate()}>삭제</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}

      {/* 깨진 사진 복구/정리 */}
      <Card className="border-rose-200 dark:border-rose-900/40">
        <CardHeader className="bg-rose-50/60 dark:bg-rose-900/10">
          <div className="flex items-center gap-2">
            <ImageOff className="w-5 h-5 text-rose-500" />
            <CardTitle className="text-rose-700 dark:text-rose-300">깨진 사진 복구 / 정리</CardTitle>
          </div>
          <CardDescription>
            배포 전 로컬 서버에만 저장된 사진을 클라우드로 이전하거나, 복구 불가한 사진 참조를 DB에서 제거합니다.
            사고보고·전자게시판·공지사항·안전수칙의 <code className="text-xs bg-muted px-1 rounded">/uploads/</code> 경로를 모두 검사합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          {fixResult && (
            <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-4 text-sm space-y-1">
              <p className="font-semibold text-rose-700 dark:text-rose-300">처리 결과</p>
              <p className="text-muted-foreground">✅ 복구됨: <strong>{fixResult.recovered}건</strong></p>
              <p className="text-muted-foreground">🗑️ 참조 제거: <strong>{fixResult.removed}건</strong></p>
              <p className="text-muted-foreground">🖼️ 슬라이드 삭제: <strong>{fixResult.slides_deleted}건</strong></p>
              <p className="mt-2 text-xs text-muted-foreground">복구된 사진은 클라우드 스토리지로 이전됐습니다. 참조가 제거된 사진은 직접 재업로드가 필요합니다.</p>
            </div>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                data-testid="button-fix-broken-images"
                className="w-full gap-2 bg-rose-600 hover:bg-rose-700 text-white"
                disabled={fixBrokenImagesMutation.isPending}
              >
                {fixBrokenImagesMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 처리 중 (시간이 걸릴 수 있습니다)...</>
                ) : (
                  <><WandSparkles className="w-4 h-4" /> 깨진 사진 복구 / 정리 실행</>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>깨진 사진 복구 / 정리</AlertDialogTitle>
                <AlertDialogDescription>
                  로컬 파일이 남아있으면 클라우드 스토리지로 이전하고, 없으면 DB에서 참조를 제거합니다.
                  복구 불가한 사진 데이터는 영구 삭제됩니다. 계속하시겠습니까?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-rose-600 hover:bg-rose-700"
                  onClick={() => fixBrokenImagesMutation.mutate()}
                >
                  실행
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* DB Backup */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-500" />
              <CardTitle>데이터베이스 백업</CardTitle>
            </div>
            <Badge variant="outline">SQL 덤프</Badge>
          </div>
          <CardDescription>
            모든 테이블 데이터 (사고보고서, 안전점검, 공지, 교육, 과태료, 차량 등)를 SQL 파일로 백업합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {info?.lastDbBackup && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="w-4 h-4 text-green-500" />
              마지막 백업: {info.lastDbBackup}
            </div>
          )}
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm flex gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span className="text-amber-700 dark:text-amber-300">
              DB 백업 다운로드는 보안을 위해 현재 비밀번호 재입력이 필요합니다.
            </span>
          </div>
          <Button
            data-testid="button-db-backup"
            onClick={() => { setDbPassword(""); setDbPasswordOpen(true); }}
            disabled={dbDownloading}
            className="w-full"
          >
            {dbDownloading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 백업 생성 중...</>
            ) : (
              <><KeyRound className="w-4 h-4 mr-2" /> DB 백업 다운로드 (.sql)</>
            )}
          </Button>

          <Dialog open={dbPasswordOpen} onOpenChange={(o) => { setDbPasswordOpen(o); if (!o) setDbPassword(""); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-amber-500" />
                  DB 백업 다운로드 — 비밀번호 재인증
                </DialogTitle>
              </DialogHeader>
              <div className="py-2 space-y-2">
                <Label htmlFor="db-backup-password">현재 비밀번호</Label>
                <Input
                  id="db-backup-password"
                  type="password"
                  value={dbPassword}
                  onChange={e => setDbPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && downloadDbWithPassword()}
                  placeholder="비밀번호를 입력하세요"
                  autoFocus
                  data-testid="input-db-backup-password"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDbPasswordOpen(false)}>취소</Button>
                <Button onClick={downloadDbWithPassword} disabled={!dbPassword.trim() || dbDownloading}>
                  <Download className="w-4 h-4 mr-1" />확인 후 다운로드
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* Files Backup */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Images className="w-5 h-5 text-green-500" />
              <CardTitle>사진·파일 백업</CardTitle>
            </div>
            <Badge variant="outline">ZIP 압축</Badge>
          </div>
          <CardDescription>
            클라우드 스토리지에 저장된 모든 사진과 파일을 ZIP으로 받습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm flex gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span className="text-amber-700 dark:text-amber-300">
              파일 수에 따라 수 분이 걸릴 수 있습니다. 버튼 클릭 후 잠시 기다려 주세요.
            </span>
          </div>
          <Button
            data-testid="button-files-backup"
            onClick={() => downloadFile("/api/admin/backup/files", `backup_files_${stamp}.zip`, setFilesDownloading)}
            disabled={filesDownloading}
            variant="outline"
            className="w-full"
          >
            {filesDownloading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> ZIP 생성 중...</>
            ) : (
              <><Download className="w-4 h-4 mr-2" /> 파일 전체 백업 다운로드 (.zip)</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Guide */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-muted-foreground" />
            <CardTitle className="text-base">백업 권장 방법</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. <strong>월 1회 이상</strong> DB 백업을 받아 외장하드나 NAS에 보관하세요</p>
          <p>2. 백업 파일 이름에 날짜가 포함되어 있으니 그대로 저장하면 됩니다</p>
          <p>3. SQL 파일은 PostgreSQL 데이터베이스에 <code>psql</code> 명령으로 복원할 수 있습니다</p>
          <p>4. 중요한 사진 자료가 추가될 때마다 파일 백업도 함께 받아두세요</p>
          <p>5. 미사용 파일 정리를 주기적으로 실행하면 클라우드 용량을 절약할 수 있습니다</p>
        </CardContent>
      </Card>

      {/* Orphan File List Sheet */}
      <Sheet open={showOrphans} onOpenChange={setShowOrphans}>
        <SheetContent side="right" className="w-full sm:w-[560px] sm:max-w-none">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-amber-600" />
              미사용 파일 목록
            </SheetTitle>
            <SheetDescription>
              DB에 저장되지 않은 임시 파일입니다. 이 파일들은 안전하게 삭제할 수 있습니다.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 flex flex-col h-[calc(100vh-180px)]">
            {orphansLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : orphans && orphans.length > 0 ? (
              <>
                {/* Summary by type */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {Object.entries(orphanGroups).map(([type, files]) => (
                    <Badge key={type} variant="secondary">
                      {type} {files.length}개 ({files.reduce((s, f) => s + f.sizeMb, 0).toFixed(1)}MB)
                    </Badge>
                  ))}
                </div>

                <ScrollArea className="flex-1 border rounded-lg">
                  <div className="p-2 space-y-1">
                    {orphans.map((f, i) => (
                      <div
                        key={f.name}
                        data-testid={`orphan-file-${i}`}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors"
                      >
                        {fileIcon(f.contentType)}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono text-muted-foreground truncate">{f.name.slice(0, 8)}...{f.name.slice(-4)}</p>
                          <p className="text-xs text-muted-foreground">
                            {fileTypeLabel(f.contentType)} · {f.sizeMb}MB · {formatDate(f.createdAt)}
                          </p>
                        </div>
                        {f.contentType.startsWith("image/") && (
                          <a
                            href={f.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 underline flex-shrink-0"
                          >
                            미리보기
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <div className="mt-4 pt-4 border-t space-y-2">
                  <p className="text-sm text-muted-foreground text-center">
                    총 {orphans.length}개 파일, {orphans.reduce((s, f) => s + f.sizeMb, 0).toFixed(1)}MB
                  </p>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white" disabled={cleanupMutation.isPending}>
                        {cleanupMutation.isPending ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 삭제 중...</>
                        ) : (
                          <><Trash2 className="w-4 h-4 mr-2" /> 전체 삭제</>
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>미사용 파일 전체 삭제</AlertDialogTitle>
                        <AlertDialogDescription>
                          위 목록의 파일 <strong>{orphans.length}개</strong>를 모두 삭제합니다. 되돌릴 수 없습니다.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <AlertDialogAction onClick={() => cleanupMutation.mutate()}>삭제</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <CheckCircle className="w-12 h-12 text-green-500" />
                <p>미사용 파일이 없습니다</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
