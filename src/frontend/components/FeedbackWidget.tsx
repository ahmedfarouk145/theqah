import { useState, FormEvent } from "react";
import { X, MessageSquare, Bug, Lightbulb, HelpCircle, Send, CheckCircle } from "lucide-react";

interface FeedbackWidgetProps {
  userEmail?: string;
  userName?: string;
}

type FeedbackType = "bug" | "feature" | "question" | "other";

export default function FeedbackWidget({ userEmail, userName }: FeedbackWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const feedbackTypes = [
    { value: "bug", label: "🐛 Bug Report", icon: Bug, color: "bg-red-50 border-red-200 text-red-700" },
    { value: "feature", label: "💡 Feature Request", icon: Lightbulb, color: "bg-blue-50 border-blue-200 text-blue-700" },
    { value: "question", label: "❓ Question", icon: HelpCircle, color: "bg-purple-50 border-purple-200 text-purple-700" },
    { value: "other", label: "💬 Other", icon: MessageSquare, color: "bg-gray-50 border-gray-200 text-gray-700" },
  ];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          message,
          userEmail,
          userName,
          userAgent: navigator.userAgent,
          url: window.location.href,
        }),
      });

      if (!response.ok) throw new Error("Failed to submit feedback");

      setSubmitted(true);
      setTimeout(() => {
        setIsOpen(false);
        setSubmitted(false);
        setMessage("");
        setType("bug");
      }, 2000);
    } catch (error) {
      console.error("Failed to submit feedback:", error);
      alert("فشل إرسال الملاحظات. يرجى المحاولة مرة أخرى.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-full px-6 py-3 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center gap-2 group"
          aria-label="إرسال ملاحظات"
        >
          <MessageSquare className="w-5 h-5 group-hover:rotate-12 transition-transform" />
          <span className="font-medium">ملاحظاتك</span>
        </button>
      )}

      {/* Feedback Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Modal Content */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden animate-slide-up">
            {submitted ? (
              /* Success State */
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  شكراً لك! 🎉
                </h3>
                <p className="text-gray-600">
                  تم استلام ملاحظاتك بنجاح. نحن نقدر وقتك!
                </p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-6 h-6" />
                      <h2 className="text-xl font-bold">شاركنا رأيك</h2>
                    </div>
                    <button
                      onClick={() => setIsOpen(false)}
                      className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                      aria-label="إغلاق"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-blue-100 text-sm">
                    ساعدنا في تحسين TheQah
                  </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                  {/* Type Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      نوع الملاحظة
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {feedbackTypes.map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.value}
                            type="button"
                            onClick={() => setType(item.value as FeedbackType)}
                            aria-label={item.label}
                            className={`p-3 border-2 rounded-xl text-sm font-medium transition-all ${
                              type === item.value
                                ? item.color + " scale-105"
                                : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                            }`}
                          >
                            <Icon className="w-5 h-5 mx-auto mb-1" />
                            <span className="block text-xs">
                              {item.label.split(" ")[1]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Message */}
                  <div>
                    <label
                      htmlFor="feedback-message"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      رسالتك
                    </label>
                    <textarea
                      id="feedback-message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="اكتب ملاحظاتك هنا..."
                      rows={5}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-shadow"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      {message.length} / 500 حرف
                    </p>
                  </div>

                  {/* User Info (if available) */}
                  {(userName || userEmail) && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-600 mb-1">سيتم الإرسال من:</p>
                      <p className="text-sm font-medium text-gray-900">
                        {userName || userEmail}
                      </p>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loading || message.length < 10}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-4 rounded-xl font-medium hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group"
                  >
                    {loading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>جاري الإرسال...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        <span>إرسال الملاحظات</span>
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
