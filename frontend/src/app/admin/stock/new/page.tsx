"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, uploadPhotos } from "@/lib/api";
import { Button, Field, PageHeading } from "@/components/ui";
import { cn } from "@/lib/utils";

const TIERS = [
  { value: "NEW", label: "New" },
  { value: "UK_USED", label: "UK used" },
  { value: "NG_USED", label: "Nigeria used" },
] as const;

export default function AdminAddListingPage() {
  const router = useRouter();

  const [productId, setProductId] = useState("");
  const [tier, setTier] = useState<(typeof TIERS)[number]["value"]>("NEW");
  const [costNaira, setCostNaira] = useState<number | "">("");
  const [priceNaira, setPriceNaira] = useState<number | "">("");
  const [vendorId, setVendorId] = useState("");
  const [stockCount, setStockCount] = useState(1);
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => api.catalog.products(),
  });
  const vendors = useQuery({
    queryKey: ["admin", "vendors"],
    queryFn: () => api.admin.vendors(),
  });

  const margin = useMemo(() => {
    if (costNaira === "" || priceNaira === "" || priceNaira <= 0) return null;
    const kobo = (priceNaira - costNaira) * 100;
    const pct = ((priceNaira - costNaira) / priceNaira) * 100;
    return { naira: priceNaira - costNaira, pct: pct.toFixed(1), kobo };
  }, [costNaira, priceNaira]);

  const create = useMutation({
    mutationFn: (publish: boolean) =>
      api.admin.createListing({
        productId,
        tier,
        priceKobo: Number(priceNaira) * 100,
        costKobo: costNaira === "" ? undefined : Number(costNaira) * 100,
        vendorId: vendorId || undefined,
        stockCount,
        photos: photo ? [photo] : [],
        publish,
      }),
    onSuccess: (data, publish) => {
      toast.success(publish ? `Published ${data.listing.reference}` : "Saved as draft");
      router.push("/admin/stock");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not save that listing");
    },
  });

  async function onPickPhoto(file: File | undefined) {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const [url] = await uploadPhotos([file]);
      setPhoto(url!);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not upload that photo");
    } finally {
      setUploadingPhoto(false);
    }
  }

  const valid = productId && priceNaira !== "" && Number(priceNaira) > 0;

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-xl">
      <div className="px-6 pt-4">
        <button
          type="button"
          onClick={() => router.push("/admin/stock")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <PageHeading>Add listing</PageHeading>

      <div className="space-y-5 px-6">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-ink-muted">Photo</label>
          <label className="mt-2 flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded-card border border-dashed border-ink-faint bg-surface">
            {uploadingPhoto ? (
              <Loader2 className="h-5 w-5 animate-spin text-ink-muted" aria-hidden />
            ) : photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote upload URL, not a static import next/image can optimise
              <img src={photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-2 text-xs text-ink-muted">
                <Camera className="h-5 w-5" aria-hidden />
                Add a photo
              </span>
            )}
            <input
              type="file"
              accept="image/*"
              disabled={uploadingPhoto}
              className="hidden"
              onChange={(e) => onPickPhoto(e.target.files?.[0])}
            />
          </label>
        </div>

        <div className="space-y-2">
          <label className="block text-[11px] font-bold uppercase tracking-wide text-ink-muted">Product</label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="h-12 w-full rounded-card border border-hairline bg-canvas px-4 text-sm text-ink outline-none focus:border-coral"
          >
            <option value="">Select a product</option>
            {products.data?.products.map((p) => (
              <option key={p.id} value={p.id}>
                {[p.brand, p.model, p.variant].filter(Boolean).join(" ")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-ink-muted">Tier</label>
          <div className="mt-2 flex gap-2">
            {TIERS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTier(t.value)}
                className={cn(
                  "rounded-pill px-4 py-2 text-sm font-semibold",
                  tier === t.value ? "bg-coral text-white" : "bg-surface text-ink-muted",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Vendor cost"
            type="number"
            inputMode="numeric"
            prefix="₦"
            value={costNaira}
            onChange={(e) => setCostNaira(e.target.value === "" ? "" : Number(e.target.value))}
          />
          <Field
            label="Sell price"
            type="number"
            inputMode="numeric"
            prefix="₦"
            value={priceNaira}
            onChange={(e) => setPriceNaira(e.target.value === "" ? "" : Number(e.target.value))}
            required
          />
        </div>

        {margin && (
          <p className="text-xs text-ink-muted">
            Your margin{" "}
            <span className="font-bold text-mint">
              ₦{margin.naira.toLocaleString("en-NG")} · {margin.pct}%
            </span>
          </p>
        )}

        <div className="space-y-2">
          <label className="block text-[11px] font-bold uppercase tracking-wide text-ink-muted">
            Vendor (optional)
          </label>
          <select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            className="h-12 w-full rounded-card border border-hairline bg-canvas px-4 text-sm text-ink outline-none focus:border-coral"
          >
            <option value="">Own stock</option>
            {vendors.data?.vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.businessName}
              </option>
            ))}
          </select>
        </div>

        <Field
          label="Stock"
          type="number"
          inputMode="numeric"
          min={0}
          value={stockCount}
          onChange={(e) => setStockCount(Number(e.target.value))}
        />

        <div className="flex gap-3 pb-4">
          <Button
            variant="outline"
            className="flex-1"
            disabled={!valid || uploadingPhoto}
            loading={create.isPending && create.variables === false}
            onClick={() => create.mutate(false)}
          >
            Save draft
          </Button>
          <Button
            className="flex-1"
            disabled={!valid || uploadingPhoto}
            loading={create.isPending && create.variables === true}
            onClick={() => create.mutate(true)}
          >
            Publish
          </Button>
        </div>
      </div>
    </div>
  );
}
