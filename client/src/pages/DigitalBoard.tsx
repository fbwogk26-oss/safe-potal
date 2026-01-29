import { useNotices, useCreateNotice, useDeleteNotice } from "@/hooks/use-notices";
import { useLockStatus } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonitorPlay, Trash2, Upload, X, ChevronLeft, ChevronRight, Play, Pause, Maximize2, Images } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

export default function DigitalBoard() {
  const { data: slides, isLoading } = useNotices("digital_board");
  const { mutate: createSlide, isPending: isCreating } = useCreateNotice();
  const { mutate: deleteSlide } = useDeleteNotice();
  const { data: lockData } = useLockStatus();
  const isLocked = lockData?.isLocked;
  const { toast } = useToast();

  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkUploadProgress, setBulkUploadProgress] = useState(0);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const slideshowRef = useRef<HTMLDivElement>(null);

  const slideList = slides || [];

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
      const formData = new FormData();
      formData.append('image', file);
      
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        
        if (data.imageUrl) {
          const fileName = file.name.replace(/\.[^/.]+$/, "");
          const contentData = JSON.stringify({
            text: "",
            imageUrl: data.imageUrl,
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
        }
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

  const parseContent = (content: string) => {
    try {
      return JSON.parse(content);
    } catch {
      return { text: content };
    }
  };

  const goToPrev = () => {
    setCurrentSlide(prev => (prev - 1 + slideList.length) % slideList.length);
  };

  const goToNext = () => {
    setCurrentSlide(prev => (prev + 1) % slideList.length);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      slideshowRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <div className="bg-indigo-100 p-3 rounded-xl text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
          <MonitorPlay className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground">전자게시판</h2>
          <p className="text-muted-foreground mt-1">슬라이드 형태로 공지사항을 게시합니다.</p>
        </div>
      </div>

      <div 
        ref={slideshowRef}
        className={`relative bg-black rounded-2xl overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'aspect-video'}`}
      >
        {slideList.length > 0 ? (
          <>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.5 }}
                className="absolute inset-0 flex items-center justify-center"
              >
                {(() => {
                  const slide = slideList[currentSlide];
                  const parsed = parseContent(slide?.content || "{}");
                  return (
                    <div className="relative w-full h-full flex items-center justify-center">
                      {parsed.imageUrl ? (
                        <img 
                          src={parsed.imageUrl} 
                          alt={slide?.title} 
                          className="max-w-full max-h-full object-contain"
                        />
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
                  );
                })()}
              </motion.div>
            </AnimatePresence>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-4 py-2">
              <Button variant="ghost" size="icon" onClick={goToPrev} className="text-white hover:bg-white/20 h-8 w-8">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsPlaying(!isPlaying)} 
                className="text-white hover:bg-white/20 h-8 w-8"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              <div className="flex gap-1 px-2">
                {slideList.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentSlide(idx)}
                    className={`w-2 h-2 rounded-full transition-all ${idx === currentSlide ? 'bg-white w-4' : 'bg-white/50'}`}
                  />
                ))}
              </div>
              <Button variant="ghost" size="icon" onClick={goToNext} className="text-white hover:bg-white/20 h-8 w-8">
                <ChevronRight className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="text-white hover:bg-white/20 h-8 w-8">
                <Maximize2 className="w-4 h-4" />
              </Button>
            </div>

            <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-sm text-white px-3 py-1 rounded-full text-sm">
              {currentSlide + 1} / {slideList.length}
            </div>
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

      <Card className="border-indigo-200 dark:border-indigo-900/30">
        <CardHeader className="bg-indigo-50/50 dark:bg-indigo-900/10 border-b">
          <CardTitle className="text-lg flex items-center gap-2">
            <Images className="w-5 h-5 text-indigo-600" />
            대량 업로드 (최대 30개)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
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
            onClick={() => !isLocked && !isBulkUploading && bulkInputRef.current?.click()}
            className={`w-full border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-3 transition-colors ${isLocked || isBulkUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10'}`}
          >
            <Images className="w-12 h-12 text-indigo-500" />
            <div className="text-center">
              <p className="font-medium">클릭하여 이미지 선택</p>
              <p className="text-sm text-muted-foreground">한 번에 최대 30개까지 업로드 가능</p>
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
                disabled={isLocked || isBulkUploading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                data-testid="button-bulk-upload"
              >
                <Upload className="w-4 h-4" /> {bulkFiles.length}개 슬라이드 일괄 등록
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-lg">등록된 슬라이드 ({slideList.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {slideList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              등록된 슬라이드가 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {slideList.map((slide, idx) => {
                const parsed = parseContent(slide.content);
                return (
                  <motion.div
                    key={slide.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`relative group rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${idx === currentSlide ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-border hover:border-indigo-300'}`}
                    onClick={() => setCurrentSlide(idx)}
                  >
                    <div className="aspect-video bg-muted">
                      {parsed.imageUrl ? (
                        <img src={parsed.imageUrl} alt={slide.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-2">
                          <p className="text-xs font-medium text-center line-clamp-3">{slide.title}</p>
                        </div>
                      )}
                    </div>
                    <div className="p-2 bg-background">
                      <p className="text-sm font-medium truncate">{slide.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {slide.createdAt && format(new Date(slide.createdAt), "yyyy-MM-dd")}
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); handleDelete(slide.id); }}
                      disabled={isLocked}
                      data-testid={`button-delete-slide-${slide.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                    {idx === currentSlide && (
                      <div className="absolute top-1 left-1 bg-indigo-500 text-white text-xs px-2 py-0.5 rounded">
                        현재
                      </div>
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
