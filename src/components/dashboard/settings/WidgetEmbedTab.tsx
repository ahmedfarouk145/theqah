"use client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type StoreInfo = {
  storeUid?: string;        // نتوقع صيغة مثل: "salla:1234567"
  storeId?: string;         // احتياطي
  name?: string;
  certificatePosition?: string;
};

type PositionOption = {
  value: string;
  label: string;
  description: string;
};

const positionOptions: PositionOption[] = [
  { value: "auto", label: "تلقائي (ذكي)", description: "يختار أفضل مكان تلقائياً" },
  { value: "before-reviews", label: "قبل التقييمات", description: "يظهر فوق قسم التقييمات مباشرة" },
  { value: "after-reviews", label: "بعد التقييمات", description: "يظهر أسفل قسم التقييمات" },
  { value: "footer", label: "فوق الفوتر", description: "يظهر قبل نهاية الصفحة" },
  { value: "floating", label: "عائم (زاوية)", description: "يظهر كبادج عائم في الزاوية" },
];

function buildSnippet(storeUid: string) {
  return `<!-- Theqah Reviews Widget (Salla) -->
<div id="theqah-reviews"
     class="theqah-reviews"
     data-store="${storeUid}"
     data-product=""
     data-limit="10"
     data-lang="ar"
     data-theme="light"></div>

<script>
(function(){
  var m = (location.pathname||"").match(/\\/p(\\d+)(?:\\/|$)/);
  var pid = m ? m[1] : "";
  var host = document.querySelector('#theqah-reviews.theqah-reviews');
  if (host && pid) host.setAttribute('data-product', pid);
  if (!document.querySelector('script[data-theqah-widget]')) {
    var s=document.createElement('script');
    s.src='https://www.theqah.com.sa/widgets/theqah-widget.js';
    s.async=true;
    s.setAttribute('data-theqah-widget','1');
    document.body.appendChild(s);
  }
})();
</script>
<!-- /Theqah Reviews Widget -->`;
}

export default function WidgetEmbedTab() {
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [position, setPosition] = useState("auto");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/store/info");
        const j = await res.json();
        if (mounted) {
          // نحاول بناء storeUid: لو عندك بالفعل بصيغة "salla:ID" استخدمها
          // وإلا إن كان لديك storeId رقمي من سلة، لفه إلى "salla:{id}"
          const storeUid: string | undefined =
            j?.store?.storeUid ||
            (j?.store?.salla?.storeId ? `salla:${j.store.salla.storeId}` : undefined);

          setStore({
            storeUid,
            storeId: j?.store?.salla?.storeId,
            name: j?.store?.name,
            certificatePosition: j?.store?.settings?.certificatePosition || "auto",
          });
          setPosition(j?.store?.settings?.certificatePosition || "auto");
        }
      } catch {
        // تجاهل الخطأ وعرض رسالة لاحقًا إذا رغبت
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleSavePosition = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/store/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certificatePosition: position }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) {
      console.error("Failed to save position:", e);
    } finally {
      setSaving(false);
    }
  };

  const snippet = useMemo(() => {
    const suid = store?.storeUid || (store?.storeId ? `salla:${store.storeId}` : "");
    return suid ? buildSnippet(suid) : "";
  }, [store]);

  const copyToClipboard = async () => {
    if (!snippet) return;
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4 mt-4">
      {/* Certificate Position Settings */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold mb-2">مكان شهادة التوثيق</h2>
          <p className="text-sm text-muted-foreground mb-4">
            اختر أين تريد أن تظهر شهادة توثيق التقييمات في متجرك
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {positionOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPosition(opt.value)}
                className={`p-3 rounded-lg border-2 text-start transition-all ${position === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                  }`}
              >
                <div className="font-medium text-sm">{opt.label}</div>
                <div className="text-xs text-muted-foreground">{opt.description}</div>
              </button>
            ))}
          </div>

          <Button
            onClick={handleSavePosition}
            disabled={saving || position === store?.certificatePosition}
            size="sm"
          >
            {saving ? "جاري الحفظ..." : saved ? "✔ تم الحفظ" : "حفظ الإعداد"}
          </Button>
        </CardContent>
      </Card>

      {/* Widget Embed Code */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold mb-2">تضمين الودجت</h2>
          <ol className="list-decimal ms-5 text-sm space-y-1 mb-3">
            <li>اذهب إلى <b>لوحة تحكم سلة → المظهر → تخصيص → إضافة كود HTML قبل &lt;/body&gt;</b>.</li>
            <li>انسخ الكود التالي وألصقه كما هو.</li>
            <li>احفظ التغييرات ثم افتح صفحة أي منتج لترى التقييمات.</li>
          </ol>

          {loading ? (
            <p className="text-sm opacity-80">جاري التحميل…</p>
          ) : snippet ? (
            <>
              <textarea
                readOnly
                value={snippet}
                className="w-full h-64 font-mono text-xs p-2 border rounded mb-3"
              />
              <Button onClick={copyToClipboard}>
                {copied ? "✔ تم النسخ" : "📋 نسخ الكود"}
              </Button>
            </>
          ) : (
            <p className="text-sm text-red-600">
              تعذّر توليد الكود — لم يتم العثور على store_id. تأكد من إتمام الربط (تنزيل التطبيق) بنجاح.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

