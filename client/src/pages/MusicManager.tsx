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
  Music2, Upload, Trash2, Clock, FileAudio,
  Play, Pause, Save, AlertCircle, Copy, ChevronDown, ChevronUp,
  Pencil, Check, X as XIcon, ListMusic,
} from "lucide-react";
import type { MusicFile } from "@shared/schema";
import { cn } from "@/lib/utils";

/* ─── Types ─────────────────────────────────────────── */
interface DayConfig  { enabled: boolean; start: string; end: string }
interface DaySchedule {
  checkin: DayConfig;
  checkout: DayConfig;
  checkinSongIds?: number[];
  checkoutSongIds?: number[];
}
type WeeklySchedule = Record<string, DaySchedule>;

const DAY_KEYS   = ["mon","tue","wed","thu","fri","sat","sun"];
const DAY_LABELS: Record<string,string> = { mon:"월",tue:"화",wed:"수",thu:"목",fri:"금",sat:"토",sun:"일" };

const TYPE_META = {
  출근: { label:"출근", bg:"bg-orange-500", light:"bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100" },
  퇴근: { label:"퇴근", bg:"bg-indigo-500", light:"bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100" },
  all:  { label:"전체", bg:"bg-emerald-500", light:"bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" },
};

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "-";
  if (bytes < 1024 * 1024) return `${(bytes/1024).toFixed(0)} KB`;
  return `${(bytes/1024/1024).toFixed(1)} MB`;
}

const WEEKDAY_ON:  DaySchedule = { checkin:{ enabled:true,  start:"08:30", end:"08:50" }, checkout:{ enabled:true,  start:"18:00", end:"18:20" } };
const WEEKEND_OFF: DaySchedule = { checkin:{ enabled:false, start:"08:30", end:"08:50" }, checkout:{ enabled:false, start:"18:00", end:"18:20" } };
const DEFAULT_WEEKLY: WeeklySchedule = { mon:WEEKDAY_ON, tue:WEEKDAY_ON, wed:WEEKDAY_ON, thu:WEEKDAY_ON, fri:WEEKDAY_ON, sat:WEEKEND_OFF, sun:WEEKEND_OFF };

function ensureWeekly(data: any): WeeklySchedule {
  if (!data) return DEFAULT_WEEKLY;
  if (data.checkin && !data.mon) {
    const d = { checkin: data.checkin, checkout: data.checkout };
    return { mon:d, tue:d, wed:d, thu:d, fri:d, sat:WEEKEND_OFF, sun:WEEKEND_OFF };
  }
  const result = { ...DEFAULT_WEEKLY };
  for (const k of DAY_KEYS) if (data[k]) result[k] = data[k];
  return result;
}

/* ─── SongPicker sub-component ───────────────────────── */
function SongPicker({ label, color, songs, selectedIds, onChange }: {
  label: string;
  color: string;
  songs: MusicFile[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  if (songs.length === 0) return null;

  const toggle = (id: number) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter(x => x !== id));
    else onChange([...selectedIds, id]);
  };

  const allSelected = songs.length > 0 && songs.every(s => selectedIds.includes(s.id));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-semibold flex items-center gap-1.5", color)}>
          <ListMusic className="w-3 h-3" />
          {label} 지정 곡
        </span>
        <button
          onClick={() => onChange(allSelected ? [] : songs.map(s => s.id))}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
          data-testid={`btn-select-all-${label}`}
        >
          {allSelected ? "전체 해제" : "전체 선택"}
        </button>
      </div>
      <div className="space-y-1 pl-1">
        {songs.map(song => {
          const checked = selectedIds.includes(song.id);
          return (
            <label
              key={song.id}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-sm",
                checked ? "bg-primary/10 text-foreground" : "hover:bg-muted/60 text-muted-foreground"
              )}
              data-testid={`song-pick-${label}-${song.id}`}
            >
              <div className={cn(
                "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                checked ? "bg-primary border-primary" : "border-muted-foreground/30"
              )}>
                {checked && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggle(song.id)} />
              <span className="truncate text-xs">{song.name}</span>
            </label>
          );
        })}
      </div>
      {selectedIds.length === 0 && (
        <p className="text-[11px] text-muted-foreground pl-1 italic">
          ※ 미지정 시 전체 {label === "출근" ? "출근·공통" : "퇴근·공통"} 곡 재생
        </p>
      )}
    </div>
  );
}

/* ─── DayCard component ──────────────────────────────── */
function DayCard({ dayKey, dayForm, isToday, allSongs, onChange, onSongIdsChange }: {
  dayKey: string;
  dayForm: DaySchedule;
  isToday: boolean;
  allSongs: MusicFile[];
  onChange: (type: "checkin"|"checkout", field: keyof DayConfig, value: string|boolean) => void;
  onSongIdsChange: (type: "checkinSongIds"|"checkoutSongIds", ids: number[]) => void;
}) {
  const [open, setOpen] = useState(isToday);
  const [showSongs, setShowSongs] = useState(false);
  const isWeekend = dayKey === "sat" || dayKey === "sun";
  const hasActive = dayForm.checkin.enabled || dayForm.checkout.enabled;

  const checkinSongs = allSongs.filter(s => s.scheduleType === "출근" || s.scheduleType === "all");
  const checkoutSongs = allSongs.filter(s => s.scheduleType === "퇴근" || s.scheduleType === "all");

  const checkinIds = dayForm.checkinSongIds ?? [];
  const checkoutIds = dayForm.checkoutSongIds ?? [];
  const hasDaySongs = checkinIds.length > 0 || checkoutIds.length > 0;

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-colors",
      isToday ? "border-primary/50 shadow-sm" : "border-border",
      isWeekend && !hasActive ? "opacity-70" : ""
    )}>
      {/* Day header */}
      <button
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
          isToday ? "bg-primary/5" : "bg-card hover:bg-muted/40"
        )}
        onClick={() => setOpen(o => !o)}
        data-testid={`btn-expand-${dayKey}`}
      >
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
          isToday ? "bg-primary text-primary-foreground" : isWeekend ? "bg-rose-100 text-rose-600" : "bg-muted text-foreground"
        )}>
          {DAY_LABELS[dayKey]}
        </div>

        <div className="flex-1 min-w-0">
          {isToday && <span className="text-xs text-primary font-medium mr-2">오늘</span>}
          <span className="text-sm text-muted-foreground">
            {dayForm.checkin.enabled  ? `출근 ${dayForm.checkin.start}~${dayForm.checkin.end}` : "출근 꺼짐"}
            {" · "}
            {dayForm.checkout.enabled ? `퇴근 ${dayForm.checkout.start}~${dayForm.checkout.end}` : "퇴근 꺼짐"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {dayForm.checkin.enabled  && <span className="w-2 h-2 rounded-full bg-orange-400" />}
          {dayForm.checkout.enabled && <span className="w-2 h-2 rounded-full bg-indigo-400" />}
          {hasDaySongs && (
            <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-medium">곡지정</span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t px-4 py-3 space-y-3 bg-card">
          {/* Checkin row */}
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <div className={cn("relative w-10 h-5 rounded-full transition-colors shrink-0",
                dayForm.checkin.enabled ? "bg-orange-400" : "bg-muted"
              )}>
                <input
                  type="checkbox"
                  checked={dayForm.checkin.enabled}
                  onChange={e => onChange("checkin","enabled",e.target.checked)}
                  className="sr-only"
                  data-testid={`chk-checkin-${dayKey}`}
                />
                <span className={cn(
                  "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                  dayForm.checkin.enabled && "translate-x-5"
                )} />
              </div>
              <span className="text-sm font-medium text-orange-600">🌅 출근 음악</span>
            </label>
            {dayForm.checkin.enabled && (
              <div className="flex items-center gap-2 pl-12">
                <Input type="time" value={dayForm.checkin.start}
                  onChange={e => onChange("checkin","start",e.target.value)}
                  className="h-9 text-sm flex-1 min-w-0" data-testid={`inp-ci-start-${dayKey}`} />
                <span className="text-muted-foreground text-sm shrink-0">~</span>
                <Input type="time" value={dayForm.checkin.end}
                  onChange={e => onChange("checkin","end",e.target.value)}
                  className="h-9 text-sm flex-1 min-w-0" data-testid={`inp-ci-end-${dayKey}`} />
              </div>
            )}
          </div>

          {/* Checkout row */}
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <div className={cn("relative w-10 h-5 rounded-full transition-colors shrink-0",
                dayForm.checkout.enabled ? "bg-indigo-400" : "bg-muted"
              )}>
                <input
                  type="checkbox"
                  checked={dayForm.checkout.enabled}
                  onChange={e => onChange("checkout","enabled",e.target.checked)}
                  className="sr-only"
                  data-testid={`chk-checkout-${dayKey}`}
                />
                <span className={cn(
                  "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                  dayForm.checkout.enabled && "translate-x-5"
                )} />
              </div>
              <span className="text-sm font-medium text-indigo-600">🌆 퇴근 음악</span>
            </label>
            {dayForm.checkout.enabled && (
              <div className="flex items-center gap-2 pl-12">
                <Input type="time" value={dayForm.checkout.start}
                  onChange={e => onChange("checkout","start",e.target.value)}
                  className="h-9 text-sm flex-1 min-w-0" data-testid={`inp-co-start-${dayKey}`} />
                <span className="text-muted-foreground text-sm shrink-0">~</span>
                <Input type="time" value={dayForm.checkout.end}
                  onChange={e => onChange("checkout","end",e.target.value)}
                  className="h-9 text-sm flex-1 min-w-0" data-testid={`inp-co-end-${dayKey}`} />
              </div>
            )}
          </div>

          {/* Song assignment section */}
          {allSongs.length > 0 && hasActive && (
            <div className="border-t pt-3">
              <button
                onClick={() => setShowSongs(s => !s)}
                className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
                data-testid={`btn-toggle-songs-${dayKey}`}
              >
                <ListMusic className="w-3.5 h-3.5" />
                <span>요일별 음악 지정</span>
                {hasDaySongs && (
                  <span className="bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full text-[10px]">
                    {checkinIds.length + checkoutIds.length}곡 지정됨
                  </span>
                )}
                {showSongs
                  ? <ChevronUp className="w-3.5 h-3.5 ml-auto" />
                  : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
              </button>

              {showSongs && (
                <div className="mt-2.5 space-y-3 bg-muted/30 rounded-lg p-3">
                  {dayForm.checkin.enabled && (
                    <SongPicker
                      label="출근"
                      color="text-orange-600"
                      songs={checkinSongs}
                      selectedIds={checkinIds}
                      onChange={ids => onSongIdsChange("checkinSongIds", ids)}
                    />
                  )}
                  {dayForm.checkout.enabled && (
                    <SongPicker
                      label="퇴근"
                      color="text-indigo-600"
                      songs={checkoutSongs}
                      selectedIds={checkoutIds}
                      onChange={ids => onSongIdsChange("checkoutSongIds", ids)}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── MusicFileCard component ────────────────────────── */
function MusicFileCard({ file, idx, isPreviewing, onPreview, onTypeChange, onNameChange, onDelete, isDeleting }: {
  file: MusicFile;
  idx: number;
  isPreviewing: boolean;
  onPreview: () => void;
  onTypeChange: (type: string) => void;
  onNameChange: (name: string) => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(file.name);

  const handleNameSave = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== file.name) onNameChange(trimmed);
    setEditing(false);
  };

  const meta = TYPE_META[file.scheduleType as keyof typeof TYPE_META] ?? TYPE_META.all;

  return (
    <div className={cn(
      "rounded-xl border p-3 space-y-2.5 transition-colors",
      isPreviewing ? "border-primary/40 bg-primary/5" : "border-border bg-card"
    )} data-testid={`music-file-${file.id}`}>

      {/* Row 1: index + name + preview */}
      <div className="flex items-start gap-2">
        <span className="text-xs text-muted-foreground w-5 shrink-0 mt-1 text-center">{idx+1}</span>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <Input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key==="Enter") handleNameSave(); if (e.key==="Escape") { setEditing(false); setDraft(file.name); } }}
                autoFocus
                className="h-7 text-sm flex-1"
                data-testid={`input-name-${file.id}`}
              />
              <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={handleNameSave} data-testid={`btn-save-name-${file.id}`}>
                <Check className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(false); setDraft(file.name); }}>
                <XIcon className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <button className="flex items-start gap-1 group w-full text-left" onClick={() => setEditing(true)} data-testid={`btn-edit-name-${file.id}`}>
              <span className="text-sm font-medium leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                {file.name}
              </span>
              <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 mt-0.5 transition-opacity" />
            </button>
          )}
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{formatFileSize(file.fileSize)}</p>
        </div>
        <Button
          variant="ghost" size="icon"
          className={cn("h-9 w-9 shrink-0", isPreviewing ? "text-primary" : "text-muted-foreground")}
          onClick={onPreview}
          data-testid={`button-preview-${file.id}`}
        >
          {isPreviewing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>
      </div>

      {/* Row 2: type selector + delete */}
      <div className="flex items-center gap-2 pl-7">
        <div className="flex flex-1 rounded-lg border overflow-hidden">
          {(["출근","퇴근","all"] as const).map(t => (
            <button
              key={t}
              onClick={() => onTypeChange(t)}
              className={cn(
                "flex-1 py-1.5 text-xs font-medium transition-colors",
                file.scheduleType === t
                  ? `${TYPE_META[t].bg} text-white`
                  : "bg-background text-muted-foreground hover:bg-muted"
              )}
              data-testid={`btn-type-${t}-${file.id}`}
            >
              {TYPE_META[t].label}
            </button>
          ))}
        </div>
        <Badge variant="outline" className={cn("text-[10px] px-1.5 shrink-0", meta.light)}>
          {meta.label}
        </Badge>
        <Button
          variant="ghost" size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
          onClick={onDelete}
          disabled={isDeleting}
          data-testid={`button-delete-music-${file.id}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────── */
export default function MusicManager() {
  const { isAdmin } = usePermissions();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadScheduleType, setUploadScheduleType] = useState<"출근"|"퇴근"|"all">("all");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const [scheduleForm, setScheduleForm] = useState<WeeklySchedule | null>(null);

  const { data: files = [], isLoading } = useQuery<MusicFile[]>({ queryKey: ["/api/music"] });
  const { data: rawSchedule } = useQuery<any>({ queryKey: ["/api/music/schedule"] });

  const schedule = ensureWeekly(rawSchedule);
  const form = scheduleForm ?? schedule;

  const MAX_SONGS = 5;
  const atLimit = files.length >= MAX_SONGS;

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/music/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/music"] }); toast({ title: "삭제 완료" }); },
    onError: (e: any) => toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; scheduleType?: string } }) =>
      apiRequest("PATCH", `/api/music/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/music"] }); toast({ title: "수정 완료" }); },
    onError: (e: any) => toast({ title: "수정 실패", description: e.message, variant: "destructive" }),
  });

  const scheduleUpdateMutation = useMutation({
    mutationFn: (data: WeeklySchedule) => apiRequest("PUT", "/api/music/schedule", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/music/schedule"] });
      setScheduleForm(null);
      toast({ title: "저장 완료", description: "요일별 설정이 저장됐습니다." });
    },
    onError: (e: any) => toast({ title: "저장 실패", description: e.message, variant: "destructive" }),
  });

  const updateDay = (day: string, type: "checkin"|"checkout", field: keyof DayConfig, value: string|boolean) => {
    setScheduleForm(prev => {
      const base = prev ?? form;
      return { ...base, [day]: { ...base[day], [type]: { ...base[day][type], [field]: value } } };
    });
  };

  const updateDaySongIds = (day: string, type: "checkinSongIds"|"checkoutSongIds", ids: number[]) => {
    setScheduleForm(prev => {
      const base = prev ?? form;
      return { ...base, [day]: { ...base[day], [type]: ids } };
    });
  };

  const copyMonToAll = () => {
    const mon = form.mon;
    const next: WeeklySchedule = {};
    for (const k of DAY_KEYS) next[k] = {
      checkin: { ...mon.checkin },
      checkout: { ...mon.checkout },
      checkinSongIds: mon.checkinSongIds ? [...mon.checkinSongIds] : [],
      checkoutSongIds: mon.checkoutSongIds ? [...mon.checkoutSongIds] : [],
    };
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
        method:"POST", headers:{"Content-Type":"application/json"}, credentials:"include",
        body: JSON.stringify({ originalName: selectedFile.name, size: selectedFile.size }),
      });
      if (!urlRes.ok) { const err = await urlRes.json().catch(()=>({})); throw new Error(err.message||"업로드 URL 요청 실패"); }
      const { uploadURL, objectPath } = await urlRes.json();
      setUploadProgress(30);

      const uploadRes = await fetch(uploadURL, { method:"PUT", headers:{"Content-Type": selectedFile.type||"audio/mpeg"}, body: selectedFile });
      if (!uploadRes.ok) throw new Error(`GCS 업로드 실패 (${uploadRes.status})`);
      setUploadProgress(80);

      const regRes = await fetch("/api/music/register", {
        method:"POST", headers:{"Content-Type":"application/json"}, credentials:"include",
        body: JSON.stringify({ name: uploadName.trim()||selectedFile.name.replace(/\.[^.]+$/,""), originalName: selectedFile.name, url: objectPath, scheduleType: uploadScheduleType, fileSize: selectedFile.size }),
      });
      if (!regRes.ok) { const err = await regRes.json().catch(()=>({})); throw new Error(err.message||"파일 등록 실패"); }

      setUploadProgress(100);
      await queryClient.invalidateQueries({ queryKey: ["/api/music"] });
      toast({ title: "업로드 완료", description: "음악 파일이 추가됐습니다." });
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

  const handlePreview = (file: MusicFile) => {
    if (previewId === file.id) {
      videoPreviewRef.current?.pause();
      setPreviewId(null);
      return;
    }
    videoPreviewRef.current?.pause();
    const vid = document.createElement("video");
    vid.src = file.url;
    vid.volume = 0.5;
    vid.play().catch(() => {
      toast({ title:"재생 실패", description:"파일을 재생할 수 없습니다.", variant:"destructive" });
      setPreviewId(null);
    });
    vid.onended = () => setPreviewId(null);
    videoPreviewRef.current = vid;
    setPreviewId(file.id);
  };

  if (!isAdmin) return <div className="text-center py-20 text-muted-foreground">관리자만 접근할 수 있습니다.</div>;

  const todayKey = ["sun","mon","tue","wed","thu","fri","sat"][new Date().getDay()];

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
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

      {/* ── Weekly Schedule ─────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              요일별 재생 시간 &amp; 음악 지정
            </CardTitle>
            <Button variant="outline" size="sm" onClick={copyMonToAll} className="text-xs gap-1.5 h-7 px-2.5" data-testid="button-copy-all">
              <Copy className="w-3.5 h-3.5" />
              월 → 전체
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 pt-1">
          {DAY_KEYS.map(day => (
            <DayCard
              key={day}
              dayKey={day}
              dayForm={form[day] ?? DEFAULT_WEEKLY[day]}
              isToday={day === todayKey}
              allSongs={files}
              onChange={(type, field, value) => updateDay(day, type, field, value)}
              onSongIdsChange={(type, ids) => updateDaySongIds(day, type, ids)}
            />
          ))}
          <div className="flex justify-end pt-1">
            <Button
              onClick={() => scheduleUpdateMutation.mutate(form)}
              disabled={scheduleUpdateMutation.isPending}
              data-testid="button-save-schedule"
              className="w-full sm:w-auto"
            >
              <Save className="w-4 h-4 mr-1.5" />
              {scheduleUpdateMutation.isPending ? "저장 중..." : "저장"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Upload ──────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
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
              <p className="text-sm">최대 {MAX_SONGS}개까지 등록 가능합니다. 기존 파일 삭제 후 업로드해주세요.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                type="file" ref={fileInputRef}
                accept=".mp3,.mp4,.wav,.ogg,.m4a,.aac"
                onChange={handleFileChange}
                disabled={isUploading}
                className="cursor-pointer"
                data-testid="input-music-file"
              />
              <p className="text-xs text-muted-foreground">MP3, MP4, WAV, OGG, M4A, AAC (최대 50MB)</p>
              <div className="flex gap-2">
                <Input
                  placeholder="표시 이름 (선택)"
                  value={uploadName}
                  onChange={e => setUploadName(e.target.value)}
                  disabled={isUploading}
                  className="flex-1"
                  data-testid="input-music-name"
                />
              </div>
              <div className="flex rounded-lg border overflow-hidden">
                {(["출근","퇴근","all"] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setUploadScheduleType(t)}
                    className={cn(
                      "flex-1 py-2 text-sm font-medium transition-colors",
                      uploadScheduleType === t
                        ? `${TYPE_META[t].bg} text-white`
                        : "bg-background text-muted-foreground hover:bg-muted"
                    )}
                    data-testid={`btn-upload-type-${t}`}
                  >
                    {TYPE_META[t].label}
                  </button>
                ))}
              </div>
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
                className="w-full"
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

      {/* ── Music List ──────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileAudio className="w-4 h-4 text-muted-foreground" />
            음악 목록
            <Badge variant="secondary" className="ml-1">{files.length}곡</Badge>
            <span className="ml-auto text-xs font-normal text-muted-foreground">이름 탭 → 수정 · 분류 버튼으로 변경</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Music2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">업로드된 음악 파일이 없습니다</p>
              <p className="text-xs mt-1">위에서 파일을 업로드해주세요</p>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file, idx) => (
                <MusicFileCard
                  key={file.id}
                  file={file}
                  idx={idx}
                  isPreviewing={previewId === file.id}
                  onPreview={() => handlePreview(file)}
                  onTypeChange={type => updateMutation.mutate({ id: file.id, data: { scheduleType: type } })}
                  onNameChange={name => updateMutation.mutate({ id: file.id, data: { name } })}
                  onDelete={() => deleteMutation.mutate(file.id)}
                  isDeleting={deleteMutation.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
