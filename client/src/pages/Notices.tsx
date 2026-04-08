import { useNotices, useCreateNotice, useDeleteNotice } from "@/hooks/use-notices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Bell, Plus, Trash2, Megaphone, ImagePlus, X, Pin, PinOff, Eye, Calendar, Image, MoreVertical, ImageOff } from "lucide-react";
import { useState, useRef, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";

function NoticeImage({ src, alt }: { src: string; alt: string }) {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  return (
    <div className="relative">
      {status === "loading" && (
        <div className="w-full h-40 bg-muted/40 animate-pulse rounded-xl border flex items-center justify-center">
          <Image className="w-8 h-8 text-muted-foreground/30" />
        </div>
      )}
      {status === "error" && (
        <div className="w-full h-28 bg-muted/30 rounded-xl border flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <ImageOff className="w-7 h-7 opacity-40" />
          <span className="text-xs">이미지를 불러올 수 없습니다</span>
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`w-full max-h-80 object-contain rounded-xl border bg-muted/20 transition-opacity ${
          status === "error" ? "hidden" :
          status === "loading" ? "opacity-0 h-0 overflow-hidden" : "opacity-100"
        }`}
        onLoad={() => setStatus("ok")}
        onError={() => setStatus("error")}
      />
    </div>
  );
}

export default function Notices() {
  const { canRegisterNotices } = usePermissions();
  const { user } = useAuth();
  const isOwner = (createdBy?: string | null) => !createdBy || user?.role === "admin" || user?.username === createdBy;
  const { data: notices, isLoading } = useNotices("notice");
  const { mutate: createNotice, isPending: isCreating } = useCreateNotice();
  const { mutate: deleteNotice } = useDeleteNotice();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<{
    id: number;
    title: string;
    content: string;
    imageUrl: string | null;
    createdAt: Date | null;
    createdBy?: string | null;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 상단 고정 ──────────────────────────────────────────
  const { data: pinnedData } = useQuery<{ pinnedNoticeId: number | null }>({
    queryKey: ["/api/settings/pinned-notice"],
  });
  const pinnedNoticeId = pinnedData?.pinnedNoticeId ?? null;

  const setPinnedMutation = useMutation({
    mutationFn: async (noticeId: number | null) => {
      return apiRequest("POST", "/api/settings/pinned-notice", { noticeId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/pinned-notice"] });
    },
  });

  const handleSetPinned = (id: number) => {
    if (pinnedNoticeId === id) {
      setPinnedMutation.mutate(null);
      toast({ title: "상단공지 해제", description: "최신 공지가 대시보드에 표시됩니다." });
    } else {
      setPinnedMutation.mutate(id);
      toast({ title: "상단공지 설정", description: "이 공지가 대시보드에 표시됩니다." });
    }
  };

  // ── 목록 필터/정렬 ──────────────────────────────────────
  const filteredNotices = useMemo(() => {
    if (!notices) return [];
    let filtered = notices;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = notices.filter(n =>
        n.title.toLowerCase().includes(query) ||
        n.content.toLowerCase().includes(query)
      );
    }
    return filtered
      .slice()
      .sort((a, b) => {
        if (a.id === pinnedNoticeId) return -1;
        if (b.id === pinnedNoticeId) return 1;
        return b.id - a.id;
      });
  }, [notices, searchQuery, pinnedNoticeId]);

  // ── 이미지 업로드 ──────────────────────────────────────
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const urlRes = await fetch('/api/uploads/request-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      const { uploadURL, objectPath } = await urlRes.json();
      await fetch(uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      await fetch('/api/uploads/make-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectPath }),
      });
      setImageUrl(objectPath);
      toast({ title: "이미지 업로드 완료" });
    } catch {
      toast({ variant: "destructive", title: "업로드 실패" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleAdd = () => {
    if (!title || !content) return;
    createNotice({ title, content, category: "notice", imageUrl: imageUrl || undefined }, {
      onSuccess: () => {
        setTitle(""); setContent(""); setImageUrl(null); setShowAddForm(false);
        toast({ title: "공지 등록 완료", description: "상단 티커에 표시됩니다." });
      }
    });
  };

  const handleDelete = (id: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (confirm("이 공지를 삭제하시겠습니까?")) {
      deleteNotice(id);
      setSelectedNotice(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <Card className="border-orange-200/50 dark:border-orange-900/30 overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border-b p-4">
          <div className="flex flex-col gap-3">
            {/* 헤더 상단 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-orange-500 to-amber-600 p-2 rounded-lg text-white">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-lg font-bold">공지 및 알림</span>
                  <p className="text-xs font-normal text-muted-foreground">시스템 공지사항</p>
                </div>
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-48">
                  <Input
                    placeholder="검색..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pr-8 h-9 text-sm bg-white/80 dark:bg-background/80"
                    data-testid="input-search-notices"
                  />
                  <Bell className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                </div>
                {canRegisterNotices && (
                  <Button
                    onClick={() => setShowAddForm(true)}
                    size="sm"
                    className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white gap-1.5 h-9"
                    data-testid="button-open-add-notice"
                  >
                    <Plus className="w-4 h-4" />
                    공지 등록
                  </Button>
                )}
              </div>
            </div>

          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="divide-y divide-border/50">
            {isLoading ? (
              [1,2,3,4,5].map(i => (
                <div key={i} className="h-16 bg-muted/20 animate-pulse" />
              ))
            ) : filteredNotices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {searchQuery ? `"${searchQuery}"에 대한 검색 결과가 없습니다.` : "아직 등록된 공지가 없습니다."}
                </p>
                {!searchQuery && canRegisterNotices && (
                  <Button onClick={() => setShowAddForm(true)} variant="outline" size="sm" className="mt-3 gap-1.5">
                    <Plus className="w-4 h-4" /> 첫 번째 공지 등록
                  </Button>
                )}
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {filteredNotices.map((notice, idx) => {
                  return (
                    <motion.div
                      key={notice.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: idx * 0.03 }}
                      onClick={() => setSelectedNotice(notice)}
                      className={`group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                        pinnedNoticeId === notice.id
                          ? 'bg-orange-50/70 dark:bg-orange-900/20 hover:bg-orange-100/70 dark:hover:bg-orange-900/30'
                          : 'hover:bg-orange-50/50 dark:hover:bg-orange-900/10'
                      }`}
                      data-testid={`row-notice-${notice.id}`}
                    >
                      {/* 아이콘 */}
                      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                        pinnedNoticeId === notice.id
                          ? 'bg-orange-200 dark:bg-orange-800/50 text-orange-600 dark:text-orange-400'
                          : 'bg-orange-100 dark:bg-orange-900/30 text-orange-500 dark:text-orange-400'
                      }`}>
                        {pinnedNoticeId === notice.id ? (
                          <Pin className="w-4 h-4" />
                        ) : notice.imageUrl ? (
                          <Image className="w-4 h-4" />
                        ) : (
                          <Bell className="w-4 h-4" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-sm truncate group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                            {notice.title}
                          </h3>
                          {pinnedNoticeId === notice.id && (
                            <Badge className="bg-orange-500 text-white text-[10px] px-1.5 py-0">고정</Badge>
                          )}
                          {notice.imageUrl && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">첨부</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{notice.content}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {notice.createdAt && format(new Date(notice.createdAt), "MM.dd HH:mm")}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={e => e.stopPropagation()}
                              data-testid={`button-menu-notice-${notice.id}`}
                            >
                              <MoreVertical className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={e => { e.stopPropagation(); setSelectedNotice(notice); }}>
                              <Eye className="w-4 h-4 mr-2" />
                              상세보기
                            </DropdownMenuItem>
                            {canRegisterNotices && (
                              <DropdownMenuItem
                                onClick={e => { e.stopPropagation(); handleSetPinned(notice.id); }}
                                data-testid={`menu-pin-notice-${notice.id}`}
                              >
                                {pinnedNoticeId === notice.id ? (
                                  <><PinOff className="w-4 h-4 mr-2" />상단공지 해제</>
                                ) : (
                                  <><Pin className="w-4 h-4 mr-2" />상단공지 설정</>
                                )}
                              </DropdownMenuItem>
                            )}
                            {canRegisterNotices && isOwner(notice.createdBy) && (
                              <DropdownMenuItem
                                onClick={e => handleDelete(notice.id, e)}
                                className="text-red-600"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                삭제
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
          {filteredNotices.length > 0 && (
            <div className="px-4 py-2 bg-muted/20 border-t text-xs text-muted-foreground flex items-center justify-between">
              <span>총 {filteredNotices.length}개</span>
              <span>클릭하여 상세보기</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 등록 다이얼로그 */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-orange-500" />
              새 공지 등록
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <Input
              placeholder="공지 제목"
              value={title}
              onChange={e => setTitle(e.target.value)}
              data-testid="input-notice-title"
            />
            <Textarea
              placeholder="메시지 내용..."
              value={content}
              onChange={e => setContent(e.target.value)}
              className="min-h-[100px]"
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
                disabled={isUploading}
                className="gap-2"
                data-testid="button-add-image"
              >
                <ImagePlus className="w-4 h-4" />
                {isUploading ? "업로드 중..." : "이미지 추가"}
              </Button>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddForm(false)}>취소</Button>
              <Button
                onClick={handleAdd}
                disabled={isCreating || !title || !content}
                className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white gap-2"
                data-testid="button-post-notice"
              >
                <Plus className="w-4 h-4" /> 공지 게시
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 상세보기 다이얼로그 */}
      <Dialog open={!!selectedNotice} onOpenChange={() => setSelectedNotice(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedNotice && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl pr-8 flex items-center gap-2">
                  {pinnedNoticeId === selectedNotice.id && (
                    <Badge className="bg-orange-500 text-white">고정</Badge>
                  )}
                  {selectedNotice.title}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                {selectedNotice.imageUrl && (
                  <NoticeImage src={selectedNotice.imageUrl} alt={selectedNotice.title} />
                )}
                <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap">{selectedNotice.content}</p>
                <div className="flex items-center justify-between pt-4 border-t text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {selectedNotice.createdAt && format(new Date(selectedNotice.createdAt), "yyyy년 MM월 dd일 HH:mm")}
                  </span>
                  {canRegisterNotices && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetPinned(selectedNotice.id)}
                      >
                        {pinnedNoticeId === selectedNotice.id ? (
                          <><PinOff className="w-4 h-4 mr-1" /> 고정 해제</>
                        ) : (
                          <><Pin className="w-4 h-4 mr-1" /> 상단 고정</>
                        )}
                      </Button>
                      {isOwner(selectedNotice.createdBy) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(selectedNotice.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-1" /> 삭제
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
