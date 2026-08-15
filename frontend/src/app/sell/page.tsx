"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BatteryMedium,
  Calendar,
  Camera,
  CheckCircle2,
  Headphones,
  Home as HomeIcon,
  Laptop,
  Loader2,
  MapPin,
  Plus,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  TriangleAlert,
  Watch,
  Wallet,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { api, ApiError, uploadPhotos, type Quote } from "@/lib/api";
import { Button, Card, ChoiceCard, Field, PageHeading, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";

// Severity, not decoration — the icon should tell you which end of "how
// beat up is it" you're picking before you've read a word of the label.
const GRADES = [
  { value: "MINT", title: "Flawless", description: "No marks at all", Icon: Sparkles },
  { value: "EXCELLENT", title: "Light marks", description: "Only visible at an angle", Icon: ShieldCheck },
  { value: "GOOD", title: "Scratched", description: "Clearly visible scratches", Icon: TriangleAlert },
  { value: "FAIR", title: "Cracked", description: "Chips or cracks present", Icon: XCircle },
] as const;

const CATEGORY_ICON: Record<string, typeof Smartphone> = {
  phone: Smartphone,
  laptop: Laptop,
  wearable: Watch,
  audio: Headphones,
};

const PHOTO_SLOTS = ["Front", "Back", "Screen on", "Sides"] as const;

const WINDOWS = [
  { value: "morning", label: "Morning", hint: "9am – 12pm", hour: 9 },
  { value: "afternoon", label: "Afternoon", hint: "12pm – 4pm", hour: 12 },
] as const;

type Step = "device" | "condition" | "photos" | "offer" | "pickup" | "confirmed";

function nextDays(count: number) {
  const days = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

export default function SellPage() {
  const [step, setStep] = useState<Step>("device");
  const [productId, setProductId] = useState("");
  const [ageMonths, setAgeMonths] = useState(18);
  const [grade, setGrade] = useState<string>("EXCELLENT");
  const [battery, setBattery] = useState<number | "">("");
  const [hasBox, setHasBox] = useState(false);
  const [hasCharger, setHasCharger] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<"DIRECT" | "COMMISSION">("DIRECT");
  const [pickupType, setPickupType] = useState<"pickup" | "dropoff">("pickup");
  const [pickupDay, setPickupDay] = useState<Date | null>(null);
  const [pickupWindow, setPickupWindow] = useState<(typeof WINDOWS)[number]["value"]>("morning");
  const [saleRef, setSaleRef] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => api.catalog.products(),
  });

  const selectedProduct = products.data?.products.find((p) => p.id === productId);

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

  const createSale = useMutation({
    mutationFn: () =>
      api.sales.create({
        productId,
        ageMonths,
        grade,
        batteryHealth: battery === "" ? undefined : battery,
        hasOriginalBox: hasBox,
        hasCharger,
        isCracked: grade === "FAIR",
        mode,
        photos: Object.values(photos),
        pickupType,
        pickupAt: (() => {
          if (pickupType !== "pickup" || !pickupDay) return undefined;
          const withTime = new Date(pickupDay);
          withTime.setHours(WINDOWS.find((w) => w.value === pickupWindow)!.hour, 0, 0, 0);
          return withTime.toISOString();
        })(),
        pickupAddress: pickupType === "dropoff" ? "14 Allen Avenue, Ikeja, Lagos" : undefined,
      }),
    onSuccess: (data) => {
      setSaleRef(data.sale.reference);
      setStep("confirmed");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not book that sale");
    },
  });

  async function onPickPhoto(slot: string, file: File | undefined) {
    if (!file) return;
    setUploading((u) => ({ ...u, [slot]: true }));
    try {
      const [url] = await uploadPhotos([file]);
      setPhotos((p) => ({ ...p, [slot]: url! }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not upload that photo. Try another.");
    } finally {
      setUploading((u) => ({ ...u, [slot]: false }));
    }
  }

  const stepOrder: Step[] = ["device", "condition", "photos", "offer", "pickup", "confirmed"];
  const stepIndex = stepOrder.indexOf(step);
  const wizardSteps = 5; // "confirmed" is a result screen, not a numbered step

  return (
    // Capped, not full-width — a wizard form stretched across a wide desktop
    // container turns every field, choice card and button into an oversized
    // strip. Centring a comfortable column here reads as intentional in a
    // way "just let it stretch" doesn't.
    <div className="animate-fade-up lg:mx-auto lg:max-w-xl">
      {step !== "confirmed" && (
        <>
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
                onClick={() => setStep(stepOrder[stepIndex - 1]!)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-surface"
                aria-label="Back"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden />
              </button>
            )}
          </div>

          <div
            className="flex gap-1.5 px-6 pt-5"
            role="progressbar"
            aria-valuenow={stepIndex + 1}
            aria-valuemin={1}
            aria-valuemax={wizardSteps}
          >
            {Array.from({ length: wizardSteps }, (_, i) => (
              <span
                key={i}
                className={cn("h-[3px] flex-1 rounded-full", i <= stepIndex ? "bg-coral" : "bg-hairline")}
              />
            ))}
          </div>
          <p className="px-6 pt-3 text-[11px] text-ink-faint">
            Step {stepIndex + 1} of {wizardSteps}
          </p>
        </>
      )}

      {step === "device" && (
        <>
          <PageHeading sub="Pick your device to get an instant offer">
            What are you selling
          </PageHeading>

          <div className="space-y-2.5 px-6">
            {products.isLoading &&
              [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[78px]" />)}

            {products.data?.products.map((p) => {
              const CategoryIcon = CATEGORY_ICON[p.category] ?? Smartphone;
              return (
                <ChoiceCard
                  key={p.id}
                  selected={productId === p.id}
                  icon={<CategoryIcon className="h-5 w-5" strokeWidth={1.5} aria-hidden />}
                  title={[p.brand, p.model, p.variant].filter(Boolean).join(" ")}
                  description={`${p.category} · new from ${p.baseNew.display}`}
                  onSelect={() => setProductId(p.id)}
                />
              );
            })}
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
                icon={<g.Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />}
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
            {PHOTO_SLOTS.map((label) => {
              const photo = photos[label];
              const isUploading = uploading[label];
              return (
                <button
                  key={label}
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputs.current[label]?.click()}
                  className={cn(
                    "relative flex aspect-[4/5] flex-col items-center justify-center gap-2 overflow-hidden rounded-card text-xs",
                    photo
                      ? "text-white"
                      : "border border-dashed border-ink-faint text-ink-muted",
                  )}
                >
                  {isUploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  ) : photo ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- remote upload URL, not a static import next/image can optimise */}
                      <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      <span className="relative rounded-pill bg-ink/60 px-2 py-1 backdrop-blur">{label}</span>
                    </>
                  ) : (
                    <>
                      <Camera className="h-5 w-5" aria-hidden />
                      {label}
                    </>
                  )}
                  <input
                    ref={(el) => {
                      fileInputs.current[label] = el;
                    }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => onPickPhoto(label, e.target.files?.[0])}
                  />
                </button>
              );
            })}
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
              disabled={
                Object.keys(photos).length < PHOTO_SLOTS.length || Object.values(uploading).some(Boolean)
              }
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
            <Card className="border-0 bg-coral-soft p-6">
              <p className="text-[11px] font-bold uppercase tracking-wide text-coral-dark">
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
              <button type="button" onClick={() => setMode("DIRECT")} className="block w-full text-left">
                <Card className={cn("p-4", mode === "DIRECT" ? "border-coral" : "border-hairline")}>
                  <div className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-coral" aria-hidden />
                    <span className="text-sm font-bold text-ink">Sell it to us</span>
                  </div>
                  <p className="mt-2 text-xs text-ink-muted">We inspect it, then pay the same day.</p>
                  <p className="tabular mt-1.5 text-xs font-bold text-ink">
                    {quote.offer.display} guaranteed
                  </p>
                </Card>
              </button>

              <button type="button" onClick={() => setMode("COMMISSION")} className="block w-full text-left">
                <Card className={cn("p-4", mode === "COMMISSION" ? "border-coral" : "border-hairline")}>
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
              </button>
            </div>
          </section>

          <div className="px-6 pt-7">
            <Button block size="lg" onClick={() => setStep("pickup")}>
              Continue with {mode === "DIRECT" ? "Sell direct" : "List for me"}
            </Button>
          </div>
        </>
      )}

      {step === "pickup" && (
        <>
          <PageHeading sub="Choose how we verify your device">Inspection</PageHeading>

          <div className="space-y-2.5 px-6">
            <ChoiceCard
              selected={pickupType === "pickup"}
              icon={<HomeIcon className="h-5 w-5" strokeWidth={1.5} aria-hidden />}
              title="We come to you"
              description="Free pickup within Lagos · inspected on the spot"
              onSelect={() => setPickupType("pickup")}
            />
            <ChoiceCard
              selected={pickupType === "dropoff"}
              icon={<MapPin className="h-5 w-5" strokeWidth={1.5} aria-hidden />}
              title="Drop at our Ikeja hub"
              description="14 Allen Avenue · Mon–Sat, 9am–6pm"
              onSelect={() => setPickupType("dropoff")}
            />
          </div>

          {pickupType === "pickup" && (
            <div className="px-6 pt-6">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                <Calendar className="h-3.5 w-3.5" aria-hidden />
                Pick a day
              </p>
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {nextDays(6).map((d) => {
                  const selected = pickupDay?.toDateString() === d.toDateString();
                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      onClick={() => setPickupDay(d)}
                      className={cn(
                        "flex shrink-0 flex-col items-center rounded-card px-4 py-2.5 text-sm font-semibold",
                        selected ? "bg-coral text-white" : "bg-surface text-ink-muted",
                      )}
                    >
                      {d.toLocaleDateString("en-NG", { weekday: "short" })}
                      <span className="tabular text-xs font-normal opacity-80">
                        {d.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="mt-5 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                Time window
              </p>
              <div className="mt-2 flex gap-2.5">
                {WINDOWS.map((w) => (
                  <button
                    key={w.value}
                    type="button"
                    onClick={() => setPickupWindow(w.value)}
                    className={cn(
                      "flex-1 rounded-card px-4 py-3 text-left",
                      pickupWindow === w.value ? "bg-coral-soft" : "bg-surface",
                    )}
                  >
                    <span
                      className={cn(
                        "block text-sm font-bold",
                        pickupWindow === w.value ? "text-coral-dark" : "text-ink",
                      )}
                    >
                      {w.label}
                    </span>
                    <span className="block text-xs text-ink-muted">{w.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="px-6 pt-7">
            <Button
              block
              size="lg"
              disabled={pickupType === "pickup" && !pickupDay}
              loading={createSale.isPending}
              onClick={() => createSale.mutate()}
            >
              Confirm pickup
            </Button>
          </div>
        </>
      )}

      {step === "confirmed" && saleRef && quote && selectedProduct && (
        <div className="flex flex-col items-center px-6 pt-10 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-mint-soft text-mint">
            <CheckCircle2 className="h-8 w-8" aria-hidden />
          </span>
          <h1 className="mt-5 font-display text-display-md text-ink">
            {pickupType === "pickup" ? "Pickup booked" : "Drop-off confirmed"}
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            Ref #{saleRef}
            {pickupType === "pickup" && pickupDay
              ? ` · ${pickupDay.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" })}, ${WINDOWS.find((w) => w.value === pickupWindow)?.hint}`
              : ""}
          </p>

          <Card className="mt-6 w-full border-0 p-5 text-left">
            <p className="text-sm font-bold text-ink">
              {[selectedProduct.brand, selectedProduct.model, selectedProduct.variant].filter(Boolean).join(" ")}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {mode === "DIRECT" ? "Sell direct" : "List for me"} · {GRADES.find((g) => g.value === grade)?.title}
              {battery !== "" ? ` · ${battery}%` : ""}
            </p>
            <p className="tabular mt-2 text-lg font-bold text-ink">{quote.offer.display}</p>
            <p className="mt-1 text-xs text-ink-faint">Final amount confirmed after inspection</p>
          </Card>

          <div className="mt-6 w-full space-y-4 text-left">
            <h2 className="text-sm font-bold text-ink">What happens next</h2>
            <div className="flex gap-3">
              <BatteryMedium className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-ink">Our agent arrives</p>
                <p className="text-xs text-ink-muted">
                  {pickupType === "pickup" ? "At the time you booked" : "When you drop it at our hub"}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-ink">Device inspected</p>
                <p className="text-xs text-ink-muted">Takes about 10 minutes on the spot</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-ink">You get paid</p>
                <p className="text-xs text-ink-muted">
                  {mode === "DIRECT" ? "Bank transfer the same day" : "As soon as it sells"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 w-full">
            <Button asChild block size="lg">
              <Link href="/sell/mine">Track this sale</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
