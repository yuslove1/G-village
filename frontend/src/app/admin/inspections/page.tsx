"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type InspectionQueueItem } from "@/lib/api";
import { Badge, EmptyState, PageHeading, Skeleton } from "@/components/ui";
import { GRADE_LABEL } from "@/lib/utils";

export default function AdminInspectionsPage() {
  const queryClient = useQueryClient();

  const inspections = useQuery({
    queryKey: ["admin", "inspections"],
    queryFn: () => api.admin.inspections(),
  });
  const agents = useQuery({
    queryKey: ["admin", "agents"],
    queryFn: () => api.admin.agents(),
  });

  async function assign(item: InspectionQueueItem, agentId: string) {
    if (!agentId) return;
    try {
      await api.admin.assignInspection(item.reference, agentId);
      queryClient.invalidateQueries({ queryKey: ["admin", "inspections"] });
      toast.success(`Assigned to ${agents.data?.agents.find((a) => a.id === agentId)?.fullName ?? "agent"}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not assign that booking");
    }
  }

  const items = inspections.data?.inspections ?? [];

  return (
    <div className="lg:mx-auto lg:max-w-4xl">
      <PageHeading sub="Route bookings to a specific agent, or leave open for anyone to claim">
        Inspections
      </PageHeading>

      {inspections.isLoading ? (
        <div className="space-y-3 px-6 lg:px-12">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="px-6 lg:px-12">
          <EmptyState
            icon={<ClipboardCheck className="h-9 w-9" />}
            title="Nothing booked"
            description="No inspections are waiting right now."
          />
        </div>
      ) : (
        <ul className="space-y-3 px-6 lg:px-12">
          {items.map((item) => (
            <li key={item.reference} className="rounded-card bg-canvas p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{item.device}</p>
                  {item.seller && (
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {item.seller.name} · {item.seller.city ?? "—"}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {GRADE_LABEL[item.claimedGrade] ?? item.claimedGrade}
                    {item.claimedBattery != null && ` · ${item.claimedBattery}%`} · {item.offer.display}
                  </p>
                </div>
                {item.pickupAt ? (
                  <Badge tone={item.status === "INSPECTED" ? "amber" : "neutral"}>
                    {new Date(item.pickupAt).toLocaleString("en-NG", {
                      weekday: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </Badge>
                ) : (
                  <Badge>Drop-off</Badge>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-hairline pt-3">
                <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <UserCheck className="h-3.5 w-3.5" aria-hidden />
                  {item.assignedAgent ? (
                    <span>
                      Assigned to <span className="font-bold text-ink">{item.assignedAgent.name}</span>
                    </span>
                  ) : (
                    <span className="font-semibold text-coral">Open — unassigned</span>
                  )}
                </span>

                <select
                  value={item.assignedAgent?.id ?? ""}
                  onChange={(e) => assign(item, e.target.value)}
                  className="h-9 rounded-pill border border-hairline bg-canvas px-3 text-xs font-semibold text-ink outline-none focus:border-coral"
                >
                  <option value="" disabled>
                    Assign to…
                  </option>
                  {agents.data?.agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.fullName}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
