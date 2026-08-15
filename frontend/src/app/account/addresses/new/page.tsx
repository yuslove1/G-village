"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button, Field, PageHeading } from "@/components/ui";

function AddressForm() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("id");
  const next = params.get("next") ?? "/account/addresses";

  const existing = useQuery({
    queryKey: ["addresses"],
    queryFn: () => api.addresses.list(),
    enabled: Boolean(editId),
  });

  const [label, setLabel] = useState("");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [phone, setPhone] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!editId || !existing.data) return;
    const a = existing.data.addresses.find((x) => x.id === editId);
    if (!a) return;
    setLabel(a.label);
    setLine1(a.line1);
    setCity(a.city);
    setState(a.state);
    setPhone(a.phone);
    setIsDefault(a.isDefault);
  }, [editId, existing.data]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body = { label, line1, city, state, phone, isDefault };
      if (editId) await api.addresses.update(editId, body);
      else await api.addresses.create(body);
      toast.success(editId ? "Address updated" : "Address added");
      router.push(next);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save that address");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-xl">
      <div className="px-6 pt-4">
        <Link
          href={next}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
      </div>

      <PageHeading sub="We'll deliver here and text you before we arrive">
        {editId ? "Edit address" : "New address"}
      </PageHeading>

      <form onSubmit={onSubmit} className="space-y-4 px-6">
        <Field
          label="Label"
          placeholder="Home, Office"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
        <Field
          label="Street address"
          placeholder="14 Allen Avenue"
          value={line1}
          onChange={(e) => setLine1(e.target.value)}
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" value={city} onChange={(e) => setCity(e.target.value)} required />
          <Field label="State" value={state} onChange={(e) => setState(e.target.value)} required />
        </div>
        <Field
          label="Phone number"
          type="tel"
          placeholder="0803 123 4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />

        <button
          type="button"
          onClick={() => setIsDefault((v) => !v)}
          aria-pressed={isDefault}
          className="flex w-full items-center gap-3 rounded-card border border-hairline bg-canvas p-4 text-left"
        >
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
              isDefault ? "border-coral bg-coral" : "border-ink-faint"
            }`}
            aria-hidden
          >
            {isDefault && <span className="h-2 w-2 rounded-full bg-white" />}
          </span>
          <span className="text-sm font-semibold text-ink">Use as default delivery address</span>
        </button>

        <Button type="submit" block size="lg" loading={submitting}>
          {editId ? "Save changes" : "Add address"}
        </Button>
      </form>
    </div>
  );
}

export default function NewAddressPage() {
  return (
    <Suspense fallback={null}>
      <AddressForm />
    </Suspense>
  );
}
