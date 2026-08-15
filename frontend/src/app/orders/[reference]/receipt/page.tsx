"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { Button, Card, Skeleton } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export default function ReceiptPage() {
  const { reference } = useParams<{ reference: string }>();
  const router = useRouter();
  const { status } = useAuth();
  const [downloading, setDownloading] = useState(false);

  async function downloadPdf() {
    setDownloading(true);
    try {
      const blob = await api.orders.receiptPdf(reference);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${reference}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not download the receipt");
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    if (status === "guest") router.replace(`/login?next=/orders/${reference}/receipt`);
  }, [status, reference, router]);

  const query = useQuery({
    queryKey: ["receipt", reference],
    queryFn: () => api.orders.receipt(reference),
    enabled: status === "authenticated",
  });

  const receipt = query.data?.receipt;

  if (status !== "authenticated" || query.isLoading || !receipt) {
    return (
      <div className="space-y-3 px-6 pt-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-xl">
      <div className="flex flex-col items-center px-6 pt-8 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-mint-soft text-mint">
          <CheckCircle2 className="h-7 w-7" aria-hidden />
        </span>
        <h1 className="mt-4 font-display text-display-md text-ink">
          {receipt.paid ? "Payment successful" : "Order placed"}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Order #{receipt.reference} · {formatDate(receipt.issuedAt)}
        </p>
      </div>

      <div className="px-6 pt-6">
        <Card className="border-0 p-5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Digital receipt</p>

          <div className="mt-3 divide-y divide-hairline">
            {receipt.lines.map((line, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                <span className="text-sm text-ink-muted">
                  {line.description}
                  {line.quantity > 1 && ` × ${line.quantity}`}
                </span>
                <span className="tabular shrink-0 text-sm font-semibold text-ink">{line.amount.display}</span>
              </div>
            ))}

            {receipt.tradeInCredit && (
              <div className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm text-ink-muted">Trade-in credit</span>
                <span className="tabular text-sm font-semibold text-mint">{receipt.tradeInCredit.display}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-sm text-ink-muted">Delivery</span>
              <span className="tabular text-sm font-semibold text-ink">{receipt.delivery.display}</span>
            </div>

            <div className="flex items-center justify-between gap-3 pt-3">
              <span className="text-sm font-bold text-ink">Total paid</span>
              <span className="tabular font-display text-lg text-ink">{receipt.total.display}</span>
            </div>
          </div>
        </Card>

        {receipt.deliverTo && (
          <p className="mt-4 text-center text-xs text-ink-muted">Delivering to {receipt.deliverTo}</p>
        )}
      </div>

      <div className="space-y-2.5 px-6 pt-6">
        <Button asChild block size="lg">
          <Link href={`/orders/${reference}`}>Track order</Link>
        </Button>
        <Button variant="outline" block size="lg" loading={downloading} onClick={downloadPdf}>
          <Download className="h-4 w-4" aria-hidden />
          Download PDF
        </Button>
      </div>
    </div>
  );
}
