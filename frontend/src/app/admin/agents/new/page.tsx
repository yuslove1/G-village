"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Copy } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button, Card, Field, PageHeading } from "@/components/ui";
import { cn } from "@/lib/utils";

const ROLES = [
  { value: "AGENT" as const, label: "Agent" },
  { value: "ADMIN" as const, label: "Admin" },
];

export default function AdminAddAgentPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [role, setRole] = useState<"AGENT" | "ADMIN">("AGENT");
  const [created, setCreated] = useState<{ fullName: string; phone: string; tempPassword: string } | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.admin.createAgent({
        fullName,
        phone,
        email: email || undefined,
        city: city || undefined,
        state: state || undefined,
        role,
      }),
    onSuccess: (result) => {
      setCreated({ fullName: result.agent.fullName, phone: result.agent.phone, tempPassword: result.tempPassword });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not create that account");
    },
  });

  if (created) {
    return (
      <div className="animate-fade-up lg:mx-auto lg:max-w-xl">
        <PageHeading>Account created</PageHeading>
        <div className="px-6 pb-6">
          <Card className="border-0 bg-mint-soft p-6">
            <p className="text-sm font-bold text-ink">{created.fullName}</p>
            <p className="text-xs text-ink-muted">{created.phone}</p>

            <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
              Temporary password
            </p>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 rounded-card bg-canvas px-3 py-2 text-sm font-bold text-ink">
                {created.tempPassword}
              </code>
              <button
                type="button"
                aria-label="Copy password"
                onClick={() => {
                  navigator.clipboard.writeText(created.tempPassword);
                  toast.success("Copied");
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-canvas"
              >
                <Copy className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              There is no SMS or email delivery wired up yet — share this password with them directly.
              It will not be shown again.
            </p>
          </Card>

          <Button className="mt-4" block onClick={() => router.push("/admin/agents")}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-xl">
      <div className="px-6 pt-4">
        <button
          type="button"
          onClick={() => router.push("/admin/agents")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <PageHeading>Add agent</PageHeading>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="space-y-4 px-6 pb-6"
      >
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-ink-muted">Role</label>
          <div className="mt-2 flex gap-2">
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
                className={cn(
                  "rounded-pill px-4 py-2 text-sm font-semibold",
                  role === r.value ? "bg-coral text-white" : "bg-surface text-ink-muted",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <Field label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <Field label="Phone" type="tel" placeholder="080..." value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <Field label="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="City" value={city} onChange={(e) => setCity(e.target.value)} />
        <Field label="State" value={state} onChange={(e) => setState(e.target.value)} />

        <Button type="submit" block size="lg" loading={create.isPending}>
          Create account
        </Button>
      </form>
    </div>
  );
}
