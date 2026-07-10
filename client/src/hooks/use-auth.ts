import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface AuthUser {
  id: string;
  username: string;
  name: string | null;
  role: string;
  department: string;
  mustChangePassword?: boolean;
  requireTotp?: boolean;
}

async function fetchUser(): Promise<AuthUser | null> {
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

const PENDING_TOTP_KEY = ["__pendingTotp"];

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const { data: pendingTotp } = useQuery<boolean>({
    queryKey: PENDING_TOTP_KEY,
    queryFn: () => false,
    initialData: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const setPendingTotp = (val: boolean) =>
    queryClient.setQueryData(PENDING_TOTP_KEY, val);

  const loginMutation = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const response = await apiRequest("POST", "/api/login", { username, password });
      return response.json() as Promise<AuthUser>;
    },
    onSuccess: (data) => {
      if ((data as any).requireTotp) {
        setPendingTotp(true);
      } else {
        setPendingTotp(false);
        queryClient.setQueryData(["/api/auth/user"], data);
      }
    },
  });

  const totpVerifyMutation = useMutation({
    mutationFn: async ({ code }: { code: string }) => {
      const response = await apiRequest("POST", "/api/auth/totp/verify-login", { code });
      return response.json() as Promise<AuthUser>;
    },
    onSuccess: (data) => {
      setPendingTotp(false);
      queryClient.setQueryData(["/api/auth/user"], data);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      setPendingTotp(false);
      queryClient.setQueryData(["/api/auth/user"], null);
    },
  });

  const clearMustChangePassword = () => {
    queryClient.setQueryData(["/api/auth/user"], (old: AuthUser | null) => {
      if (!old) return null;
      return { ...old, mustChangePassword: false };
    });
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    mustChangePassword: user?.mustChangePassword ?? false,
    pendingTotp: !!pendingTotp,
    clearMustChangePassword,
    login: loginMutation.mutateAsync,
    loginError: loginMutation.error,
    isLoggingIn: loginMutation.isPending,
    totpVerify: totpVerifyMutation.mutateAsync,
    totpVerifyError: totpVerifyMutation.error,
    isTotpVerifying: totpVerifyMutation.isPending,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
    cancelTotp: () => setPendingTotp(false),
  };
}
