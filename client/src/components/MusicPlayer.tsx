/**
 * MusicPlayer — simple, reliable schedule-driven player.
 *
 * Design:
 *  • One <video> element, always mounted (display:none).
 *  • React state is only for UI. All media calls are imperative.
 *  • tryAutoplay() — called when schedule activates / new URL loads (auto)
 *  • handlePlayClick() — called by user gesture (always succeeds)
 *  • No effect dependency on volume/mute so adjusting them never reloads audio.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Music2, Play, Pause, SkipForward, SkipBack,
  Volume2, VolumeX, X, ChevronDown, ChevronUp, ListMusic, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MusicFile } from "@shared/schema";

interface DayConfig {
  enabled: boolean;
  start: string;
  end: string;
}
interface DaySchedule {
  checkin: DayConfig;
  checkout: DayConfig;
  checkinSongIds?: number[];
  checkoutSongIds?: number[];
}
type WeeklySchedule = Record<string, DaySchedule>;

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function getCurrentTime() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}

function getActiveType(s: WeeklySchedule | undefined): string | null {
  if (!s) return null;
  const now = new Date();
  const dayKey = DAY_KEYS[now.getDay()];
  const day = s[dayKey];
  if (!day) return null;
  const t = getCurrentTime();
  if (day.checkin?.enabled && t >= day.checkin.start && t <= day.checkin.end) return "출근";
  if (day.checkout?.enabled && t >= day.checkout.start && t <= day.checkout.end) return "퇴근";
  return null;
}

/**
 * For music files we stream directly through Express (/objects/... route)
 * which already handles Range requests + auth cookies (same-origin).
 * This avoids signed-URL sidecar availability issues on deployed servers.
 */
function useMusicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  // Already a direct path → use as-is
  return path;
}

const SESSION_KEY = "music_approved";

export function MusicPlayer() {
  // ── UI state ──────────────────────────────────────────────────────────────
  const [activeType, setActiveType] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [progress, setProgress] = useState(0);

  // ── Refs — always up-to-date, safe in async callbacks ─────────────────────
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeTypeRef = useRef<string | null>(null);
  const wantPlayRef = useRef(false);
  const wasTriggeredRef = useRef(false);
  const volumeRef = useRef(0.7);
  const isMutedRef = useRef(false);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const errorCountRef = useRef(0); // consecutive errors guard

  // Keep refs in sync
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: allFiles = [] } = useQuery<MusicFile[]>({
    queryKey: ["/api/music"],
    staleTime: 60_000,
  });
  const { data: schedule } = useQuery<WeeklySchedule>({
    queryKey: ["/api/music/schedule"],
    staleTime: 60_000,
  });

  // Resolve day-specific song IDs if configured
  const daySpecificFiles = (() => {
    if (!activeType || !schedule) return null;
    const now = new Date();
    const dayKey = DAY_KEYS[now.getDay()];
    const day = schedule[dayKey];
    if (!day) return null;
    const ids = activeType === "출근" ? (day.checkinSongIds ?? []) : (day.checkoutSongIds ?? []);
    if (!ids || ids.length === 0) return null;
    const idSet = new Set(ids);
    const picked = allFiles.filter(f => idSet.has(f.id));
    return picked.length > 0 ? picked : null;
  })();

  const activeFiles = daySpecificFiles ?? allFiles.filter(
    f => f.scheduleType === activeType || f.scheduleType === "all"
  );
  const safeLen = Math.max(activeFiles.length, 1);
  const currentFile = activeFiles[currentIndex % safeLen];
  const musicUrl = useMusicUrl(currentFile?.url);

  // ── Progress ticker ───────────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying) {
      progressTimer.current = setInterval(() => {
        const a = videoRef.current;
        if (a?.duration) setProgress((a.currentTime / a.duration) * 100);
      }, 500);
    } else {
      if (progressTimer.current) clearInterval(progressTimer.current);
    }
    return () => { if (progressTimer.current) clearInterval(progressTimer.current); };
  }, [isPlaying]);

  // ── Volume / mute sync (direct, no reload) ────────────────────────────────
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.volume = isMuted ? 0 : volume;
    el.muted = false;
  }, [volume, isMuted]);

  // ── Autoplay (stable ref — doesn't cause effect re-runs) ─────────────────
  // Uses volumeRef/isMutedRef so it's always up-to-date without being a dep.
  const tryAutoplay = useCallback(async (el: HTMLVideoElement) => {
    el.muted = false;
    el.volume = isMutedRef.current ? 0 : volumeRef.current;
    try {
      await el.play();
      errorCountRef.current = 0;
      setIsPlaying(true);
      try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* ok */ }
    } catch {
      // Try muted fallback (often allowed even when normal autoplay is blocked)
      el.muted = true;
      try {
        await el.play();
        el.muted = false;
        el.volume = isMutedRef.current ? 0 : volumeRef.current;
        errorCountRef.current = 0;
        setIsPlaying(true);
        try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* ok */ }
      } catch {
        el.muted = false;
        setIsPlaying(false);
      }
    }
  }, []); // stable — uses refs internally

  // ── When signed URL changes, load it. Play if we intend to. ──────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !musicUrl) return;
    el.src = musicUrl;
    el.load();
    if (wantPlayRef.current) {
      tryAutoplay(el);
    }
  }, [musicUrl]); // intentionally omit tryAutoplay (stable ref, safe)

  // ── Schedule watcher ──────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      const newType = getActiveType(schedule);
      const prev = activeTypeRef.current;
      if (newType === prev) return;

      activeTypeRef.current = newType;
      setActiveType(newType);

      if (!newType) {
        wantPlayRef.current = false;
        wasTriggeredRef.current = false;
        setIsPlaying(false);
        setShowPlaylist(false);
        videoRef.current?.pause();
        try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ok */ }
      } else if (!wasTriggeredRef.current) {
        wasTriggeredRef.current = true;
        wantPlayRef.current = true;
        // If URL is already available, play now. Otherwise musicUrl effect handles it.
        const el = videoRef.current;
        if (el && musicUrl) {
          if (!el.src || el.src !== musicUrl) {
            el.src = musicUrl;
            el.load();
          }
          tryAutoplay(el);
        }
      }
    };

    check();
    const timer = setInterval(check, 30_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule]); // musicUrl & tryAutoplay intentionally omitted (stable refs)

  // ── Next / Prev ───────────────────────────────────────────────────────────
  const playNext = useCallback(() => {
    if (!wantPlayRef.current) return;
    setCurrentIndex(i => (i + 1) % Math.max(activeFiles.length, 1));
  }, [activeFiles.length]);

  const playPrev = useCallback(() => {
    setCurrentIndex(i => (i - 1 + Math.max(activeFiles.length, 1)) % Math.max(activeFiles.length, 1));
  }, [activeFiles.length]);

  // ── User gesture play (always works in browser) ───────────────────────────
  const handlePlayClick = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    wantPlayRef.current = true;
    errorCountRef.current = 0;
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* ok */ }

    el.muted = false;
    el.volume = isMutedRef.current ? 0 : volumeRef.current;

    // Ensure src is set
    if (musicUrl) {
      const fullUrl = musicUrl.startsWith("http") ? musicUrl : (location.origin + musicUrl);
      if (el.src !== fullUrl && el.src !== musicUrl) {
        el.src = musicUrl;
      }
    }

    // If element is in an error state or has no data, reload before playing.
    // load() + play() in the same click handler preserves the user gesture.
    if (el.error || el.readyState < 1) {
      el.load();
    }

    el.play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  }, [musicUrl]);

  const handlePauseClick = useCallback(() => {
    wantPlayRef.current = false;
    videoRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const handleClose = useCallback(() => {
    wantPlayRef.current = false;
    wasTriggeredRef.current = false;
    activeTypeRef.current = null;
    setActiveType(null);
    setIsPlaying(false);
    setShowPlaylist(false);
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ""; }
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ok */ }
  }, []);

  const handleSeek = (pct: number) => {
    const el = videoRef.current;
    if (el?.duration) { el.currentTime = (pct / 100) * el.duration; setProgress(pct); }
  };

  // Audio element is always mounted to keep the ref valid
  const audioEl = (
    <video
      ref={videoRef}
      onEnded={() => { errorCountRef.current = 0; playNext(); }}
      onError={() => {
        if (!wantPlayRef.current) return;
        errorCountRef.current += 1;
        // Stop cycling if all songs have errored (max = total files or 10)
        if (errorCountRef.current > Math.max((activeFiles.length || 1) * 2, 10)) {
          wantPlayRef.current = false;
          setIsPlaying(false);
          return;
        }
        setTimeout(playNext, 2000);
      }}
      style={{ display: "none" }}
      playsInline
      preload="auto"
    />
  );

  if (!activeType || activeFiles.length === 0) return audioEl;

  const scheduleLabel = activeType === "출근" ? "🌅 출근음악" : "🌆 퇴근음악";
  const bgColor = activeType === "출근" ? "from-orange-500 to-yellow-500" : "from-indigo-600 to-purple-600";
  const solidBg = activeType === "출근" ? "bg-orange-500" : "bg-indigo-600";
  const activeSongIdx = currentIndex % activeFiles.length;

  return (
    <>
      {audioEl}

      <div className="fixed bottom-0 left-0 right-0 z-[60] animate-in slide-in-from-bottom duration-300 shadow-2xl">

        {/* Playlist */}
        {showPlaylist && (
          <div className={cn("animate-in slide-in-from-bottom duration-200 border-t border-white/20", solidBg)}>
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between px-4 py-2 border-b border-white/20">
                <div className="flex items-center gap-2 text-white">
                  <ListMusic className="w-4 h-4" />
                  <span className="text-sm font-semibold">{scheduleLabel} 재생목록</span>
                  <span className="text-xs text-white/60">{activeFiles.length}곡</span>
                  {daySpecificFiles && (
                    <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full">요일지정</span>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-white/70 hover:bg-white/20"
                  onClick={() => setShowPlaylist(false)} data-testid="button-playlist-close">
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>
              <div className="max-h-52 overflow-y-auto">
                {activeFiles.map((file, idx) => {
                  const isActive = idx === activeSongIdx;
                  return (
                    <button
                      key={file.id}
                      onClick={() => {
                        setShowPlaylist(false);
                        wantPlayRef.current = true;
                        if (idx === activeSongIdx) {
                          handlePlayClick();
                        } else {
                          setCurrentIndex(idx);
                          // musicUrl effect will fire when new URL arrives
                        }
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        isActive ? "bg-white/25 text-white" : "text-white/80 hover:bg-white/15 hover:text-white"
                      )}
                      data-testid={`button-playlist-song-${file.id}`}
                    >
                      <div className="w-6 h-6 flex items-center justify-center shrink-0">
                        {isActive && isPlaying ? (
                          <div className="flex gap-[2px] items-end h-4">
                            {[0, 160, 320].map((delay, i) => (
                              <span key={i} className="w-[3px] bg-white rounded-full animate-[bounce_0.8s_ease-in-out_infinite]"
                                style={{ height: i === 1 ? "100%" : i === 0 ? "60%" : "40%", animationDelay: `${delay}ms` }} />
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-white/40 font-mono">{idx + 1}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm truncate font-medium", isActive && "font-semibold")}>{file.name}</p>
                        {file.scheduleType === "all" && (
                          <p className="text-[10px] text-white/50 mt-0.5">출퇴근 공통</p>
                        )}
                      </div>
                      {isActive && isPlaying && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div className="h-1 bg-black/20 cursor-pointer"
          onClick={e => {
            const r = e.currentTarget.getBoundingClientRect();
            handleSeek(((e.clientX - r.left) / r.width) * 100);
          }}>
          <div className="h-full bg-white/80 transition-none" style={{ width: `${progress}%` }} />
        </div>

        {/* Player bar */}
        <div className={cn("bg-gradient-to-r px-4 py-2", bgColor)}>
          {!isMinimized ? (
            <div className="max-w-3xl mx-auto flex items-center gap-3">
              <div className={cn(
                "w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0",
                isPlaying && "animate-[spin_8s_linear_infinite]"
              )}>
                <Music2 className="w-4 h-4 text-white" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate" data-testid="text-current-song">
                  {currentFile?.name || "음악 준비 중"}
                </p>
                <p className="text-white/70 text-xs">
                  {scheduleLabel} · {activeSongIdx + 1}/{activeFiles.length}
                  {!isPlaying && <span className="ml-2 text-white/50 animate-pulse">▶ 눌러서 재생</span>}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20"
                  onClick={playPrev} data-testid="button-music-prev">
                  <SkipBack className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon"
                  className="h-9 w-9 text-white hover:bg-white/20 bg-white/10"
                  onClick={isPlaying ? handlePauseClick : handlePlayClick}
                  data-testid="button-music-play-pause">
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20"
                  onClick={playNext} data-testid="button-music-next">
                  <SkipForward className="w-4 h-4" />
                </Button>
              </div>

              <div className="hidden sm:flex items-center gap-2 w-28">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20 shrink-0"
                  onClick={() => setIsMuted(m => !m)} data-testid="button-music-mute">
                  {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </Button>
                <Slider
                  value={[isMuted ? 0 : volume * 100]}
                  onValueChange={v => { setVolume(v[0] / 100); setIsMuted(v[0] === 0); }}
                  min={0} max={100} step={1} className="flex-1"
                  data-testid="slider-music-volume"
                />
              </div>

              <Button variant="ghost" size="icon"
                className={cn("h-7 w-7 text-white hover:bg-white/20", showPlaylist && "bg-white/20")}
                onClick={() => setShowPlaylist(p => !p)} title="재생목록"
                data-testid="button-music-playlist">
                <ListMusic className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20"
                onClick={() => { setIsMinimized(true); setShowPlaylist(false); }}
                data-testid="button-music-minimize">
                <ChevronDown className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20"
                onClick={handleClose} data-testid="button-music-close">
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <Music2 className="w-4 h-4" />
                <span className="text-sm font-medium truncate max-w-[200px]">{currentFile?.name || scheduleLabel}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20"
                  onClick={isPlaying ? handlePauseClick : handlePlayClick}
                  data-testid="button-music-play-pause-mini">
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20"
                  onClick={() => setIsMinimized(false)} data-testid="button-music-expand">
                  <ChevronUp className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
