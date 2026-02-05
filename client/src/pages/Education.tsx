import { useNotices, useCreateNotice, useDeleteNotice } from "@/hooks/use-notices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Plus, Trash2, ImagePlus, X, BookOpen, Calendar, Search, Eye, FileText, Image } from "lucide-react";
import { useState, useRef, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePermissions } from "@/hooks/use-permissions";

export default function Education() {
  const { canRegisterEducation } = usePermissions();
  const { data: materials, isLoading } = useNotices("edu");
  const { mutate: createMaterial, isPending: isCreating } = useCreateNotice();
  const { mutate: deleteMaterial } = useDeleteNotice();
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
    <div className="max-w-5xl mx-auto space-y-4">
      <Card className="border-blue-200/50 dark:border-blue-900/30 overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-b p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 rounded-lg text-white">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <span className="text-lg font-bold">안전 교육</span>
                <p className="text-xs font-normal text-muted-foreground">안전 문서 관리</p>
              </div>
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-48">
                <Input 
                  placeholder="검색..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pr-8 h-9 text-sm bg-white/80 dark:bg-background/80"
                  data-testid="input-search-edu"
                />
                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
              {canRegisterEducation && (
                <Button 
                  onClick={() => setShowAddForm(true)} 
                  size="sm"
                  className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white gap-1.5 h-9"
                  data-testid="button-open-add-edu"
                >
                  <Plus className="w-4 h-4" /> 
                  <span className="hidden sm:inline">새 자료</span>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border/50">
            {isLoading ? (
              [1,2,3,4,5].map(i => (
                <div key={i} className="h-16 bg-muted/20 animate-pulse" />
              ))
            ) : filteredMaterials.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {searchQuery ? `"${searchQuery}"에 대한 검색 결과가 없습니다.` : "아직 등록된 교육 자료가 없습니다."}
                </p>
                {!searchQuery && canRegisterEducation && (
                  <Button onClick={() => setShowAddForm(true)} variant="outline" size="sm" className="mt-3 gap-1.5">
                    <Plus className="w-4 h-4" /> 첫 번째 자료 추가
                  </Button>
                )}
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {filteredMaterials.map((item, idx) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: idx * 0.03 }}
                    onClick={() => setSelectedItem(item)}
                    className="group flex items-center gap-4 px-4 py-3 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors"
                    data-testid={`row-edu-${item.id}`}
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                      {item.imageUrl ? (
                        <Image className="w-4 h-4" />
                      ) : (
                        <BookOpen className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-sm truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {item.title}
                        </h3>
                        {item.imageUrl && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">첨부</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{item.content}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {item.createdAt && format(new Date(item.createdAt), "MM.dd")}
                      </span>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-blue-600"
                        onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }}
                        data-testid={`button-view-edu-${item.id}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {canRegisterEducation && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
                          onClick={(e) => handleDelete(item.id, e)}
                          data-testid={`button-delete-edu-${item.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
          {filteredMaterials.length > 0 && (
            <div className="px-4 py-2 bg-muted/20 border-t text-xs text-muted-foreground flex items-center justify-between">
              <span>총 {filteredMaterials.length}개</span>
              <span>클릭하여 상세보기</span>
            </div>
          )}
        </CardContent>
      </Card>

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
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => handleDelete(selectedItem.id)}
                  >
                    <Trash2 className="w-4 h-4 mr-1" /> 삭제
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
