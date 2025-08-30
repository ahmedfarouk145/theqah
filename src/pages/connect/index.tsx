import Head from "next/head";
import Link from "next/link";

export default function ConnectIndex() {
  return (
    <>
      <Head><title>ربط متجرك | Theqah</title></Head>
      <div dir="rtl" className="min-h-screen bg-gray-50">
        <div className="max-w-xl mx-auto p-6">
          <h1 className="text-2xl font-bold mb-4">اختَر المنصّة لبدء الربط</h1>
          <p className="text-gray-600 mb-6">
            اربط متجرك لإرسال روابط المراجعات تلقائيًا بعد نجاح الطلب.
          </p>
          <div className="grid gap-3">
            <Link href="/connect/zid" className="rounded-xl bg-white border p-4 hover:bg-gray-50">
              زد (Zid)
            </Link>
            <Link href="/connect/salla" className="rounded-xl bg-white border p-4 hover:bg-gray-50">
              سلة (Salla)
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
