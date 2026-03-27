import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import {
  Music2,
  Upload,
  Trash2,
  Clock,
  FileAudio,
  Play,
  Pause,
  Save,
  AlertCircle,
} from "lucide-react";
import type { MusicFile } from "@shared/schema";
import { cn } from "@/lib/utils";

interface MusicSchedule {
  checkin: { enabled: boolean; start: string; end: string };
  checkout: { enabled: boolean; start: string; end: string };
}

const SCHEDULE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  출근: { label: "출근", color: "bg-orange-100 text-orange-700 border-orange-200" },
  퇴근: { label: "퇴근", color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  all: { label: "전체", color: "bg-green-100 text-green-700 border-green-200" },
};

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "-";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function MusicManager() {
  const { isAdmin } = usePermissions();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadScheduleType, setUploadScheduleType] = useState<"출근" | "퇴근" | "all">("all");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

  const { data: files = [], isLoading } = useQuery<MusicFile[]>({
    queryKey: ["/api/music"],
  });

  const { data: schedule } = useQuery<MusicSchedule>({
    queryKey: ["/api/music/schedule"],
  });

  const [scheduleForm, setScheduleForm] = useState<MusicSchedule | null>(null);

  const currentSchedule = scheduleForm ?? schedule ?? {
    checkin: { enabled: true, start: "08:30", end: "08:50" },
    checkout: { enabled: true, start: "18:00", end: "18:20" },
  };

  const MAX_SONGS = 5;
  const atLimit = files.length >= MAX_SONGS;

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/music/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/music"] });
      toast({ title: "삭제 완료", description: "음악 파일이 삭제되었습니다." });
    },
    onError: (e: any) => {
      toast({ title: "삭제 실패", description: e.message, variant: "destructive" });
    },
  });

  const scheduleUpdateMutation = useMutation({
    mutationFn: (data: MusicSchedule) =>
      apiRequest("PUT", "/api/music/schedule", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/music/schedule"] });
      toast({ title: "저장 완료", description: "음악 재생 시간이 저장되었습니다." });
    },
    onError: (e: any) => {
      toast({ title: "저장 실패", description: e.message, variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (!uploadName) {
      setUploadName(file.name.replace(/\.[^.]+$/, ""));
    }
  };

  // Direct client→GCS upload (bypasses server proxy size limits)
  const handleUpload = async () => {
    if (!selectedFile || isUploading) return;

    setIsUploading(true);
    setUploadProgress(10);

    try {
      // Step 1: Get signed upload URL from server
      const urlRes = await fetch("/api/music/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          originalName: selectedFile.name,
          size: selectedFile.size,
        }),
      });

      if (!urlRes.ok) {
        const err = await urlRes.json().catch(() => ({}));
        throw new Error(err.message || "업로드 URL 요청 실패");
      }

      const { uploadURL, objectPath } = await urlRes.json();
      setUploadProgress(30);

      // Step 2: Upload directly to GCS (no server proxy)
      const contentType = selectedFile.type || "audio/mpeg";
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: selectedFile,
      });

      if (!uploadRes.ok) {
        throw new Error(`GCS 업로드 실패 (${uploadRes.status})`);
      }
      setUploadProgress(80);

      // Step 3: Register in database
      const regRes = await fetch("/api/music/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: uploadName.trim() || selectedFile.name.replace(/\.[^.]+$/, ""),
          originalName: selectedFile.name,
          url: objectPath,
          scheduleType: uploadScheduleType,
          fileSize: selectedFile.size,
        }),
      });

      if (!regRes.ok) {
        const err = await regRes.json().catch(() => ({}));
        throw new Error(err.message || "파일 등록 실패");
      }

      setUploadProgress(100);
      await queryClient.invalidateQueries({ queryKey: ["/api/music"] });
      toast({ title: "업로드 완료", description: "음악 파일이 추가되었습니다." });
      setSelectedFile(null);
      setUploadName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: any) {
      toast({ title: "업로드 실패", description: e.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handlePreview = async (file: MusicFile) => {
    if (previewId === file.id) {
      videoPreviewRef.current?.pause();
      setPreviewId(null);
      return;
    }
    if (videoPreviewRef.current) {
      videoPreviewRef.current.pause();
    }

    try {
      // Get signed URL for reliable playback (bypasses server streaming issues)
      let playUrl = file.url;
      if (file.url.startsWith("/objects/")) {
        const res = await fetch(`/api/download?path=${encodeURIComponent(file.url)}&ttl=600`, {
          credentials: "include",
        });
        const data = await res.json();
        if (data.url) playUrl = data.url;
      }

      const vid = document.createElement("video");
      vid.src = playUrl;
      vid.volume = 0.5;
      vid.play().catch(() => {
        toast({ title: "재생 실패", description: "파일을 재생할 수 없습니다.", variant: "destructive" });
        setPreviewId(null);
      });
      vid.onended = () => setPreviewId(null);
      videoPreviewRef.current = vid;
      setPreviewId(file.id);
    } catch {
      toast({ title: "재생 실패", description: "파일 URL을 가져올 수 없습니다.", variant: "destructive" });
    }
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        관리자만 접근할 수 있습니다.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="page-header-icon bg-purple-500">
          <Music2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">음악 자동재생 관리</h1>
          <p className="text-sm text-muted-foreground">출퇴근 시간에 자동으로 음악이 재생됩니다</p>
        </div>
      </div>

      {/* Schedule Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            재생 시간 설정
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Checkin */}
          <div className="flex items-center gap-4 p-3 rounded-lg border bg-orange-50/50 border-orange-200/60">
            <div className="flex items-center gap-2 w-28 shrink-0">
              <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center">
                <span className="text-orange-600 text-xs font-bold">출근</span>
              </div>
              <span className="text-sm font-medium">출근 음악</span>
            </div>
            <div className="flex items-center gap-2 flex-1">
              <Input
                type="time"
                value={currentSchedule.checkin.start}
                onChange={(e) =>
                  setScheduleForm({ ...currentSchedule, checkin: { ...currentSchedule.checkin, start: e.target.value } })
                }
                className="w-32 text-sm"
                data-testid="input-checkin-start"
              />
              <span className="text-muted-foreground text-sm">~</span>
              <Input
                type="time"
                value={currentSchedule.checkin.end}
                onChange={(e) =>
                  setScheduleForm({ ...currentSchedule, checkin: { ...currentSchedule.checkin, end: e.target.value } })
                }
                className="w-32 text-sm"
                data-testid="input-checkin-end"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={currentSchedule.checkin.enabled}
                onChange={(e) =>
                  setScheduleForm({ ...currentSchedule, checkin: { ...currentSchedule.checkin, enabled: e.target.checked } })
                }
                className="w-4 h-4 accent-orange-500"
                data-testid="checkbox-checkin-enabled"
              />
              <span className="text-sm text-muted-foreground">활성화</span>
            </label>
          </div>

          {/* Checkout */}
          <div className="flex items-center gap-4 p-3 rounded-lg border bg-indigo-50/50 border-indigo-200/60">
            <div className="flex items-center gap-2 w-28 shrink-0">
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center">
                <span className="text-indigo-600 text-xs font-bold">퇴근</span>
              </div>
              <span className="text-sm font-medium">퇴근 음악</span>
            </div>
            <div className="flex items-center gap-2 flex-1">
              <Input
                type="time"
                value={currentSchedule.checkout.start}
                onChange={(e) =>
                  setScheduleForm({ ...currentSchedule, checkout: { ...currentSchedule.checkout, start: e.target.value } })
                }
                className="w-32 text-sm"
                data-testid="input-checkout-start"
              />
              <span className="text-muted-foreground text-sm">~</span>
              <Input
                type="time"
                value={currentSchedule.checkout.end}
                onChange={(e) =>
                  setScheduleForm({ ...currentSchedule, checkout: { ...currentSchedule.checkout, end: e.target.value } })
                }
                className="w-32 text-sm"
                data-testid="input-checkout-end"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={currentSchedule.checkout.enabled}
                onChange={(e) =>
                  setScheduleForm({ ...currentSchedule, checkout: { ...currentSchedule.checkout, enabled: e.target.checked } })
                }
                className="w-4 h-4 accent-indigo-500"
                data-testid="checkbox-checkout-enabled"
              />
              <span className="text-sm text-muted-foreground">활성화</span>
            </label>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => scheduleUpdateMutation.mutate(currentSchedule)}
              disabled={scheduleUpdateMutation.isPending}
              data-testid="button-save-schedule"
            >
              <Save className="w-4 h-4 mr-1.5" />
              시간 저장
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Upload Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4 text-muted-foreground" />
            음악 파일 업로드
            <span className="ml-auto text-xs font-normal text-muted-foreground">{files.length} / {MAX_SONGS}곡</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {atLimit ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p className="text-sm">최대 {MAX_SONGS}개까지 등록할 수 있습니다. 기존 파일을 삭제 후 업로드해주세요.</p>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  type="file"
                  ref={fileInputRef}
                  accept=".mp3,.mp4,.wav,.ogg,.m4a,.aac"
                  onChange={handleFileChange}
                  disabled={isUploading}
                  className="cursor-pointer"
                  data-testid="input-music-file"
                />
                <p className="text-xs text-muted-foreground mt-1">MP3, MP4, WAV, OGG, M4A, AAC (최대 50MB)</p>
              </div>
              <Input
                placeholder="표시 이름 (선택)"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                disabled={isUploading}
                className="sm:w-48"
                data-testid="input-music-name"
              />
              <select
                value={uploadScheduleType}
                onChange={(e) => setUploadScheduleType(e.target.value as "출근" | "퇴근" | "all")}
                disabled={isUploading}
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm w-24 sm:w-28 shrink-0"
                data-testid="select-schedule-type"
              >
                <option value="all">전체</option>
                <option value="출근">출근</option>
                <option value="퇴근">퇴근</option>
              </select>
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
                data-testid="button-upload-music"
              >
                <Upload className="w-4 h-4 mr-1.5" />
                {isUploading ? "업로드 중..." : "업로드"}
              </Button>
            </div>
          )}
          {isUploading && (
            <div className="space-y-1">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">{uploadProgress}%</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Music File List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileAudio className="w-4 h-4 text-muted-foreground" />
              음악 목록
              <Badge variant="secondary" className="ml-1">{files.length}곡</Badge>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Music2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">업로드된 음악 파일이 없습니다</p>
              <p className="text-xs mt-1">위에서 MP3 또는 MP4 파일을 업로드해주세요</p>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file, idx) => {
                const typeInfo = SCHEDULE_TYPE_LABELS[file.scheduleType] || SCHEDULE_TYPE_LABELS.all;
                const isPreviewing = previewId === file.id;
                return (
                  <div
                    key={file.id}
                    data-testid={`music-file-${file.id}`}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                      isPreviewing
                        ? "bg-primary/5 border-primary/30"
                        : "bg-card hover:bg-muted/30"
                    )}
                  >
                    <span className="text-xs text-muted-foreground w-5 shrink-0 text-center">
                      {idx + 1}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn("h-8 w-8 shrink-0", isPreviewing ? "text-primary" : "text-muted-foreground")}
                      onClick={() => handlePreview(file)}
                      data-testid={`button-preview-${file.id}`}
                    >
                      {isPreviewing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" data-testid={`text-music-name-${file.id}`}>
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {file.originalName} · {formatFileSize(file.fileSize)}
                      </p>
                    </div>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium shrink-0", typeInfo.color)}>
                      {typeInfo.label}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={() => deleteMutation.mutate(file.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-music-${file.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
