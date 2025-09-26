// ✅ قالب SMS موحّد وقصير لتجنّب multipart
export function buildReviewSms(customerName: string, storeName: string, url: string) {
  const name = customerName || 'العميل';
  const store = storeName || 'المتجر';
  // ملاحظة: اختصر النص لأقل من ~70 حرف Unicode قدر الإمكان
  return `مرحباً ${name}، قيّم تجربتك من ${store}: ${url}`;
}
