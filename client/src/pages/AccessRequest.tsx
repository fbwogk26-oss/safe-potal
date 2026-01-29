import { useNotices, useCreateNotice, useDeleteNotice } from "@/hooks/use-notices";
import { useLockStatus } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { DoorOpen, Plus, Trash2, FileText } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

export default function AccessRequest() {
  const { data: materials, isLoading } = useNotices("access");
  const { mutate: createMaterial, isPending: isCreating } = useCreateNotice();
  const { mutate: deleteMaterial } = useDeleteNotice();
  const { data: lockData } = useLockStatus();
  const isLocked = lockData?.isLocked;
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const handleAdd = () => {
    if (!title || !content) return;
    createMaterial({ title, content, category: "access" }, {
      onSuccess: () => {
        setTitle("");
        setContent("");
        toast({ title: "신청 완료", description: "출입신청이 등록되었습니다." });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("이 신청을 삭제하시겠습니까?")) deleteMaterial(id);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            <div className="bg-purple-100 p-2 rounded-xl text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
              <DoorOpen className="w-8 h-8" />
            </div>
            출입신청(효목)
          </h2>
          <p className="text-muted-foreground mt-2">효목 사업소 출입신청을 관리합니다.</p>
        </div>
      </div>

      <Card className="glass-card overflow-hidden border-purple-200 dark:border-purple-900/30">
        <CardContent className="p-6 space-y-4">
          <Input 
            placeholder="신청 제목" 
            value={title} 
            onChange={e => setTitle(e.target.value)}
            disabled={isLocked}
            data-testid="input-access-title"
          />
          <Textarea 
            placeholder="신청 내용, 방문 목적 등..." 
            value={content} 
            onChange={e => setContent(e.target.value)}
            disabled={isLocked}
            data-testid="input-access-content"
          />
          <div className="flex justify-end">
            <Button onClick={handleAdd} disabled={isLocked || isCreating || !title} className="bg-purple-600 hover:bg-purple-700 text-white gap-2" data-testid="button-submit-access">
              <Plus className="w-4 h-4" /> 신청 등록
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AnimatePresence>
          {materials?.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="group bg-card rounded-2xl p-6 border border-border/50 shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col justify-between h-full"
              data-testid={`card-access-${item.id}`}
            >
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div className="p-3 bg-purple-50 text-purple-600 rounded-lg dark:bg-purple-900/20">
                    <FileText className="w-6 h-6" />
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="opacity-0 group-hover:opacity-100"
                    onClick={() => handleDelete(item.id)}
                    disabled={isLocked}
                    data-testid={`button-delete-access-${item.id}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-1 line-clamp-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-4">{item.content}</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t text-xs text-muted-foreground flex justify-between items-center">
                <span>신청일: {item.createdAt && format(new Date(item.createdAt), "yyyy-MM-dd")}</span>
                <span className="bg-secondary px-2 py-1 rounded">상세 보기</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
