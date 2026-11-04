"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type RateMaster = {
  id: string;
  rate_name: string;
  rate_type: string;
  unit: string;
};

type RateVersion = {
  id: string;
  rate_master_id: string;
  rate_value: number;
  effective_from: string;
  effective_to: string | null;
};

type RateWithHistory = RateMaster & {
  versions: RateVersion[];
};

const today = () => {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const formatRate = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);

export default function RatesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [rates, setRates] = useState<RateWithHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedRate, setSelectedRate] = useState<RateWithHistory | null>(null);
  const [newValue, setNewValue] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(today());

  const loadRates = useCallback(async () => {
    setLoading(true);
    setError("");

    const { data: masters, error: masterError } = await supabase
      .from("rate_masters")
      .select("id, rate_name, rate_type, unit")
      .order("rate_type")
      .order("rate_name");

    if (masterError) {
      setError(masterError.message);
      setLoading(false);
      return;
    }

    const { data: versions, error: versionError } = await supabase
      .from("rate_versions")
      .select("id, rate_master_id, rate_value, effective_from, effective_to")
      .order("effective_from", { ascending: false });

    if (versionError) {
      setError(versionError.message);
      setLoading(false);
      return;
    }

    const combined = (masters || []).map((master) => ({
      ...master,
      versions: (versions || []).filter(
        (version) => version.rate_master_id === master.id
      ),
    }));

    setRates(combined);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRates();
  }, [loadRates]);

  const activeRate = (rate: RateWithHistory) => {
    const date = today();
    return rate.versions.find(
      (version) =>
        version.effective_from <= date &&
        (!version.effective_to || version.effective_to >= date)
    );
  };

  const groupedRates = useMemo(() => {
    const groups: Record<string, RateWithHistory[]> = {};
    rates.forEach((rate) => {
      groups[rate.rate_type] ||= [];
      groups[rate.rate_type].push(rate);
    });
    return groups;
  }, [rates]);

  const openEditor = (rate: RateWithHistory) => {
    setSelectedRate(rate);
    setNewValue("");
    setEffectiveFrom(today());
    setError("");
    setSuccess("");
  };

  const saveRate = async () => {
    if (!selectedRate) return;

    const numericValue = Number(newValue);
    if (!newValue.trim() || !Number.isFinite(numericValue) || numericValue < 0) {
      setError("Enter a valid rate greater than or equal to zero.");
      return;
    }

    if (!effectiveFrom || effectiveFrom < today()) {
      setError("Choose today or a future effective date.");
      return;
    }

    setSavingId(selectedRate.id);
    setError("");
    setSuccess("");

    const { error: saveError } = await supabase.rpc("add_rate_version", {
      p_rate_master_id: selectedRate.id,
      p_rate_value: numericValue,
      p_effective_from: effectiveFrom,
    });

    setSavingId(null);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    setSuccess(`Updated ${selectedRate.rate_name} successfully.`);
    setSelectedRate(null);
    await loadRates();
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold tracking-widest text-emerald-700">
              QUOTEFORGE
            </p>
            <h1 className="mt-1 text-3xl font-bold">Rate masters</h1>
            <p className="mt-2 text-slate-600">
              View current rates and add new effective-dated values.
            </p>
          </div>
          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold hover:bg-slate-100"
          >
            Back to dashboard
          </button>
        </div>

        {error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {success}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border bg-white p-8 text-slate-600">
            Loading rate masters...
          </div>
        ) : rates.length === 0 ? (
          <div className="rounded-xl border bg-white p-8 text-slate-600">
            No rate masters found. Add rate masters in Supabase first.
          </div>
        ) : (
          <div className="space-y-7">
            {Object.entries(groupedRates).map(([type, items]) => (
              <section
                key={type}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                  <h2 className="font-bold capitalize">{type} rates</h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {items.map((rate) => {
                    const current = activeRate(rate);
                    const latest = rate.versions[0];

                    return (
                      <div
                        key={rate.id}
                        className="flex flex-col justify-between gap-4 px-5 py-5 sm:flex-row sm:items-center"
                      >
                        <div>
                          <h3 className="font-semibold">{rate.rate_name}</h3>
                          <p className="mt-1 text-sm text-slate-500">
                            Unit: {rate.unit}
                          </p>
                          {current ? (
                            <p className="mt-2 text-sm text-emerald-700">
                              Current rate: <strong>{formatRate(Number(current.rate_value))}</strong>{" "}
                              {rate.unit} · Effective from {current.effective_from}
                            </p>
                          ) : (
                            <p className="mt-2 text-sm text-amber-700">
                              No rate effective today
                              {latest
                                ? ` · Latest value ${formatRate(Number(latest.rate_value))} from ${latest.effective_from}`
                                : ""}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-slate-500">
                            {rate.versions.length} rate version(s) recorded
                          </p>
                        </div>
                        <button
                          onClick={() => openEditor(rate)}
                          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                        >
                          Add new rate
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {selectedRate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-bold">Add a new rate</h2>
              <p className="mt-1 text-sm text-slate-600">
                {selectedRate.rate_name} · {selectedRate.unit}
              </p>

              <label className="mt-5 block text-sm font-semibold">
                New rate value
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={newValue}
                  onChange={(event) => setNewValue(event.target.value)}
                  placeholder="Enter rate"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="mt-4 block text-sm font-semibold">
                Effective from
                <input
                  type="date"
                  min={today()}
                  value={effectiveFrom}
                  onChange={(event) => setEffectiveFrom(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <p className="mt-3 text-xs leading-5 text-slate-500">
                The previous rate will remain available in history. The new
                value applies from the selected date.
              </p>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setSelectedRate(null)}
                  disabled={savingId !== null}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveRate}
                  disabled={savingId !== null}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  {savingId ? "Saving..." : "Save rate"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
