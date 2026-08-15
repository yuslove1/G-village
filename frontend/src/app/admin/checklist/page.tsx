"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type ChecklistItem } from "@/lib/api";
import { Button, Card, EmptyState, Field, PageHeading, Skeleton } from "@/components/ui";

const FIXED = [
  "Screen matches photos",
  "No hidden cracks or dents",
  "Battery health confirmed",
  "Powers on and functions",
  "Not iCloud locked",
  "IMEI clean, not blacklisted",
];

export default function AdminChecklistPage() {
  const [label, setLabel] = useState("");
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "checklist-items"],
    queryFn: () => api.admin.checklistItems(),
  });

  const items = query.data?.items ?? [];

  const create = useMutation({
    mutationFn: () => api.admin.createChecklistItem(label.trim()),
    onSuccess: ({ item }) => {
      queryClient.setQueryData<{ items: ChecklistItem[] } | undefined>(
        ["admin", "checklist-items"],
        (data) => ({ items: [...(data?.items ?? []), item] }),
      );
      setLabel("");
      toast.success("Added to the checklist");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not add that item");
    },
  });

  async function remove(item: ChecklistItem) {
    try {
      await api.admin.deleteChecklistItem(item.id);
      queryClient.setQueryData<{ items: ChecklistItem[] } | undefined>(
        ["admin", "checklist-items"],
        (data) => data && { items: data.items.filter((i) => i.id !== item.id) },
      );
      toast.success("Removed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove that item");
    }
  }

  return (
    <div className="lg:mx-auto lg:max-w-2xl">
      <PageHeading
        className="pb-0"
        sub="Extra things an agent checks for on top of the fixed checklist below"
      >
        Inspection checklist
      </PageHeading>

      <div className="px-6 pt-5 lg:px-12">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (label.trim()) create.mutate();
          }}
          className="flex items-end gap-2"
        >
          <div className="flex-1">
            <Field
              label="Add a check"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Test both earbuds pair correctly"
              maxLength={160}
            />
          </div>
          <Button type="submit" loading={create.isPending} disabled={!label.trim()}>
            Add
          </Button>
        </form>
      </div>

      <div className="px-6 pt-6 lg:px-12">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
          Custom checks {items.length > 0 && `(${items.length})`}
        </h2>

        {query.isLoading ? (
          <div className="mt-2 space-y-2">
            <Skeleton className="h-14 w-full" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-9 w-9" />}
            title="No custom checks yet"
            description="Agents currently only see the fixed checklist below. Add one above to have every inspection from now on check for it too."
          />
        ) : (
          <ul className="mt-2 space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-card bg-canvas p-3.5 shadow-soft"
              >
                <span className="text-sm font-semibold text-ink">{item.label}</span>
                <button
                  type="button"
                  onClick={() => remove(item)}
                  aria-label={`Remove "${item.label}"`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-6 pt-7 lg:px-12">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
          Fixed checklist (always shown, not editable here)
        </h2>
        <Card className="mt-2 border-0 p-4">
          <ul className="space-y-2 text-xs text-ink-muted">
            {FIXED.map((label) => (
              <li key={label}>· {label}</li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
            These six are wired into approval itself — an iCloud-locked or blacklisted device can't be
            approved no matter what — so they live in code, not here.
          </p>
        </Card>
      </div>
    </div>
  );
}
