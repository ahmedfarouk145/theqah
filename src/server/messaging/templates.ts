// src/server/messaging/templates.ts
// ✅ قالب SMS موحّد — لازم يطابق التدقيق حرفيًا (لاحظ ::)
export function buildReviewSms(customerName: string, storeName: string, url: string) {
  const name = customerName || 'العميل';
  const store = storeName || 'المتجر';
  return `مرحباً ${name}، قيم تجربتك من ${store}:: ${url} وساهم في إسعاد يتيم!`;
}
