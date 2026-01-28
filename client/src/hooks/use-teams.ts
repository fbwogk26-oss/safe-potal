import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreateTeamRequest, type UpdateTeamRequest } from "@shared/routes";

export function useTeams(year?: number) {
  return useQuery({
    queryKey: [api.teams.list.path, year],
    queryFn: async () => {
      const url = year 
        ? `${api.teams.list.path}?year=${year}` 
        : api.teams.list.path;
      
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch teams");
      return api.teams.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateTeamRequest) => {
      const res = await fetch(api.teams.create.path, {
        method: api.teams.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.teams.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create team");
      }
      return api.teams.create.responses[201].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.teams.list.path] }),
  });
}

export function useUpdateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateTeamRequest) => {
      const url = buildUrl(api.teams.update.path, { id });
      const res = await fetch(url, {
        method: api.teams.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      
      if (!res.ok) {
        if (res.status === 404) throw new Error("Team not found");
        throw new Error("Failed to update team");
      }
      return api.teams.update.responses[200].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.teams.list.path] }),
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.teams.delete.path, { id });
      const res = await fetch(url, { 
        method: api.teams.delete.method,
        credentials: "include" 
      });
      if (!res.ok) throw new Error("Failed to delete team");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.teams.list.path] }),
  });
}

export function useResetTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/teams/${id}/reset`, {
        method: 'POST',
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to reset team");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.teams.list.path] }),
  });
}

export function useResetAllTeams() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (year: number) => {
      const res = await fetch('/api/teams/reset-all', {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to reset all teams");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.teams.list.path] }),
  });
}
