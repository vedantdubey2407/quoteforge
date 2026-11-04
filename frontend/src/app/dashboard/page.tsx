
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Factory,
  FileText,
  Clock,
  CheckCircle,
  LogOut,
  Plus,
  Search,
  Bell,
  RefreshCw,
  Calculator,
  ArrowRight,
  Upload,
} from "lucide-react";

type RFQ = {
  id: string;
  rfq_number: string;
  status: string;
  due_date: string | null;
  created_at: string | null;
  customers: { name: string } | null;
  parts: { part_name: string }[];
};

export default function DashboardPage() {
  const router = useRouter();

  const [name, setName] = useState("Estimator");
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      const supabase = createClient();

      try {
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
          .select("full_name, role")
          .eq("id", user.id)
          .single();

        if (profileError || !profile || profile.role !== "estimator") {
          router.replace("/");
          return;
        }

        const { data, error: rfqError } = await supabase
          .from("rfqs")
          .select(`
            id,
            rfq_number,
            status,
            due_date,
            created_at,
            customers ( name ),
            parts ( part_name )
          `)
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false });

        if (rfqError) throw rfqError;

        if (!active) return;

        setName(profile.full_name || "Estimator");
        setRfqs((data || []) as unknown as RFQ[]);
      } catch (err) {
        console.error("Dashboard error:", err);

        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load dashboard data."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, [router]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  function openCosting(rfqId: string) {
    router.push(`/rfqs/${rfqId}/costing`);
  }

  function openDocuments(rfqId: string) {
    router.push(`/rfqs/${rfqId}/documents`);
  }

  const stats = useMemo(
    () => [
      {
        label: "Total RFQs",
        value: rfqs.length,
        icon: FileText,
      },
      {
        label: "Under Estimation",
        value: rfqs.filter((r) => r.status === "estimating").length,
        icon: Clock,
      },
      {
        label: "Pending Approval",
        value: rfqs.filter((r) => r.status === "pending_approval").length,
        icon: RefreshCw,
      },
      {
        label: "Quotes Sent",
        value: rfqs.filter((r) => r.status === "sent").length,
        icon: CheckCircle,
      },
    ],
    [rfqs]
  );

  const filteredRfqs = useMemo(() => {
    const query = search.toLowerCase().trim();

    if (!query) return rfqs;

    return rfqs.filter((rfq) =>
      [
        rfq.rfq_number,
        rfq.customers?.name,
        ...rfq.parts.map((part) => part.part_name),
        rfq.status,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    );
  }, [rfqs, search]);

  function statusStyle(status: string) {
    switch (status) {
      case "estimating":
        return "bg-amber-50 text-amber-700";
      case "pending_approval":
        return "bg-blue-50 text-blue-700";
      case "sent":
        return "bg-emerald-50 text-emerald-700";
      case "won":
        return "bg-green-100 text-green-800";
      case "lost":
        return "bg-red-50 text-red-700";
      default:
        return "bg-gray-100 text-gray-600";
    }
  }

  function statusLabel(status: string) {
    return status
      .replaceAll("_", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f6f4]">
        <div className="text-center">
          <RefreshCw className="animate-spin mx-auto text-emerald-700 mb-3" />
          <p className="text-gray-500">Loading QuoteForge...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f6f4]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Factory className="text-[#172923]" size={28} />
          <span className="text-xl font-bold text-[#172923]">
            QuoteForge
          </span>
        </div>

        <div className="flex items-center gap-5">
          <Bell size={20} className="text-gray-500" />

          <span className="text-sm font-medium text-gray-700">
            {name}
          </span>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-red-600"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6 md:p-10">
        {/* Page heading */}
        <div className="flex flex-col md:flex-row justify-between gap-4 mb-8">
          <div>
            <p className="text-sm text-gray-500">
              ESTIMATOR WORKSPACE
            </p>

            <h1 className="text-3xl font-bold text-[#172923] mt-2">
              Good morning, {name}
            </h1>

            <p className="text-gray-500 mt-2">
              Here's your manufacturing quotation overview.
            </p>
          </div>

          <button
            onClick={() => router.push("/rfqs/new")}
            className="bg-[#172923] text-white px-5 py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-[#263d32]"
          >
            <Plus size={18} />
            New RFQ
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-700 text-sm">
            Could not load RFQ data: {error}

            <button
              onClick={() => window.location.reload()}
              className="ml-3 underline font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {/* Statistics */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {stats.map((item) => (
            <div
              key={item.label}
              className="bg-white p-6 rounded-xl border border-gray-200"
            >
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-500">
                  {item.label}
                </p>

                <item.icon
                  size={20}
                  className="text-emerald-700"
                />
              </div>

              <p className="text-3xl font-bold text-[#172923] mt-4">
                {String(item.value).padStart(2, "0")}
              </p>
            </div>
          ))}
        </div>

        {/* Recent RFQs */}
        <section className="bg-white rounded-xl border border-gray-200">
          <div className="p-6 border-b border-gray-200 flex flex-col sm:flex-row justify-between gap-4 sm:items-center">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Recent RFQs
              </h2>

              <p className="text-sm text-gray-500 mt-1">
                Your latest quotation requests
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search
                size={18}
                className="absolute left-3 top-3 text-gray-400"
              />

              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search RFQ, customer or part..."
                className="w-full border border-gray-200 rounded-lg py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-500 text-sm">
                <tr>
                  <th className="p-4">RFQ Number</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Part</th>
                  <th className="p-4">Due Date</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Action</th>
                </tr>
              </thead>

              <tbody className="text-sm text-gray-700">
                {filteredRfqs.map((rfq) => (
                  <tr
                    key={rfq.id}
                    className="border-t hover:bg-gray-50 transition"
                  >
                    <td className="p-4 font-medium text-[#172923]">
                      <button
                        onClick={() => openCosting(rfq.id)}
                        className="hover:text-emerald-700 hover:underline"
                      >
                        {rfq.rfq_number}
                      </button>
                    </td>

                    <td className="p-4">
                      {rfq.customers?.name || "Unknown"}
                    </td>

                    <td className="p-4">
                      {rfq.parts
                        .map((part) => part.part_name)
                        .join(", ") || "—"}
                    </td>

                    <td className="p-4">
                      {rfq.due_date
                        ? new Date(rfq.due_date).toLocaleDateString("en-IN")
                        : "—"}
                    </td>

                    <td className="p-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusStyle(
                          rfq.status
                        )}`}
                      >
                        {statusLabel(rfq.status)}
                      </span>
                    </td>

                    <td className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => openCosting(rfq.id)}
                          className="inline-flex items-center gap-2 rounded-lg bg-[#172923] px-3 py-2 text-xs font-semibold text-white hover:bg-[#263d32]"
                        >
                          <Calculator size={15} />
                          Costing
                          <ArrowRight size={14} />
                        </button>
                        <button
                          onClick={() => openDocuments(rfq.id)}
                          className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                        >
                          <Upload size={15} />
                          Documents
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredRfqs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-12 text-center">
                      <FileText
                        className="mx-auto text-gray-300 mb-3"
                        size={32}
                      />

                      <p className="font-medium text-gray-700">
                        {search
                          ? "No matching RFQs found"
                          : "No RFQs yet"}
                      </p>

                      <p className="text-gray-500 text-sm mt-1">
                        {search
                          ? "Try a different search term."
                          : "Create your first RFQ to get started."}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-gray-100 text-xs text-gray-400">
            Showing {filteredRfqs.length} of {rfqs.length} RFQs
          </div>
        </section>
      </div>
    </main>
  );
}
