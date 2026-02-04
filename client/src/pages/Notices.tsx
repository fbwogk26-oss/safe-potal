import { useNotices, useCreateNotice, useDeleteNotice } from "@/hooks/use-notices";
import { useLockStatus } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Bell, Plus, Trash2, Megaphone, ImagePlus, X, Settings, Pin, PinOff } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

export default function Notices() {
  const { data: notices, isLoading } = useNotices("notice");
  const { mutate: createNotice, isPending: isCreating } = useCreateNotice();
  const { mutate: deleteNotice } = useDeleteNotice();
  const { data: lockData } = useLockStatus();
  const isLocked = lockData?.isLocked;
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pinnedNoticeId, setPinnedNoticeId] = useState<number | null>(null);
  
  useEffect(() => {
    const stored = localStorage.getItem('pinnedNoticeId');
    if (stored) setPinnedNoticeId(Number(stored));
  }, []);
  
  const handleSetPinned = (id: number) => {
    if (pinnedNoticeId === id) {
      localStorage.removeItem('pinnedNoticeId');
      setPinnedNoticeId(null);
      toast({ title: "상단공지 해제", description: "최신 공지가 대시보드에 표시됩니다." });
    } else {
      localStorage.setItem('pinnedNoticeId', String(id));
      setPinnedNoticeId(id);
      toast({ title: "상단공지 설정", description: "이 공지가 대시보드에 표시됩니다." });
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    
    try {
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
      
      await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      
      setImageUrl(objectPath);
      toast({ title: "이미지 업로드 완료" });
    } catch (err) {
      toast({ variant: "destructive", title: "업로드 실패" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleAdd = () => {
    if (!title || !content) return;
    createNotice({ title, content, category: "notice", imageUrl: imageUrl || undefined }, {
      onSuccess: () => {
        setTitle("");
        setContent("");
        setImageUrl(null);
        toast({ title: "공지 등록 완료", description: "상단 티커에 표시됩니다." });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("이 공지를 삭제하시겠습니까?")) deleteNotice(id);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 md:space-y-8">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="bg-orange-100 p-2 sm:p-2.5 rounded-lg sm:rounded-xl text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
          <Megaphone className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" />
        </div>
        <div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground">
            공지 및 알림
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">시스템 공지사항</p>
        </div>
      </div>

      <Card className="glass-card overflow-hidden border-orange-200 dark:border-orange-900/30">
        <CardContent className="p-6 space-y-4">
          <Input 
            placeholder="공지 제목" 
            value={title} 
            onChange={e => setTitle(e.target.value)}
            disabled={isLocked}
            data-testid="input-notice-title"
          />
          <Textarea 
            placeholder="메시지 내용..." 
            value={content} 
            onChange={e => setContent(e.target.value)}
            disabled={isLocked}
            data-testid="input-notice-content"
          />
          
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleImageUpload}
            className="hidden"
            data-testid="input-notice-image"
          />
          
          {imageUrl ? (
            <div className="relative inline-block">
              <img src={imageUrl} alt="미리보기" className="max-h-32 rounded-lg border" />
              <Button
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 h-6 w-6"
                onClick={() => setImageUrl(null)}
                data-testid="button-remove-image"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLocked || isUploading}
              className="gap-2"
              data-testid="button-add-image"
            >
              <ImagePlus className="w-4 h-4" />
              {isUploading ? "업로드 중..." : "이미지 추가"}
            </Button>
          )}
          
          <div className="flex justify-end">
            <Button onClick={handleAdd} disabled={isLocked || isCreating || !title} className="bg-orange-600 hover:bg-orange-700 text-white gap-2" data-testid="button-post-notice">
              <Plus className="w-4 h-4" /> 공지 게시
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <AnimatePresence>
          {notices?.map((notice) => (
            <motion.div
              key={notice.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="group flex gap-4 bg-card rounded-2xl p-6 border border-border/50 shadow-sm items-start"
              data-testid={`card-notice-${notice.id}`}
            >
              <div className="bg-muted w-12 h-12 rounded-full flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {pinnedNoticeId === notice.id && (
                      <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full">상단공지</span>
                    )}
                    <h3 className="font-bold text-lg">{notice.title}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {notice.createdAt && format(new Date(notice.createdAt), "yyyy-MM-dd HH:mm")}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-8 w-8"
                          data-testid={`button-settings-notice-${notice.id}`}
                        >
                          <Settings className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                          onClick={() => handleSetPinned(notice.id)}
                          data-testid={`menu-pin-notice-${notice.id}`}
                        >
                          {pinnedNoticeId === notice.id ? (
                            <>
                              <PinOff className="w-4 h-4 mr-2" />
                              상단공지 해제
                            </>
                          ) : (
                            <>
                              <Pin className="w-4 h-4 mr-2" />
                              상단공지 설정
                            </>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <p className="text-muted-foreground">{notice.content}</p>
                {notice.imageUrl && (
                  <img 
                    src={notice.imageUrl} 
                    alt="첨부 이미지" 
                    className="max-w-full max-h-64 rounded-lg border mt-2"
                  />
                )}
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="opacity-0 group-hover:opacity-100"
                onClick={() => handleDelete(notice.id)}
                disabled={isLocked}
                data-testid={`button-delete-notice-${notice.id}`}
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
