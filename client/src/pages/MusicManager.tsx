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
  Copy,
} from "lucide-react";
import type { MusicFile } from "@shared/schema";
import { cn } from "@/lib/utils";

interface DayConfig {
  enabled: boolean;
  start: string;
  end: string;
}
interface DaySchedule {
  checkin: DayConfig;
  checkout: DayConfig;
}
type WeeklySchedule = Record<string, DaySchedule>;

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<string, string> = {
  mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일",
};

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

const DEFAULT_WEEKLY: WeeklySchedule = {
  mon: { checkin: { enabled: true, start: "08:30", end: "08:50" }, checkout: { enabled: true, start: "18:00", end: "18:20" } },
  tue: { checkin: { enabled: true, start: "08:30", end: "08:50" }, checkout: { enabled: true, start: "18:00", end: "18:20" } },
  wed: { checkin: { enabled: true, start: "08:30", end: "08:50" }, checkout: { enabled: true, start: "18:00", end: "18:20" } },
  thu: { checkin: { enabled: true, start: "08:30", end: "08:50" }, checkout: { enabled: true, start: "18:00", end: "18:20" } },
  fri: { checkin: { enabled: true, start: "08:30", end: "08:50" }, checkout: { enabled: true, start: "18:00", end: "18:20" } },
  sat: { checkin: { enabled: false, start: "08:30", end: "08:50" }, checkout: { enabled: false, start: "18:00", end: "18:20" } },
  sun: { checkin: { enabled: false, start: "08:30", end: "08:50" }, checkout: { enabled: false, start: "18:00", end: "18:20" } },
};

function ensureWeekly(data: any): WeeklySchedule {
  if (!data) return DEFAULT_WEEKLY;
  // Old format migration
  if (data.checkin && !data.mon) {
    const weekday = { checkin: data.checkin, checkout: data.checkout };
    return { mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday,
      sat: DEFAULT_WEEKLY.sat, sun: DEFAULT_WEEKLY.sun };
  }
  // Fill missing days
  const result = { ...DEFAULT_WEEKLY };
  for (const k of DAY_KEYS) {
    if (data[k]) result[k] = data[k];
  }
  return result;
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
  const [scheduleForm, setScheduleForm] = useState<WeeklySchedule | null>(null);

  const { data: files = [], isLoading } = useQuery<MusicFile[]>({
    queryKey: ["/api/music"],
  });

  const { data: rawSchedule } = useQuery<any>({
    queryKey: ["/api/music/schedule"],
  });

  const schedule = ensureWeekly(rawSchedule);
  const form = scheduleForm ?? schedule;

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
    mutationFn: (data: WeeklySchedule) => apiRequest("PUT", "/api/music/schedule", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/music/schedule"] });
      setScheduleForm(null);
      toast({ title: "저장 완료", description: "요일별 재생 시간이 저장되었습니다." });
    },
    onError: (e: any) => {
      toast({ title: "저장 실패", description: e.message, variant: "destructive" });
    },
  });

  const updateDay = (day: string, type: "checkin" | "checkout", field: keyof DayConfig, value: string | boolean) => {
    setScheduleForm(prev => {
      const base = prev ?? form;
      return { ...base, [day]: { ...base[day], [type]: { ...base[day][type], [field]: value } } };
    });
  };

  const copyMonToAll = () => {
    const mon = form.mon;
    const next: WeeklySchedule = {};
    for (const k of DAY_KEYS) next[k] = { ...mon, checkin: { ...mon.checkin }, checkout: { ...mon.checkout } };
    setScheduleForm(next);
    toast({ title: "복사 완료", description: "월요일 설정이 모든 요일에 적용됐습니다." });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (!uploadName) setUploadName(file.name.replace(/\.[^.]+$/, ""));
  };

  const handleUpload = async () => {
    if (!selectedFile || isUploading) return;
    setIsUploading(true);
    setUploadProgress(10);
    try {
      const urlRes = await fetch("/api/music/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ originalName: selectedFile.name, size: selectedFile.size }),
      });
      if (!urlRes.ok) { const err = await urlRes.json().catch(() => ({})); throw new Error(err.message || "업로드 URL 요청 실패"); }
      const { uploadURL, objectPath } = await urlRes.json();
      setUploadProgress(30);

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": selectedFile.type || "audio/mpeg" },
        body: selectedFile,
      });
      if (!uploadRes.ok) throw new Error(`GCS 업로드 실패 (${uploadRes.status})`);
      setUploadProgress(80);

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
      if (!regRes.ok) { const err = await regRes.json().catch(() => ({})); throw new Error(err.message || "파일 등록 실패"); }

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
    videoPreviewRef.current?.pause();
    try {
      const vid = document.createElement("video");
      vid.src = file.url;
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
    return <div className="text-center py-20 text-muted-foreground">관리자만 접근할 수 있습니다.</div>;
  }

  const todayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];

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

      {/* Weekly Schedule */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              요일별 재생 시간 설정
            </CardTitle>
            <Button variant="outline" size="sm" onClick={copyMonToAll}
              className="text-xs gap-1.5" data-testid="button-copy-all">
              <Copy className="w-3.5 h-3.5" />
              월요일 → 전체 복사
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Column headers */}
          <div className="grid grid-cols-[3rem_1fr_1fr] gap-x-3 mb-2 px-1">
            <div />
            <div className="text-center text-xs font-semibold text-orange-600 bg-orange-50 rounded px-2 py-1">🌅 출근 음악</div>
            <div className="text-center text-xs font-semibold text-indigo-600 bg-indigo-50 rounded px-2 py-1">🌆 퇴근 음악</div>
          </div>

          <div className="space-y-1.5">
            {DAY_KEYS.map(day => {
              const dayForm = form[day] ?? DEFAULT_WEEKLY[day];
              const isToday = day === todayKey;
              const isWeekend = day === "sat" || day === "sun";
              return (
                <div
                  key={day}
                  className={cn(
                    "grid grid-cols-[3rem_1fr_1fr] gap-x-3 items-center p-2 rounded-lg border transition-colors",
                    isToday ? "border-primary/40 bg-primary/5" : isWeekend ? "bg-muted/30" : "bg-card",
                  )}
                  data-testid={`schedule-row-${day}`}
                >
                  {/* Day label */}
                  <div className="flex flex-col items-center justify-center">
                    <span className={cn(
                      "text-sm font-bold",
                      isToday ? "text-primary" : isWeekend ? "text-rose-500" : "text-foreground"
                    )}>
                      {DAY_LABELS[day]}
                    </span>
                    {isToday && <span className="text-[9px] text-primary font-medium">오늘</span>}
                  </div>

                  {/* Checkin */}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={dayForm.checkin.enabled}
                      onChange={e => updateDay(day, "checkin", "enabled", e.target.checked)}
                      className="w-3.5 h-3.5 accent-orange-500 shrink-0"
                      data-testid={`checkbox-checkin-${day}`}
                    />
                    <Input
                      type="time"
                      value={dayForm.checkin.start}
                      onChange={e => updateDay(day, "checkin", "start", e.target.value)}
                      disabled={!dayForm.checkin.enabled}
                      className="h-7 text-xs px-1.5 w-[5.5rem]"
                      data-testid={`input-checkin-start-${day}`}
                    />
                    <span className="text-muted-foreground text-xs shrink-0">~</span>
                    <Input
                      type="time"
                      value={dayForm.checkin.end}
                      onChange={e => updateDay(day, "checkin", "end", e.target.value)}
                      disabled={!dayForm.checkin.enabled}
                      className="h-7 text-xs px-1.5 w-[5.5rem]"
                      data-testid={`input-checkin-end-${day}`}
                    />
                  </div>

                  {/* Checkout */}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={dayForm.checkout.enabled}
                      onChange={e => updateDay(day, "checkout", "enabled", e.target.checked)}
                      className="w-3.5 h-3.5 accent-indigo-500 shrink-0"
                      data-testid={`checkbox-checkout-${day}`}
                    />
                    <Input
                      type="time"
                      value={dayForm.checkout.start}
                      onChange={e => updateDay(day, "checkout", "start", e.target.value)}
                      disabled={!dayForm.checkout.enabled}
                      className="h-7 text-xs px-1.5 w-[5.5rem]"
                      data-testid={`input-checkout-start-${day}`}
                    />
                    <span className="text-muted-foreground text-xs shrink-0">~</span>
                    <Input
                      type="time"
                      value={dayForm.checkout.end}
                      onChange={e => updateDay(day, "checkout", "end", e.target.value)}
                      disabled={!dayForm.checkout.enabled}
                      className="h-7 text-xs px-1.5 w-[5.5rem]"
                      data-testid={`input-checkout-end-${day}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end mt-3">
            <Button
              onClick={() => scheduleUpdateMutation.mutate(form)}
              disabled={scheduleUpdateMutation.isPending}
              data-testid="button-save-schedule"
            >
              <Save className="w-4 h-4 mr-1.5" />
              {scheduleUpdateMutation.isPending ? "저장 중..." : "시간 저장"}
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
              <Button onClick={handleUpload} disabled={!selectedFile || isUploading} data-testid="button-upload-music">
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
              {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
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
                      isPreviewing ? "bg-primary/5 border-primary/30" : "bg-card hover:bg-muted/30"
                    )}
                  >
                    <span className="text-xs text-muted-foreground w-5 shrink-0 text-center">{idx + 1}</span>
                    <Button
                      variant="ghost" size="icon"
                      className={cn("h-8 w-8 shrink-0", isPreviewing ? "text-primary" : "text-muted-foreground")}
                      onClick={() => handlePreview(file)}
                      data-testid={`button-preview-${file.id}`}
                    >
                      {isPreviewing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" data-testid={`text-music-name-${file.id}`}>{file.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{file.originalName} · {formatFileSize(file.fileSize)}</p>
                    </div>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium shrink-0", typeInfo.color)}>
                      {typeInfo.label}
                    </span>
                    <Button
                      variant="ghost" size="icon"
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
