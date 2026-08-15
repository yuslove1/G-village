import PDFDocument from "pdfkit";
import type { MoneyDto } from "./serialize.js";

export interface ReceiptData {
  reference: string;
  issuedAt: Date;
  paid: boolean;
  lines: Array<{ description: string; quantity: number; amount: MoneyDto }>;
  tradeInCredit: MoneyDto | null;
  delivery: MoneyDto;
  total: MoneyDto;
  deliverTo: string | null;
}

/** Renders the same receipt shown at /orders/:reference/receipt as a PDF. */
export function renderReceiptPdf(receipt: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).fillColor("#141413").text("Gadgetvillage");
    doc.fontSize(10).fillColor("#73726C").text("Digital receipt");
    doc.moveDown(1.5);

    doc.fontSize(13).fillColor("#141413").text(`Order ${receipt.reference}`);
    doc.fontSize(10).fillColor("#73726C").text(`Issued ${receipt.issuedAt.toLocaleString("en-NG")}`);
    doc.fillColor(receipt.paid ? "#1FAA71" : "#C23A3A").text(receipt.paid ? "Paid" : "Unpaid");
    doc.moveDown(1);

    doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - 56, doc.y).strokeColor("#EAE8F2").stroke();
    doc.moveDown(0.75);

    doc.fillColor("#141413").fontSize(11);
    for (const line of receipt.lines) {
      doc.text(`${line.description}${line.quantity > 1 ? ` ×${line.quantity}` : ""}`, { continued: true });
      doc.text(line.amount.display, { align: "right" });
    }

    doc.moveDown(0.5);
    if (receipt.tradeInCredit) {
      doc.fillColor("#3A3A37").text("Trade-in credit", { continued: true });
      doc.text(receipt.tradeInCredit.display, { align: "right" });
    }
    doc.fillColor("#3A3A37").text("Delivery", { continued: true });
    doc.text(receipt.delivery.display, { align: "right" });

    doc.moveDown(0.5);
    doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - 56, doc.y).strokeColor("#EAE8F2").stroke();
    doc.moveDown(0.5);

    doc.fontSize(13).fillColor("#141413").text("Total", { continued: true });
    doc.text(receipt.total.display, { align: "right" });

    if (receipt.deliverTo) {
      doc.moveDown(1.5);
      doc.fontSize(9).fillColor("#73726C").text(`Deliver to: ${receipt.deliverTo}`);
    }

    doc.end();
  });
}
