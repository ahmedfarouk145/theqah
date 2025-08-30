"use client";
import { useEffect, useMemo, useState, useCallback } from "react";

type Reply = {
  id: string;
  reviewId: string;
  storeId: string;
  userId: string;
  text: string;
  createdAt: number;
};

type Props = {
  reviewId: string;
  storeId: string;    // هنبعته في الهيدر للتحقق بالسيرفر
  canPost?: boolean;  // تحكم من صلاحيات الواجهة
};

function fmt(ts: number) {
  try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
}

export default function RepliesTab({ reviewId, storeId, canPost = true }: Props) {
  const [items, setItems] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const disabled = useMemo(() => posting || !text.trim(), [posting, text]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/reply`, {
        headers: { "x-store-id": storeId },
      });
      const j = await r.json();
      if (j?.ok) setItems(j.items || []);
    } finally {
      setLoading(false);
    }
  }, [reviewId, storeId]);

  const post = useCallback(async () => {
    if (!text.trim()) return;
    setPosting(true);
    try {
      const r = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-store-id": storeId,
        },
        body: JSON.stringify({ text }),
      });
      const j = await r.json();
      if (j?.ok) {
        setText("");
        await load();
      } else {
        alert(j?.error || "فشل إرسال الرد");
      }
    } finally {
      setPosting(false);
    }
  }, [text, reviewId, storeId, load]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">الردود</h3>
        <button onClick={load} className="text-sm text-gray-600 hover:underline">تحديث</button>
      </div>

      {loading ? (
        <div className="animate-pulse h-20 bg-gray-100 rounded-xl" />
      ) : items.length === 0 ? (
        <div className="text-sm text-gray-500">لا توجد ردود بعد.</div>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <div key={r.id} className="border rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">{fmt(r.createdAt)}</div>
              <div className="whitespace-pre-wrap leading-7">{r.text}</div>
            </div>
          ))}
        </div>
      )}

      {canPost && (
        <div className="border rounded-xl p-3 space-y-2">
          <label className="text-sm">إضافة رد</label>
          <textarea
            className="w-full border rounded-lg p-2 min-h-[90px]"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            placeholder="اكتب ردك للعميل…"
          />
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{text.length}/2000</span>
            <button
              onClick={post}
              disabled={disabled}
              className="px-3 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
            >
              نشر الرد
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
