import { useState, FormEvent } from "react";
import type { NextPage } from "next";
import { useRouter } from "next/router";

const AdminLogin: NextPage = () => {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Verify the secret by making a test API call
      const response = await fetch("/api/admin/monitor-app?period=24h", {
        headers: {
          Authorization: `Bearer ${secret}`,
        },
      });

      if (!response.ok) {
        throw new Error("Invalid admin secret");
      }

      // Store in localStorage
      localStorage.setItem("adminSecret", secret);
      
      // Redirect to monitoring dashboard
      router.push("/admin/monitoring");
    } catch {
      setError("Invalid admin secret. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Login</h1>
          <p className="text-gray-600 mt-2">Enter your admin secret to access monitoring</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8">
          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label htmlFor="secret" className="block text-sm font-medium text-gray-700 mb-2">
                Admin Secret
              </label>
              <input
                id="secret"
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter ADMIN_SECRET"
                required
                autoComplete="off"
              />
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? "Verifying..." : "Access Monitoring"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              The admin secret is stored in environment variables.
              <br />
              For security, it&apos;s never exposed in the frontend code.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
