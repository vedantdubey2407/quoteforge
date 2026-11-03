"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  AlertCircle,
  ClipboardCheck,
  LogOut,
} from "lucide-react";

type PendingApproval = {
  approval_id: string;
  quote_id: string;
  rfq_number: string;
  customer_name: string | null;
  annual_value: number;
  quote_version: number;
  requested_at: string;
  requested_by_name: string | null;
  part_name: string | null;
  part_number: string | null;
  selling_price: number | null;
};

const formatINR = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export default function ApprovalsPage() {
  const router = useRouter();
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadApprovals = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace("/");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;

      if (profile?.role !== "sales_head") {
        router.replace("/dashboard");
        return;
      }

      const { data, error: approvalsError } = await supabase.rpc(
        "get_pending_quote_approvals"
      );

      if (approvalsError) throw approvalsError;

      setApprovals((data ?? []) as PendingApproval[]);
    } catch (err) {
      console.error("Pending approvals loading error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load pending approvals."
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadApprovals();
  }, [loadApprovals]);

  async function reviewApproval(
    quoteId: string,
    decision: "approved" | "rejected"
  ) {
    const actionLabel = decision === "approved" ? "approve" : "reject";
    const confirmed = window.confirm(
      `Are you sure you want to ${actionLabel} this quote?`
    );

    if (!confirmed) return;

    setReviewingId(quoteId);
    setError("");
    setNotice("");

    try {
      const supabase = createClient();
      const { data, error: reviewError } = await supabase.rpc(
        "review_quote_approval",
        {
          p_quote_id: quoteId,
          p_decision: decision,
          p_comments: comments[quoteId]?.trim() || null,
        }
      );

      if (reviewError) throw reviewError;
      if (!data?.success) {
        throw new Error("The approval decision could not be saved.");
      }

      setApprovals((current) =>
        current.filter((item) => item.quote_id !== quoteId)
      );
      setComments((current) => {
        const updated = { ...current };
        delete updated[quoteId];
        return updated;
      });
      setNotice(
        decision === "approved"
          ? "Quote approved successfully."
          : "Quote rejected successfully."
      );
    } catch (err) {
      console.error("Approval review error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to submit the approval decision."
      );
    } finally {
      setReviewingId(null);
    }
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#f5f7f6] px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold tracking-wider text-emerald-700">
              QUOTEFORGE · SALES HEAD
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950 md:text-4xl">
              Quote approvals
            </h1>
            <p className="mt-2 text-base text-slate-600">
              Review quotations requiring approval before they can proceed.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadApprovals()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-lg bg-[#172923] px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </header>

        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Pending approvals
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-950">
              {approvals.length}
            </p>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Approval threshold
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-950">
              ₹25,00,000
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Annual quote value, excluding GST
            </p>
          </section>
        </div>

        {error && (
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {notice && (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
            <CheckCircle2 size={18} />
            {notice}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-64 items-center justify-center rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-3 text-slate-600">
              <Loader2 size={22} className="animate-spin text-emerald-700" />
              <span className="text-sm font-medium">
                Loading pending approvals...
              </span>
            </div>
          </div>
        ) : approvals.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 text-center">
            <div className="rounded-full bg-emerald-50 p-4 text-emerald-700">
              <ClipboardCheck size={30} />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-950">
              No pending approvals
            </h2>
            <p className="mt-2 max-w-md text-sm text-slate-600">
              Quotes requiring your review will appear here once an estimator
              submits a quote above ₹25 lakh annual value.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {approvals.map((item) => (
              <article
                key={item.approval_id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold tracking-wider text-emerald-700">
                      PENDING REVIEW · QUOTE v{item.quote_version}
                    </p>
                    <h2 className="mt-2 text-xl font-bold text-slate-950">
                      {item.rfq_number}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {item.customer_name ?? "Customer not available"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-amber-50 px-4 py-3">
                    <p className="text-xs font-semibold text-amber-800">
                      Annual quote value · excl. GST
                    </p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-amber-950">
                      {formatINR(Number(item.annual_value))}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Part name
                    </p>
                    <p className="mt-1 font-semibold text-slate-950">
                      {item.part_name ?? "Not available"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Part number
                    </p>
                    <p className="mt-1 font-semibold text-slate-950">
                      {item.part_number ?? "Not available"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Selling price per part
                    </p>
                    <p className="mt-1 font-semibold text-slate-950">
                      {item.selling_price == null
                        ? "Not available"
                        : formatINR(Number(item.selling_price))}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Submitted by
                    </p>
                    <p className="mt-1 font-semibold text-slate-950">
                      {item.requested_by_name ?? "Estimator"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(item.requested_at)}
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  <label
                    htmlFor={`comments-${item.quote_id}`}
                    className="mb-2 block text-sm font-semibold text-slate-800"
                  >
                    Review comments (optional)
                  </label>
                  <textarea
                    id={`comments-${item.quote_id}`}
                    rows={3}
                    value={comments[item.quote_id] ?? ""}
                    onChange={(event) =>
                      setComments((current) => ({
                        ...current,
                        [item.quote_id]: event.target.value,
                      }))
                    }
                    placeholder="Add a note for the estimator..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    onClick={() =>
                      void reviewApproval(item.quote_id, "rejected")
                    }
                    disabled={reviewingId === item.quote_id}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-5 py-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {reviewingId === item.quote_id ? (
                      <Loader2 size={17} className="animate-spin" />
                    ) : (
                      <XCircle size={17} />
                    )}
                    Reject quote
                  </button>
                  <button
                    onClick={() =>
                      void reviewApproval(item.quote_id, "approved")
                    }
                    disabled={reviewingId === item.quote_id}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {reviewingId === item.quote_id ? (
                      <Loader2 size={17} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={17} />
                    )}
                    Approve quote
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
