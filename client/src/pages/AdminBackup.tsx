import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Database, Images, Download, CheckCircle, AlertCircle, Loader2, HardDrive, RefreshCw, Trash2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface BackupInfo {
  lastDbBackup: string | null;
  lastFilesBackup: string | null;
  dbSizeKb: number;
  fileCount: number;
  orphanCount: number;
  orphanSizeMb: number;
  totalSizeMb: number;
}

export default function AdminBackup() {
  const { toast } = useToast();
  const [dbDownloading, setDbDownloading] = useState(false);
  const [filesDownloading, setFilesDownloading] = useState(false);

  const { data: info, isLoading: infoLoading, refetch } = useQuery<BackupInfo>({
    queryKey: ["/api/admin/backup/info"],
  });

  const cleanupMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/backup/cleanup-orphans"),
    onSuccess: async (res: any) => {
      const data = await res.json();
      toast({
        title: "정리 완료",
        description: `${data.deleted}개 파일 삭제, ${data.freedMb}MB 확보`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backup/info"] });
    },
    onError: () => toast({ title: "정리 실패", variant: "destructive" }),
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
                  {infoLoading ? "..." : info ? `${info.fileCount}개 (${info.totalSizeMb}MB)` : "-"}
                </p>
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
                  {infoLoading ? "..." : info ? `${info.orphanCount}개 (${info.orphanSizeMb}MB)` : "-"}
                </p>
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
              <Badge variant="outline" className="border-amber-400 text-amber-700">
                {info.orphanSizeMb}MB 낭비 중
              </Badge>
            </div>
            <CardDescription className="text-amber-700 dark:text-amber-300">
              업로드했다가 저장하지 않은 파일 <strong>{info.orphanCount}개</strong>가 클라우드에 남아있습니다.
              이 파일들은 실제로 사용되지 않으므로 삭제해도 앱에 영향이 없습니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  data-testid="button-cleanup-orphans"
                  variant="outline"
                  className="w-full border-amber-400 text-amber-700 hover:bg-amber-100"
                  disabled={cleanupMutation.isPending}
                >
                  {cleanupMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 삭제 중...</>
                  ) : (
                    <><Trash2 className="w-4 h-4 mr-2" /> 미사용 파일 {info.orphanCount}개 삭제 ({info.orphanSizeMb}MB 확보)</>
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
            이 파일을 보관해두면 데이터가 손실되어도 복구할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {info?.lastDbBackup && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="w-4 h-4 text-green-500" />
              마지막 백업: {info.lastDbBackup}
            </div>
          )}
          <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
            <p className="font-medium">백업 파일에 포함되는 데이터:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
              <li>공지사항, 안전점검 기록</li>
              <li>사고보고서, 아차사고, 위험성평가</li>
              <li>교육 이력, 서명 기록</li>
              <li>차량 정보, 과태료, 유류비</li>
              <li>사용자 계정, 팀 정보</li>
              <li>기타 모든 데이터</li>
            </ul>
          </div>
          <Button
            data-testid="button-db-backup"
            onClick={() => downloadFile("/api/admin/backup/database", `backup_db_${stamp}.sql`, setDbDownloading)}
            disabled={dbDownloading}
            className="w-full"
          >
            {dbDownloading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 백업 생성 중...</>
            ) : (
              <><Download className="w-4 h-4 mr-2" /> DB 백업 다운로드 (.sql)</>
            )}
          </Button>
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
            공지 이미지, 점검 사진, 사고 사진, 동영상, 음악 파일 등이 포함됩니다.
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
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> ZIP 생성 중... (기다려 주세요)</>
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
    </div>
  );
}
