
"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  ArrowLeft,
  Download,
  Loader2,
  AlertCircle,
  FileText,
} from "lucide-react";

type QuoteDetails = {
  quote_id: string;
  version: number;
  status: string;
  gst_percent: number;
  annual_value: number;
  created_at: string;
  rfq_number: string;
  customer_name: string;
  part_name: string;
  part_number: string;
  material: string;
  volume: number;
  material_cost: number;
  scrap_cost: number;
  processing_cost: number;
  overhead_cost: number;
  packing_cost: number;
  freight_cost: number;
  total_cost: number;
  margin_percent: number;
  selling_price: number;
  gst_amount: number;
  price_including_gst: number;
  approval_comments: string | null;
  reviewed_at: string | null;
};

const formatINR = (value: number) =>
  `INR ${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)}`;

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not available";

// Main PDF page content
function QuotePdfContent() {
  const params = useParams();
  const router = useRouter();
  const quoteId = params.id as string;

  const [quote, setQuote] = useState<QuoteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadQuote() {
      try {
        setLoading(true);
        setError("");

        const supabase = createClient();

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          router.replace("/");
          return;
        }

        const { data, error: fetchError } = await supabase.rpc(
          "get_approved_quote_details",
          { p_quote_id: quoteId }
        );

        if (fetchError) throw fetchError;
        if (!data) {
          throw new Error("Approved quote details were not found.");
        }

        if (!active) return;

        setQuote(data as QuoteDetails);
      } catch (err) {
        console.error("Quote details loading error:", err);

        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load approved quote details."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    if (quoteId) void loadQuote();

    return () => {
      active = false;
    };
  }, [quoteId, router]);

  function downloadPdf() {
    if (!quote) return;

    setDownloading(true);
    setError("");

    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const left = 15;
      const right = pageWidth - 15;
      const contentWidth = right - left;

      // Header
      doc.setFillColor(23, 41, 35);
      doc.rect(0, 0, pageWidth, 38, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(21);
      doc.text("QUOTEFORGE", left, 17);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("MANUFACTURING QUOTATION", left, 26);

      doc.setFont("helvetica", "bold");
      doc.text(`QUOTE v${quote.version}`, right, 17, {
        align: "right",
      });
      doc.text("APPROVED", right, 26, {
        align: "right",
      });

      // Quotation details
      doc.setTextColor(25, 35, 31);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("Quotation details", left, 51);

      autoTable(doc, {
        startY: 57,
        margin: { left, right: 15 },
        theme: "grid",
        head: [["Field", "Details", "Field", "Details"]],
        body: [
          ["RFQ number", quote.rfq_number, "Customer", quote.customer_name],
          ["Part name", quote.part_name, "Part number", quote.part_number],
          [
            "Material",
            quote.material,
            "Annual volume",
            formatNumber(quote.volume),
          ],
          [
            "Quote version",
            `v${quote.version}`,
            "Created",
            formatDate(quote.created_at),
          ],
        ],
        styles: {
          font: "helvetica",
          fontSize: 8.5,
          cellPadding: 2.4,
          textColor: [35, 45, 40],
          overflow: "linebreak",
          valign: "middle",
        },
        headStyles: {
          fillColor: [23, 41, 35],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        columnStyles: {
          0: { fontStyle: "bold", cellWidth: 30 },
          1: { cellWidth: 55 },
          2: { fontStyle: "bold", cellWidth: 30 },
          3: { cellWidth: "auto" },
        },
      });

      let cursorY =
        (doc as jsPDF & { lastAutoTable?: { finalY: number } })
          .lastAutoTable?.finalY ?? 100;

      // Cost breakdown
      cursorY += 12;

      if (cursorY > pageHeight - 90) {
        doc.addPage();
        cursorY = 20;
      }

      doc.setTextColor(25, 35, 31);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("Cost breakdown (per part)", left, cursorY);

      autoTable(doc, {
        startY: cursorY + 5,
        margin: { left, right: 15 },
        theme: "striped",
        head: [["Cost component", "Amount"]],
        body: [
          ["Material cost", formatINR(quote.material_cost)],
          ["Scrap cost", formatINR(quote.scrap_cost)],
          ["Processing cost", formatINR(quote.processing_cost)],
          ["Overhead", formatINR(quote.overhead_cost)],
          ["Packing", formatINR(quote.packing_cost)],
          ["Freight", formatINR(quote.freight_cost)],
          ["Total manufacturing cost", formatINR(quote.total_cost)],
          [
            `Selling price (margin ${quote.margin_percent}%)`,
            formatINR(quote.selling_price),
          ],
          [`GST (${quote.gst_percent}%)`, formatINR(quote.gst_amount)],
          [
            "Selling price including GST",
            formatINR(quote.price_including_gst),
          ],
        ],
        styles: {
          font: "helvetica",
          fontSize: 8.5,
          cellPadding: 2,
          textColor: [45, 55, 50],
          overflow: "linebreak",
        },
        headStyles: {
          fillColor: [23, 41, 35],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        alternateRowStyles: {
          fillColor: [244, 247, 245],
        },
        columnStyles: {
          0: { cellWidth: 115 },
          1: { halign: "right", cellWidth: "auto" },
        },
      });

      cursorY =
        (doc as jsPDF & { lastAutoTable?: { finalY: number } })
          .lastAutoTable?.finalY ?? cursorY + 75;

      // Keep annual value and approval information together.
      const commentLines = quote.approval_comments
        ? doc.splitTextToSize(
            `Review comments: ${quote.approval_comments}`,
            contentWidth
          )
        : [];

      const approvalBlockHeight = 19 + commentLines.length * 4.5;
      const annualBlockHeight = 24;
      const combinedHeight =
        6 + annualBlockHeight + 5 + approvalBlockHeight;

      cursorY += 6;

      if (cursorY + combinedHeight > pageHeight - 22) {
        doc.addPage();
        cursorY = 20;
      }

      // Annual quote value
      doc.setFillColor(235, 247, 240);
      doc.roundedRect(
        left,
        cursorY,
        contentWidth,
        annualBlockHeight,
        3,
        3,
        "F"
      );

      doc.setTextColor(23, 41, 35);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(
        "ANNUAL QUOTE VALUE (EXCLUDING GST)",
        left + 5,
        cursorY + 8
      );

      doc.setFontSize(12);
      doc.text(
        formatINR(quote.annual_value),
        left + 5,
        cursorY + 18
      );

      // Approval details
      cursorY += annualBlockHeight + 5;

      doc.setTextColor(25, 35, 31);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Approval information", left, cursorY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(
        `Status: ${quote.status.toUpperCase()}`,
        left,
        cursorY + 5.5
      );

      doc.text(
        `Reviewed at: ${formatDate(quote.reviewed_at)}`,
        left,
        cursorY + 11
      );

      if (commentLines.length > 0) {
        doc.text(commentLines, left, cursorY + 16);
      }

      // Footer
      const pageCount = doc.getNumberOfPages();

      for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setDrawColor(220, 226, 222);
        doc.line(left, pageHeight - 17, right, pageHeight - 17);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(110, 120, 115);

        doc.text(
          "QuoteForge | GST shown separately | Generated electronically",
          left,
          pageHeight - 10
        );

        doc.text(`${page} / ${pageCount}`, right, pageHeight - 10, {
          align: "right",
        });
      }

      doc.save(
        `QuoteForge-${quote.rfq_number}-v${quote.version}.pdf`
      );
    } catch (err) {
      console.error("PDF generation error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to generate quotation PDF."
      );
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f7f6]">
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 size={22} className="animate-spin text-emerald-700" />
          <span className="text-sm font-medium">
            Loading approved quote...
          </span>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7f6] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => router.back()}
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-emerald-700"
        >
          <ArrowLeft size={18} />
          Back
        </button>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-50 p-3 text-emerald-700">
              <FileText size={25} />
            </div>

            <div>
              <p className="text-sm font-bold tracking-wider text-emerald-700">
                QUOTEFORGE
              </p>
              <h1 className="text-2xl font-bold text-slate-950">
                Download quotation PDF
              </h1>
            </div>
          </div>

          {error && (
            <div className="mt-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {quote && (
            <>
              <div className="mt-6 grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-slate-500">RFQ</p>
                  <p className="mt-1 font-semibold text-slate-950">
                    {quote.rfq_number}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Customer</p>
                  <p className="mt-1 font-semibold text-slate-950">
                    {quote.customer_name}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Quote version</p>
                  <p className="mt-1 font-semibold text-slate-950">
                    v{quote.version}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">
                    Annual value · excl. GST
                  </p>
                  <p className="mt-1 font-semibold text-slate-950">
                    {formatINR(quote.annual_value)}
                  </p>
                </div>
              </div>

              <button
                onClick={downloadPdf}
                disabled={downloading}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-4 font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {downloading ? (
                  <Loader2 size={19} className="animate-spin" />
                ) : (
                  <Download size={19} />
                )}

                {downloading
                  ? "Generating PDF..."
                  : "Download quotation PDF"}
              </button>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

// Page-level Suspense boundary for useParams()
export default function QuotePdfPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#f5f7f6]">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 size={22} className="animate-spin text-emerald-700" />
            <span className="text-sm font-medium">
              Loading quotation page...
            </span>
          </div>
        </main>
      }
    >
      <QuotePdfContent />
    </Suspense>
  );
}
