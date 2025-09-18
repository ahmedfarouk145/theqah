export default function SallaOAuthInfo() {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "";
  return (
    <main dir="rtl" style={{maxWidth:760,margin:"40px auto",fontFamily:"Tahoma,Arial"}}>
      <h1>مصادقة سلة — النمط السهل (Easy OAuth)</h1>
      <ol>
        <li>التاجر يثبّت التطبيق من متجر سلة.</li>
        <li>سلة ترسل حدث <code>app.store.authorize</code> إلى <code>/api/salla/webhook</code>.</li>
        <li>نحفظ <b>access_token</b> و <b>refresh_token</b> في <code>salla_tokens</code>، وننشئ/نحدّث <code>stores</code>.</li>
        <li>نرسل بريدًا ترحيبيًا للتاجر يحتوي رابط لوحة التحكم.</li>
      </ol>
      <p>نقطة الفحص: <code>{base}/api/salla/verify?uid=salla:&lt;storeId&gt;</code></p>
    </main>
  );
}
