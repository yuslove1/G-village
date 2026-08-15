"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type AdminAgent } from "@/lib/api";
import { Button, EmptyState, PageHeading, Skeleton } from "@/components/ui";
import { cn, initials } from "@/lib/utils";

function StatusPill({ status }: { status: AdminAgent["status"] }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-pill px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
        status === "ACTIVE" ? "bg-mint-soft text-mint" : "bg-surface text-ink-muted",
      )}
    >
      {status === "ACTIVE" ? "Active" : "Onboarding"}
    </span>
  );
}

export default function AdminAgentsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "agents"],
    queryFn: () => api.admin.agents(),
  });

  const agents = query.data?.agents ?? [];

  async function remove(a: AdminAgent) {
    try {
      await api.admin.deleteAgent(a.id);
      queryClient.setQueryData<{ agents: AdminAgent[] } | undefined>(["admin", "agents"], (data) =>
        data && { agents: data.agents.filter((x) => x.id !== a.id) },
      );
      toast.success(`${a.fullName} removed. Anything open in their queue is back in the pool.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove that agent");
    }
  }
  const cities = new Set(agents.map((a) => a.city).filter(Boolean));
  const totalInspections = agents.reduce((sum, a) => sum + a.inspectionsThisMonth, 0);

  return (
    <div className="lg:mx-auto lg:max-w-2xl">
      <div className="flex items-center justify-between px-6 pb-4 pt-2">
        <h1 className="font-display text-display-md text-ink">
          Agents<span className="text-coral">.</span>
        </h1>
        <Button asChild size="sm">
          <Link href="/admin/agents/new">
            <Plus className="h-4 w-4" aria-hidden />
            Add agent
          </Link>
        </Button>
      </div>

      {!query.isLoading && agents.length > 0 && (
        <p className="px-6 text-xs text-ink-muted lg:px-12">
          {agents.length} agent{agents.length === 1 ? "" : "s"} across {cities.size} cit
          {cities.size === 1 ? "y" : "ies"} · {totalInspections} inspections this month
        </p>
      )}

      {query.isLoading ? (
        <div className="space-y-3 px-6 pt-4 lg:px-12">
          <Skeleton className="h-20 w-full" />
        </div>
      ) : agents.length === 0 ? (
        <div className="px-6 lg:px-12">
          <EmptyState icon={<Users className="h-9 w-9" />} title="No agents yet" description="Agent accounts show up here once created." />
        </div>
      ) : (
        <>
          <ul className="space-y-3 px-6 pt-4 lg:hidden">
            {agents.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-card bg-canvas p-4 shadow-soft">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-coral-soft text-sm font-bold text-coral-dark">
                  {initials(a.fullName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{a.fullName}</p>
                  <p className="text-xs text-ink-muted">
                    {a.city ?? "Unassigned"}
                    {a.state ? `, ${a.state}` : ""}
                  </p>
                  <div className="mt-1">
                    <StatusPill status={a.status} />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <p className="tabular text-sm font-bold text-ink">{a.inspectionsThisMonth}</p>
                    <p className="text-[10px] text-ink-faint">this month</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(a)}
                    aria-label={`Remove ${a.fullName}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden px-12 pt-4 lg:block">
            <div className="overflow-hidden rounded-card bg-canvas shadow-soft">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-surface text-xs font-bold uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-3 font-bold">Agent</th>
                    <th className="px-4 py-3 font-bold">Location</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 text-right font-bold">Inspections this month</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.id} className="border-b border-hairline last:border-0 hover:bg-surface/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-coral-soft text-xs font-bold text-coral-dark">
                            {initials(a.fullName)}
                          </span>
                          <span className="font-semibold text-ink">{a.fullName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        {a.city ?? "Unassigned"}
                        {a.state ? `, ${a.state}` : ""}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={a.status} />
                      </td>
                      <td className="tabular px-4 py-3 text-right text-ink">{a.inspectionsThisMonth}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => remove(a)}
                          aria-label={`Remove ${a.fullName}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
