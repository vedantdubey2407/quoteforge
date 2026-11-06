"use client";

import { useState, useEffect, Suspense } from "react";

import { useParams, useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

import {

  ArrowLeft,

  Calculator,

  Loader2,

  RefreshCw,

  IndianRupee,

  AlertCircle,

  CheckCircle2,

  Save,

} from "lucide-react";

type Part = {

  id: string;

  part_name: string;

  part_number: string;

  material: string;

  gross_weight_kg: number;

  annual_volume: number;

  cycle_time_minutes: number;

  machine_hour_rate: number;

};

type CostResult = {

  material_cost: number;

  scrap_cost: number;

  processing_cost: number;

  overhead_cost: number;

  packing_cost: number;

  freight_cost: number;

  total_cost: number;

  margin_percent: number;

  selling_price: number;

  gst_percent: number;

  gst_amount: number;

  price_including_gst: number;

  annual_volume: number;

  annual_value: number;

};

type CostingForm = {

  material_rate_per_kg: string;

  scrap_percent: string;

  overhead_percent: string;

  packing_cost_per_part: string;

  freight_cost_per_part: string;

  margin_percent: string;

  gst_percent: string;

};

type SavedQuote = {

  quote_id: string;

  version: number;

  status: string;

};

type RoutingStep = {
  sequence_number: number;
  operation_name: string;
  machine_type: string | null;
  estimated_cycle_time_minutes: number | null;
  source_note: string | null;
};

type RoutingSuggestion = {
  // Existing RFQ suggestions carry part_id; imported CSV suggestions carry record_id.
  part_id?: string | null;
  record_id?: string | null;
  rfq_number: string | null;
  quote_date: string | null;
  customer_name: string | null;
  part_number: string;
  part_name: string;
  material: string | null;
  gross_weight_kg: number | null;
  annual_volume: number | null;
  cycle_time_minutes: number | null;
  source_type: string;
  data_source: string;
  is_synthetic: boolean | null;
  similarity_score: number;
  similarity_reasons: {
    material_match: number;
    weight_similarity: number;
    part_name_similarity: number;
    cycle_time_similarity: number;
  };
  routing_steps: RoutingStep[];
};

type RoutingApiResponse = {
  success: boolean;
  message: string;
  target_part?: string;
  historical_parts_considered?: number;
  data?: {
    suggestions: RoutingSuggestion[];
    method: string;
    human_review_required: boolean;
    notice: string;
  };
  suggestions?: RoutingSuggestion[];
  human_review_required: boolean;
};

const formatINR = (value: number) =>

  new Intl.NumberFormat("en-IN", {

    style: "currency",

    currency: "INR",

    minimumFractionDigits: 2,

    maximumFractionDigits: 2,

  }).format(value);

function getRoutingSuggestionKey(
  suggestion: RoutingSuggestion
): string {
  if (suggestion.record_id) {
    return `record:${suggestion.record_id}`;
  }

  if (suggestion.part_id) {
    return `part:${suggestion.part_id}`;
  }

  return `suggestion:${suggestion.part_number}`;
}

function isImportedCsvSuggestion(suggestion: RoutingSuggestion): boolean {
  return (
    suggestion.source_type === "imported_historical_csv" ||
    suggestion.data_source === "historical_quotes"
  );
}

const initialForm: CostingForm = {

  material_rate_per_kg: "85",

  scrap_percent: "5",

  overhead_percent: "10",

  packing_cost_per_part: "5",

  freight_cost_per_part: "3",

  margin_percent: "20",

  gst_percent: "18",

};

function CostingPageContent() {

  const params = useParams();

  const router = useRouter();

  const rfqId = params.id as string;

  const [part, setPart] = useState<Part | null>(null);

  const [rfqNumber, setRfqNumber] = useState("");

  const [customerName, setCustomerName] = useState("");

  const [form, setForm] = useState<CostingForm>(initialForm);

  const [costingDate, setCostingDate] = useState(() => {

    const now = new Date();

    return new Date(now.getTime() - now.getTimezoneOffset() * 60000)

      .toISOString()

      .slice(0, 10);

  });

  const [machineHourRate, setMachineHourRate] = useState<number | null>(null);

  const [rateLoading, setRateLoading] = useState(false);

  const [rateSourceSummary, setRateSourceSummary] = useState("");

  const [result, setResult] = useState<CostResult | null>(null);

  const [loading, setLoading] = useState(true);

  const [calculating, setCalculating] = useState(false);

  const [saving, setSaving] = useState(false);

  const [savedQuote, setSavedQuote] = useState<SavedQuote | null>(null);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [routingError, setRoutingError] = useState("");
  const [routingSuggestions, setRoutingSuggestions] = useState<RoutingSuggestion[]>([]);
  const [reviewedRoutingIds, setReviewedRoutingIds] = useState<string[]>([]);
  const [routingReviewSavingIds, setRoutingReviewSavingIds] = useState<string[]>([]);
  const [routingNotice, setRoutingNotice] = useState("");

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  async function applyEffectiveRates(targetPart: Part, targetDate: string) {

    setRateLoading(true);

    setError("");

    try {

      const supabase = createClient();

      const [{ data: masters, error: masterError }, { data: versions, error: versionError }] =

        await Promise.all([

          supabase

            .from("rate_masters")

            .select("id, rate_name, rate_type, unit"),

          supabase

            .from("rate_versions")

            .select("rate_master_id, rate_value, effective_from, effective_to")

            .lte("effective_from", targetDate)

            .order("effective_from", { ascending: false }),

        ]);

      if (masterError) throw masterError;

      if (versionError) throw versionError;

      const activeVersions = (versions || []).filter(

        (version) =>

          version.effective_from <= targetDate &&

          (!version.effective_to || version.effective_to >= targetDate)

      );

      const getRate = (master: { id: string; rate_name: string; rate_type: string }) => {

        const version = activeVersions.find(

          (item) => item.rate_master_id === master.id

        );

        return version ? Number(version.rate_value) : null;

      };

      const materialKey =

        targetPart.material.toLowerCase().match(/[a-z0-9]+/)?.[0] ?? "";

      const materialMaster = (masters || []).find((master) => {

        if (master.rate_type !== "material") return false;

        const masterKey = master.rate_name.toLowerCase().replace(/[^a-z0-9]/g, "");

        return materialKey.length > 0 && masterKey.startsWith(materialKey);

      });

      const machineMaster = (masters || []).find((master) => master.rate_type === "machine");

      const overheadMaster = (masters || []).find((master) => master.rate_type === "overhead");

      const packingMaster = (masters || []).find((master) => master.rate_type === "packing");

      const freightMaster = (masters || []).find((master) => master.rate_type === "freight");

      const required = [

        ["material", materialMaster],

        ["machine", machineMaster],

        ["overhead", overheadMaster],

        ["packing", packingMaster],

        ["freight", freightMaster],

      ] as const;

      const missing = required

        .filter(([, master]) => !master || getRate(master) === null)

        .map(([label]) => label);

      if (missing.length) {

        throw new Error(

          `No effective ${missing.join(", ")} rate found for ${targetDate}. Check Rate Masters.`

        );

      }

      const materialRate = getRate(materialMaster!)!;

      const machineRate = getRate(machineMaster!)!;

      const overheadRate = getRate(overheadMaster!)!;

      const packingRate = getRate(packingMaster!)!;

      const freightRate = getRate(freightMaster!)!;

      setForm((previous) => ({

        ...previous,

        material_rate_per_kg: String(materialRate),

        overhead_percent: String(overheadRate),

        packing_cost_per_part: String(packingRate),

        freight_cost_per_part: String(freightRate),

      }));

      setMachineHourRate(machineRate);

      setRateSourceSummary(

        `Rates loaded for ${targetDate}: ${materialMaster!.rate_name}, ${machineMaster!.rate_name}, overhead, packing and freight.`

      );

      setResult(null);

      setSavedQuote(null);

    } catch (rateError) {

      setMachineHourRate(null);

      setRateSourceSummary("");

      setError(

        rateError instanceof Error ? rateError.message : "Unable to load effective rates."

      );

    } finally {

      setRateLoading(false);

    }

  }

  useEffect(() => {

    let active = true;

    async function loadRFQ() {

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

        const { data, error: fetchError } = await supabase

          .from("rfqs")

          .select(`

            id,

            rfq_number,

            owner_id,

            customers(name),

            parts(

              id,

              part_name,

              part_number,

              material,

              gross_weight_kg,

              annual_volume,

              cycle_time_minutes,

              machine_hour_rate

            )

          `)

          .eq("id", rfqId)

          .eq("owner_id", user.id)

          .single();

        if (fetchError) throw fetchError;

        if (!data) throw new Error("RFQ not found or access denied.");

        const parts = data.parts as unknown as Part[];

        if (!parts || parts.length === 0) {

          throw new Error("No part information found for this RFQ.");

        }

        if (!active) return;

        setRfqNumber(data.rfq_number);

        setCustomerName(

          (data.customers as unknown as { name: string })?.name ?? "Customer"

        );

        setPart(parts[0]);

        await applyEffectiveRates(parts[0], costingDate);

      } catch (err) {

        console.error("RFQ loading error:", err);

        if (active) {

          setError(

            err instanceof Error ? err.message : "Unable to load RFQ details."

          );

        }

      } finally {

        if (active) setLoading(false);

      }

    }

    if (rfqId) loadRFQ();

    return () => {

      active = false;

    };

  }, [rfqId, router, costingDate]);

  function updateField(field: keyof CostingForm, value: string) {

    setForm((previous) => ({ ...previous, [field]: value }));

    setResult(null);

    setSavedQuote(null);

    setSuccess("");

    setError("");

  }

  function validateForm(): boolean {

    for (const [key, value] of Object.entries(form) as [keyof CostingForm, string][]) {

      if (value.trim() === "" || !Number.isFinite(Number(value))) {

        setError(`Please enter a valid value for ${String(key).replace(/_/g, " ")}.`);

        return false;

      }

      if (Number(value) < 0) {

        setError("Costing values cannot be negative.");

        return false;

      }

    }

    if (Number(form.scrap_percent) > 100) {

      setError("Scrap allowance cannot exceed 100%.");

      return false;

    }

    if (Number(form.overhead_percent) > 100) {

      setError("Overhead cannot exceed 100%.");

      return false;

    }

    if (Number(form.margin_percent) >= 100) {

      setError("Gross margin must be less than 100%.");

      return false;

    }

    if (Number(form.gst_percent) > 100) {

      setError("GST cannot exceed 100%.");

      return false;

    }

    return true;

  }

  async function calculate() {

    if (!part) return;

    setError("");

    setSuccess("");

    setResult(null);

    setSavedQuote(null);

    if (!validateForm()) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;

    if (!apiUrl) {

      setError("Backend API URL is missing. Check frontend/.env.local.");

      return;

    }

    setCalculating(true);

    try {

      const response = await fetch(

        `${apiUrl.replace(/\/+$/, "")}/api/costing/calculate`,

        {

          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({

            gross_weight_kg: Number(part.gross_weight_kg),

            material_rate_per_kg: Number(form.material_rate_per_kg),

            scrap_percent: Number(form.scrap_percent),

            cycle_time_minutes: Number(part.cycle_time_minutes),

            machine_hour_rate: Number(machineHourRate ?? part.machine_hour_rate),

            overhead_percent: Number(form.overhead_percent),

            packing_cost_per_part: Number(form.packing_cost_per_part),

            freight_cost_per_part: Number(form.freight_cost_per_part),

            margin_percent: Number(form.margin_percent),

            annual_volume: Number(part.annual_volume),

            gst_percent: Number(form.gst_percent),

          }),

        }

      );

      const payload = await response.json();

      if (!response.ok) {

        throw new Error(

          typeof payload.detail === "string"

            ? payload.detail

            : "Cost calculation failed. Check your inputs."

        );

      }

      if (!payload.data) {

        throw new Error("The costing API returned an invalid response.");

      }

      setResult(payload.data as CostResult);

      setSuccess("Manufacturing cost calculated successfully.");

    } catch (err) {

      console.error("Costing error:", err);

      setError(

        err instanceof Error

          ? err.message

          : "Unable to calculate cost. Check the backend connection."

      );

    } finally {

      setCalculating(false);

    }

  }

  async function saveCosting() {

    if (!part || !result || savedQuote) return;

    setSaving(true);

    setError("");

    setSuccess("");

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

      const { data, error: saveError } = await supabase.rpc(

        "save_costing_snapshot",

        {

          p_rfq_id: rfqId,

          p_part_id: part.id,

          p_gst_percent: result.gst_percent,

          p_annual_value: result.annual_value,

          p_material_cost: result.material_cost,

          p_scrap_cost: result.scrap_cost,

          p_processing_cost: result.processing_cost,

          p_overhead_cost: result.overhead_cost,

          p_packing_cost: result.packing_cost,

          p_freight_cost: result.freight_cost,

          p_total_cost: result.total_cost,

          p_margin_percent: result.margin_percent,

          p_selling_price: result.selling_price,

          p_volume: result.annual_volume,

          p_rate_snapshot: {

            ...form,

            material: part.material,

            gross_weight_kg: part.gross_weight_kg,

            cycle_time_minutes: part.cycle_time_minutes,

            machine_hour_rate: part.machine_hour_rate,

            annual_volume: part.annual_volume,

            calculated_at: new Date().toISOString(),

          },

        }

      );

      if (saveError) throw saveError;

      if (!data?.success || !data?.quote_id) {

        throw new Error("The costing snapshot could not be saved.");

      }

      setSavedQuote({

        quote_id: data.quote_id,

        version: data.version,

        status: data.status,

      });

      setSuccess(`Costing saved successfully as Quote v${data.version}.`);

    } catch (err) {

      console.error("Save costing error:", err);

      setError(

        err instanceof Error ? err.message : "Unable to save costing snapshot."

      );

    } finally {

      setSaving(false);

    }

  }

  async function fetchRoutingSuggestions() {
    if (!part) return;

    setRoutingLoading(true);
    setRoutingError("");
    setRoutingNotice("");
    setRoutingSuggestions([]);
    setReviewedRoutingIds([]);

    try {
      const supabase = createClient();
      const { data: { session }, error: authError } = await supabase.auth.getSession();

      if (authError || !session?.access_token) {
        router.replace("/");
        return;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) throw new Error("Backend API URL is missing. Check frontend/.env.local.");

      const response = await fetch(
        `${apiUrl.replace(/\/+$/, "")}/api/routing/suggest`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ rfq_id: rfqId, part_id: part.id, limit: 3 }),
        }
      );

      const payload = await response.json() as RoutingApiResponse & { detail?: string };
      if (!response.ok) {
        throw new Error(payload.detail || "Unable to retrieve routing suggestions.");
      }

      const suggestions = payload.data?.suggestions ?? payload.suggestions ?? [];
      setRoutingSuggestions(suggestions);
      setRoutingNotice(
        payload.data?.notice ?? payload.message ?? "Review suggested operations before use."
      );

      // Restore previously saved review status for this RFQ part.
      const reviewsResponse = await fetch(
        `${apiUrl.replace(/\/+$/, "")}/api/routing/reviews?rfq_id=${encodeURIComponent(rfqId)}&part_id=${encodeURIComponent(part.id)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );

      if (reviewsResponse.ok) {
        const reviewsPayload = await reviewsResponse.json();
        const savedIds = (reviewsPayload.reviews ?? [])
          .map(
            (review: {
              suggested_part_id: string | null;
              historical_record_id: string | null;
            }) =>
              review.historical_record_id
                ? `record:${review.historical_record_id}`
                : review.suggested_part_id
                  ? `part:${review.suggested_part_id}`
                  : ""
          )
          .filter(Boolean);

        setReviewedRoutingIds(savedIds);
      } else {
        setRoutingError("Suggestions loaded, but saved review status could not be retrieved.");
      }
    } catch (err) {
      console.error("Routing suggestion error:", err);
      setRoutingError(
        err instanceof Error ? err.message : "Unable to retrieve routing suggestions."
      );
    } finally {
      setRoutingLoading(false);
    }
  }

  async function saveRoutingReview(suggestion: RoutingSuggestion) {
    const suggestionKey = getRoutingSuggestionKey(suggestion);

    if (!part || reviewedRoutingIds.includes(suggestionKey)) return;

    setRoutingReviewSavingIds((previous) => [...previous, suggestionKey]);
    setRoutingError("");

    try {
      const supabase = createClient();
      const {
        data: { session },
        error: authError,
      } = await supabase.auth.getSession();

      if (authError || !session?.access_token) {
        router.replace("/");
        return;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) throw new Error("Backend API URL is missing.");

      const response = await fetch(
        `${apiUrl.replace(/\/+$/, "")}/api/routing/review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            rfq_id: rfqId,
            target_part_id: part.id,
            suggested_part_id: suggestion.part_id ?? null,
            historical_record_id: suggestion.record_id ?? null,
            similarity_score: suggestion.similarity_score,
            source_type: suggestion.source_type,
            suggestion_snapshot: suggestion,
          }),
        }
      );

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof payload.detail === "string"
            ? payload.detail
            : "Unable to save routing review."
        );
      }

      setReviewedRoutingIds((previous) =>
        previous.includes(suggestionKey)
          ? previous
          : [...previous, suggestionKey]
      );
      setSuccess(`Routing review for ${suggestion.part_number} saved successfully.`);
    } catch (err) {
      console.error("Save routing review error:", err);
      setRoutingError(
        err instanceof Error ? err.message : "Unable to save routing review."
      );
    } finally {
      setRoutingReviewSavingIds((previous) =>
        previous.filter((id) => id !== suggestionKey)
      );
    }
  }

  function resetCalculation() {

    setForm(initialForm);

    setResult(null);

    setSavedQuote(null);

    setError("");

    setSuccess("");

  }

  if (loading) {

    return (

      <main className="flex min-h-screen items-center justify-center bg-[#f5f7f6]">

        <div className="flex flex-col items-center gap-3">

          <Loader2 size={32} className="animate-spin text-emerald-700" />

          <p className="text-sm font-medium text-slate-600">

            Loading RFQ details...

          </p>

        </div>

      </main>

    );

  }

  if (error && !part) {

    return (

      <main className="min-h-screen bg-[#f5f7f6] p-6 md:p-10">

        <div className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-white p-6">

          <div className="flex items-center gap-3 text-red-700">

            <AlertCircle size={22} />

            <h2 className="font-bold">Unable to load costing workspace</h2>

          </div>

          <p className="mt-3 text-sm text-slate-700">{error}</p>

          <button

            onClick={() => router.push("/dashboard")}

            className="mt-5 rounded-lg bg-[#172923] px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-900"

          >

            Back to dashboard

          </button>

        </div>

      </main>

    );

  }

  if (!part) return null;

  const fields: {

    key: keyof CostingForm;

    label: string;

    suffix: string;

    step: string;

  }[] = [

    { key: "material_rate_per_kg", label: "Material rate", suffix: "₹ / kg", step: "0.01" },

    { key: "scrap_percent", label: "Scrap allowance", suffix: "%", step: "0.01" },

    { key: "overhead_percent", label: "Overhead", suffix: "%", step: "0.01" },

    { key: "packing_cost_per_part", label: "Packing cost", suffix: "₹ / part", step: "0.01" },

    { key: "freight_cost_per_part", label: "Freight cost", suffix: "₹ / part", step: "0.01" },

    { key: "margin_percent", label: "Gross margin", suffix: "%", step: "0.01" },

    { key: "gst_percent", label: "GST", suffix: "%", step: "0.01" },

  ];

  const breakdown: { key: keyof CostResult; label: string }[] = [

    { key: "material_cost", label: "Material cost" },

    { key: "scrap_cost", label: "Scrap cost" },

    { key: "processing_cost", label: "Processing cost" },

    { key: "overhead_cost", label: "Overhead" },

    { key: "packing_cost", label: "Packing" },

    { key: "freight_cost", label: "Freight" },

  ];

  return (

    <main className="min-h-screen bg-[#f5f7f6] px-4 py-6 md:px-8 md:py-10">

      <div className="mx-auto max-w-7xl">

        <button

          onClick={() => router.push("/dashboard")}

          className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-slate-700 transition hover:text-emerald-700"

        >

          <ArrowLeft size={18} />

          Back to dashboard

        </button>

        <div className="mb-8">

          <p className="text-sm font-bold tracking-wider text-emerald-700">

            MANUFACTURING COSTING

          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-950 md:text-4xl">

            Costing workspace

          </h1>

          <p className="mt-2 text-base text-slate-600">

            Calculate manufacturing cost and quotation price.

          </p>

        </div>

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">

          <div className="flex flex-wrap items-start justify-between gap-5">

            <div>

              <p className="text-sm font-medium text-slate-500">RFQ</p>

              <h2 className="mt-1 text-xl font-bold text-slate-950">

                {rfqNumber}

              </h2>

              <p className="mt-2 text-sm text-slate-700">

                Customer:{" "}

                <span className="font-semibold text-slate-900">

                  {customerName}

                </span>

              </p>

            </div>

            <div className="text-left md:text-right">

              <p className="text-sm font-medium text-slate-500">Part number</p>

              <p className="mt-1 font-bold text-slate-950">

                {part.part_number}

              </p>

            </div>

          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 border-t border-slate-200 pt-5 sm:grid-cols-2 lg:grid-cols-4">

            <div>

              <p className="text-xs font-medium text-slate-500">Part name</p>

              <p className="mt-1 font-semibold text-slate-950">{part.part_name}</p>

            </div>

            <div>

              <p className="text-xs font-medium text-slate-500">Material</p>

              <p className="mt-1 font-semibold text-slate-950">{part.material}</p>

            </div>

            <div>

              <p className="text-xs font-medium text-slate-500">Gross weight</p>

              <p className="mt-1 font-semibold text-slate-950">

                {Number(part.gross_weight_kg).toFixed(2)} kg

              </p>

            </div>

            <div>

              <p className="text-xs font-medium text-slate-500">Annual volume</p>

              <p className="mt-1 font-semibold text-slate-950">

                {Number(part.annual_volume).toLocaleString("en-IN")} parts

              </p>

            </div>

            <div>

              <p className="text-xs font-medium text-slate-500">Cycle time</p>

              <p className="mt-1 font-semibold text-slate-950">

                {part.cycle_time_minutes} min

              </p>

            </div>

            <div>

              <p className="text-xs font-medium text-slate-500">Machine hour rate</p>

              <p className="mt-1 font-semibold text-slate-950">

                {machineHourRate === null ? "Not loaded" : `${formatINR(machineHourRate)} / hour`}

              </p>

            </div>

          </div>

        </section>

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Historical routing recommendations</h2>
              <p className="mt-1 text-sm text-slate-600">Find similar parts and review their previous manufacturing operations.</p>
            </div>
            <button
              onClick={fetchRoutingSuggestions}
              disabled={routingLoading || rateLoading}
              className="flex items-center justify-center gap-2 rounded-lg bg-[#172923] px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {routingLoading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
              {routingLoading ? "Finding similar parts..." : "Find similar routings"}
            </button>
          </div>

          {routingError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{routingError}</div>
          )}

          {routingNotice && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{routingNotice}</div>
          )}

          {routingSuggestions.map((suggestion) => {
            const suggestionKey = getRoutingSuggestionKey(suggestion);
            const reviewed = reviewedRoutingIds.includes(suggestionKey);
            const reviewSaving = routingReviewSavingIds.includes(suggestionKey);
            const importedCsv = isImportedCsvSuggestion(suggestion);
            return (
              <div key={suggestionKey} className="mt-5 rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-950">{suggestion.part_number} — {suggestion.part_name}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Customer: {suggestion.customer_name ?? "Not available"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {importedCsv ? (
                        <>
                          <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-800">
                            Imported CSV
                          </span>
                          <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                            Synthetic demo data
                          </span>
                        </>
                      ) : (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-800">
                          Existing RFQ
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg bg-emerald-50 px-4 py-2 text-center">
                    <p className="text-2xl font-bold text-emerald-800">{suggestion.similarity_score}%</p>
                    <p className="text-xs font-medium text-emerald-700">Similarity</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">RFQ number</p><p className="mt-1 font-semibold text-slate-900">{suggestion.rfq_number ?? "N/A"}</p></div>
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Quote date</p><p className="mt-1 font-semibold text-slate-900">{suggestion.quote_date ?? "N/A"}</p></div>
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Annual volume</p><p className="mt-1 font-semibold text-slate-900">{suggestion.annual_volume !== null && suggestion.annual_volume !== undefined ? `${Number(suggestion.annual_volume).toLocaleString("en-IN")} parts` : "N/A"}</p></div>
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Material</p><p className="mt-1 font-semibold text-slate-900">{suggestion.material ?? "Not available"}</p></div>
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Gross weight</p><p className="mt-1 font-semibold text-slate-900">{suggestion.gross_weight_kg ?? "N/A"} kg</p></div>
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Cycle time</p><p className="mt-1 font-semibold text-slate-900">{suggestion.cycle_time_minutes ?? "N/A"} min</p></div>
                </div>

                <h4 className="mt-5 font-semibold text-slate-900">Similarity breakdown</h4>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Material</p><p className="mt-1 font-semibold text-slate-900">{(suggestion.similarity_reasons.material_match * 100).toFixed(1)}%</p></div>
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Weight</p><p className="mt-1 font-semibold text-slate-900">{(suggestion.similarity_reasons.weight_similarity * 100).toFixed(1)}%</p></div>
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Part name</p><p className="mt-1 font-semibold text-slate-900">{(suggestion.similarity_reasons.part_name_similarity * 100).toFixed(1)}%</p></div>
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Cycle time</p><p className="mt-1 font-semibold text-slate-900">{(suggestion.similarity_reasons.cycle_time_similarity * 100).toFixed(1)}%</p></div>
                </div>

                <h4 className="mt-5 font-semibold text-slate-900">Suggested manufacturing operations</h4>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-slate-500"><tr><th className="py-2 pr-3">Step</th><th className="py-2 pr-3">Operation</th><th className="py-2 pr-3">Machine</th><th className="py-2">Time</th></tr></thead>
                    <tbody>
                      {suggestion.routing_steps.map((step) => (
                        <tr key={step.sequence_number} className="border-b border-slate-100">
                          <td className="py-3 pr-3 text-slate-600">{step.sequence_number}</td>
                          <td className="py-3 pr-3 font-medium text-slate-900">{step.operation_name}</td>
                          <td className="py-3 pr-3 text-slate-700">{step.machine_type ?? "—"}</td>
                          <td className="py-3 text-slate-700">{step.estimated_cycle_time_minutes ?? "—"} min</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {importedCsv && (
                  <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-semibold">Synthetic demo data</p>
                    <p className="mt-1">
                      This suggestion comes from imported historical CSV records, which are synthetic demonstration data. The operations shown must be validated by the estimator before they are used.
                    </p>
                  </div>
                )}

                {suggestion.source_type === "demo_hypothetical" && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Demonstration route only. These operations are hypothetical and must be validated by the estimator before use.
                    {suggestion.routing_steps.some((step) => step.source_note) && (
                      <ul className="mt-2 list-disc pl-5">
                        {[...new Set(suggestion.routing_steps.map((step) => step.source_note).filter(Boolean))].map((note) => <li key={note}>{note}</li>)}
                      </ul>
                    )}
                  </div>
                )}

                <button
                  onClick={() => saveRoutingReview(suggestion)}
                  disabled={reviewed || reviewSaving}
                  className={`mt-4 rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-70 ${reviewed ? "border border-emerald-300 bg-emerald-50 text-emerald-800" : "bg-slate-900 text-white hover:bg-slate-700"}`}
                >
                  {reviewSaving
                    ? "Saving..."
                    : reviewed
                      ? "Review Saved"
                      : "Save Routing Review"}
                </button>
                <p className="mt-2 text-xs text-slate-500">
                  Review is saved to Supabase with the estimator, timestamp, source, and routing snapshot. This does not approve factory instructions or apply the route to costing.
                </p>
              </div>
            );
          })}
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-2">

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">

            <div className="mb-7 flex items-center gap-3">

              <div className="rounded-lg bg-emerald-50 p-3 text-emerald-700">

                <Calculator size={23} />

              </div>

              <div>

                <h2 className="text-lg font-bold text-slate-950">

                  Costing assumptions

                </h2>

                <p className="mt-1 text-sm text-slate-600">

                  Rates are loaded from Supabase using the selected costing date.

                </p>

              </div>

            </div>

            <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">

              <label className="block text-sm font-semibold text-slate-800">

                Costing date

                <input

                  type="date"

                  value={costingDate}

                  onChange={async (event) => {

                    const nextDate = event.target.value;

                    setCostingDate(nextDate);

                    setSuccess("");

                    if (part && nextDate) await applyEffectiveRates(part, nextDate);

                  }}

                  className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 sm:max-w-xs"

                />

              </label>

              <p className="mt-2 text-xs text-slate-600">

                {rateLoading

                  ? "Loading effective rates..."

                  : rateSourceSummary || "Waiting for effective rates."}

              </p>

            </div>

            <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2">

              {fields.map((field) => (

                <label key={field.key} className="block">

                  <span className="mb-2 block text-sm font-semibold text-slate-800">

                    {field.label}

                  </span>

                  <div className="flex items-center rounded-lg border border-slate-300 bg-white transition focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100">

                    <input

                      type="number"

                      min="0"

                      step={field.step}

                      value={form[field.key]}

                      onChange={(event) =>

                        updateField(field.key, event.target.value)

                      }

                      className="w-full min-w-0 rounded-lg bg-transparent px-3 py-3 text-sm font-medium text-slate-950 placeholder:text-slate-400 outline-none"

                    />

                    <span className="whitespace-nowrap px-3 text-xs font-medium text-slate-600">

                      {field.suffix}

                    </span>

                  </div>

                </label>

              ))}

            </div>

            {error && (

              <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">

                <AlertCircle size={18} className="mt-0.5 shrink-0" />

                <p>{error}</p>

              </div>

            )}

            {success && (

              <div className="mt-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">

                <CheckCircle2 size={18} />

                <span>{success}</span>

              </div>

            )}

            <button

              onClick={calculate}

              disabled={calculating || saving || rateLoading || machineHourRate === null}

              className="mt-7 flex w-full items-center justify-center gap-2 rounded-lg bg-[#172923] px-5 py-4 font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"

            >

              {calculating ? (

                <Loader2 className="animate-spin" size={19} />

              ) : (

                <Calculator size={19} />

              )}

              {rateLoading ? "Loading rates..." : calculating ? "Calculating..." : "Calculate manufacturing cost"}

            </button>

          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">

            <div className="mb-7">

              <h2 className="text-lg font-bold text-slate-950">Cost breakdown</h2>

              <p className="mt-1 text-sm text-slate-600">

                Results from the QuoteForge costing engine.

              </p>

            </div>

            {!result ? (

              <div className="flex min-h-80 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 text-center">

                <div className="rounded-full bg-emerald-50 p-4 text-emerald-700">

                  <IndianRupee size={28} />

                </div>

                <p className="mt-4 font-semibold text-slate-900">

                  No calculation yet

                </p>

                <p className="mt-2 max-w-xs text-sm text-slate-600">

                  Enter your assumptions and calculate to see the manufacturing

                  cost breakdown.

                </p>

              </div>

            ) : (

              <>

                <div className="space-y-5">

                  {breakdown.map((item) => (

                    <div

                      key={item.key}

                      className="flex items-center justify-between gap-4 text-sm"

                    >

                      <span className="font-medium text-slate-700">

                        {item.label}

                      </span>

                      <span className="font-semibold tabular-nums text-slate-950">

                        {formatINR(Number(result[item.key]))}

                      </span>

                    </div>

                  ))}

                </div>

                <div className="mt-6 border-t border-slate-200 pt-5">

                  <div className="flex items-center justify-between gap-4">

                    <span className="font-bold text-slate-950">

                      Total manufacturing cost

                    </span>

                    <span className="font-bold tabular-nums text-slate-950">

                      {formatINR(result.total_cost)}

                    </span>

                  </div>

                </div>

                <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50 p-5">

                  <p className="text-sm font-semibold text-emerald-900">

                    Selling price per part

                  </p>

                  <p className="mt-2 text-3xl font-bold tabular-nums text-emerald-950 md:text-4xl">

                    {formatINR(result.selling_price)}

                  </p>

                  <p className="mt-3 text-sm font-medium text-emerald-800">

                    Gross margin: {result.margin_percent}%

                  </p>

                </div>

                <div className="mt-6 space-y-4 text-sm">

                  <div className="flex justify-between gap-4">

                    <span className="font-medium text-slate-700">

                      GST ({result.gst_percent}%)

                    </span>

                    <span className="font-semibold tabular-nums text-slate-950">

                      {formatINR(result.gst_amount)}

                    </span>

                  </div>

                  <div className="flex justify-between gap-4">

                    <span className="font-bold text-slate-900">

                      Price including GST

                    </span>

                    <span className="font-bold tabular-nums text-slate-950">

                      {formatINR(result.price_including_gst)}

                    </span>

                  </div>

                  <div className="border-t border-slate-200 pt-4">

                    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">

                      <span className="font-bold text-slate-900">

                        Annual quote value (excl. GST)

                      </span>

                      <span className="text-lg font-bold tabular-nums text-slate-950">

                        {formatINR(result.annual_value)}

                      </span>

                    </div>

                    <p className="mt-2 text-xs text-slate-500">

                      Annual volume:{" "}

                      {Number(result.annual_volume).toLocaleString("en-IN")} parts

                    </p>

                  </div>

                </div>

                {savedQuote && (

                  <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">

                    <p className="font-semibold">

                      Quote v{savedQuote.version} saved as {savedQuote.status}.

                    </p>

                    <p className="mt-1 break-all text-xs text-emerald-800">

                      Quote ID: {savedQuote.quote_id}

                    </p>

                  </div>

                )}

                <button

                  onClick={saveCosting}

                  disabled={saving || calculating || Boolean(savedQuote)}

                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"

                >

                  {saving ? (

                    <Loader2 className="animate-spin" size={18} />

                  ) : (

                    <Save size={18} />

                  )}

                  {saving

                    ? "Saving costing..."

                    : savedQuote

                      ? `Quote v${savedQuote.version} saved`

                      : "Save costing as draft quote"}

                </button>

                <button

                  onClick={resetCalculation}

                  disabled={saving}

                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"

                >

                  <RefreshCw size={16} />

                  Reset calculation

                </button>

              </>

            )}

          </section>

        </div>

        <p className="mt-6 text-center text-xs text-slate-500">

          QuoteForge Manufacturing Costing Engine · GST calculated separately

        </p>

      </div>

    </main>

  );

}
export default function CostingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-slate-600">Loading costing workspace...</p>
        </div>
      }
    >
      <CostingPageContent />
    </Suspense>
  );
}
