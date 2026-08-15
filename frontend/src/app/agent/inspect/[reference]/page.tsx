"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button, Card, Field, PageHeading, Skeleton } from "@/components/ui";
import { GRADE_LABEL, cn } from "@/lib/utils";

const CHECKLIST = [
  { key: "screenMatches", label: "Screen matches photos" },
  { key: "noHiddenDamage", label: "No hidden cracks or dents" },
  { key: "batteryOk", label: "Battery health confirmed" },
  { key: "powersOn", label: "Powers on and functions" },
  { key: "notIcloudLocked", label: "Not iCloud locked" },
  { key: "imeiClean", label: "IMEI clean, not blacklisted" },
] as const;

type Checklist = Record<(typeof CHECKLIST)[number]["key"], boolean>;

const GRADES = ["MINT", "EXCELLENT", "GOOD", "FAIR"] as const;

export default function AgentInspectPage() {
  const { reference } = useParams<{ reference: string }>();
  const router = useRouter();

  const queue = useQuery({
    queryKey: ["admin", "inspections"],
    queryFn: () => api.admin.inspections(),
  });

  // Admin-defined, on top of the six fixed checks above — see
  // /admin/checklist. New ones only ever apply going forward; this fetches
  // whatever's active right now, not whatever was active when older
  // inspections in the queue were started.
  const customItems = useQuery({
    queryKey: ["admin", "checklist-items"],
    queryFn: () => api.admin.checklistItems(),
  });

  const sale = queue.data?.inspections.find((s) => s.reference === reference);

  const [checklist, setChecklist] = useState<Checklist>({
    screenMatches: false,
    noHiddenDamage: false,
    batteryOk: false,
    powersOn: false,
    notIcloudLocked: false,
    imeiClean: false,
  });
  const [customChecked, setCustomChecked] = useState<Record<string, boolean>>({});
  const [imei, setImei] = useState("");
  const [gradeAssessed, setGradeAssessed] = useState<string>("");
  const [batteryActual, setBatteryActual] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState<"checklist" | "reject" | "publish">("checklist");
  const [rejectReason, setRejectReason] = useState("");
  const [listPrice, setListPrice] = useState<number | "">("");

  useEffect(() => {
    if (!sale) return;
    setGradeAssessed(sale.claimedGrade);
    setBatteryActual(sale.claimedBattery ?? "");
    const suggested = Math.round((Number(sale.offer.kobo) / 100) * 1.15 / 1000) * 1000;
    setListPrice(suggested);
  }, [sale]);

  const items = customItems.data?.items ?? [];
  const allChecked =
    CHECKLIST.every((c) => checklist[c.key]) && items.every((i) => customChecked[i.id]);

  const submit = useMutation({
    mutationFn: (approve: boolean) =>
      api.admin.completeInspection(reference, {
        ...checklist,
        checklistResults: items.map((i) => ({ itemId: i.id, passed: Boolean(customChecked[i.id]) })),
        imei: imei || undefined,
        gradeAssessed,
        batteryActual: batteryActual === "" ? undefined : batteryActual,
        listPriceKobo: approve ? Number(listPrice) * 100 : Number(sale?.offer.kobo ?? 0),
        approve,
        rejectReason: approve ? undefined : rejectReason || "Did not match description",
        notes: notes || undefined,
      }),
    onSuccess: (data) => {
      toast.success(data.approved ? `Published as ${data.listingReference}` : "Sale rejected");
      router.push("/agent");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not save that inspection");
    },
  });

  if (queue.isLoading) {
    return (
      <div className="space-y-3 px-6 pt-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="px-6 pt-10 text-center text-sm text-ink-muted">
        That inspection isn't in the queue anymore.
      </div>
    );
  }

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-xl">
      <div className="flex items-center gap-3 px-6 pt-4">
        <button
          type="button"
          onClick={() => (phase === "checklist" ? router.push("/agent") : setPhase("checklist"))}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <PageHeading sub={`#${sale.reference} · Seller claimed`}>{sale.device}</PageHeading>

      {sale.photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-6">
          {sale.photos.map((photo, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- seller-submitted data URL, next/image can't optimise it
            <img key={i} src={photo} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover" />
          ))}
        </div>
      )}

      {phase === "checklist" && (
        <>
          <section className="px-6 pt-6">
            <h2 className="text-sm font-bold text-ink">Verify each item</h2>
            <div className="mt-3 space-y-2">
              {CHECKLIST.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setChecklist((c) => ({ ...c, [item.key]: !c[item.key] }))}
                  aria-pressed={checklist[item.key]}
                  className="flex w-full items-center gap-3 rounded-card bg-canvas p-3.5 shadow-soft"
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                      checklist[item.key] ? "border-coral bg-coral" : "border-ink-faint",
                    )}
                  >
                    {checklist[item.key] && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                  </span>
                  <span className="text-sm font-semibold text-ink">{item.label}</span>
                </button>
              ))}
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCustomChecked((c) => ({ ...c, [item.id]: !c[item.id] }))}
                  aria-pressed={Boolean(customChecked[item.id])}
                  className="flex w-full items-center gap-3 rounded-card bg-canvas p-3.5 shadow-soft"
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                      customChecked[item.id] ? "border-coral bg-coral" : "border-ink-faint",
                    )}
                  >
                    {customChecked[item.id] && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                  </span>
                  <span className="text-sm font-semibold text-ink">{item.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-4 px-6 pt-6">
            <h2 className="text-sm font-bold text-ink">Adjust offer</h2>
            <Field label="IMEI (optional)" value={imei} onChange={(e) => setImei(e.target.value)} maxLength={15} />
            <div className="space-y-2">
              <label className="block text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                Grade assessed
              </label>
              <div className="flex flex-wrap gap-2">
                {GRADES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGradeAssessed(g)}
                    className={cn(
                      "rounded-pill px-4 py-2 text-sm font-semibold",
                      gradeAssessed === g ? "bg-coral text-white" : "bg-surface text-ink-muted",
                    )}
                  >
                    {GRADE_LABEL[g] ?? g}
                  </button>
                ))}
              </div>
            </div>
            <Field
              label="Battery actual %"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={batteryActual}
              onChange={(e) => setBatteryActual(e.target.value === "" ? "" : Number(e.target.value))}
            />
            <Field label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </section>

          <div className="space-y-3 px-6 pt-7">
            <Button
              block
              size="lg"
              disabled={!allChecked || !gradeAssessed}
              onClick={() => setPhase("publish")}
            >
              Approve
            </Button>
            <Button block size="lg" variant="outline" onClick={() => setPhase("reject")}>
              Reject
            </Button>
          </div>
        </>
      )}

      {phase === "reject" && (
        <section className="space-y-4 px-6 pt-6">
          <Card className="border-0 bg-danger-soft p-4">
            <p className="text-xs leading-relaxed text-ink-muted">
              <span className="font-bold text-ink">This device does not match what was claimed.</span> The
              seller keeps it — nothing is paid.
            </p>
          </Card>
          <Field
            label="Reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Screen cracked, not disclosed"
          />
          <Button
            block
            size="lg"
            variant="danger"
            loading={submit.isPending}
            onClick={() => submit.mutate(false)}
          >
            Confirm rejection
          </Button>
        </section>
      )}

      {phase === "publish" && (
        <section className="px-6 pt-6">
          <Card className="border-0 bg-mint-soft p-5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-mint">Device verified</p>
            <p className="mt-2 text-sm font-bold text-ink">Grade: {GRADE_LABEL[gradeAssessed] ?? gradeAssessed}</p>
            <p className="tabular mt-3 text-lg font-bold text-ink">Paid to seller {sale.offer.display}</p>
          </Card>

          <div className="mt-6">
            <Field
              label="Suggested list price"
              type="number"
              inputMode="numeric"
              prefix="₦"
              value={listPrice}
              onChange={(e) => setListPrice(e.target.value === "" ? "" : Number(e.target.value))}
            />
            {listPrice !== "" && (
              <p className="mt-2 text-xs text-ink-muted">
                Margin ₦{(Number(listPrice) - Number(sale.offer.kobo) / 100).toLocaleString("en-NG")}
              </p>
            )}
          </div>

          <div className="pt-7">
            <Button
              block
              size="lg"
              disabled={listPrice === "" || Number(listPrice) <= 0}
              loading={submit.isPending}
              onClick={() => submit.mutate(true)}
            >
              Publish to marketplace
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
