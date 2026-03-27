/**
 * MusicPlayer — schedule-driven audio player
 *
 * Key design decisions:
 *  • NO separate "tap to start" banner. The player bar is always visible when
 *    the schedule is active.  If the browser blocks autoplay the bar shows in
 *    paused state; the user clicks ▶ once and it plays forever.
 *  • User-approval is persisted in sessionStorage so page navigations within
 *    the same browser session never reset the block.
 *  • No double-play race: signedUrl effect drives playback when the URL
 *    changes; isPlaying effect only drives pause.  skipNextPlayEffect flag
 *    prevents the isPlaying effect from duplicating a gesture-triggered play.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Music2,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  X,
  ChevronDown,
  ChevronUp,
  ListMusic,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MusicFile } from "@shared/schema";

interface MusicSchedule {
  checkin: { enabled: boolean; start: string; end: string };
  checkout: { enabled: boolean; start: string; end: string };
}

const SESSION_APPROVED_KEY = "music_session_approved";

function getCurrentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function getActiveScheduleType(schedule: MusicSchedule | undefined): string | null {
  if (!schedule) return null;
  const cur = getCurrentTime();
  if (schedule.checkin?.enabled && cur >= schedule.checkin.start && cur <= schedule.checkin.end) return "출근";
  if (schedule.checkout?.enabled && cur >= schedule.checkout.start && cur <= schedule.checkout.end) return "퇴근";
  return null;
}

function useSignedMusicUrl(objectPath: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!objectPath) { setUrl(null); return; }
    if (!objectPath.startsWith("/objects/")) { setUrl(objectPath); return; }
    let cancelled = false;
    setUrl(null);
    fetch(`/api/download?path=${encodeURIComponent(objectPath)}&ttl=7200`, { credentials: "include" })
      .then(r => r.json())
      .then(data => { if (!cancelled && data.url) setUrl(data.url); })
      .catch(() => { if (!cancelled) setUrl(objectPath); });
    return () => { cancelled = true; };
  }, [objectPath]);
  return url;
}

export function MusicPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showPlaylist, setShowPlaylist] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressRef = useRef<NodeJS.Timeout | null>(null);
  const wasAutoTriggeredRef = useRef(false);
  const activeTypeRef = useRef<string | null>(null);
  const isPlayingRef = useRef(false);
  const volumeRef = useRef(0.7);
  const isMutedRef = useRef(false);
  const signedUrlRef = useRef<string | null>(null);
  // Once any play (user or auto) succeeds, never block again this session
  const userApprovedRef = useRef(
    typeof sessionStorage !== "undefined" && sessionStorage.getItem(SESSION_APPROVED_KEY) === "true"
  );
  // Skip the isPlaying effect when a gesture handler already called el.play()
  const skipNextPlayEffectRef = useRef(false);

  useEffect(() => { activeTypeRef.current = activeType; }, [activeType]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  const { data: allFiles = [] } = useQuery<MusicFile[]>({
    queryKey: ["/api/music"],
    staleTime: 60000,
  });

  const { data: schedule } = useQuery<MusicSchedule>({
    queryKey: ["/api/music/schedule"],
    staleTime: 60000,
  });

  const activeFiles = allFiles.filter(
    (f) => f.scheduleType === activeType || f.scheduleType === "all"
  );
  const safeLen = Math.max(activeFiles.length, 1);
  const currentFile = activeFiles[currentIndex % safeLen];
  const signedUrl = useSignedMusicUrl(currentFile?.url);

  useEffect(() => { signedUrlRef.current = signedUrl; }, [signedUrl]);

  // ── Approve helper ────────────────────────────────────────────────────────
  const markApproved = () => {
    userApprovedRef.current = true;
    try { sessionStorage.setItem(SESSION_APPROVED_KEY, "true"); } catch { /* ignore */ }
  };

  // ── Autoplay helper ───────────────────────────────────────────────────────
  // Normal play → muted fallback. If both fail and user hasn't approved yet,
  // simply leave the player bar in paused state — no banner is shown.
  const attemptAutoplay = useCallback(async (el: HTMLVideoElement) => {
    el.volume = isMutedRef.current ? 0 : volumeRef.current;
    try {
      await el.play();
      markApproved();
      setIsPlaying(true);
    } catch {
      el.muted = true;
      try {
        await el.play();
        el.muted = false;
        el.volume = isMutedRef.current ? 0 : volumeRef.current;
        markApproved();
        setIsPlaying(true);
      } catch {
        // Both blocked — leave player bar visible in paused state
        setIsPlaying(false);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Schedule watcher ──────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      const newType = getActiveScheduleType(schedule);
      const prev = activeTypeRef.current;
      if (newType === prev) return;
      activeTypeRef.current = newType;
      setActiveType(newType);
      if (!newType) {
        setIsPlaying(false);
        setShowPlaylist(false);
        wasAutoTriggeredRef.current = false;
        // Clear session approval so next schedule activation starts fresh
        try { sessionStorage.removeItem(SESSION_APPROVED_KEY); } catch { /* ignore */ }
        userApprovedRef.current = false;
      } else if (!wasAutoTriggeredRef.current) {
        wasAutoTriggeredRef.current = true;
        // Attempt autoplay — player bar is already visible regardless
        setIsPlaying(true); // optimistic; attemptAutoplay may revert to false
      }
    };
    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [schedule]);

  // ── Load new signed URL → attempt play if we should be playing ────────────
  useEffect(() => {
    if (!videoRef.current || !signedUrl) return;
    const el = videoRef.current;
    el.src = signedUrl;
    el.load();
    if (isPlayingRef.current) {
      attemptAutoplay(el);
    }
  }, [signedUrl, attemptAutoplay]);

  // ── isPlaying toggle (pause only — play is driven above or by gesture) ────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!videoRef.current) return;
    const el = videoRef.current;
    if (!isPlaying) {
      el.pause();
      return;
    }
    if (skipNextPlayEffectRef.current) {
      skipNextPlayEffectRef.current = false;
      return; // gesture handler already called el.play()
    }
    const url = signedUrlRef.current;
    if (!url) return; // signedUrl effect will handle it
    if (!el.src || el.src === window.location.href) {
      el.src = url;
      el.load();
    }
    attemptAutoplay(el);
  }, [isPlaying, attemptAutoplay]);

  // ── Volume sync ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : volume;
      videoRef.current.muted = false;
    }
  }, [volume, isMuted]);

  // ── Progress bar ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying) {
      progressRef.current = setInterval(() => {
        if (videoRef.current?.duration) {
          setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100);
        }
      }, 500);
    } else {
      if (progressRef.current) clearInterval(progressRef.current);
    }
    return () => { if (progressRef.current) clearInterval(progressRef.current); };
  }, [isPlaying]);

  // ── Next / Prev ───────────────────────────────────────────────────────────
  const playNext = useCallback(() => {
    if (!isPlayingRef.current) return; // no cycling when not playing
    setCurrentIndex(i => (i + 1) % Math.max(activeFiles.length, 1));
  }, [activeFiles.length]);

  const playPrev = useCallback(() => {
    setCurrentIndex(i => (i - 1 + activeFiles.length) % Math.max(activeFiles.length, 1));
  }, [activeFiles.length]);

  // ── Gesture-triggered play (user clicked ▶) ───────────────────────────────
  const handlePlay = (idx?: number) => {
    const nextIdx = idx ?? currentIndex;
    markApproved();
    skipNextPlayEffectRef.current = true;
    if (idx !== undefined) setCurrentIndex(idx);
    setIsPlaying(true);
    setShowPlaylist(false);

    const el = videoRef.current;
    if (!el) return;
    const url = signedUrlRef.current;
    if (!url) return; // signedUrl effect will trigger play when URL arrives

    el.src = url;
    el.muted = false;
    el.volume = isMuted ? 0 : volume;
    el.load();
    el.play().catch(() => {
      // User gesture should always succeed, but if not, just mark as paused
      skipNextPlayEffectRef.current = false;
      setIsPlaying(false);
    });

    void nextIdx; // suppress unused warning
  };

  const handleClose = () => {
    setIsPlaying(false);
    setActiveType(null);
    activeTypeRef.current = null;
    wasAutoTriggeredRef.current = false;
    userApprovedRef.current = false;
    setShowPlaylist(false);
    try { sessionStorage.removeItem(SESSION_APPROVED_KEY); } catch { /* ignore */ }
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ""; }
  };

  const handleSeek = (pct: number) => {
    if (videoRef.current?.duration) {
      videoRef.current.currentTime = (pct / 100) * videoRef.current.duration;
      setProgress(pct);
    }
  };

  // Only render when schedule is active and there are songs
  if (!activeType || activeFiles.length === 0) return null;

  const scheduleLabel = activeType === "출근" ? "🌅 출근음악" : "🌆 퇴근음악";
  const bgColor = activeType === "출근" ? "from-orange-500 to-yellow-500" : "from-indigo-600 to-purple-600";
  const solidBg = activeType === "출근" ? "bg-orange-500" : "bg-indigo-600";
  const activeSongIdx = currentIndex % activeFiles.length;

  return (
    <>
      <video
        ref={videoRef}
        onEnded={playNext}
        onError={() => { if (isPlayingRef.current) setTimeout(playNext, 1500); }}
        style={{ display: "none" }}
        playsInline
        preload="auto"
      />

      {/* ── Persistent player bar (always visible when schedule is active) ── */}
      <div className="fixed bottom-0 left-0 right-0 z-[60] animate-in slide-in-from-bottom duration-300 shadow-2xl">

        {/* Playlist panel */}
        {showPlaylist && (
          <div className={cn("animate-in slide-in-from-bottom duration-200 border-t border-white/20", solidBg)}>
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between px-4 py-2 border-b border-white/20">
                <div className="flex items-center gap-2 text-white">
                  <ListMusic className="w-4 h-4" />
                  <span className="text-sm font-semibold">{scheduleLabel} 재생목록</span>
                  <span className="text-xs text-white/60">{activeFiles.length}곡</span>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-white/70 hover:bg-white/20" onClick={() => setShowPlaylist(false)} data-testid="button-playlist-close">
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>
              <div className="max-h-52 overflow-y-auto">
                {activeFiles.map((file, idx) => {
                  const isActive = idx === activeSongIdx;
                  return (
                    <button
                      key={file.id}
                      onClick={() => handlePlay(idx)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        isActive ? "bg-white/25 text-white" : "text-white/80 hover:bg-white/15 hover:text-white"
                      )}
                      data-testid={`button-playlist-song-${file.id}`}
                    >
                      <div className="w-6 h-6 flex items-center justify-center shrink-0">
                        {isActive && isPlaying ? (
                          <div className="flex gap-[2px] items-end h-4">
                            <span className="w-[3px] bg-white rounded-full animate-[bounce_0.8s_ease-in-out_infinite]" style={{ height: "60%", animationDelay: "0ms" }} />
                            <span className="w-[3px] bg-white rounded-full animate-[bounce_0.8s_ease-in-out_infinite]" style={{ height: "100%", animationDelay: "160ms" }} />
                            <span className="w-[3px] bg-white rounded-full animate-[bounce_0.8s_ease-in-out_infinite]" style={{ height: "40%", animationDelay: "320ms" }} />
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
        <div
          className="h-1 bg-black/20 cursor-pointer"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            handleSeek(((e.clientX - r.left) / r.width) * 100);
          }}
        >
          <div className="h-full bg-white/80 transition-none" style={{ width: `${progress}%` }} />
        </div>

        {/* Controls */}
        <div className={cn("bg-gradient-to-r px-4 py-2", bgColor)}>
          {!isMinimized ? (
            <div className="max-w-3xl mx-auto flex items-center gap-3">
              {/* Disc icon — spins only when playing */}
              <div className={cn(
                "w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0",
                isPlaying && "animate-[spin_8s_linear_infinite]"
              )}>
                <Music2 className="w-4 h-4 text-white" />
              </div>

              {/* Song info */}
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate" data-testid="text-current-song">
                  {currentFile?.name || "음악 준비 중"}
                </p>
                <p className="text-white/70 text-xs">
                  {scheduleLabel} · {activeSongIdx + 1}/{activeFiles.length}
                  {!isPlaying && <span className="ml-2 text-white/50">▶ 눌러서 재생</span>}
                </p>
              </div>

              {/* Playback controls */}
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={playPrev} data-testid="button-music-prev">
                  <SkipBack className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-white hover:bg-white/20 bg-white/10"
                  onClick={() => {
                    if (isPlaying) {
                      setIsPlaying(false);
                    } else {
                      handlePlay();
                    }
                  }}
                  data-testid="button-music-play-pause"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={playNext} data-testid="button-music-next">
                  <SkipForward className="w-4 h-4" />
                </Button>
              </div>

              {/* Volume */}
              <div className="hidden sm:flex items-center gap-2 w-28">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20 shrink-0" onClick={() => setIsMuted(m => !m)} data-testid="button-music-mute">
                  {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </Button>
                <Slider
                  value={[isMuted ? 0 : volume * 100]}
                  onValueChange={v => { setVolume(v[0] / 100); setIsMuted(v[0] === 0); }}
                  min={0} max={100} step={1}
                  className="flex-1"
                  data-testid="slider-music-volume"
                />
              </div>

              {/* Playlist toggle */}
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-7 w-7 text-white hover:bg-white/20", showPlaylist && "bg-white/20")}
                onClick={() => setShowPlaylist(p => !p)}
                title="재생목록"
                data-testid="button-music-playlist"
              >
                <ListMusic className="w-4 h-4" />
              </Button>

              <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20" onClick={() => { setIsMinimized(true); setShowPlaylist(false); }} data-testid="button-music-minimize">
                <ChevronDown className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20" onClick={handleClose} data-testid="button-music-close">
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-white hover:bg-white/20"
                  onClick={() => { if (isPlaying) setIsPlaying(false); else handlePlay(); }}
                  data-testid="button-music-play-pause-mini"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20" onClick={() => setIsMinimized(false)} data-testid="button-music-expand">
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
