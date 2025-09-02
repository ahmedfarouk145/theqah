// src/server/messaging/send-sms.ts
// عميل إرسال SMS عبر OurSMS + قالب الرسالة الموحد + رابر sendSms(to, text, opts?)

type MsgClass = "transactional" | "promotional" | "";

export type SendSMSParams = {
  to: string | string[];         // رقم واحد أو مجموعة أرقام (E.164 مفضل)
  text: string;                  // نص الرسالة
  customId?: string | null;      // معرف خاص بك يظهر في تقاريرهم (اختياري)
  priority?: 0 | 1 | 2 | 3 | 4;  // 1 أعلى أولوية - 0 = تلقائي (افتراضي)
  delayMinutes?: number;         // تأخير بالدقائق (افتراضي 0)
  validityMinutes?: number;      // صلاحية بالدقائق (افتراضي 0 = أقصى مدة)
  msgClass?: MsgClass;           // "transactional" | "promotional" | ""
  requestDlr?: boolean;          // DLR لو مدعوم (افتراضي false)
};

export type OursmsSendResult = {
  jobId: string;
  customId: string | null;
  total: number;
  rejected: number;
  accepted: number;
  duplicates: number;
  cost: number;
  acceptedMsgs?: unknown;
  rejectedMsgs?: unknown;
  statusCode?: number | null;
  statusDesc?: string | null;
  message?: string | null;
};

export type SendSmsOptions = {
  defaultCountry?: "SA" | "EG";
  msgClass?: MsgClass;
  requestDlr?: boolean;
  priority?: 0 | 1 | 2 | 3 | 4;
  delayMinutes?: number;
  validityMinutes?: number;
};

function env(name: string, fallback?: string) {
  const v = process.env[name];
  return (v && v.trim()) || fallback || "";
}

// ---------- القالب الموحّد ----------
export function buildInviteSMS(storeName: string | null | undefined, link: string) {
  const s = (storeName || "").trim() || "متجرك";

  // قابل للتخصيص من ENV (اختياري):
  // INVITE_SMS_TEMPLATE="مرحباً، قيّم تجربتك من {{store}}: {{link}} وساهم في إسعاد يتيم!"
  const tpl = env("INVITE_SMS_TEMPLATE");
  if (tpl) {
    return tpl.replace(/\{\{store\}\}/g, s).replace(/\{\{link\}\}/g, link);
  }

  // الافتراضي المطلوب
  return `مرحباً، قيّم تجربتك من ${s}: ${link} وساهم في إسعاد يتيم!`;
}

// ---------- تطبيع رقم الهاتف إلى E.164 (مبسّط لـ SA/EG) ----------
function normalizePhone(raw: string, def?: "SA" | "EG"): string {
  const digits = String(raw).replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0")) {
    if (def === "SA") return `+966${digits.slice(1)}`;
    if (def === "EG") return `+20${digits.slice(1)}`;
  }
  if (def === "SA") return `+966${digits}`;
  if (def === "EG") return `+20${digits}`;
  return digits;
}

// ---------- الإرسال عبر OurSMS ----------
export async function sendSMSViaOursms(params: SendSMSParams) {
  const API_KEY = env("OURSMS_API_KEY");
  if (!API_KEY) {
    throw new Error("OURSMS_API_KEY is missing");
  }

  const BASE = env("OURSMS_BASE_URL", "https://api.oursms.com");
  const SENDER = env("OURSMS_SENDER"); // يجب أن يكون مُعتمد في بعض الدول

  const {
    to,
    text,
    //eslint-disable-next-line @typescript-eslint/no-unused-vars
    customId = null,
    priority = 0,
    delayMinutes = 0,
    validityMinutes = 0,
    msgClass = "",
    requestDlr = false,
  } = params;

  const dests = Array.isArray(to) ? to : [to];

  const url = `${BASE.replace(/\/+$/, "")}/msgs/sms`;

  const body = {
    src: SENDER || "oursms",
    dests,
    body: text,
    priority,
    delay: delayMinutes,
    validity: validityMinutes,
    maxParts: 0,
    dlr: requestDlr ? 1 : 0,
    prevDups: 0,
    msgClass: msgClass || undefined,
    // customId: يمكن إضافته إذا كان حسابك يدعمه في هذا المسار
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const textErr = await res.text().catch(() => "");
    throw new Error(`oursms_http_${res.status}${textErr ? `: ${textErr}` : ""}`);
  }

  const json = (await res.json().catch(() => ({}))) as Partial<OursmsSendResult>;

  return {
    ok: true as const,
    result: {
      jobId: String(json.jobId || ""),
      customId: (json.customId ?? null) as string | null,
      total: Number(json.total ?? 0),
      rejected: Number(json.rejected ?? 0),
      accepted: Number(json.accepted ?? 0),
      duplicates: Number(json.duplicates ?? 0),
      cost: Number(json.cost ?? 0),
      acceptedMsgs: json.acceptedMsgs ?? null,
      rejectedMsgs: json.rejectedMsgs ?? null,
      statusCode: (json.statusCode ?? null) as number | null,
      statusDesc: (json.statusDesc ?? null) as string | null,
      message: (json.message ?? null) as string | null,
    } as OursmsSendResult,
  };
}

// ---------- (اختياري) رصيد الحساب ----------
export async function getOursmsCredits() {
  const API_KEY = env("OURSMS_API_KEY");
  const BASE = env("OURSMS_BASE_URL", "https://api.oursms.com");
  if (!API_KEY) throw new Error("OURSMS_API_KEY is missing");

  const url = `${BASE.replace(/\/+$/, "")}/billing/credits`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`oursms_http_${res.status}${t ? `: ${t}` : ""}`);
  }
  return res.json();
}

// ---------- (اختياري) سحب DLRs ----------
export async function getOursmsDlrs(count = 100) {
  const API_KEY = env("OURSMS_API_KEY");
  const BASE = env("OURSMS_BASE_URL", "https://api.oursms.com");
  if (!API_KEY) throw new Error("OURSMS_API_KEY is missing");

  const url = `${BASE.replace(/\/+$/, "")}/inbox/dlrs?count=${Math.min(
    Math.max(1, count),
    500
  )}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`oursms_http_${res.status}${t ? `: ${t}` : ""}`);
  }
  return res.json();
}

// ---------- الرابر الموحّد المطلوب من بقية المشروع ----------
export async function sendSms(
  to: string | string[],
  text: string,
  opts?: SendSmsOptions
): Promise<{ ok: boolean }> {
  const dests = (Array.isArray(to) ? to : [to]).map((n) =>
    normalizePhone(n, opts?.defaultCountry)
  );

  const res = await sendSMSViaOursms({
    to: dests,
    text,
    msgClass: opts?.msgClass ?? "",
    requestDlr: !!opts?.requestDlr,
    priority: opts?.priority ?? 0,
    delayMinutes: opts?.delayMinutes ?? 0,
    validityMinutes: opts?.validityMinutes ?? 0,
  });

  return { ok: !!res?.ok };
}

// اجعل الرابر هو الـ default export أيضاً
export default sendSms;
