"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button, Field, PageHeading } from "@/components/ui";
import { cn } from "@/lib/utils";

const SUPPLIES = ["Phones", "Tablets", "Laptops", "Audio", "Wearables"];

export default function AdminAddVendorPage() {
  const router = useRouter();

  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [supplies, setSupplies] = useState<Set<string>>(new Set());
  const [paymentTerms, setPaymentTerms] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.admin.createVendor({
        businessName,
        contactName,
        phone,
        location,
        supplies: [...supplies],
        paymentTerms: paymentTerms || undefined,
      }),
    onSuccess: () => {
      toast.success("Vendor saved");
      router.push("/admin/vendors");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not save that vendor");
    },
  });

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-xl">
      <div className="px-6 pt-4">
        <button
          type="button"
          onClick={() => router.push("/admin/vendors")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <PageHeading>Add vendor</PageHeading>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="space-y-4 px-6 pb-6"
      >
        <Field label="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
        <Field label="Contact person" value={contactName} onChange={(e) => setContactName(e.target.value)} required />
        <Field label="Phone / WhatsApp" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <Field label="Location" placeholder="Shop 42, CV Ikeja" value={location} onChange={(e) => setLocation(e.target.value)} required />

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-ink-muted">Supplies</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUPPLIES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() =>
                  setSupplies((prev) => {
                    const next = new Set(prev);
                    next.has(s) ? next.delete(s) : next.add(s);
                    return next;
                  })
                }
                className={cn(
                  "rounded-pill px-4 py-2 text-sm font-semibold",
                  supplies.has(s) ? "bg-coral text-white" : "bg-surface text-ink-muted",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <Field
          label="Typical payment terms (optional)"
          placeholder="Same day on pickup"
          value={paymentTerms}
          onChange={(e) => setPaymentTerms(e.target.value)}
        />

        <Button type="submit" block size="lg" loading={create.isPending}>
          Save vendor
        </Button>
      </form>
    </div>
  );
}
