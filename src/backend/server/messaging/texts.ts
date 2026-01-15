export type InviteKind = 'first' | 'reminder';

export function buildInviteText(opts: {
  locale: 'ar'|'en'; customerName: string; storeName: string; url: string; kind?: InviteKind;
}) {
  const k = opts.kind || 'first';
  if (opts.locale === 'en') {
    const base = k==='reminder'
      ? `Reminder: ${opts.customerName || 'dear customer'}, rate your experience with ${opts.storeName}: ${opts.url}`
      : `Hi ${opts.customerName || 'dear customer'}, rate your experience with ${opts.storeName}: ${opts.url}`;
    return `${base} and help make an orphan smile!`;
  }
  const name = (opts.customerName || 'عميلنا العزيز').trim();
  const base = k==='reminder'
    ? `تذكير: ${name}، قيّم تجربتك من ${opts.storeName}: ${opts.url}`
    : `مرحباً ${name}، قيّم تجربتك من ${opts.storeName}: ${opts.url}`;
  return `${base} وساهم في إسعاد يتيم!`;
}
