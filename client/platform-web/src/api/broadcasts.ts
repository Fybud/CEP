import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "./index";

export type BroadcastJob = {
  id: string;
  templateId: string;
  templateName: string;
  variables: Record<string, string>;
  status: "completed" | "partial" | "failed";
  total: number;
  succeeded: number;
  failed: number;
  createdAt: string;
  scheduledAt?: string | null;
  cancelledAt?: string | null;
  pausedAt?: string | null;
  recurrence?: "none" | "weekly" | "monthly";
  suppressionDays?: number | null;
  parentJobId?: string | null;
  recipients: Array<{
    id: string;
    customerId: string;
    customerName: string | null;
    status: "sent" | "failed";
    error: string | null;
  }>;
};

export const useBroadcastHistory = () => {
  return useQuery({
    queryKey: ["broadcasts"],
    queryFn: () => request<{ jobs: BroadcastJob[] }>("/api/v1/broadcasts"),
  });
};

export const useSendBroadcast = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { 
      templateId: string; 
      customerIds: string[]; 
      variables: Record<string, string>;
      includeTags?: string[];
      excludeTags?: string[];
      scheduledAt?: string;
      recurrence?: "none" | "weekly" | "monthly";
      suppressionDays?: number | null;
    }) =>
      request<{ jobId: string; total: number; succeeded: number; failed: number }>("/api/v1/broadcasts", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

