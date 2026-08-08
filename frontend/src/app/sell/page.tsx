"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, BatteryMedium, Camera, Plus, ShieldCheck, Store, Wallet } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { api, ApiError, type Quote } from "@/lib/api";
import { Button, Card, ChoiceCard, Field, PageHeading, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";

const GRADES = [
  { value: "MINT", title: "Flawless", description: "No marks at all" },
  { value: "EXCELLENT", title: "Light marks", description: "Only visible at an angle" },
  { value: "GOOD", title: "Scratched", description: "Clearly visible scratches" },
  { value: "FAIR", title: "Cracked", description: "Chips or cracks present" },
] as const;

type Step = "device" | "condition" | "photos" | "offer";

export default function SellPage() {
  const [step, setStep] = useState<Step>("device");
  const [productId, setProductId] = useState("");
  const [ageMonths, setAgeMonths] = useState(18);
  const [grade, setGrade] = useState<string>("EXCELLENT");
  const [battery, setBattery] = useState<number | "">("");
  const [hasBox, setHasBox] = useState(false);
  const [hasCharger, setHasCharger] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => api.catalog.products(),
  });

  const getQuote = useMutation({
    mutationFn: () =>
      api.sales.quote({
        productId,
        ageMonths,
        grade,
        batteryHealth: battery === "" ? undefined : battery,
        hasOriginalBox: hasBox,
        hasCharger,
        isCracked: grade === "FAIR",
      }),
    onSuccess: (data) => {
      setQuote(data.quote);
      setStep("offer");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not price that device");
    },
  });

  const stepIndex = ["device", "condition", "photos", "offer"].indexOf(step);

  return (
    <div className="animate-fade-up">
      <div className="flex items-center gap-3 px-6 pt-4">
        {step === "device" ? (
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setStep(["device", "condition", "photos", "offer"][stepIndex - 1] as Step)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </button>
        )}
      </div>

      <div className="flex gap-1.5 px-6 pt-5" role="progressbar" aria-valuenow={stepIndex + 1} aria-valuemin={1} aria-valuemax={4}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn("h-[3px] flex-1 rounded-full", i <= stepIndex ? "bg-ink" : "bg-hairline")}
          />
        ))}
      </div>
      <p className="px-6 pt-3 text-[11px] text-ink-faint">Step {stepIndex + 1} of 4</p>

      {step === "device" && (
        <>
          <PageHeading sub="Pick your device to get an instant offer">
            What are you selling
          </PageHeading>

          <div className="space-y-2.5 px-6">
            {products.isLoading &&
              [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[78px]" />)}

            {products.data?.products.map((p) => (
              <ChoiceCard
                key={p.id}
                selected={productId === p.id}
                title={[p.brand, p.model, p.variant].filter(Boolean).join(" ")}
                description={`${p.category} · new from ${p.baseNew.display}`}
                onSelect={() => setProductId(p.id)}
              />
            ))}
          </div>

          <div className="px-6 pt-6">
            <Button block size="lg" disabled={!productId} onClick={() => setStep("condition")}>
              Continue
            </Button>
          </div>
        </>
      )}

      {step === "condition" && (
        <>
          <PageHeading sub="Be straight with us. Everything gets checked before you are paid.">
            Condition
          </PageHeading>

          <div className="space-y-2.5 px-6">
            {GRADES.map((g) => (
              <ChoiceCard
                key={g.value}
                selected={grade === g.value}
                title={g.title}
                description={g.description}
                onSelect={() => setGrade(g.value)}
              />
            ))}
          </div>

          <div className="space-y-4 px-6 pt-6">
            <Field
              label="How old is it, in months"
              type="number"
              inputMode="numeric"
              min={0}
              max={240}
              value={ageMonths}
              onChange={(e) => setAgeMonths(Number(e.target.value))}
              hint="A rough figure is fine"
            />

            <Field
              label="Battery health"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              placeholder="87"
              value={battery}
              onChange={(e) => setBattery(e.target.value === "" ? "" : Number(e.target.value))}
              hint="Settings, then Battery, then Battery Health. Leave blank if you cannot find it."
            />

            <div className="flex gap-2">
              <Button
                variant={hasBox ? "primary" : "outline"}
                size="sm"
                onClick={() => setHasBox((v) => !v)}
              >
                Original box
              </Button>
              <Button
                variant={hasCharger ? "primary" : "outline"}
                size="sm"
                onClick={() => setHasCharger((v) => !v)}
              >
                Charger
              </Button>
            </div>
          </div>

          <div className="px-6 pt-6">
            <Button block size="lg" onClick={() => setStep("photos")}>
              Continue
            </Button>
          </div>
        </>
      )}

      {step === "photos" && (
        <>
          <PageHeading sub="Four angles so buyers know what they are getting">
            Add photos
          </PageHeading>

          <div className="grid grid-cols-2 gap-3 px-6">
            {["Front", "Back", "Screen on", "Sides"].map((label, i) => (
              <button
                key={label}
                type="button"
                className={cn(
                  "flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-card text-xs",
                  i < 2
                    ? "bg-surface text-ink-muted"
                    : "border border-dashed border-ink-faint text-ink-muted",
                )}
              >
                {i < 2 ? (
                  <Camera className="h-5 w-5" aria-hidden />
                ) : (
                  <Plus className="h-5 w-5" aria-hidden />
                )}
                {label}
              </button>
            ))}
          </div>

          {/* Said before the pickup is booked, not after. Managing this
              expectation up front is what stops the argument at the door. */}
          <div className="px-6 pt-6">
            <Card className="flex gap-3 border-0 bg-amber-soft p-4">
              <ShieldCheck className="h-5 w-5 shrink-0 text-amber" aria-hidden />
              <p className="text-xs leading-relaxed text-ink-muted">
                <span className="font-bold text-ink">Photos get checked at inspection.</span> If the
                device does not match them, we revise the offer before any money moves. You can walk
                away at that point.
              </p>
            </Card>
          </div>

          <div className="px-6 pt-6">
            <Button
              block
              size="lg"
              loading={getQuote.isPending}
              onClick={() => getQuote.mutate()}
            >
              See my offer
            </Button>
          </div>
        </>
      )}

      {step === "offer" && quote && (
        <>
          <div className="px-6 pt-6">
            <Card className="border-0 bg-teal-soft p-6">
              <p className="text-[11px] font-bold uppercase tracking-wide text-teal">
                Your instant offer
              </p>
              <p className="tabular mt-3 font-display text-[2.25rem] leading-none text-ink">
                {quote.offer.display}
              </p>
              <p className="mt-3 text-xs text-ink-muted">
                Held for you until {new Date(quote.validUntil).toLocaleDateString("en-NG", {
                  day: "numeric",
                  month: "long",
                })}
              </p>
            </Card>
          </div>

          {/* The breakdown is the whole trust argument. An offer you can check
              line by line gets argued with far less than a bare number. */}
          <section className="px-6 pt-7">
            <h2 className="text-sm font-bold text-ink">How we got there</h2>
            <ul className="mt-3 space-y-2.5">
              {quote.breakdown.map((line) => (
                <li key={line.label} className="flex items-baseline justify-between gap-4">
                  <span className="text-xs text-ink-muted">{line.label}</span>
                  <span className="tabular shrink-0 text-xs font-semibold text-ink">
                    {line.amount.display}
                  </span>
                </li>
              ))}
            </ul>
            {quote.confidence !== "high" && (
              <p className="mt-4 text-xs text-ink-muted">
                Filling in battery health usually moves this figure up.
              </p>
            )}
          </section>

          <section className="px-6 pt-8">
            <h2 className="text-sm font-bold text-ink">How would you like to sell?</h2>

            <div className="mt-3 space-y-3">
              <Card className="border-teal p-4">
                <div className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-teal" aria-hidden />
                  <span className="text-sm font-bold text-ink">Sell it to us</span>
                </div>
                <p className="mt-2 text-xs text-ink-muted">
                  We inspect it, then pay the same day.
                </p>
                <p className="tabular mt-1.5 text-xs font-bold text-ink">
                  {quote.offer.display} guaranteed
                </p>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-2">
                  <Store className="h-5 w-5 text-ink-muted" aria-hidden />
                  <span className="text-sm font-bold text-ink">List it for me</span>
                </div>
                <p className="mt-2 text-xs text-ink-muted">
                  We list it and take 15% when it sells. Takes longer, pays more.
                </p>
                <p className="tabular mt-1.5 text-xs font-bold text-ink">
                  Around {quote.suggestedList.display} before our cut
                </p>
              </Card>
            </div>
          </section>

          <div className="space-y-3 px-6 pt-7">
            <Button block size="lg">
              Sell direct, get paid on pickup
            </Button>
            <Button block size="lg" variant="outline">
              List for me
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
