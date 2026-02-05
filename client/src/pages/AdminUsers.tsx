import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { 
  Shield, 
  ShieldOff, 
  Users, 
  ArrowLeft, 
  Plus, 
  Trash2,
  Eye,
  EyeOff,
  Upload,
  FileSpreadsheet,
  Download,
  Building2
} from "lucide-react";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UserData {
  id: string;
  username: string;
  name: string | null;
  department: string | null;
  role: string;
  createdAt: string | null;
}

export default function AdminUsers() {
  const { toast } = useToast();
  const { user: currentUser, isAuthenticated } = useAuth();
  const { data: roleData } = useQuery<{ role: string }>({
    queryKey: ["/api/auth/user-role"],
    enabled: isAuthenticated,
  });
  const isAdmin = roleData?.role === "admin";

  const { data: users, isLoading } = useQuery<UserData[]>({
    queryKey: ["/api/users"],
    enabled: isAdmin,
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest("PUT", `/api/users/${userId}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "역할이 변경되었습니다." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "역할 변경에 실패했습니다." });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "사용자가 삭제되었습니다." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "사용자 삭제에 실패했습니다." });
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground mb-4">로그인이 필요합니다.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <ShieldOff className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">관리자 권한이 필요합니다.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="mb-6">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-2 mb-4" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
            대시보드로 돌아가기
          </Button>
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">사용자 관리</h1>
              <p className="text-sm text-muted-foreground">사용자 계정을 생성하고 관리합니다</p>
            </div>
          </div>
          <div className="flex gap-2">
            <ExcelUploadDialog />
            <CreateUserDialog />
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">등록된 사용자 ({users?.length || 0}명)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">로딩 중...</div>
          ) : !users || users.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">등록된 사용자가 없습니다.</div>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card"
                  data-testid={`user-row-${user.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {(user.name?.[0] || user.username?.[0] || "U").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">
                        {user.name || user.username}
                        {user.id === currentUser?.id && (
                          <span className="ml-2 text-xs text-muted-foreground">(나)</span>
                        )}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>@{user.username}</span>
                        {user.department && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {user.department}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                      {user.role === "admin" ? "관리자" : "일반 사용자"}
                    </Badge>
                    {user.id !== currentUser?.id && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateRoleMutation.mutate({
                              userId: user.id,
                              role: user.role === "admin" ? "user" : "admin",
                            })
                          }
                          disabled={updateRoleMutation.isPending}
                          data-testid={`button-toggle-role-${user.id}`}
                        >
                          {user.role === "admin" ? (
                            <>
                              <ShieldOff className="w-4 h-4 mr-1" />
                              권한 해제
                            </>
                          ) : (
                            <>
                              <Shield className="w-4 h-4 mr-1" />
                              관리자 지정
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm("정말로 이 사용자를 삭제하시겠습니까?")) {
                              deleteUserMutation.mutate(user.id);
                            }
                          }}
                          disabled={deleteUserMutation.isPending}
                          data-testid={`button-delete-${user.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ExcelUploadDialog() {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/users/bulk-upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "업로드 실패");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ 
        title: "일괄 등록 완료", 
        description: `${data.successCount}명의 사용자가 등록되었습니다.${data.skipCount ? ` (${data.skipCount}명 건너뜀)` : ""}` 
      });
      setOpen(false);
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "업로드 실패", 
        description: error.message 
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const downloadTemplate = () => {
    const csvContent = "부서명,이름,아이디,비밀번호\n네트워크팀,홍길동,hong123,password123\n안전관리팀,김철수,kim456,password456";
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "사용자_등록_양식.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2" data-testid="button-bulk-upload">
          <Upload className="w-4 h-4" />
          엑셀 일괄등록
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>엑셀로 사용자 일괄 등록</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-4 bg-muted/50 rounded-lg space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
              엑셀 파일 형식
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>첫 번째 행: 헤더 (부서명, 이름, 아이디, 비밀번호)</p>
              <p>두 번째 행부터: 사용자 데이터</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border rounded">
                <thead className="bg-muted">
                  <tr>
                    <th className="border p-1.5 text-left">부서명</th>
                    <th className="border p-1.5 text-left">이름</th>
                    <th className="border p-1.5 text-left">아이디</th>
                    <th className="border p-1.5 text-left">비밀번호</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border p-1.5">네트워크팀</td>
                    <td className="border p-1.5">홍길동</td>
                    <td className="border p-1.5">hong123</td>
                    <td className="border p-1.5">password123</td>
                  </tr>
                  <tr>
                    <td className="border p-1.5">안전관리팀</td>
                    <td className="border p-1.5">김철수</td>
                    <td className="border p-1.5">kim456</td>
                    <td className="border p-1.5">password456</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={downloadTemplate}>
              <Download className="w-4 h-4" />
              양식 다운로드 (CSV)
            </Button>
          </div>

          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
              data-testid="input-excel-file"
            />
            <Button 
              className="w-full gap-2" 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="w-4 h-4" />
              {uploading ? "업로드 중..." : "엑셀 파일 선택"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              .xlsx, .xls, .csv 파일 지원
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState("user");
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  const createUserMutation = useMutation({
    mutationFn: async (data: { username: string; password: string; name: string; department: string; role: string }) => {
      return apiRequest("POST", "/api/users", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "사용자가 생성되었습니다." });
      setOpen(false);
      setUsername("");
      setPassword("");
      setName("");
      setDepartment("");
      setRole("user");
    },
    onError: (error: any) => {
      toast({ 
        variant: "destructive", 
        title: "사용자 생성 실패", 
        description: error.message || "오류가 발생했습니다." 
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast({ variant: "destructive", title: "아이디와 비밀번호는 필수입니다." });
      return;
    }
    createUserMutation.mutate({ username, password, name: name || username, department, role });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2" data-testid="button-create-user">
          <Plus className="w-4 h-4" />
          사용자 추가
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>새 사용자 추가</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">부서명</label>
            <Input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="소속 부서"
              data-testid="input-new-department"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">이름</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="사용자 이름"
              data-testid="input-new-name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">아이디 (ID)</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="로그인 아이디"
              data-testid="input-new-username"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">비밀번호 (PW)</label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호"
                className="pr-10"
                data-testid="input-new-password"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">권한</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger data-testid="select-new-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">일반 사용자</SelectItem>
                <SelectItem value="admin">관리자</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button 
            type="submit" 
            className="w-full" 
            disabled={createUserMutation.isPending}
            data-testid="button-submit-user"
          >
            {createUserMutation.isPending ? "생성 중..." : "사용자 생성"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
