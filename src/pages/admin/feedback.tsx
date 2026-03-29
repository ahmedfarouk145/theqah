import { useEffect, useState, useCallback } from "react";
import type { NextPage } from "next";
import { isAxiosError } from "axios";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { useRouter } from "next/router";
import { CheckCircle, Eye, Trash2, FileText } from "lucide-react";
import axios from "@/lib/axiosInstance";
import { app } from "@/lib/firebase";

interface Feedback {
  id: string;
  type: "bug" | "feature" | "question" | "other";
  message: string;
  userEmail?: string;
  userName?: string;
  url?: string;
  status: "new" | "reviewed" | "resolved";
  createdAt: string | number | Date;
  resolvedAt?: string | number | Date;
  notes?: string;
}

const AdminFeedbackPage: NextPage = () => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [filter, setFilter] = useState<"all" | "new" | "reviewed" | "resolved">("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      setAuthLoading(false);
      return;
    }

    try {
      const auth = getAuth(app);
      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        setAuthLoading(false);
        if (!currentUser) {
          router.push("/login");
        }
      });
      return unsubscribe;
    } catch (authError) {
      console.warn("[AdminFeedback] Firebase auth error:", authError);
      setAuthLoading(false);
      setError("تعذر التحقق من جلسة المشرف.");
    }
  }, [router]);

  const fetchFeedbackCallback = useCallback(async () => {
    if (!user) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.get<{ feedbacks?: Feedback[]; feedback?: Feedback[] }>("/api/admin/feedback");
      setFeedbacks(data.feedbacks || data.feedback || []);
    } catch (fetchError) {
      console.error("Failed to fetch feedback:", fetchError);
      if (isAxiosError(fetchError)) {
        setError((fetchError.response?.data as { message?: string } | undefined)?.message || fetchError.message);
      } else {
        setError("فشل في تحميل الملاحظات.");
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) {
      void fetchFeedbackCallback();
    }
  }, [authLoading, fetchFeedbackCallback, user]);

  const fetchFeedback = async () => {
    await fetchFeedbackCallback();
  };

  const updateStatus = async (id: string, status: "reviewed" | "resolved") => {
    try {
      await axios.put("/api/admin/feedback", { feedbackId: id, status });
      await fetchFeedback();
    } catch (updateError) {
      console.error("Failed to update status:", updateError);
      setError(isAxiosError(updateError) ? updateError.message : "فشل في تحديث الحالة.");
    }
  };

  const deleteFeedback = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه الملاحظة؟")) return;

    try {
      await axios.delete("/api/admin/feedback", { params: { id } });
      await fetchFeedback();
    } catch (deleteError) {
      console.error("Failed to delete feedback:", deleteError);
      setError(isAxiosError(deleteError) ? deleteError.message : "فشل في حذف الملاحظة.");
    }
  };

  const filteredFeedbacks =
    filter === "all"
      ? feedbacks
      : feedbacks.filter((f) => f.status === filter);

  const typeLabels: Record<string, { label: string; emoji: string }> = {
    bug: { label: "Bug", emoji: "🐛" },
    feature: { label: "Feature", emoji: "💡" },
    question: { label: "Question", emoji: "❓" },
    other: { label: "Other", emoji: "💬" },
  };

  const statusColors = {
    new: "bg-blue-100 text-blue-800",
    reviewed: "bg-yellow-100 text-yellow-800",
    resolved: "bg-green-100 text-green-800",
  };

  if (authLoading || (loading && feedbacks.length === 0)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <h2 className="text-lg font-semibold text-red-800">تسجيل الدخول مطلوب</h2>
          <p className="mt-2 text-red-600">يجب تسجيل الدخول بحساب مشرف للوصول إلى صفحة الملاحظات.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">User Feedback</h1>
              <p className="text-sm text-gray-600 mt-1">
                {feedbacks.length} total feedbacks
              </p>
            </div>
            <button
              onClick={() => fetchFeedback()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 mb-6">
          {["all", "new", "reviewed", "resolved"].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status as "all" | "new" | "reviewed" | "resolved")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === status
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
              {status !== "all" &&
                ` (${feedbacks.filter((f) => f.status === status).length})`}
            </button>
          ))}
        </div>

        {/* Feedback List */}
        <div className="space-y-4">
          {filteredFeedbacks.map((feedback) => (
            <div key={feedback.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{typeLabels[feedback.type].emoji}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">
                        {typeLabels[feedback.type].label}
                      </span>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          statusColors[feedback.status]
                        }`}
                      >
                        {feedback.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {new Date(feedback.createdAt).toLocaleString("ar-SA")}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {feedback.status === "new" && (
                    <button
                      onClick={() => updateStatus(feedback.id, "reviewed")}
                      className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg"
                      title="Mark as Reviewed"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                  )}
                  {feedback.status !== "resolved" && (
                    <button
                      onClick={() => updateStatus(feedback.id, "resolved")}
                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                      title="Mark as Resolved"
                    >
                      <CheckCircle className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteFeedback(feedback.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-gray-900 whitespace-pre-wrap">{feedback.message}</p>
              </div>

              {(feedback.userName || feedback.userEmail || feedback.url) && (
                <div className="border-t pt-4 space-y-2 text-sm">
                  {feedback.userName && (
                    <p className="text-gray-600">
                      <span className="font-medium">User:</span> {feedback.userName}
                    </p>
                  )}
                  {feedback.userEmail && (
                    <p className="text-gray-600">
                      <span className="font-medium">Email:</span> {feedback.userEmail}
                    </p>
                  )}
                  {feedback.url && (
                    <p className="text-gray-600 text-xs">
                      <span className="font-medium">Page:</span>{" "}
                      <a
                        href={feedback.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {feedback.url}
                      </a>
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}

          {filteredFeedbacks.length === 0 && (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No feedback found</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminFeedbackPage;
