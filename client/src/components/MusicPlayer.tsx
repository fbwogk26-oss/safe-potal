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
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showPlaylist, setShowPlaylist] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressRef = useRef<NodeJS.Timeout | null>(null);
  const wasAutoTriggeredRef = useRef(false);
  const activeTypeRef = useRef<string | null>(null);
  const isPlayingRef = useRef(false);
  const volumeRef = useRef(0.7);
  const isMutedRef = useRef(false);
  // True after user explicitly clicks a play button — prevents re-showing banner
  const userApprovedRef = useRef(false);
  // Ref copy of signedUrl so we don't need it as an effect dependency
  const signedUrlRef = useRef<string | null>(null);
  // Skip the isPlaying effect's attemptAutoplay when user already triggered play directly
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
  const currentFile = activeFiles[currentIndex % Math.max(activeFiles.length, 1)];
  const signedUrl = useSignedMusicUrl(currentFile?.url);

  // Keep ref in sync — used by effects that must not have signedUrl as a dep
  useEffect(() => { signedUrlRef.current = signedUrl; }, [signedUrl]);

  // ── Autoplay helper ──────────────────────────────────────────────────────
  // Tries normal play → muted fallback.
  // If user already approved playback, never shows the interaction banner again.
  const attemptAutoplay = useCallback(async (el: HTMLVideoElement) => {
    el.volume = isMutedRef.current ? 0 : volumeRef.current;
    try {
      await el.play();
      setNeedsInteraction(false);
    } catch {
      el.muted = true;
      try {
        await el.play();
        el.muted = false;
        el.volume = isMutedRef.current ? 0 : volumeRef.current;
        setNeedsInteraction(false);
      } catch {
        // Both normal and muted blocked
        setIsPlaying(false);
        if (!userApprovedRef.current) {
          // First-time autoplay blocked → show tap-to-start banner
          setNeedsInteraction(true);
        }
        // If user already approved, silently stop — no banner
      }
    }
  }, []);

  // ── Schedule watcher ─────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      const newType = getActiveScheduleType(schedule);
      const prevType = activeTypeRef.current;
      if (newType !== prevType) {
        activeTypeRef.current = newType;
        setActiveType(newType);
        if (!newType) {
          setIsPlaying(false);
          setNeedsInteraction(false);
          setShowPlaylist(false);
          wasAutoTriggeredRef.current = false;
          userApprovedRef.current = false;
        } else if (!wasAutoTriggeredRef.current) {
          wasAutoTriggeredRef.current = true;
          setNeedsInteraction(false);
          setIsPlaying(true);
        }
      }
    };
    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [schedule]);

  // ── Load new signed URL → play if needed ─────────────────────────────────
  // FIX: Only run when signedUrl changes. Does NOT trigger another run when
  // isPlaying changes (signedUrl is NOT in the isPlaying effect's dep array).
  useEffect(() => {
    if (!videoRef.current || !signedUrl) return;
    const el = videoRef.current;
    el.src = signedUrl;
    el.load();
    if (isPlayingRef.current) {
      attemptAutoplay(el);
    }
  }, [signedUrl, attemptAutoplay]);

  // ── isPlaying toggle ──────────────────────────────────────────────────────
  // FIX: signedUrl is NOT in the dep array — we read it via signedUrlRef.
  // This prevents extra attemptAutoplay calls whenever the URL changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!videoRef.current) return;
    const el = videoRef.current;

    if (isPlaying) {
      // Skip if the user already called el.play() directly (gesture handler)
      if (skipNextPlayEffectRef.current) {
        skipNextPlayEffectRef.current = false;
        return;
      }
      const url = signedUrlRef.current;
      if (!url) return; // signedUrl effect will handle play when URL arrives
      if (!el.src || el.src === window.location.href) {
        el.src = url;
        el.load();
      }
      attemptAutoplay(el);
    } else {
      el.pause();
    }
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
    // FIX: Only auto-advance if we're supposed to be playing.
    // Prevents the onError → playNext → onError infinite loop
    // when the player is stopped or showing the banner.
    if (!isPlayingRef.current) return;
    setCurrentIndex((i) => (i + 1) % Math.max(activeFiles.length, 1));
  }, [activeFiles.length]);

  const playPrev = useCallback(() => {
    setCurrentIndex((i) => (i - 1 + activeFiles.length) % Math.max(activeFiles.length, 1));
  }, [activeFiles.length]);

  // ── User actions ──────────────────────────────────────────────────────────

  // Called from the banner "재생 시작" button (user-gesture context)
  const handleStartPlaying = () => {
    userApprovedRef.current = true;
    skipNextPlayEffectRef.current = true; // Prevent effect from double-calling play
    setNeedsInteraction(false);
    setIsPlaying(true);

    const el = videoRef.current;
    if (!el) return;
    const url = signedUrlRef.current;
    if (!url) return; // signedUrl effect will trigger play when URL arrives

    // Always reset to a clean state before user-initiated play
    el.src = url;
    el.muted = false;
    el.volume = isMuted ? 0 : volume;
    el.load();

    // Direct play in user-gesture context — always succeeds unless media error
    el.play().catch(() => {
      skipNextPlayEffectRef.current = false;
      setIsPlaying(false);
      // Don't re-show banner after user approved — just silently stop
    });
  };

  // Called from the playlist panel (user-gesture context)
  const handleSelectSong = (idx: number) => {
    userApprovedRef.current = true;
    skipNextPlayEffectRef.current = true;
    setCurrentIndex(idx);
    setIsPlaying(true);
    setShowPlaylist(false);
    // signedUrl will change → signedUrl effect loads & plays the new track
  };

  const handleClose = () => {
    setIsPlaying(false);
    setActiveType(null);
    activeTypeRef.current = null;
    wasAutoTriggeredRef.current = false;
    userApprovedRef.current = false;
    setNeedsInteraction(false);
    setShowPlaylist(false);
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ""; }
  };

  const handleSeek = (pct: number) => {
    if (videoRef.current?.duration) {
      videoRef.current.currentTime = (pct / 100) * videoRef.current.duration;
      setProgress(pct);
    }
  };

  if (!activeType || activeFiles.length === 0) return null;

  const scheduleLabel = activeType === "출근" ? "🌅 출근음악" : "🌆 퇴근음악";
  const bannerMessage = activeType === "출근" ? "오늘도 안전한 하루되세요 😊" : "오늘 하루도 수고 하셨습니다 🙏";
  const bgColor = activeType === "출근" ? "from-orange-500 to-yellow-500" : "from-indigo-600 to-purple-600";
  const solidBg = activeType === "출근" ? "bg-orange-500" : "bg-indigo-600";

  return (
    <>
      <video
        ref={videoRef}
        onEnded={playNext}
        onError={() => {
          // FIX: Only advance on error if we're actively supposed to be playing.
          // This breaks the onError→playNext→fetch→error infinite loop.
          if (isPlayingRef.current) {
            setTimeout(playNext, 1500);
          }
        }}
        style={{ display: "none" }}
        playsInline
        preload="auto"
      />

      {/* ── Banner (shown only when browser blocks initial autoplay) ──────── */}
      {needsInteraction && !isPlaying && (
        <div className={cn("fixed bottom-0 left-0 right-0 z-[60] animate-in slide-in-from-bottom duration-500 bg-gradient-to-r", bgColor)}>
          <div className="max-w-2xl mx-auto flex items-center justify-between px-4 py-3 gap-4">
            <div className="flex items-center gap-3 text-white">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <Music2 className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-sm">{bannerMessage}</p>
                <p className="text-xs text-white/80">{activeFiles.length}곡이 준비되어 있습니다</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="bg-white text-gray-900 hover:bg-white/90 font-semibold text-xs h-8 px-4"
                onClick={handleStartPlaying}
                data-testid="button-start-music"
              >
                <Play className="w-3.5 h-3.5 mr-1" />재생 시작
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={handleClose} data-testid="button-dismiss-music">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Player bar ─────────────────────────────────────────────────────── */}
      {isPlaying && (
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
                    const isActive = idx === currentIndex % activeFiles.length;
                    return (
                      <button
                        key={file.id}
                        onClick={() => handleSelectSong(idx)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                          isActive ? "bg-white/25 text-white" : "text-white/80 hover:bg-white/15 hover:text-white"
                        )}
                        data-testid={`button-playlist-song-${file.id}`}
                      >
                        <div className="w-6 h-6 flex items-center justify-center shrink-0">
                          {isActive ? (
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
                        {isActive && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Progress bar */}
          <div
            className="h-1 bg-black/20 relative cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              handleSeek(((e.clientX - rect.left) / rect.width) * 100);
            }}
          >
            <div className="h-full bg-white/80 transition-none" style={{ width: `${progress}%` }} />
          </div>

          {/* Controls */}
          <div className={cn("bg-gradient-to-r px-4 py-2", bgColor)}>
            {!isMinimized ? (
              <div className="max-w-3xl mx-auto flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0 animate-[spin_8s_linear_infinite]">
                  <Music2 className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate" data-testid="text-current-song">
                    {currentFile?.name || "음악 재생 중"}
                  </p>
                  <p className="text-white/70 text-xs">
                    {scheduleLabel} · {(currentIndex % activeFiles.length) + 1}/{activeFiles.length}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={playPrev} data-testid="button-music-prev">
                    <SkipBack className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-white/20 bg-white/10" onClick={() => setIsPlaying((p) => !p)} data-testid="button-music-play-pause">
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={playNext} data-testid="button-music-next">
                    <SkipForward className="w-4 h-4" />
                  </Button>
                </div>
                <div className="hidden sm:flex items-center gap-2 w-28">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20 shrink-0" onClick={() => setIsMuted((m) => !m)} data-testid="button-music-mute">
                    {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </Button>
                  <Slider
                    value={[isMuted ? 0 : volume * 100]}
                    onValueChange={(v) => { setVolume(v[0] / 100); setIsMuted(v[0] === 0); }}
                    min={0} max={100} step={1}
                    className="flex-1"
                    data-testid="slider-music-volume"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-7 w-7 text-white hover:bg-white/20", showPlaylist && "bg-white/20")}
                  onClick={() => setShowPlaylist((p) => !p)}
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
                  <span className="text-sm font-medium truncate max-w-[200px]">{currentFile?.name || "재생 중"}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20" onClick={() => setIsPlaying((p) => !p)} data-testid="button-music-play-pause-mini">
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
      )}
    </>
  );
}
