import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useLockStatus() {
  return useQuery({
    queryKey: [api.settings.getLock.path],
    queryFn: async () => {
      const res = await fetch(api.settings.getLock.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch lock status");
      return api.settings.getLock.responses[200].parse(await res.json());
    },
    refetchInterval: 10000, // Check every 10s
  });
}

export function useSetLock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ isLocked, pin }: { isLocked: boolean; pin?: string }) => {
      const res = await fetch(api.settings.setLock.path, {
        method: api.settings.setLock.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isLocked, pin }),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error("Invalid PIN");
        throw new Error("Failed to update lock status");
      }
      return api.settings.setLock.responses[200].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.settings.getLock.path] }),
  });
}
