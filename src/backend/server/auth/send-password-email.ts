// src/server/auth/send-password-email.ts
import { getAuth } from "firebase-admin/auth";
import { sendEmailDmail } from "@/server/messaging/email-dmail";

type SendPasswordEmailInput = {
  email: string;
  storeUid: string;          // مثال: salla:982747175
  storeName?: string;        // للاستخدام داخل نص الإيميل
  redirectUrlBase?: string;  // اختياري: أساس رابط التوجيه بعد التعيين
};

function isValidEmail(e?: string | null): e is string {
  return !!e && /\S+@\S+\.\S+/.test(e);
}

function appBase(): string {
  const base =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "";
  return base.replace(/\/+$/, "");
}

/** يرسل إيميل "تعيين/إعادة تعيين كلمة المرور" باستخدام Firebase Auth */
export async function sendPasswordSetupEmail({
  email,
  storeUid,
  storeName,
  redirectUrlBase,
}: SendPasswordEmailInput): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidEmail(email)) return { ok: false, error: "invalid_email" };

  const base = (redirectUrlBase || appBase()).replace(/\/+$/, "");
  if (!base) return { ok: false, error: "missing_base_url" };

  // عند العودة بعد التعين نودّيه صفحة ترحيب (عدّلها كما تريد)
  const continueUrl = `${base}/auth/welcome?store=${encodeURIComponent(storeUid)}`;

  const auth = getAuth();

  // Check if user exists, create if not
  let userExists = false;
  try {
    await auth.getUserByEmail(email);
    userExists = true;
  } catch (err: unknown) {
    // User doesn't exist - this is expected for new merchants
    const firebaseErr = err as { code?: string };
    if (firebaseErr.code === "auth/user-not-found") {
      // Create the user
      try {
        await auth.createUser({
          email,
          emailVerified: false,
          disabled: false,
          displayName: storeName || undefined,
        });
        userExists = true;
      } catch (createErr) {
        const createErrTyped = createErr as { message?: string };
        return { ok: false, error: `create_user_failed: ${createErrTyped.message || String(createErr)}` };
      }
    } else {
      return { ok: false, error: `get_user_failed: ${firebaseErr.code || String(err)}` };
    }
  }

  if (!userExists) {
    return { ok: false, error: "user_not_created" };
  }

  // Generate password reset link
  const resetLink = await auth.generatePasswordResetLink(email, {
    url: continueUrl,
    handleCodeInApp: false,
  });

  const safeStore = (storeName || "").trim() || "متجرك";
  const subject = `تعيين كلمة المرور لحسابك في ${safeStore}`;

  const html = `
    <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8">
      <h2 style="margin:0 0 12px 0">مرحباً 👋</h2>
      <p>تم ربط تطبيق <strong>${safeStore}</strong> بنجاح.</p>
      <p>لتفعيل الدخول إلى لوحة التحكم، الرجاء تعيين كلمة المرور من خلال الرابط التالي:</p>
      <p>
        <a href="${resetLink}" style="background:#0ea5e9;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">
          تعيين كلمة المرور
        </a>
      </p>
      <p style="color:#64748b">إذا لم يعمل الزر، انسخ الرابط التالي والصقه في المتصفح:</p>
      <p style="direction:ltr;word-break:break-all">${resetLink}</p>
      <hr/>
      <p style="color:#64748b;font-size:12px">هذا الرابط مرتبط بالبريد: ${email}</p>
    </div>
  `.trim();

  const res = await sendEmailDmail(email, subject, html);
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export default sendPasswordSetupEmail;
