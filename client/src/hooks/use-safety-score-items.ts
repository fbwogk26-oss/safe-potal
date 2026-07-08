import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { SafetyScoreItem, InsertSafetyScoreItem, UpdateSafetyScoreItem } from "@shared/schema";
import { api } from "@shared/routes";

const ITEMS_PATH = "/api/safety-score-items";

export function useSafetyScoreItems() {
  return useQuery<SafetyScoreItem[]>({
    queryKey: [ITEMS_PATH],
  });
}

export function useCreateSafetyScoreItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertSafetyScoreItem) => {
      const res = await apiRequest("POST", ITEMS_PATH, data);
      return (await res.json()) as SafetyScoreItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ITEMS_PATH] });
      queryClient.invalidateQueries({ queryKey: [api.teams.list.path] });
    },
  });
}

export function useUpdateSafetyScoreItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateSafetyScoreItem) => {
      const res = await apiRequest("PUT", `${ITEMS_PATH}/${id}`, updates);
      return (await res.json()) as SafetyScoreItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ITEMS_PATH] });
      queryClient.invalidateQueries({ queryKey: [api.teams.list.path] });
    },
  });
}

export function useDeleteSafetyScoreItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `${ITEMS_PATH}/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ITEMS_PATH] });
      queryClient.invalidateQueries({ queryKey: [api.teams.list.path] });
    },
  });
}
