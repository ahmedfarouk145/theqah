// عميل إرسال SMS عبر OurSMS + قالب الرسالة الموحد + رابر sendSms(to, text, opts?)

type MsgClass = "transactional" | "promotional" | "";

export type SendSMSParams = {
  to: string | string[];
  text: string;
  customId?: string | null;
  priority?: 0 | 1 | 2 | 3 | 4;
  delayMinutes?: number;
  validityMinutes?: number;
  msgClass?: MsgClass;
  requestDlr?: boolean;
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

export type SendSmsResult = {
  ok: boolean;
  id: string | null;
  error: string | null;
};

function env(name: string, fallback?: string) {
  const v = process.env[name];
  return (v && v.trim()) || fallback || "";
}

// Import Firebase Admin for logging
import { dbAdmin } from "@/lib/firebaseAdmin";

// Enhanced SMS logging function
async function logSmsAttempt(
  to: string | string[],
  text: string,
  success: boolean,
  jobId?: string | null,
  error?: string,
  stats?: { total?: number; accepted?: number; rejected?: number; cost?: number }
) {
  try {
    const db = dbAdmin();
    const logData = {
      to: Array.isArray(to) ? to : [to],
      toCount: Array.isArray(to) ? to.length : 1,
      text: text.substring(0, 200), // First 200 chars for privacy
      textLength: text.length,
      success,
      jobId: jobId || null,
      error: error || null,
      stats: stats || null,
      timestamp: Date.now(),
      service: 'oursms',
      createdAt: new Date().toISOString()
    };
    
    // Log to sms_logs collection
    await db.collection("sms_logs").add(logData);
    
    // Update stats
    const statsRef = db.collection("sms_stats").doc("summary");
    await db.runTransaction(async (transaction) => {
      const statsDoc = await transaction.get(statsRef);
      const currentStats = (statsDoc.exists ? statsDoc.data() : {}) || {};
      
      const messageCount = Array.isArray(to) ? to.length : 1;
      
      transaction.set(statsRef, {
        totalAttempts: (currentStats?.totalAttempts || 0) + 1,
        totalMessages: (currentStats?.totalMessages || 0) + messageCount,
        successful: success ? (currentStats?.successful || 0) + 1 : (currentStats?.successful || 0),
        failed: success ? (currentStats?.failed || 0) : (currentStats?.failed || 0) + 1,
        messagesDelivered: success ? (currentStats?.messagesDelivered || 0) + (stats?.accepted || messageCount) : (currentStats?.messagesDelivered || 0),
        messagesRejected: (currentStats?.messagesRejected || 0) + (stats?.rejected || 0),
        totalCost: (currentStats?.totalCost || 0) + (stats?.cost || 0),
        lastAttempt: Date.now(),
        updatedAt: Date.now()
      }, { merge: true });
    });
    
  } catch (logError) {
    console.error("[OURSMS] Failed to log SMS attempt:", logError);
  }
}

// ---------- القالب الموحّد ----------
export function buildInviteSMS(storeName: string | null | undefined, link: string) {
  const s = (storeName || "").trim() || "متجرك";
  const tpl = env("INVITE_SMS_TEMPLATE"); // اختياري
  if (tpl) {
    return tpl.replace(/\{\{store\}\}/g, s).replace(/\{\{link\}\}/g, link);
  }
  return `مرحباً، قيّم تجربتك من ${s}: ${link} وساهم في إسعاد يتيم!`;
}

// ---------- تطبيع رقم الهاتف ----------
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

// util: Timeout لطلبات fetch
async function fetchWithTimeout(input: RequestInfo, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 20000, ...rest } = init;
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...rest, signal: ac.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

// ---------- الإرسال عبر OurSMS ----------
export async function sendSMSViaOursms(params: SendSMSParams) {
  const { to, text } = params; // Extract for logging
  
  try {
    const API_KEY = env("OURSMS_API_KEY");
    if (!API_KEY) throw new Error("OURSMS_API_KEY is missing");

  const BASE = env("OURSMS_BASE_URL", "https://api.oursms.com");
  const SENDER = env("OURSMS_SENDER");

  const {
    to,
    text,
    customId = null, // Used in API response
    priority = 1,
    delayMinutes = 0,
    validityMinutes = 0,
    msgClass = "transactional",
    requestDlr = true,
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
  };

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    timeoutMs: 20000,
  });

  if (!res.ok) {
    const textErr = await res.text().catch(() => "");
    throw new Error(`oursms_http_${res.status}${textErr ? `: ${textErr}` : ""}`);
  }

  const json = (await res.json().catch(() => ({}))) as Partial<OursmsSendResult>;

  const result = {
    jobId: String(json.jobId || ""),
    customId: customId ?? (json.customId ?? null) as string | null,
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
  } as OursmsSendResult;

  console.log(`[OURSMS] ✅ SMS sent successfully - Job ID: ${result.jobId}, Accepted: ${result.accepted}/${result.total}, Cost: ${result.cost}`);

  // Log success
  await logSmsAttempt(to, text, true, result.jobId, undefined, {
    total: result.total,
    accepted: result.accepted,
    rejected: result.rejected,
    cost: result.cost
  });

  return {
    ok: true as const,
    result,
  };
  
  } catch (error: unknown) {
    const errorMessage = (error as Error)?.message || String(error);
    
    console.error(`[OURSMS] ❌ Failed to send SMS:`, {
      error: errorMessage,
      to: Array.isArray(to) ? to : [to],
      textLength: text.length
    });
    
    // Log failure
    await logSmsAttempt(to, text, false, null, errorMessage);
    
    throw error; // Re-throw for caller handling
  }
}

// ---------- (اختياري) رصيد الحساب ----------
export async function getOursmsCredits() {
  const API_KEY = env("OURSMS_API_KEY");
  const BASE = env("OURSMS_BASE_URL", "https://api.oursms.com");
  if (!API_KEY) throw new Error("OURSMS_API_KEY is missing");

  const url = `${BASE.replace(/\/+$/, "")}/billing/credits`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
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

  const url = `${BASE.replace(/\/+$/, "")}/inbox/dlrs?count=${Math.min(Math.max(1, count), 500)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`oursms_http_${res.status}${t ? `: ${t}` : ""}`);
  }
  return res.json();
}

// ---------- الرابر ----------
export async function sendSms(
  to: string | string[],
  text: string,
  opts?: SendSmsOptions
): Promise<SendSmsResult> {
  const defaultCountry: "SA" = (opts?.defaultCountry ?? "SA") as "SA";

  const dests = (Array.isArray(to) ? to : [to]).map((n) =>
    normalizePhone(n, defaultCountry)
  );

  const msgClass: MsgClass = opts?.msgClass ?? "transactional";
  const priority: 0 | 1 | 2 | 3 | 4 = opts?.priority ?? 1;
  const requestDlr = opts?.requestDlr ?? true;
  const delayMinutes = opts?.delayMinutes ?? 0;
  const validityMinutes = opts?.validityMinutes ?? 0;

  try {
    const res = await sendSMSViaOursms({
      to: dests,
      text,
      msgClass,
      requestDlr,
      priority,
      delayMinutes,
      validityMinutes,
    });

    const id = res.result?.jobId ? String(res.result.jobId) : null;
    return { ok: !!res?.ok, id, error: null };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return { ok: false, id: null, error: errMsg };
  }
}

export default sendSms;
