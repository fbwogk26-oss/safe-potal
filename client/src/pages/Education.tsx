import { useNotices, useCreateNotice, useDeleteNotice } from "@/hooks/use-notices";
import { useLockStatus } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GraduationCap, Plus, Trash2, ImagePlus, X, BookOpen, Calendar, Search, AlertCircle, ChevronRight } from "lucide-react";
import { useState, useRef, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Education() {
  const { data: materials, isLoading } = useNotices("edu");
  const { mutate: createMaterial, isPending: isCreating } = useCreateNotice();
  const { mutate: deleteMaterial } = useDeleteNotice();
  const { data: lockData } = useLockStatus();
  const isLocked = lockData?.isLocked;
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<{
    id: number;
    category: string;
    title: string;
    content: string;
    imageUrl: string | null;
    createdAt: Date | null;
  } | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredMaterials = useMemo(() => {
    if (!materials) return [];
    if (!searchQuery.trim()) return materials;
    const query = searchQuery.toLowerCase();
    return materials.filter(item => 
      item.title.toLowerCase().includes(query) || 
      item.content.toLowerCase().includes(query)
    );
  }, [materials, searchQuery]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    const formData = new FormData();
    formData.append('image', file);
    
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.imageUrl) {
        setImageUrl(data.imageUrl);
        toast({ title: "이미지 업로드 완료" });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "업로드 실패" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleAdd = () => {
    if (!title || !content) return;
    createMaterial({ title, content, category: "edu", imageUrl: imageUrl || undefined }, {
      onSuccess: () => {
        setTitle("");
        setContent("");
        setImageUrl(null);
        setShowAddForm(false);
        toast({ title: "자료 추가 완료", description: "교육 자료가 게시되었습니다." });
      }
    });
  };

  const handleDelete = (id: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (confirm("이 자료를 삭제하시겠습니까?")) {
      deleteMaterial(id);
      setSelectedItem(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-4 rounded-2xl text-white shadow-lg shadow-blue-500/30">
            <GraduationCap className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-3xl font-display font-bold text-foreground">안전 교육</h2>
            <p className="text-muted-foreground mt-1">훈련 자료 및 안전 문서 관리</p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Input 
              placeholder="자료 검색..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pr-9 bg-background/50 backdrop-blur-sm"
              data-testid="input-search-edu"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          </div>
          {!isLocked && (
            <Button 
              onClick={() => setShowAddForm(true)} 
              className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white gap-2 shadow-lg"
              data-testid="button-open-add-edu"
            >
              <Plus className="w-4 h-4" /> 새 자료
            </Button>
          )}
        </div>
      </div>

      {isLocked && (
        <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 p-3 rounded-xl border border-amber-200 dark:border-amber-800">
          <AlertCircle className="w-4 h-4" /> 시스템이 잠겨 있습니다. 편집이 비활성화되었습니다.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {isLoading ? (
          [1,2,3,4,5,6].map(i => (
            <div key={i} className="h-72 bg-gradient-to-br from-muted/30 to-muted/10 rounded-2xl animate-pulse" />
          ))
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredMaterials.map((item, idx) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => setSelectedItem(item)}
                className="group relative bg-card rounded-2xl overflow-hidden border border-border/50 shadow-sm hover:shadow-xl hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-300 cursor-pointer"
                data-testid={`card-edu-${item.id}`}
              >
                {item.imageUrl ? (
                  <div className="h-44 overflow-hidden">
                    <img 
                      src={item.imageUrl} 
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  </div>
                ) : (
                  <div className="h-44 bg-gradient-to-br from-blue-500/20 via-indigo-500/10 to-purple-500/20 flex items-center justify-center">
                    <BookOpen className="w-16 h-16 text-blue-500/30" />
                  </div>
                )}
                
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-lg line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {item.title}
                    </h3>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-blue-500 group-hover:translate-x-1 transition-all flex-shrink-0 mt-1" />
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{item.content}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                    <Calendar className="w-3 h-3" />
                    {item.createdAt && format(new Date(item.createdAt), "yyyy-MM-dd")}
                  </div>
                </div>

                {!isLocked && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute top-2 right-2 bg-black/30 backdrop-blur-sm text-white hover:bg-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all h-8 w-8"
                    onClick={(e) => handleDelete(item.id, e)}
                    data-testid={`button-delete-edu-${item.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {!isLoading && filteredMaterials.length === 0 && (
        <div className="text-center py-16 text-muted-foreground bg-gradient-to-br from-muted/20 to-transparent rounded-2xl border border-dashed">
          <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-lg font-medium">
            {searchQuery ? `"${searchQuery}"에 대한 검색 결과가 없습니다.` : "아직 등록된 교육 자료가 없습니다."}
          </p>
          {!searchQuery && !isLocked && (
            <Button onClick={() => setShowAddForm(true)} variant="outline" className="mt-4 gap-2">
              <Plus className="w-4 h-4" /> 첫 번째 자료 추가하기
            </Button>
          )}
        </div>
      )}

      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-blue-500" />
              새 교육 자료 등록
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <Input 
              placeholder="자료 제목" 
              value={title} 
              onChange={e => setTitle(e.target.value)}
              className="font-medium"
              data-testid="input-edu-title"
            />
            <Textarea 
              placeholder="내용 설명, 링크 또는 요약..." 
              value={content} 
              onChange={e => setContent(e.target.value)}
              className="min-h-[120px]"
              data-testid="input-edu-content"
            />
            
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleImageUpload}
              className="hidden"
              data-testid="input-edu-image"
            />
            
            {imageUrl ? (
              <div className="relative inline-block">
                <img src={imageUrl} alt="미리보기" className="max-h-40 rounded-lg border" />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6"
                  onClick={() => setImageUrl(null)}
                  data-testid="button-remove-edu-image"
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
                data-testid="button-add-edu-image"
              >
                <ImagePlus className="w-4 h-4" />
                {isUploading ? "업로드 중..." : "이미지 추가"}
              </Button>
            )}
            
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddForm(false)}>취소</Button>
              <Button 
                onClick={handleAdd} 
                disabled={isCreating || !title || !content} 
                className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white gap-2"
                data-testid="button-add-edu"
              >
                <Plus className="w-4 h-4" /> 자료 추가
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl pr-8">{selectedItem.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                {selectedItem.imageUrl && (
                  <img 
                    src={selectedItem.imageUrl} 
                    alt={selectedItem.title}
                    className="w-full max-h-80 object-contain rounded-xl border bg-muted/20"
                  />
                )}
                <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap">{selectedItem.content}</p>
                <div className="flex items-center justify-between pt-4 border-t text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {selectedItem.createdAt && format(new Date(selectedItem.createdAt), "yyyy년 MM월 dd일")}
                  </span>
                  {!isLocked && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(selectedItem.id)}
                    >
                      <Trash2 className="w-4 h-4 mr-1" /> 삭제
                    </Button>
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
