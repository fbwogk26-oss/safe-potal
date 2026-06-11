import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { InsertNotice } from "@shared/schema";
import { useHeadquarters } from "@/contexts/HeadquartersContext";

export function useNotices(category?: string, options?: { refetchInterval?: number }) {
  const { headquarters } = useHeadquarters();
  return useQuery({
    queryKey: [api.notices.list.path, category, headquarters],
    queryFn: async () => {
      let url = category 
        ? `${api.notices.list.path}?category=${category}&headquarters=${encodeURIComponent(headquarters)}` 
        : `${api.notices.list.path}?headquarters=${encodeURIComponent(headquarters)}`;

      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notices");
      return api.notices.list.responses[200].parse(await res.json());
    },
    refetchInterval: options?.refetchInterval,
    refetchOnWindowFocus: true,
  });
}

export function useCreateNotice() {
  const queryClient = useQueryClient();
  const { headquarters } = useHeadquarters();
  return useMutation({
    mutationFn: async (data: InsertNotice) => {
      const res = await fetch(api.notices.create.path, {
        method: api.notices.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, headquarters }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create notice");
      return api.notices.create.responses[201].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.notices.list.path] }),
  });
}

export function useUpdateNotice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { id: number } & Partial<InsertNotice>) => {
      const { id, ...rest } = data;
      const url = buildUrl(api.notices.update.path, { id });
      const res = await fetch(url, {
        method: api.notices.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rest),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update notice");
      return api.notices.update.responses[200].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.notices.list.path] }),
  });
}

export function useDeleteNotice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.notices.delete.path, { id });
      const res = await fetch(url, { 
        method: api.notices.delete.method,
        credentials: "include" 
      });
      if (!res.ok) throw new Error("Failed to delete notice");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.notices.list.path] }),
  });
}
