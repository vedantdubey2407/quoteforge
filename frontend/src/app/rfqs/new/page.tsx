
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Save, Loader2 } from "lucide-react";

type Customer = {
  id: string;
  name: string;
};

export default function NewRFQPage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [rfqNumber, setRfqNumber] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [partName, setPartName] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [material, setMaterial] = useState("");
  const [weight, setWeight] = useState("");
  const [volume, setVolume] = useState("");
  const [cycleTime, setCycleTime] = useState("");
  const [hourRate, setHourRate] = useState("");

  useEffect(() => {
    async function loadCustomers() {
      const supabase = createClient();

      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role !== "estimator") {
        router.replace("/");
        return;
      }

      const { data, error } = await supabase
        .from("customers")
        .select("id, name")
        .order("name");

      if (error) {
        setError(error.message);
      } else {
        setCustomers(data || []);
      }

      setLoadingCustomers(false);
    }

    loadCustomers();
  }, [router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const numericValues = [
      Number(weight),
      Number(volume),
      Number(cycleTime),
      Number(hourRate),
    ];

    if (
      numericValues.some((value) => !Number.isFinite(value) || value <= 0) ||
      !Number.isInteger(Number(volume))
    ) {
      setError("Enter valid positive numbers for all part costing fields.");
      setLoading(false);
      return;
    }

    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/");
        return;
      }

      // Recheck the user's role before creating an RFQ.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError || profile?.role !== "estimator") {
        setError("Only an estimator can create RFQs.");
        return;
      }

      // Create the RFQ first.
      const { data: rfq, error: rfqError } = await supabase
        .from("rfqs")
        .insert({
          rfq_number: rfqNumber.trim(),
          customer_id: customerId,
          owner_id: user.id,
          due_date: dueDate,
          status: "estimating",
        })
        .select("id")
        .single();

      if (rfqError) throw rfqError;

      // Add its part.
      const { error: partError } = await supabase
        .from("parts")
        .insert({
          rfq_id: rfq.id,
          part_name: partName.trim(),
          part_number: partNumber.trim() || null,
          material: material.trim(),
          gross_weight_kg: numericValues[0],
          annual_volume: numericValues[1],
          cycle_time_minutes: numericValues[2],
          machine_hour_rate: numericValues[3],
        });

      if (partError) {
        // Compensate for a failed part insert.
        await supabase.from("rfqs").delete().eq("id", rfq.id);
        throw partError;
      }

      setSuccess("RFQ created successfully!");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      console.error("RFQ creation error:", err);
      setError(
        err instanceof Error ? err.message : "Unable to create RFQ."
      );
    } finally {
      setLoading(false);
    }
  }

  if (loadingCustomers) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-700" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f6f4] p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft size={18} /> Back to dashboard
        </button>

        <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-9">
          <p className="text-xs tracking-wider text-emerald-700 font-semibold">
            RFQ MANAGEMENT
          </p>

          <h1 className="text-3xl font-bold text-[#172923] mt-2">
            Create new RFQ
          </h1>

          <p className="text-gray-500 mt-2 mb-8">
            Enter the customer request and initial part information.
          </p>

          <form onSubmit={handleSubmit} className="space-y-8">
            <section>
              <h2 className="font-semibold text-gray-900 mb-4">
                RFQ details
              </h2>

              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    RFQ Number
                  </label>
                  <input
                    required
                    value={rfqNumber}
                    onChange={(e) => setRfqNumber(e.target.value)}
                    placeholder="RFQ-2611-024"
                    className="mt-2 w-full border rounded-lg p-3 outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Customer
                  </label>
                  <select
                    required
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="mt-2 w-full border rounded-lg p-3 bg-white outline-none focus:ring-2 focus:ring-emerald-700"
                  >
                    <option value="">Select customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                  {customers.length === 0 && (
                    <p className="text-xs text-amber-700 mt-2">
                      No customers found. Check customer read permissions.
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Due Date
                  </label>
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().split("T")[0]}
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="mt-2 w-full border rounded-lg p-3 outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
              </div>
            </section>

            <section className="border-t pt-7">
              <h2 className="font-semibold text-gray-900 mb-4">
                Part information
              </h2>

              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <label className="text-sm font-medium">Part Name</label>
                  <input
                    required
                    value={partName}
                    onChange={(e) => setPartName(e.target.value)}
                    placeholder="Rear wheel spindle"
                    className="mt-2 w-full border rounded-lg p-3"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Part Number</label>
                  <input
                    value={partNumber}
                    onChange={(e) => setPartNumber(e.target.value)}
                    placeholder="RWS-024"
                    className="mt-2 w-full border rounded-lg p-3"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Material</label>
                  <input
                    required
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                    placeholder="EN8"
                    className="mt-2 w-full border rounded-lg p-3"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">
                    Gross Weight (kg)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    required
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="0.61"
                    className="mt-2 w-full border rounded-lg p-3"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">
                    Annual Volume (units)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={volume}
                    onChange={(e) => setVolume(e.target.value)}
                    placeholder="180000"
                    className="mt-2 w-full border rounded-lg p-3"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">
                    Cycle Time (minutes)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    required
                    value={cycleTime}
                    onChange={(e) => setCycleTime(e.target.value)}
                    placeholder="3.2"
                    className="mt-2 w-full border rounded-lg p-3"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">
                    Machine Hour Rate (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={hourRate}
                    onChange={(e) => setHourRate(e.target.value)}
                    placeholder="850"
                    className="mt-2 w-full border rounded-lg p-3"
                  />
                </div>
              </div>
            </section>

            {error && (
              <p role="alert" className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
                {error}
              </p>
            )}

            {success && (
              <p role="status" className="bg-green-50 text-green-700 p-3 rounded-lg text-sm">
                {success}
              </p>
            )}

            <div className="flex justify-end border-t pt-6">
              <button
                type="submit"
                disabled={loading || customers.length === 0}
                className="bg-[#172923] text-white px-6 py-3 rounded-lg flex items-center gap-2 hover:bg-[#263d32] disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Save size={18} />
                )}
                {loading ? "Creating RFQ..." : "Create RFQ"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
