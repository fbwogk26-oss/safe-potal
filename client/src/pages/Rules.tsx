import { useNotices, useCreateNotice, useDeleteNotice } from "@/hooks/use-notices";
import { useLockStatus } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, Plus, Trash2, AlertCircle, Search, ImagePlus, X, ChevronRight, Calendar } from "lucide-react";
import { useState, useMemo, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Rules() {
  const { data: rules, isLoading } = useNotices("rule");
  const { mutate: createRule, isPending: isCreating } = useCreateNotice();
  const { mutate: deleteRule } = useDeleteNotice();
  const { data: lockData } = useLockStatus();
  const isLocked = lockData?.isLocked;
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedRule, setSelectedRule] = useState<{
    id: number;
    category: string;
    title: string;
    content: string;
    imageUrl: string | null;
    createdAt: Date | null;
  } | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredRules = useMemo(() => {
    if (!rules) return [];
    if (!searchQuery.trim()) return rules;
    const query = searchQuery.toLowerCase();
    return rules.filter(rule => 
      rule.title.toLowerCase().includes(query) || 
      rule.content.toLowerCase().includes(query)
    );
  }, [rules, searchQuery]);

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
    createRule({ title, content, category: "rule", imageUrl: imageUrl || undefined }, {
      onSuccess: () => {
        setTitle("");
        setContent("");
        setImageUrl(null);
        setShowAddForm(false);
        toast({ title: "수칙 추가 완료", description: "새로운 안전 수칙이 게시되었습니다." });
      }
    });
  };

  const handleDelete = (id: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (confirm("이 수칙을 삭제하시겠습니까?")) {
      deleteRule(id);
      setSelectedRule(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 md:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-2.5 sm:p-3 md:p-4 rounded-xl sm:rounded-2xl text-white shadow-lg shadow-emerald-500/30">
            <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground">안전 수칙</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">필수 안전 가이드라인</p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-48 md:w-64">
            <Input 
              placeholder="검색..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pr-8 bg-background/50 backdrop-blur-sm h-9 text-sm"
              data-testid="input-search-rules"
            />
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          </div>
          {!isLocked && (
            <Button 
              onClick={() => setShowAddForm(true)} 
              size="sm"
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white gap-1.5 shadow-lg h-9 text-xs sm:text-sm"
              data-testid="button-open-add-rule"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">새 수칙</span><span className="sm:hidden">추가</span>
            </Button>
          )}
        </div>
      </div>

      {isLocked && (
        <div className="flex items-center gap-2 text-xs sm:text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 p-2.5 sm:p-3 rounded-lg sm:rounded-xl border border-amber-200 dark:border-amber-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> 시스템 잠김 - 편집 비활성화
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-5">
        {isLoading ? (
          [1,2,3,4,5,6].map(i => (
            <div key={i} className="h-64 bg-gradient-to-br from-muted/30 to-muted/10 rounded-2xl animate-pulse" />
          ))
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredRules.map((rule, idx) => (
              <motion.div
                key={rule.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => setSelectedRule(rule)}
                className="group relative bg-card rounded-2xl overflow-hidden border border-border/50 shadow-sm hover:shadow-xl hover:border-emerald-300 dark:hover:border-emerald-700 transition-all duration-300 cursor-pointer"
                data-testid={`card-rule-${rule.id}`}
              >
                {rule.imageUrl ? (
                  <div className="h-40 overflow-hidden">
                    <img 
                      src={rule.imageUrl} 
                      alt={rule.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  </div>
                ) : (
                  <div className="h-40 bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-cyan-500/20 flex items-center justify-center">
                    <ShieldCheck className="w-16 h-16 text-emerald-500/30" />
                  </div>
                )}
                
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-lg line-clamp-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      {rule.title}
                    </h3>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-emerald-500 group-hover:translate-x-1 transition-all flex-shrink-0 mt-1" />
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{rule.content}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                    <Calendar className="w-3 h-3" />
                    {rule.createdAt && format(new Date(rule.createdAt), "yyyy-MM-dd")}
                  </div>
                </div>

                {!isLocked && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute top-2 right-2 bg-black/30 backdrop-blur-sm text-white hover:bg-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all h-8 w-8"
                    onClick={(e) => handleDelete(rule.id, e)}
                    data-testid={`button-delete-rule-${rule.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {!isLoading && filteredRules.length === 0 && (
        <div className="text-center py-16 text-muted-foreground bg-gradient-to-br from-muted/20 to-transparent rounded-2xl border border-dashed">
          <ShieldCheck className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-lg font-medium">
            {searchQuery ? `"${searchQuery}"에 대한 검색 결과가 없습니다.` : "아직 등록된 수칙이 없습니다."}
          </p>
          {!searchQuery && !isLocked && (
            <Button onClick={() => setShowAddForm(true)} variant="outline" className="mt-4 gap-2">
              <Plus className="w-4 h-4" /> 첫 번째 수칙 추가하기
            </Button>
          )}
        </div>
      )}

      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              새 안전 수칙 등록
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <Input 
              placeholder="수칙 제목 (예: 필수 보호구 착용)" 
              value={title} 
              onChange={e => setTitle(e.target.value)}
              className="font-medium"
              data-testid="input-rule-title"
            />
            <Textarea 
              placeholder="안전 수칙에 대한 상세 설명을 입력하세요..." 
              value={content} 
              onChange={e => setContent(e.target.value)}
              className="min-h-[120px]"
              data-testid="input-rule-content"
            />
            
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleImageUpload}
              className="hidden"
              data-testid="input-rule-image"
            />
            
            {imageUrl ? (
              <div className="relative inline-block">
                <img src={imageUrl} alt="미리보기" className="max-h-40 rounded-lg border" />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6"
                  onClick={() => setImageUrl(null)}
                  data-testid="button-remove-rule-image"
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
                data-testid="button-add-rule-image"
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
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white gap-2"
                data-testid="button-add-rule"
              >
                <Plus className="w-4 h-4" /> 수칙 추가
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedRule} onOpenChange={() => setSelectedRule(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedRule && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl pr-8">{selectedRule.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                {selectedRule.imageUrl && (
                  <img 
                    src={selectedRule.imageUrl} 
                    alt={selectedRule.title}
                    className="w-full max-h-80 object-contain rounded-xl border bg-muted/20"
                  />
                )}
                <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap">{selectedRule.content}</p>
                <div className="flex items-center justify-between pt-4 border-t text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {selectedRule.createdAt && format(new Date(selectedRule.createdAt), "yyyy년 MM월 dd일")}
                  </span>
                  {!isLocked && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(selectedRule.id)}
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
