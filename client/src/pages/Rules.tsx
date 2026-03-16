import { useNotices, useCreateNotice, useDeleteNotice } from "@/hooks/use-notices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Plus, Trash2, Search, ImagePlus, X, Eye, FileText, Calendar, Image } from "lucide-react";
import { useState, useMemo, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";

export default function Rules() {
  const { canRegisterRules, canDownloadRulesFiles } = usePermissions();
  const { user } = useAuth();
  const isOwner = (createdBy?: string | null) => !createdBy || user?.role === "admin" || user?.username === createdBy;
  const { data: rules, isLoading } = useNotices("rule");
  const { mutate: createRule, isPending: isCreating } = useCreateNotice();
  const { mutate: deleteRule } = useDeleteNotice();
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
    createdBy?: string | null;
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
    <div className="max-w-5xl mx-auto space-y-4">
      <Card className="border-emerald-200/50 dark:border-emerald-900/30 overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-b p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-2 rounded-lg text-white">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <span className="text-lg font-bold">안전 수칙</span>
                <p className="text-xs font-normal text-muted-foreground">필수 안전 가이드라인</p>
              </div>
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-48">
                <Input 
                  placeholder="검색..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pr-8 h-9 text-sm bg-white/80 dark:bg-background/80"
                  data-testid="input-search-rules"
                />
                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
              {canRegisterRules && (
                <Button 
                  onClick={() => setShowAddForm(true)} 
                  size="sm"
                  className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white gap-1.5 h-9"
                  data-testid="button-open-add-rule"
                >
                  <Plus className="w-4 h-4" /> 
                  새 수칙
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
            ) : filteredRules.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {searchQuery ? `"${searchQuery}"에 대한 검색 결과가 없습니다.` : "아직 등록된 수칙이 없습니다."}
                </p>
                {!searchQuery && canRegisterRules && (
                  <Button onClick={() => setShowAddForm(true)} variant="outline" size="sm" className="mt-3 gap-1.5">
                    <Plus className="w-4 h-4" /> 첫 번째 수칙 추가
                  </Button>
                )}
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {filteredRules.map((rule, idx) => (
                  <motion.div
                    key={rule.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: idx * 0.03 }}
                    onClick={() => setSelectedRule(rule)}
                    className="group flex items-center gap-4 px-4 py-3 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 cursor-pointer transition-colors"
                    data-testid={`row-rule-${rule.id}`}
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                      {rule.imageUrl ? (
                        <Image className="w-4 h-4" />
                      ) : (
                        <FileText className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-sm truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {rule.title}
                        </h3>
                        {rule.imageUrl && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">첨부</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{rule.content}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {rule.createdAt && format(new Date(rule.createdAt), "MM.dd")}
                      </span>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-emerald-600"
                        onClick={(e) => { e.stopPropagation(); setSelectedRule(rule); }}
                        data-testid={`button-view-rule-${rule.id}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {canRegisterRules && isOwner(rule.createdBy) && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
                          onClick={(e) => handleDelete(rule.id, e)}
                          data-testid={`button-delete-rule-${rule.id}`}
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
          {filteredRules.length > 0 && (
            <div className="px-4 py-2 bg-muted/20 border-t text-xs text-muted-foreground flex items-center justify-between">
              <span>총 {filteredRules.length}개</span>
              <span>클릭하여 상세보기</span>
            </div>
          )}
        </CardContent>
      </Card>

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
                  {canRegisterRules && isOwner(selectedRule.createdBy) && (
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
