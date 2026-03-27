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
  if (schedule.checkin?.enabled && cur >= schedule.checkin.start && cur <= schedule.checkin.end) {
    return "출근";
  }
  if (schedule.checkout?.enabled && cur >= schedule.checkout.start && cur <= schedule.checkout.end) {
    return "퇴근";
  }
  return null;
}

async function getStreamUrl(objectPath: string): Promise<string> {
  const res = await fetch(`/api/download?path=${encodeURIComponent(objectPath)}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("URL 취득 실패");
  const data = await res.json();
  return data.url as string;
}

export function MusicPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const [wasAutoTriggered, setWasAutoTriggered] = useState(false);
  const [progress, setProgress] = useState(0);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [srcLoading, setSrcLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<NodeJS.Timeout | null>(null);

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

  const playNext = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % Math.max(activeFiles.length, 1));
  }, [activeFiles.length]);

  const playPrev = useCallback(() => {
    setCurrentIndex((i) => (i - 1 + activeFiles.length) % Math.max(activeFiles.length, 1));
  }, [activeFiles.length]);

  // Check schedule every 30s
  useEffect(() => {
    const check = () => {
      const newType = getActiveScheduleType(schedule);
      setActiveType((prev) => {
        if (prev !== newType) {
          if (!newType) {
            setIsPlaying(false);
            setWasAutoTriggered(false);
            setNeedsInteraction(false);
            setAudioSrc(null);
          } else if (!wasAutoTriggered) {
            setNeedsInteraction(true);
            setWasAutoTriggered(true);
          }
        }
        return newType;
      });
    };
    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [schedule, wasAutoTriggered]);

  // Fetch signed stream URL whenever currentFile changes
  useEffect(() => {
    if (!currentFile?.url) {
      setAudioSrc(null);
      return;
    }
    setSrcLoading(true);
    getStreamUrl(currentFile.url)
      .then((url) => {
        setAudioSrc(url);
      })
      .catch(() => {
        setAudioSrc(null);
        setSrcLoading(false);
      });
  }, [currentFile?.id]);

  // Set audio src and play when signed URL is ready
  useEffect(() => {
    if (!audioRef.current || !audioSrc) return;
    audioRef.current.src = audioSrc;
    audioRef.current.volume = isMuted ? 0 : volume;
    audioRef.current.load();
    setSrcLoading(false);
    if (isPlaying) {
      audioRef.current.play().catch(() => {
        setIsPlaying(false);
        setNeedsInteraction(true);
      });
    }
  }, [audioSrc]);

  // Play/pause when isPlaying changes (src already set)
  useEffect(() => {
    if (!audioRef.current || !audioSrc) return;
    if (isPlaying) {
      audioRef.current.play().catch(() => {
        setIsPlaying(false);
        setNeedsInteraction(true);
      });
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  // Volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Progress bar
  useEffect(() => {
    if (isPlaying) {
      progressRef.current = setInterval(() => {
        if (audioRef.current && audioRef.current.duration) {
          setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
        }
      }, 500);
    } else {
      if (progressRef.current) clearInterval(progressRef.current);
    }
    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [isPlaying]);

  const handleStartPlaying = () => {
    setNeedsInteraction(false);
    setCurrentIndex(0);
    setIsPlaying(true);
  };

  const handleClose = () => {
    setIsPlaying(false);
    setActiveType(null);
    setWasAutoTriggered(false);
    setNeedsInteraction(false);
    setAudioSrc(null);
  };

  const handleSeek = (val: number[]) => {
    if (audioRef.current && audioRef.current.duration) {
      audioRef.current.currentTime = (val[0] / 100) * audioRef.current.duration;
      setProgress(val[0]);
    }
  };

  if (!activeType || activeFiles.length === 0) return null;

  const scheduleLabel = activeType === "출근" ? "🌅 출근음악" : "🌆 퇴근음악";
  const bannerMessage = activeType === "출근" ? "오늘도 안전한 하루되세요 😊" : "오늘 하루도 수고 하셨습니다 🙏";
  const bgColor = activeType === "출근"
    ? "from-orange-500 to-yellow-500"
    : "from-indigo-600 to-purple-600";

  return (
    <>
      <audio
        ref={audioRef}
        onEnded={playNext}
        onError={() => {
          setSrcLoading(false);
          playNext();
        }}
      />

      {/* Notification prompt */}
      {needsInteraction && !isPlaying && (
        <div className={cn(
          "fixed bottom-0 left-0 right-0 z-[60] animate-in slide-in-from-bottom duration-500",
          "bg-gradient-to-r", bgColor
        )}>
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
                disabled={srcLoading}
                data-testid="button-start-music"
              >
                <Play className="w-3.5 h-3.5 mr-1" />
                {srcLoading ? "준비 중..." : "재생 시작"}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={handleClose}
                data-testid="button-dismiss-music"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Player bar */}
      {isPlaying && (
        <div className={cn(
          "fixed bottom-0 left-0 right-0 z-[60] animate-in slide-in-from-bottom duration-300",
          "shadow-2xl"
        )}>
          {/* Progress bar */}
          <div className="h-1 bg-black/20 relative">
            <div
              className="h-full bg-white/80 transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className={cn(
            "bg-gradient-to-r px-4 py-2", bgColor
          )}>
            {!isMinimized && (
              <div className="max-w-3xl mx-auto flex items-center gap-3">
                {/* Song info */}
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0 animate-[spin_8s_linear_infinite]">
                  <Music2 className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate" data-testid="text-current-song">
                    {currentFile?.name || "음악 재생 중"}
                  </p>
                  <p className="text-white/70 text-xs">{scheduleLabel} · {currentIndex + 1}/{activeFiles.length}</p>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white hover:bg-white/20"
                    onClick={playPrev}
                    data-testid="button-music-prev"
                  >
                    <SkipBack className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-white hover:bg-white/20 bg-white/10"
                    onClick={() => setIsPlaying((p) => !p)}
                    data-testid="button-music-play-pause"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white hover:bg-white/20"
                    onClick={playNext}
                    data-testid="button-music-next"
                  >
                    <SkipForward className="w-4 h-4" />
                  </Button>
                </div>

                {/* Volume */}
                <div className="hidden sm:flex items-center gap-2 w-28">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white hover:bg-white/20 shrink-0"
                    onClick={() => setIsMuted((m) => !m)}
                    data-testid="button-music-mute"
                  >
                    {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </Button>
                  <Slider
                    value={[isMuted ? 0 : volume * 100]}
                    onValueChange={(v) => {
                      setVolume(v[0] / 100);
                      setIsMuted(v[0] === 0);
                    }}
                    min={0}
                    max={100}
                    step={1}
                    className="flex-1"
                    data-testid="slider-music-volume"
                  />
                </div>

                {/* Minimize / Close */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-white hover:bg-white/20"
                  onClick={() => setIsMinimized(true)}
                  data-testid="button-music-minimize"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-white hover:bg-white/20"
                  onClick={handleClose}
                  data-testid="button-music-close"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}

            {isMinimized && (
              <div className="max-w-3xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-2 text-white">
                  <Music2 className="w-4 h-4" />
                  <span className="text-sm font-medium truncate max-w-[200px]">
                    {currentFile?.name || "재생 중"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white hover:bg-white/20"
                    onClick={() => setIsPlaying((p) => !p)}
                    data-testid="button-music-play-pause-mini"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white hover:bg-white/20"
                    onClick={() => setIsMinimized(false)}
                    data-testid="button-music-expand"
                  >
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
