import { useNotices, useCreateNotice, useDeleteNotice } from "@/hooks/use-notices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Plus, Trash2, ImagePlus, X, BookOpen, Calendar, Search, Eye, FileText, Image, Paperclip, Download, FileSpreadsheet, FileIcon, Video, Loader2 } from "lucide-react";
import { useState, useRef, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePermissions } from "@/hooks/use-permissions";

export default function Education() {
  const { canRegisterEducation, canDownloadEducationFiles } = usePermissions();
  const { data: materials, isLoading } = useNotices("edu");
  const { mutate: createMaterial, isPending: isCreating } = useCreateNotice();
  const { mutate: deleteMaterial } = useDeleteNotice();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Array<{ url: string; name: string; type: string }>>([]);

  const ACCEPTED_FILE_TYPES = "image/*,.pptx,.ppt,.docx,.doc,.xlsx,.xls,.pdf,.mp4,.avi,.mov,.wmv,.webm,video/*";

  const getExtFromName = (name: string | null | undefined) => {
    if (!name) return '';
    return name.split('.').pop()?.toLowerCase() || '';
  };

  const isImageByType = (fileType: string | null | undefined) => {
    if (!fileType) return true;
    return fileType.startsWith('image/');
  };

  const isVideoByType = (fileType: string | null | undefined, fileName: string | null | undefined) => {
    if (fileType?.startsWith('video/')) return true;
    const ext = getExtFromName(fileName);
    return ['mp4','avi','mov','wmv','webm'].includes(ext);
  };

  const getFileIconByMeta = (fileType: string | null | undefined, fileName: string | null | undefined) => {
    const ext = getExtFromName(fileName);
    if (fileType?.startsWith('image/')) return <Image className="w-4 h-4 text-blue-500" />;
    if (fileType?.startsWith('video/') || ['mp4','avi','mov','wmv','webm'].includes(ext)) return <Video className="w-4 h-4 text-purple-500" />;
    if (['pptx','ppt'].includes(ext) || fileType?.includes('presentation') || fileType?.includes('powerpoint')) return <FileText className="w-4 h-4 text-orange-500" />;
    if (['docx','doc'].includes(ext) || fileType?.includes('word')) return <FileText className="w-4 h-4 text-blue-500" />;
    if (['xlsx','xls'].includes(ext) || fileType?.includes('spreadsheet') || fileType?.includes('excel')) return <FileSpreadsheet className="w-4 h-4 text-green-500" />;
    if (ext === 'pdf' || fileType === 'application/pdf') return <FileIcon className="w-4 h-4 text-red-500" />;
    return <Paperclip className="w-4 h-4" />;
  };

  const getFileLabelByMeta = (fileType: string | null | undefined, fileName: string | null | undefined) => {
    const ext = getExtFromName(fileName);
    if (fileType?.startsWith('image/')) return '이미지';
    if (fileType?.startsWith('video/') || ['mp4','avi','mov','wmv','webm'].includes(ext)) return '동영상';
    if (['pptx','ppt'].includes(ext) || fileType?.includes('presentation') || fileType?.includes('powerpoint')) return 'PPT';
    if (['docx','doc'].includes(ext) || fileType?.includes('word')) return 'Word';
    if (['xlsx','xls'].includes(ext) || fileType?.includes('spreadsheet') || fileType?.includes('excel')) return 'Excel';
    if (ext === 'pdf' || fileType === 'application/pdf') return 'PDF';
    return '파일';
  };

  const filteredMaterials = useMemo(() => {
    if (!materials) return [];
    if (!searchQuery.trim()) return materials;
    const query = searchQuery.toLowerCase();
    return materials.filter(item => 
      item.title.toLowerCase().includes(query) || 
      item.content.toLowerCase().includes(query)
    );
  }, [materials, searchQuery]);

  const [isDownloading, setIsDownloading] = useState(false);
  const [uploadedFileType, setUploadedFileType] = useState<string | null>(null);

  const handleDownload = async (fileUrl: string, fileName: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const res = await fetch(`/api/download?path=${encodeURIComponent(fileUrl)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("다운로드 실패");
      const { url } = await res.json();
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      toast({ variant: "destructive", title: "다운로드 실패", description: "파일을 다운로드할 수 없습니다." });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const maxSize = 100 * 1024 * 1024;
    const maxFiles = 10;

    if (attachments.length + files.length > maxFiles) {
      toast({ variant: "destructive", title: "파일 수 초과", description: `최대 ${maxFiles}개까지 첨부 가능합니다.` });
      return;
    }

    for (const file of Array.from(files)) {
      if (file.size > maxSize) {
        toast({ variant: "destructive", title: "파일 크기 초과", description: `${file.name}: 100MB 이하의 파일만 업로드 가능합니다.` });
        return;
      }
    }
    
    setIsUploading(true);
    
    try {
      const newAttachments: Array<{ url: string; name: string; type: string }> = [];
      for (const file of Array.from(files)) {
        const urlRes = await fetch('/api/uploads/request-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            contentType: file.type,
          }),
        });
        if (!urlRes.ok) {
          const err = await urlRes.json().catch(() => ({}));
          throw new Error(err.error || `${file.name} 업로드 URL 요청 실패`);
        }
        const { uploadURL, objectPath } = await urlRes.json();
        
        const uploadRes = await fetch(uploadURL, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });
        if (!uploadRes.ok) throw new Error(`${file.name} 업로드 실패`);
        
        newAttachments.push({ url: objectPath, name: file.name, type: file.type });
      }
      
      setAttachments(prev => [...prev, ...newAttachments]);
      if (!imageUrl && newAttachments.length > 0) {
        setImageUrl(newAttachments[0].url);
        setUploadedFileName(newAttachments[0].name);
        setUploadedFileType(newAttachments[0].type);
      }
      toast({ title: `${newAttachments.length}개 파일 업로드 완료` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "업로드 실패", description: err?.message || "파일 업로드 중 오류가 발생했습니다." });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAdd = () => {
    if (!title || !content) return;
    createMaterial({ 
      title, content, category: "edu", 
      imageUrl: imageUrl || undefined,
      fileName: uploadedFileName || undefined,
      fileType: uploadedFileType || undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    } as any, {
      onSuccess: () => {
        setTitle("");
        setContent("");
        setImageUrl(null);
        setUploadedFileName(null);
        setUploadedFileType(null);
        setAttachments([]);
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
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      {(() => {
                        const atts = (item as any).attachments;
                        if (atts && Array.isArray(atts) && atts.length > 0) {
                          return getFileIconByMeta(atts[0].type, atts[0].name);
                        }
                        return item.imageUrl ? getFileIconByMeta((item as any).fileType, (item as any).fileName) : (
                          <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        );
                      })()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-sm truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {item.title}
                        </h3>
                        {(() => {
                          const atts = (item as any).attachments;
                          if (atts && Array.isArray(atts) && atts.length > 0) {
                            return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{atts.length}개 파일</Badge>;
                          }
                          if (item.imageUrl) {
                            return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{getFileLabelByMeta((item as any).fileType, (item as any).fileName)}</Badge>;
                          }
                          return null;
                        })()}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{item.content}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {item.createdAt && format(new Date(item.createdAt), "MM.dd")}
                      </span>
                      {item.imageUrl && canDownloadEducationFiles && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-green-600"
                          onClick={(e) => handleDownload(item.imageUrl!, (item as any).fileName || '첨부파일', e)}
                          disabled={isDownloading}
                          data-testid={`button-download-edu-${item.id}`}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      )}
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
              accept={ACCEPTED_FILE_TYPES}
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              multiple
              data-testid="input-edu-file"
            />
            
            {attachments.length > 0 && (
              <div className="space-y-2">
                {attachments.map((att, idx) => (
                  <div key={idx} className="relative border rounded-lg p-3">
                    <div className="flex items-center gap-3 pr-8">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                        {getFileIconByMeta(att.type, att.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{att.name}</p>
                        <p className="text-xs text-muted-foreground">{getFileLabelByMeta(att.type, att.name)} 파일</p>
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6"
                      onClick={() => {
                        const newAtts = attachments.filter((_, i) => i !== idx);
                        setAttachments(newAtts);
                        if (newAtts.length > 0) {
                          setImageUrl(newAtts[0].url);
                          setUploadedFileName(newAtts[0].name);
                          setUploadedFileType(newAtts[0].type);
                        } else {
                          setImageUrl(null);
                          setUploadedFileName(null);
                          setUploadedFileType(null);
                        }
                      }}
                      data-testid={`button-remove-edu-file-${idx}`}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || attachments.length >= 10}
              className="gap-2"
              data-testid="button-add-edu-file"
            >
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              {isUploading ? "업로드 중..." : attachments.length > 0 ? "파일 추가 첨부" : "파일 첨부 (이미지, PPT, Word, Excel, PDF, 동영상)"}
            </Button>
            
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
                {(() => {
                  const allAttachments: Array<{ url: string; name: string; type: string }> = 
                    selectedItem.attachments && Array.isArray(selectedItem.attachments) && selectedItem.attachments.length > 0
                      ? selectedItem.attachments
                      : selectedItem.imageUrl
                        ? [{ url: selectedItem.imageUrl, name: selectedItem.fileName || '첨부파일', type: selectedItem.fileType || '' }]
                        : [];
                  
                  if (allAttachments.length === 0) return null;
                  
                  return (
                    <div className="space-y-3">
                      {allAttachments.map((att: { url: string; name: string; type: string }, idx: number) => (
                        <div key={idx}>
                          {isImageByType(att.type) && !isVideoByType(att.type, att.name) ? (
                            <img 
                              src={att.url} 
                              alt={att.name}
                              className="w-full max-h-80 object-contain rounded-xl border bg-muted/20"
                            />
                          ) : isVideoByType(att.type, att.name) ? (
                            <video 
                              controls 
                              className="w-full max-h-80 rounded-xl border bg-black"
                              preload="metadata"
                            >
                              <source src={att.url} type={att.type} />
                            </video>
                          ) : (
                            <div className="flex items-center gap-4 p-4 rounded-xl border bg-muted/20">
                              <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-background flex items-center justify-center">
                                {getFileIconByMeta(att.type, att.name)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{att.name}</p>
                                <p className="text-sm text-muted-foreground">{getFileLabelByMeta(att.type, att.name)} 파일</p>
                              </div>
                            </div>
                          )}
                          {canDownloadEducationFiles && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="gap-1.5 w-full mt-2" 
                              onClick={() => handleDownload(att.url, att.name)}
                              disabled={isDownloading}
                              data-testid={`button-download-edu-file-${idx}`}
                            >
                              <Download className="w-4 h-4" /> {isDownloading ? '다운로드 중...' : `${att.name} 다운로드`}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap">{selectedItem.content}</p>
                <div className="flex items-center justify-between pt-4 border-t text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {selectedItem.createdAt && format(new Date(selectedItem.createdAt), "yyyy년 MM월 dd일")}
                  </span>
                  {canRegisterEducation && (
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
