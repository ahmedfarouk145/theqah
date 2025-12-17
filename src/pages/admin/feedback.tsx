import { useEffect, useState, useCallback } from "react";
import type { NextPage } from "next";
import { useRouter } from "next/router";
import { CheckCircle, Eye, Trash2, FileText } from "lucide-react";

interface Feedback {
  id: string;
  type: "bug" | "feature" | "question" | "other";
  message: string;
  userEmail?: string;
  userName?: string;
  url?: string;
  status: "new" | "reviewed" | "resolved";
  createdAt: Date;
  resolvedAt?: Date;
  notes?: string;
}

const AdminFeedbackPage: NextPage = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [filter, setFilter] = useState<"all" | "new" | "reviewed" | "resolved">("all");

  const fetchFeedbackCallback = useCallback(async () => {
    setLoading(true);
    try {
      const adminSecret = localStorage.getItem("adminSecret");
      if (!adminSecret) {
        router.push("/admin/login");
        return;
      }

      const response = await fetch("/api/admin/feedback", {
        headers: { Authorization: `Bearer ${adminSecret}` },
      });

      if (!response.ok) throw new Error("Failed to fetch feedback");

      const data = await response.json();
      setFeedbacks(data.feedbacks);
    } catch (error) {
      console.error("Failed to fetch feedback:", error);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchFeedbackCallback();
  }, [fetchFeedbackCallback]);

  const fetchFeedback = async () => {
    await fetchFeedbackCallback();
  };

  const updateStatus = async (id: string, status: "reviewed" | "resolved") => {
    try {
      const adminSecret = localStorage.getItem("adminSecret");
      await fetch("/api/admin/feedback", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ feedbackId: id, status }),
      });
      await fetchFeedback();
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  };

  const deleteFeedback = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه الملاحظة؟")) return;

    try {
      const adminSecret = localStorage.getItem("adminSecret");
      await fetch(`/api/admin/feedback?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminSecret}` },
      });
      await fetchFeedback();
    } catch (error) {
      console.error("Failed to delete feedback:", error);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
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
