import { useNotices, useCreateNotice, useDeleteNotice } from "@/hooks/use-notices";
import { useLockStatus } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, Plus, Trash2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

export default function Rules() {
  const { data: rules, isLoading } = useNotices("rule");
  const { mutate: createRule, isPending: isCreating } = useCreateNotice();
  const { mutate: deleteRule } = useDeleteNotice();
  const { data: lockData } = useLockStatus();
  const isLocked = lockData?.isLocked;
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const handleAdd = () => {
    if (!title || !content) return;
    createRule({ title, content, category: "rule" }, {
      onSuccess: () => {
        setTitle("");
        setContent("");
        toast({ title: "Rule Added", description: "New safety rule has been posted." });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this rule?")) {
      deleteRule(id);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-xl text-primary">
              <ShieldCheck className="w-8 h-8" />
            </div>
            Safety Rules
          </h2>
          <p className="text-muted-foreground mt-2">Mandatory safety protocols and guidelines.</p>
        </div>
      </div>

      {/* Input Form */}
      <Card className="glass-card overflow-hidden">
        <div className="p-1 bg-primary/5 border-b border-primary/10">
           <div className="px-4 py-1 text-xs font-semibold text-primary uppercase tracking-wider">New Rule Entry</div>
        </div>
        <CardContent className="p-6 space-y-4">
          <Input 
            placeholder="Rule Title (e.g., Mandatory PPE)" 
            value={title} 
            onChange={e => setTitle(e.target.value)}
            disabled={isLocked}
            className="font-medium"
          />
          <Textarea 
            placeholder="Detailed description of the safety rule..." 
            value={content} 
            onChange={e => setContent(e.target.value)}
            disabled={isLocked}
            className="min-h-[100px]"
          />
          <div className="flex justify-end">
            <Button onClick={handleAdd} disabled={isLocked || isCreating || !title} className="gap-2">
              <Plus className="w-4 h-4" /> Add Rule
            </Button>
          </div>
          {isLocked && (
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 p-2 rounded-lg border border-red-100">
              <AlertCircle className="w-4 h-4" /> System is locked. Editing is disabled.
            </div>
          )}
        </CardContent>
      </Card>

      {/* List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => <div key={i} className="h-32 bg-muted/20 rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <AnimatePresence>
            {rules?.map((rule) => (
              <motion.div
                key={rule.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="group relative bg-card rounded-2xl p-6 border border-border/50 shadow-sm hover:shadow-md transition-all duration-300"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold font-display text-primary">{rule.title}</h3>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {rule.createdAt && format(new Date(rule.createdAt), "yyyy-MM-dd")}
                      </span>
                    </div>
                    <p className="text-foreground/80 leading-relaxed">{rule.content}</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-muted-foreground hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleDelete(rule.id)}
                    disabled={isLocked}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        {rules?.length === 0 && (
          <div className="text-center py-12 text-muted-foreground bg-muted/10 rounded-2xl border border-dashed">
            No rules have been added yet.
          </div>
        )}
      </div>
    </div>
  );
}
