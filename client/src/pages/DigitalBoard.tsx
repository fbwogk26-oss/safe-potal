import { useNotices, useCreateNotice, useDeleteNotice } from "@/hooks/use-notices";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { MonitorPlay, Trash2, Upload, X, ChevronLeft, ChevronRight, Play, Pause, Maximize2, Images, Minimize2, CheckSquare, Square } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useState, useRef, useEffect, memo } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import { usePermissions } from "@/hooks/use-permissions";

// Preloads ALL slide signed-URLs + images in parallel when slideList changes.
// Returns a stable map { objectPath → signedUrl } so transitions are instant.
function usePreloadedSlideUrls(slideList: any[], parseContent: (c: string) => ParsedContent) {
  const [urlMap, setUrlMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!slideList.length) return;

    const paths = Array.from(
      new Set(
        slideList
          .map(s => parseContent(s?.content || "{}").imageUrl)
          .filter(Boolean) as string[]
      )
    );
    if (!paths.length) return;

    paths.forEach(path => {
      if (!path.startsWith("/objects/")) {
        setUrlMap(prev => (prev[path] ? prev : { ...prev, [path]: path }));
        // Preload into browser cache
        const img = new Image();
        img.src = path;
        return;
      }

      fetch(`/api/download?path=${encodeURIComponent(path)}`, { credentials: "include" })
        .then(r => r.json())
        .then(data => {
          if (!data.url) return;
          setUrlMap(prev => (prev[path] ? prev : { ...prev, [path]: data.url }));
          // Preload GCS image into browser cache immediately
          const img = new Image();
          img.src = data.url;
        })
        .catch(() => {
          setUrlMap(prev => (prev[path] ? prev : { ...prev, [path]: path }));
        });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideList.length]);

  return urlMap;
}

const PreloadedImage = memo(function PreloadedImage({ src, alt, className }: { src: string | undefined; alt: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="w-full h-full bg-gray-900 flex flex-col items-center justify-center gap-2 text-white/40">
        <MonitorPlay className="w-10 h-10" />
        <span className="text-xs text-center px-2">이미지를 불러올 수 없습니다<br/>슬라이드를 삭제 후 재업로드하세요</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
});

type ParsedContent = { imageUrl?: string; text?: string };

function SlideViewer({ slideList, currentSlide, parseContent, urlMap }: {
  slideList: any[];
  currentSlide: number;
  parseContent: (c: string) => ParsedContent;
  urlMap: Record<string, string>;
}) {
  const slide = slideList[currentSlide];
  const parsed = parseContent(slide?.content || "{}");
  const resolvedSrc = parsed.imageUrl ? (urlMap[parsed.imageUrl] ?? undefined) : undefined;

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <AnimatePresence mode="crossfade">
        <motion.div
          key={currentSlide}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="absolute inset-0 flex items-center justify-center"
          style={{ willChange: "opacity" }}
        >
          <div className="relative w-full h-full flex items-center justify-center">
            {parsed.imageUrl ? (
              <PreloadedImage src={resolvedSrc} alt={slide?.title || ""} className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="flex flex-col items-center justify-center text-white p-8 text-center">
                <h3 className="text-4xl font-bold mb-4">{slide?.title}</h3>
                <p className="text-xl text-white/80 max-w-2xl">{parsed.text}</p>
              </div>
            )}
            {parsed.imageUrl && (slide?.title || parsed.text) && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
                <h3 className="text-2xl font-bold text-white">{slide?.title}</h3>
                {parsed.text && <p className="text-white/80 mt-1">{parsed.text}</p>}
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function SlideControls({ slideList, currentSlide, isPlaying, isFullscreen, onPrev, onNext, onTogglePlay, onSelectSlide, onToggleFullscreen }: {
  slideList: any[];
  currentSlide: number;
  isPlaying: boolean;
  isFullscreen: boolean;
  onPrev: () => void;
  onNext: () => void;
  onTogglePlay: () => void;
  onSelectSlide: (i: number) => void;
  onToggleFullscreen: () => void;
}) {
  return (
    <>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-4 py-2 z-10">
        <Button variant="ghost" size="icon" onClick={onPrev} className="text-white hover:bg-white/20 h-8 w-8">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onTogglePlay} className="text-white hover:bg-white/20 h-8 w-8">
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>
        <div className="flex gap-1 px-2">
          {slideList.map((_, idx) => (
            <button
              key={idx}
              onClick={() => onSelectSlide(idx)}
              className={`w-2 h-2 rounded-full transition-all ${idx === currentSlide ? 'bg-white w-4' : 'bg-white/50'}`}
              data-testid={`button-slide-dot-${idx}`}
              aria-label={`슬라이드 ${idx + 1}`}
            />
          ))}
        </div>
        <Button variant="ghost" size="icon" onClick={onNext} className="text-white hover:bg-white/20 h-8 w-8">
          <ChevronRight className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onToggleFullscreen} className="text-white hover:bg-white/20 h-8 w-8" title={isFullscreen ? "전체화면 종료 (ESC)" : "전체화면"}>
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </Button>
      </div>
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        {isFullscreen && (
          <Button variant="ghost" size="sm" onClick={onToggleFullscreen} className="text-white bg-black/50 hover:bg-black/70 h-7 text-xs gap-1 backdrop-blur-sm">
            <Minimize2 className="w-3 h-3" /> ESC
          </Button>
        )}
        <div className="bg-black/50 backdrop-blur-sm text-white px-3 py-1 rounded-full text-sm">
          {currentSlide + 1} / {slideList.length}
        </div>
      </div>
    </>
  );
}

export default function DigitalBoard() {
  const { canEditDigitalBoard } = usePermissions();
  const { data: slides, isLoading } = useNotices("digital_board");
  const { mutate: createSlide, isPending: isCreating } = useCreateNotice();
  const { mutate: deleteSlide } = useDeleteNotice();
  const { toast } = useToast();

  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkUploadProgress, setBulkUploadProgress] = useState(0);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const slideshowRef = useRef<HTMLDivElement>(null);

  // ── 슬라이드 선택 모드 ──────────────────────────────────
  const [slideSelectMode, setSlideSelectMode] = useState(false);
  const [selectedSlideIds, setSelectedSlideIds] = useState<Set<number>>(new Set());

  const toggleSlideSelect = (id: number) => {
    setSelectedSlideIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllSlides = () => setSelectedSlideIds(new Set(slideList.map(s => s.id)));
  const clearSlideSelection = () => setSelectedSlideIds(new Set());
  const exitSlideSelectMode = () => { setSlideSelectMode(false); setSelectedSlideIds(new Set()); };

  const bulkSlideDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("DELETE", "/api/notices/bulk", { ids }),
    onSuccess: async (res: Response) => {
      const data = await res.json().catch(() => ({ deleted: selectedSlideIds.size }));
      queryClient.invalidateQueries({ queryKey: ["/api/notices"] });
      toast({ title: `${data.deleted}개 슬라이드 삭제 완료` });
      exitSlideSelectMode();
      setCurrentSlide(0);
    },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const handleBulkSlideDelete = () => {
    if (selectedSlideIds.size === 0) return;
    if (!confirm(`선택한 ${selectedSlideIds.size}개 슬라이드를 삭제하시겠습니까?`)) return;
    bulkSlideDeleteMutation.mutate(Array.from(selectedSlideIds));
  };

  const slideList = slides || [];

  const parseContent = (content: string): ParsedContent => {
    try { return JSON.parse(content); } catch { return { text: content }; }
  };

  // Pre-fetch ALL signed URLs + preload images into browser cache
  const urlMap = usePreloadedSlideUrls(slideList, parseContent);

  useEffect(() => {
    if (!isPlaying || slideList.length === 0) return;
    const interval = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % slideList.length);
    }, 10000);
    return () => clearInterval(interval);
  }, [isPlaying, slideList.length]);

  const handleBulkFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 30) {
      toast({ variant: "destructive", title: "최대 30개까지 선택 가능합니다." });
      setBulkFiles(files.slice(0, 30));
    } else {
      setBulkFiles(files);
    }
  };

  const handleBulkUpload = async () => {
    if (bulkFiles.length === 0) return;
    
    setIsBulkUploading(true);
    setBulkUploadProgress(0);
    
    let successCount = 0;
    
    for (let i = 0; i < bulkFiles.length; i++) {
      const file = bulkFiles[i];
      
      try {
        // Step 1: Request presigned URL
        const urlRes = await fetch('/api/uploads/request-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            contentType: file.type,
          }),
        });
        const { uploadURL, objectPath } = await urlRes.json();
        
        // Step 2: Upload to presigned URL
        await fetch(uploadURL, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });
        
        const fileName = file.name.replace(/\.[^/.]+$/, "");
        const contentData = JSON.stringify({
          text: "",
          imageUrl: objectPath,
        });
        
        await new Promise<void>((resolve) => {
          createSlide({ title: fileName, content: contentData, category: "digital_board" }, {
            onSuccess: () => {
              successCount++;
              resolve();
            },
            onError: () => resolve()
          });
        });
      } catch (err) {
        console.error('Upload failed for:', file.name);
      }
      
      setBulkUploadProgress(Math.round(((i + 1) / bulkFiles.length) * 100));
    }
    
    setIsBulkUploading(false);
    setBulkFiles([]);
    setBulkUploadProgress(0);
    if (bulkInputRef.current) bulkInputRef.current.value = "";
    toast({ title: `${successCount}개 슬라이드 등록 완료` });
  };

  const handleDelete = (id: number) => {
    if (confirm("이 슬라이드를 삭제하시겠습니까?")) {
      deleteSlide(id);
      if (currentSlide >= slideList.length - 1) {
        setCurrentSlide(Math.max(0, slideList.length - 2));
      }
    }
  };

  const goToPrev = () => {
    setCurrentSlide(prev => (prev - 1 + slideList.length) % slideList.length);
  };

  const goToNext = () => {
    setCurrentSlide(prev => (prev + 1) % slideList.length);
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      // 브라우저 네이티브 전체화면 요청
      try {
        const el = slideshowRef.current;
        if (el?.requestFullscreen) await el.requestFullscreen();
        else setIsFullscreen(true); // fallback
      } catch {
        setIsFullscreen(true);
      }
    } else {
      await document.exitFullscreen().catch(() => setIsFullscreen(false));
    }
  };

  // 네이티브 fullscreenchange 이벤트로 상태 동기화
  useEffect(() => {
    const handleFSChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFSChange);
    document.addEventListener("webkitfullscreenchange", handleFSChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFSChange);
      document.removeEventListener("webkitfullscreenchange", handleFSChange);
    };
  }, []);

  // ESC 키 처리 (portal fallback용)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 md:space-y-8">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="bg-indigo-100 p-2 sm:p-2.5 md:p-3 rounded-lg sm:rounded-xl text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
          <MonitorPlay className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" />
        </div>
        <div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground">전자게시판</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">슬라이드 공지사항</p>
        </div>
      </div>

      {/* 전체화면 포털 — 네이티브 fullscreen이 안 되는 환경(iframe 등) 폴백 */}
      {isFullscreen && slideList.length > 0 && createPortal(
        <div className="fixed inset-0 bg-black z-[99999] flex items-center justify-center">
          <SlideViewer slideList={slideList} currentSlide={currentSlide} parseContent={parseContent} urlMap={urlMap} />
          <SlideControls
            slideList={slideList}
            currentSlide={currentSlide}
            isPlaying={isPlaying}
            isFullscreen={true}
            onPrev={goToPrev}
            onNext={goToNext}
            onTogglePlay={() => setIsPlaying(p => !p)}
            onSelectSlide={setCurrentSlide}
            onToggleFullscreen={toggleFullscreen}
          />
        </div>,
        document.body
      )}

      {/* 슬라이드 뷰어 — requestFullscreen() 대상 엘리먼트 */}
      <div 
        ref={slideshowRef}
        className={`relative bg-black overflow-hidden ${isFullscreen ? "w-full h-full" : "aspect-video rounded-2xl"}`}
      >
        {slideList.length > 0 ? (
          <>
            <SlideViewer slideList={slideList} currentSlide={currentSlide} parseContent={parseContent} urlMap={urlMap} />
            <SlideControls
              slideList={slideList}
              currentSlide={currentSlide}
              isPlaying={isPlaying}
              isFullscreen={isFullscreen}
              onPrev={goToPrev}
              onNext={goToNext}
              onTogglePlay={() => setIsPlaying(p => !p)}
              onSelectSlide={setCurrentSlide}
              onToggleFullscreen={toggleFullscreen}
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white/50">
            <div className="text-center">
              <MonitorPlay className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>등록된 슬라이드가 없습니다.</p>
            </div>
          </div>
        )}
      </div>

      {canEditDigitalBoard && (
        <Card className="border-indigo-200 dark:border-indigo-900/30">
          <CardHeader className="bg-indigo-50/50 dark:bg-indigo-900/10 border-b p-3 sm:p-4 md:p-6">
            <CardTitle className="text-sm sm:text-base md:text-lg flex items-center gap-2">
              <Images className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
              대량 업로드 (최대 30개)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4">
            <input
              type="file"
              accept="image/*"
              multiple
              ref={bulkInputRef}
              onChange={handleBulkFileSelect}
              className="hidden"
              data-testid="input-bulk-images"
            />
            <div 
              onClick={() => !isBulkUploading && bulkInputRef.current?.click()}
              className={`w-full border-2 border-dashed rounded-lg p-4 sm:p-6 md:p-8 flex flex-col items-center justify-center gap-2 sm:gap-3 transition-colors ${isBulkUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10'}`}
            >
              <Images className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-indigo-500" />
              <div className="text-center">
                <p className="font-medium text-sm sm:text-base">클릭하여 이미지 선택</p>
                <p className="text-xs sm:text-sm text-muted-foreground">최대 30개까지 업로드 가능</p>
              </div>
            </div>
          
          {bulkFiles.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{bulkFiles.length}개 이미지 선택됨</p>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => { setBulkFiles([]); if (bulkInputRef.current) bulkInputRef.current.value = ""; }}
                  disabled={isBulkUploading}
                >
                  <X className="w-4 h-4 mr-1" /> 취소
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {bulkFiles.map((file, idx) => (
                  <div key={idx} className="text-xs bg-muted px-2 py-1 rounded">{file.name}</div>
                ))}
              </div>
              {isBulkUploading && (
                <div className="space-y-2">
                  <Progress value={bulkUploadProgress} className="h-2" />
                  <p className="text-sm text-center text-muted-foreground">업로드 중... {bulkUploadProgress}%</p>
                </div>
              )}
              <Button 
                onClick={handleBulkUpload} 
                disabled={isBulkUploading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                data-testid="button-bulk-upload"
              >
                <Upload className="w-4 h-4" /> {bulkFiles.length}개 슬라이드 일괄 등록
              </Button>
            </div>
          )}
          </CardContent>
        </Card>
      )}

      <Card className="border-indigo-200 dark:border-indigo-900/30 overflow-hidden">
        <CardHeader className="bg-indigo-50/50 dark:bg-indigo-900/10 border-b p-3 sm:p-4">
          <div className="flex flex-col gap-2">
            <CardTitle className="text-sm sm:text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <MonitorPlay className="w-4 h-4 text-indigo-600" />
                등록된 슬라이드
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-normal text-muted-foreground bg-indigo-100 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">
                  {slideList.length}개
                </span>
              </div>
            </CardTitle>
            {canEditDigitalBoard && slideList.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {!slideSelectMode ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => setSlideSelectMode(true)}
                    data-testid="button-slide-select-mode"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    선택 삭제
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={selectedSlideIds.size === slideList.length ? clearSlideSelection : selectAllSlides}
                      data-testid="button-slide-select-all"
                    >
                      <Square className="w-3.5 h-3.5" />
                      {selectedSlideIds.size === slideList.length ? "전체 해제" : "전체 선택"}
                    </Button>
                    {selectedSlideIds.size > 0 && (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 gap-1.5 text-xs"
                        onClick={handleBulkSlideDelete}
                        disabled={bulkSlideDeleteMutation.isPending}
                        data-testid="button-slide-bulk-delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {bulkSlideDeleteMutation.isPending ? "삭제 중..." : `${selectedSlideIds.size}개 삭제`}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs text-muted-foreground"
                      onClick={exitSlideSelectMode}
                      data-testid="button-slide-exit-select"
                    >
                      <X className="w-3.5 h-3.5" />
                      취소
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {selectedSlideIds.size > 0 ? `${selectedSlideIds.size}개 선택됨` : "슬라이드를 선택하세요"}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          {slideList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MonitorPlay className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">등록된 슬라이드가 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
              {slideList.map((slide, idx) => {
                const parsed = parseContent(slide.content);
                const isChecked = selectedSlideIds.has(slide.id);
                return (
                  <motion.div
                    key={slide.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.02 }}
                    className={`relative group rounded-lg overflow-hidden border-2 transition-all cursor-pointer shadow-sm hover:shadow-md ${
                      slideSelectMode
                        ? isChecked
                          ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                          : 'border-border/50 hover:border-indigo-400'
                        : idx === currentSlide
                          ? 'border-indigo-500 ring-2 ring-indigo-500/30 shadow-indigo-200 dark:shadow-indigo-900/30'
                          : 'border-border/50 hover:border-indigo-400'
                    }`}
                    onClick={() => {
                      if (slideSelectMode) { toggleSlideSelect(slide.id); return; }
                      setCurrentSlide(idx);
                    }}
                    data-testid={`slide-thumbnail-${slide.id}`}
                  >
                    <div className="aspect-video bg-muted relative">
                      {parsed.imageUrl ? (
                        <PreloadedImage src={urlMap[parsed.imageUrl]} alt={slide.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-2">
                          <p className="text-xs font-medium text-center line-clamp-2">{slide.title}</p>
                        </div>
                      )}
                      {!slideSelectMode && idx === currentSlide && (
                        <div className="absolute inset-0 bg-indigo-500/10 flex items-center justify-center">
                          <div className="bg-indigo-500 text-white text-xs px-2 py-0.5 rounded-full font-medium shadow-sm">
                            재생중
                          </div>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-xs text-white font-medium truncate">{slide.title}</p>
                      </div>
                    </div>
                    <div className="absolute top-0.5 left-0.5 bg-black/50 text-white text-[10px] px-1 py-0.5 rounded font-mono">
                      {idx + 1}
                    </div>
                    {slideSelectMode ? (
                      <div className="absolute top-0.5 right-0.5 p-0.5 bg-white/80 dark:bg-black/60 rounded">
                        <Checkbox
                          checked={isChecked}
                          className="w-4 h-4"
                          data-testid={`chk-slide-${slide.id}`}
                        />
                      </div>
                    ) : canEditDigitalBoard && (
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-0.5 right-0.5 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        onClick={(e) => { e.stopPropagation(); handleDelete(slide.id); }}
                        data-testid={`button-delete-slide-${slide.id}`}
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </Button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
