import React from "react";
import { PLANS } from "@/config/plans";

export default function PricingTable() {
  const plans = [PLANS.TRIAL, PLANS.PAID_MONTHLY, PLANS.PAID_ANNUAL];

  return (
    <section className="w-full py-10">
      <div className="mx-auto max-w-6xl px-4">
        <header className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            التقييمات الموثّقة هي سمعتك الإلكترونية
          </h2>
          <p className="mt-3 text-gray-600">
            اختر ما يناسب متجرك — وابدأ بتحويل كل عملية شراء إلى دليل ثقة جديد.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`rounded-2xl border p-6 flex flex-col justify-between shadow-sm ${
                p.highlight ? "border-indigo-500 ring-2 ring-indigo-200" : "border-gray-200"
              }`}
            >
              <div>
                <h3 className="text-xl font-bold">{p.name}</h3>
                <div className="mt-2">
                  {p.priceSar === null ? (
                    <div className="text-3xl font-extrabold">بالاتفاق</div>
                  ) : (
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <div className="text-3xl font-extrabold">
                        {p.priceSar} <span className="text-base font-normal">ريال</span>
                      </div>
                      {p.priceBeforeDiscount && (
                        <span className="text-sm text-gray-500 line-through">
                          {p.priceBeforeDiscount} ريال
                        </span>
                      )}
                      <span className="text-base font-normal text-gray-600">/ شهر</span>
                    </div>
                  )}
                </div>

                <p className="mt-2 text-gray-600">
                  {p.reviewsPerMonth ? `${p.reviewsPerMonth} مراجعة شهرياً` : "مراجعات مخصصة حسب الاتفاق"}
                </p>

                <ul className="mt-4 space-y-2">
                  {p.features.map((f: string, i: number) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6">
                <button
                  className={`w-full rounded-xl px-4 py-2 font-semibold transition ${
                    p.highlight
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "bg-gray-900 text-white hover:bg-black"
                  }`}
                  onClick={() => {
                    // TODO: افتح صفحة شراء التطبيق في سلة أو مسار الدفع الداخلي
                    // مثال: router.push(`/subscribe?plan=${p.id}`)
                  }}
                >
                  اشترك الآن
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          الأسعار بالريال السعودي شهريًا. قد تُطبَّق ضرائب أو رسوم بوابة دفع حسب لوائح البلد.
        </p>
      </div>
    </section>
  );
}
