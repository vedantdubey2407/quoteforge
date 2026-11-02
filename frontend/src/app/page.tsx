
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Factory,
  Mail,
  Lock,
  ArrowRight,
  Loader2,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (loading) return;

    setLoading(true);
    setError("");

    const supabase = createClient();

    try {
      // Step 1: Authenticate user
      const { data, error: authError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (!data.user) {
        setError("Unable to verify your account.");
        return;
      }

      // Step 2: Fetch the user's assigned role
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", data.user.id)
        .single();

      // Debugging information
      console.log("Logged in user ID:", data.user.id);
      console.log("Profile response:", profile);
      console.log("Profile error:", profileError);

      if (profileError || !profile) {
        await supabase.auth.signOut();
        setError(
          "Your account has no assigned application role. Please contact the administrator."
        );
        return;
      }

      // Step 3: Redirect based on role
      if (profile.role === "estimator") {
        router.replace("/dashboard");
      } else if (profile.role === "sales_head") {
        router.replace("/approvals");
      } else {
        await supabase.auth.signOut();
        setError("Invalid application role. Please contact the administrator.");
        return;
      }

      router.refresh();
    } catch (err) {
      console.error("Login error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f6f4] flex items-center justify-center p-4 md:p-6">
      <div className="w-full max-w-5xl grid md:grid-cols-2 bg-white rounded-2xl shadow-xl overflow-hidden">

        {/* LEFT BRANDING SECTION */}
        <section className="bg-[#172923] text-white p-8 md:p-14 flex flex-col justify-between min-h-[540px]">
          <div>
            <div className="flex items-center gap-3">
              <Factory size={30} />
              <span className="text-2xl font-bold tracking-tight">
                QuoteForge
              </span>
            </div>

            <p className="text-sm text-emerald-300 mt-2 tracking-wide">
              MANUFACTURING INTELLIGENCE
            </p>
          </div>

          <div className="my-12">
            <p className="text-emerald-300 text-sm font-semibold mb-4">
              FROM RFQ TO QUOTATION
            </p>

            <h1 className="text-4xl font-semibold leading-tight">
              Smarter costing.
              <br />
              Faster decisions.
            </h1>

            <p className="text-gray-300 mt-5 leading-7">
              One workspace for manufacturing estimates,
              version-controlled rates and customer quotations.
            </p>
          </div>

          <p className="text-xs text-gray-400">
            Secure manufacturing quotation workspace
          </p>
        </section>

        {/* RIGHT LOGIN SECTION */}
        <section className="p-8 md:p-14 flex flex-col justify-center">
          <p className="text-sm text-gray-500 font-medium tracking-wide">
            WELCOME BACK
          </p>

          <h2 className="text-3xl font-bold text-gray-900 mt-2">
            Sign in
          </h2>

          <p className="text-gray-500 mt-2 mb-8">
            Enter your credentials to access QuoteForge.
          </p>

          <form onSubmit={handleLogin} className="space-y-5">

            {/* EMAIL */}
            <div>
              <label
                htmlFor="email"
                className="text-sm font-medium text-gray-700"
              >
                Email address
              </label>

              <div className="relative mt-2">
                <Mail
                  className="absolute left-3 top-3.5 text-gray-400"
                  size={18}
                />

                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full border border-gray-200 rounded-lg py-3 pl-10 pr-4 text-gray-900 outline-none focus:ring-2 focus:ring-emerald-700 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* PASSWORD */}
            <div>
              <label
                htmlFor="password"
                className="text-sm font-medium text-gray-700"
              >
                Password
              </label>

              <div className="relative mt-2">
                <Lock
                  className="absolute left-3 top-3.5 text-gray-400"
                  size={18}
                />

                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full border border-gray-200 rounded-lg py-3 pl-10 pr-4 text-gray-900 outline-none focus:ring-2 focus:ring-emerald-700 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* ERROR MESSAGE */}
            {error && (
              <div
                role="alert"
                className="text-sm text-red-600 bg-red-50 border border-red-100 p-3 rounded-lg"
              >
                {error}
              </div>
            )}

            {/* SUBMIT BUTTON */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#172923] text-white py-3 rounded-lg font-semibold hover:bg-[#263d32] transition flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-8">
            Authorized personnel only · QuoteForge
          </p>
        </section>
      </div>
    </main>
  );
}
