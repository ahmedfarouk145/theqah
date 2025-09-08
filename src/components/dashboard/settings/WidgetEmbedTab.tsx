"use client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type StoreInfo = {
  storeUid?: string;        // نتوقع صيغة مثل: "salla:1234567"
  storeId?: string;         // احتياطي
  name?: string;
};

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
          });
        }
      } catch {
        // تجاهل الخطأ وعرض رسالة لاحقًا إذا رغبت
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

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
    <Card className="mt-4">
      <CardContent>
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
  );
}
