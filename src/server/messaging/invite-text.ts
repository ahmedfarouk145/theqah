// src/server/messaging/invite-text.ts
export function buildFixedInviteText(name: string, storeName: string, link: string) {
  const n = name || "عميلنا";
  const s = storeName || "متجرنا";
  return `مرحباً ${n}، قيم تجربتك من ${s}: ${link} وساهم في إسعاد يتيم!`;
}
