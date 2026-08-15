"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleDot, ClipboardCheck, ClipboardList, MapPin, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Badge, Button, Card, EmptyState, PageHeading, Skeleton } from "@/components/ui";
import { GRADE_LABEL } from "@/lib/utils";

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="border-0 p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-soft text-cyan-dark">
        {icon}
      </span>
      <p className="tabular mt-3 text-xl font-bold text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink-muted">{label}</p>
    </Card>
  );
}

export default function AgentQueuePage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "inspections"],
    queryFn: () => api.admin.inspections(),
  });

  const stats = useQuery({
    queryKey: ["admin", "agents", "me"],
    queryFn: () => api.admin.myStats(),
  });

  // The API already scopes this list to "unassigned, or assigned to me" for
  // an agent — so a missing assignedAgent here always means open, not
  // "assigned to someone else I can't see."
  const inspections = query.data?.inspections ?? [];

  async function claimAndStart(reference: string) {
    try {
      await api.admin.claimInspection(reference);
      queryClient.invalidateQueries({ queryKey: ["admin", "inspections"] });
      router.push(`/agent/inspect/${reference}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not claim that booking");
      queryClient.invalidateQueries({ queryKey: ["admin", "inspections"] });
    }
  }

  return (
    <div className="lg:mx-auto lg:max-w-2xl">
      <PageHeading sub={`${inspections.length} inspection${inspections.length === 1 ? "" : "s"} booked`}>
        Today
      </PageHeading>

      <div className="px-6">
        {stats.isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Stat
              icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
              label="Completed today"
              value={stats.data?.today.completed ?? 0}
            />
            <Stat
              icon={<ClipboardList className="h-4 w-4" aria-hidden />}
              label="Completed this week"
              value={stats.data?.thisWeek.completed ?? 0}
            />
            <Stat
              icon={<ClipboardCheck className="h-4 w-4" aria-hidden />}
              label="Assigned to you"
              value={stats.data?.queue.assignedToMe ?? 0}
            />
            <Stat
              icon={<CircleDot className="h-4 w-4" aria-hidden />}
              label="Open for claim"
              value={stats.data?.queue.openForClaim ?? 0}
            />
          </div>
        )}
      </div>

      <h2 className="px-6 pt-7 text-sm font-bold text-ink">Queue</h2>

      {query.isLoading ? (
        <div className="mt-2 space-y-3 px-6">
          <Skeleton className="h-32 w-full" />
        </div>
      ) : inspections.length === 0 ? (
        <EmptyState
          icon={<PackageOpen className="h-9 w-9" />}
          title="Queue is clear"
          description="No inspections are booked right now."
        />
      ) : (
        <ul className="mt-2 space-y-3 px-6">
          {inspections.map((s) => (
            <li key={s.reference} className="rounded-card bg-canvas p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{s.device}</p>
                  {s.seller && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                      {s.seller.name} · {s.seller.city ?? "—"}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge tone={s.status === "INSPECTED" ? "amber" : "neutral"}>
                    {s.pickupAt
                      ? new Date(s.pickupAt).toLocaleString("en-NG", {
                          weekday: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "Drop-off"}
                  </Badge>
                  {!s.assignedAgent && <Badge tone="coral">Open</Badge>}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-hairline pt-3">
                <span className="text-xs text-ink-muted">
                  {GRADE_LABEL[s.claimedGrade] ?? s.claimedGrade}
                  {s.claimedBattery != null && ` · ${s.claimedBattery}%`} · Offer {s.offer.display}
                </span>
                {s.assignedAgent ? (
                  <Button asChild size="sm">
                    <Link href={`/agent/inspect/${s.reference}`} className="flex items-center gap-1.5">
                      <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
                      {s.status === "INSPECTED" ? "Resume" : "Start inspection"}
                    </Link>
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => claimAndStart(s.reference)}>
                    <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
                    Claim & start
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
