import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { HardHat, Building2, ShoppingCart, ArrowRight, FileText, Plus, Trash2, ImagePlus, X, Upload, Download, FileSpreadsheet } from "lucide-react";
import { Link } from "wouter";
import { useNotices, useCreateNotice, useDeleteNotice } from "@/hooks/use-notices";
import { useLockStatus } from "@/hooks/use-settings";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

const SUBMENU_ITEMS = [
  {
    title: "팀별 보호구 현황",
    description: "각 팀의 안전보호구 보유 및 배포 현황을 확인합니다.",
    icon: Building2,
    href: "/equipment/status",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    iconColor: "text-amber-600 dark:text-amber-400",
    borderColor: "border-amber-200 dark:border-amber-900/30 hover:border-amber-400"
  },
  {
    title: "용품 신청",
    description: "안전용품을 신청합니다.",
    icon: ShoppingCart,
    href: "/equipment/request",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    iconColor: "text-purple-600 dark:text-purple-400",
    borderColor: "border-purple-200 dark:border-purple-900/30 hover:border-purple-400"
  }
];

export default function SafetyEquipment() {
  const { data: materials, isLoading } = useNotices("equipment");
  const { mutate: createMaterial, isPending: isCreating } = useCreateNotice();
  const { mutate: deleteMaterial } = useDeleteNotice();
  const { data: lockData } = useLockStatus();
  const isLocked = lockData?.isLocked;
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [excelUrl, setExcelUrl] = useState<string | null>(null);
  const [excelName, setExcelName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isExcelUploading, setIsExcelUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

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

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsExcelUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const res = await fetch('/api/upload/file', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.fileUrl) {
        setExcelUrl(data.fileUrl);
        setExcelName(file.name);
        toast({ title: "엑셀 파일 업로드 완료" });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "업로드 실패" });
    } finally {
      setIsExcelUploading(false);
    }
  };

  const handleAdd = () => {
    if (!title || !content) return;
    const contentData = JSON.stringify({
      text: content,
      excelUrl: excelUrl,
      excelName: excelName,
    });
    createMaterial({ title, content: contentData, category: "equipment", imageUrl: imageUrl || undefined }, {
      onSuccess: () => {
        setTitle("");
        setContent("");
        setImageUrl(null);
        setExcelUrl(null);
        setExcelName(null);
        toast({ title: "자료 추가 완료", description: "안전보호구 관리 자료가 게시되었습니다." });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("이 자료를 삭제하시겠습니까?")) deleteMaterial(id);
  };

  const parseContent = (content: string) => {
    try {
      return JSON.parse(content);
    } catch {
      return { text: content };
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            <div className="bg-amber-100 p-2 rounded-xl text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <HardHat className="w-8 h-8" />
            </div>
            안전보호구 관리
          </h2>
          <p className="text-muted-foreground mt-2">안전보호구 관리 자료 및 문서를 관리합니다.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {SUBMENU_ITEMS.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className={`group cursor-pointer hover:shadow-lg transition-all duration-300 ${item.borderColor}`} data-testid={`card-submenu-${item.href.split('/').pop()}`}>
              <CardHeader className="pb-2">
                <div className={`w-12 h-12 rounded-xl ${item.bgColor} flex items-center justify-center mb-3`}>
                  <item.icon className={`w-6 h-6 ${item.iconColor}`} />
                </div>
                <CardTitle className="flex items-center justify-between">
                  {item.title}
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="glass-card overflow-hidden border-amber-200 dark:border-amber-900/30">
        <CardHeader className="bg-amber-50/50 dark:bg-amber-900/10 border-b border-amber-100 dark:border-amber-900/20">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-600" />
            자료 등록
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <Input 
            placeholder="자료 제목" 
            value={title} 
            onChange={e => setTitle(e.target.value)}
            disabled={isLocked}
            data-testid="input-equipment-title"
          />
          <Textarea 
            placeholder="내용 설명..." 
            value={content} 
            onChange={e => setContent(e.target.value)}
            disabled={isLocked}
            data-testid="input-equipment-content"
          />
          
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleImageUpload}
            className="hidden"
            data-testid="input-equipment-image"
          />
          
          <input
            type="file"
            accept=".xlsx,.xls"
            ref={excelInputRef}
            onChange={handleExcelUpload}
            className="hidden"
            data-testid="input-equipment-excel"
          />

          <div className="flex flex-wrap gap-2">
            {imageUrl ? (
              <div className="relative inline-block">
                <img src={imageUrl} alt="미리보기" className="max-h-32 rounded-lg border" />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6"
                  onClick={() => setImageUrl(null)}
                  data-testid="button-remove-equipment-image"
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
                data-testid="button-add-equipment-image"
              >
                <ImagePlus className="w-4 h-4" />
                {isUploading ? "업로드 중..." : "이미지 추가"}
              </Button>
            )}

            {excelUrl ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg dark:bg-green-900/20 dark:border-green-800">
                <FileSpreadsheet className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-700 dark:text-green-400">{excelName}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => { setExcelUrl(null); setExcelName(null); }}
                  data-testid="button-remove-equipment-excel"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => excelInputRef.current?.click()}
                disabled={isLocked || isExcelUploading}
                className="gap-2"
                data-testid="button-add-equipment-excel"
              >
                <Upload className="w-4 h-4" />
                {isExcelUploading ? "업로드 중..." : "엑셀 파일 첨부"}
              </Button>
            )}
          </div>
          
          <div className="flex justify-end">
            <Button onClick={handleAdd} disabled={isLocked || isCreating || !title} className="bg-amber-600 hover:bg-amber-700 text-white gap-2" data-testid="button-add-equipment">
              <Plus className="w-4 h-4" /> 자료 추가
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AnimatePresence>
          {materials?.map((item) => {
            const parsed = parseContent(item.content);
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="group bg-card rounded-2xl p-6 border border-border/50 shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col justify-between h-full"
                data-testid={`card-equipment-${item.id}`}
              >
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-lg dark:bg-amber-900/20">
                      <FileText className="w-6 h-6" />
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="opacity-0 group-hover:opacity-100"
                      onClick={() => handleDelete(item.id)}
                      disabled={isLocked}
                      data-testid={`button-delete-equipment-${item.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-1 line-clamp-2">{item.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-4">{parsed.text}</p>
                  </div>
                  {item.imageUrl && (
                    <img 
                      src={item.imageUrl} 
                      alt="첨부 이미지" 
                      className="max-w-full max-h-48 rounded-lg border"
                    />
                  )}
                  {parsed.excelUrl && (
                    <a 
                      href={parsed.excelUrl} 
                      download={parsed.excelName}
                      className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-green-700 hover:bg-green-100 transition-colors dark:bg-green-900/20 dark:border-green-800 dark:text-green-400"
                    >
                      <Download className="w-4 h-4" />
                      <span className="text-sm">{parsed.excelName || "엑셀 다운로드"}</span>
                    </a>
                  )}
                </div>
                <div className="mt-4 pt-4 border-t text-xs text-muted-foreground flex justify-between items-center">
                  <span>게시일: {item.createdAt && format(new Date(item.createdAt), "yyyy-MM-dd")}</span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
