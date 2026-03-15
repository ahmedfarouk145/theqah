import type { PlanId } from '@/config/plans';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { sanitizeError } from '../monitoring/sanitize';

const NEW_SUBSCRIPTION_ALERT_TYPE = 'subscription.new_paid';
const DEFAULT_APP_URL = 'https://www.theqah.com.sa';
const PAID_PLANS = new Set<PlanId>(['PAID_MONTHLY', 'PAID_ANNUAL']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

type AlertStatus = 'sending' | 'sent' | 'partial' | 'failed';

export interface SendNewSubscriptionAdminAlertParams {
  storeUid: string;
  provider: 'salla' | 'zid';
  planId: string;
  startedAt: number;
  expiresAt?: number | null;
  previousPlanId?: string | null;
  previousPlanActive?: boolean | null;
  merchantId?: string | number | null;
}

export interface NewSubscriptionAdminAlertResult {
  sent: boolean;
  skipped?: 'no_recipients' | 'not_new_paid_activation' | 'already_recorded' | 'delivery_failed';
  alertId?: string;
  recipientCount?: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(timestamp?: number | null): string {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
    return 'N/A';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Riyadh',
  }).format(new Date(timestamp));
}

function getNestedString(record: Record<string, unknown> | undefined, path: string[]): string | null {
  let current: unknown = record;

  for (const segment of path) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === 'string' && current.trim() ? current.trim() : null;
}

function getNestedNumber(record: Record<string, unknown> | undefined, path: string[]): number | null {
  let current: unknown = record;

  for (const segment of path) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === 'number' && Number.isFinite(current) ? current : null;
}

function getStoreName(storeData: Record<string, unknown> | undefined): string {
  return (
    getNestedString(storeData, ['storeName']) ||
    getNestedString(storeData, ['meta', 'storeName']) ||
    getNestedString(storeData, ['meta', 'userinfo', 'data', 'merchant', 'name']) ||
    getNestedString(storeData, ['meta', 'userinfo', 'merchant', 'name']) ||
    getNestedString(storeData, ['salla', 'storeName']) ||
    getNestedString(storeData, ['zid', 'storeName']) ||
    'Unknown store'
  );
}

function getStoreMerchantId(
  storeData: Record<string, unknown> | undefined,
  provider: 'salla' | 'zid'
): string | null {
  const providerStoreId = getNestedNumber(storeData, [provider, 'storeId']);
  if (providerStoreId !== null) return String(providerStoreId);

  const providerUid = getNestedString(storeData, [provider, 'uid']);
  if (providerUid) return providerUid;

  return null;
}

function getAlertRecipients(): string[] {
  const raw =
    process.env.NEW_SUBSCRIPTION_ALERT_EMAILS ||
    process.env.ADMIN_NOTIFICATION_EMAIL ||
    process.env.ADMIN_EMAIL ||
    '';

  return parseNotificationEmails(raw);
}

function getAppBaseUrl(): string {
  const raw = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL;
  return raw.replace(/\/+$/, '');
}

function buildSubject(storeName: string, planId: string): string {
  return `New subscription: ${storeName} (${planId})`;
}

function buildHtml(params: {
  storeName: string;
  storeUid: string;
  provider: 'salla' | 'zid';
  planId: string;
  startedAt: number;
  expiresAt?: number | null;
  merchantId?: string | null;
}): string {
  const dashboardUrl = `${getAppBaseUrl()}/dashboard`;
  const rows = [
    ['Store name', params.storeName],
    ['Store UID', params.storeUid],
    ['Provider', params.provider],
    ['Plan ID', params.planId],
    ['Started at', formatDate(params.startedAt)],
    ['Expires at', formatDate(params.expiresAt)],
    ['Merchant ID', params.merchantId || 'N/A'],
  ]
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 12px;border:1px solid #e5e7eb;font-weight:600;background:#f8fafc;">${escapeHtml(label)}</td><td style="padding:10px 12px;border:1px solid #e5e7eb;">${escapeHtml(value)}</td></tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Subscription Alert</title>
</head>
<body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
    <div style="padding:24px 28px;background:linear-gradient(135deg,#111827,#1f2937);color:#ffffff;">
      <h1 style="margin:0 0 8px;font-size:24px;">New paid subscription</h1>
      <p style="margin:0;font-size:14px;opacity:0.9;">A store has moved into an active paid plan.</p>
    </div>
    <div style="padding:28px;">
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">
        This is an automated admin alert from TheQah. Subscription details are below.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.5;">
        ${rows}
      </table>
      <div style="margin-top:24px;">
        <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none;font-weight:600;">Open dashboard</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function isAlreadyExistsError(error: unknown): boolean {
  if (!error) return false;

  const message = error instanceof Error ? error.message : String(error);
  return /already exists/i.test(message);
}

function normalizeAlertIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function parseNotificationEmails(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0 && EMAIL_REGEX.test(item))
    )
  );
}

export function isPaidPlan(planId: string | null | undefined): planId is PlanId {
  return PAID_PLANS.has(planId as PlanId);
}

export function shouldSendNewSubscriptionAdminAlert(params: {
  nextPlanId: string | null | undefined;
  previousPlanId?: string | null;
  previousPlanActive?: boolean | null;
}): boolean {
  if (!isPaidPlan(params.nextPlanId)) return false;

  const previousIsPaid = isPaidPlan(params.previousPlanId);
  const wasActivePaid = previousIsPaid && params.previousPlanActive !== false;

  return !wasActivePaid;
}

export function buildNewSubscriptionAdminAlertId(params: {
  storeUid: string;
  planId: string;
  startedAt: number;
}): string {
  return `${NEW_SUBSCRIPTION_ALERT_TYPE}_${normalizeAlertIdPart(params.storeUid)}_${normalizeAlertIdPart(params.planId)}_${params.startedAt}`;
}

export async function sendNewSubscriptionAdminAlert(
  params: SendNewSubscriptionAdminAlertParams
): Promise<NewSubscriptionAdminAlertResult> {
  const recipients = getAlertRecipients();
  if (recipients.length === 0) {
    return { sent: false, skipped: 'no_recipients', recipientCount: 0 };
  }

  if (
    !shouldSendNewSubscriptionAdminAlert({
      nextPlanId: params.planId,
      previousPlanId: params.previousPlanId,
      previousPlanActive: params.previousPlanActive,
    })
  ) {
    return { sent: false, skipped: 'not_new_paid_activation', recipientCount: recipients.length };
  }

  const db = dbAdmin();
  const alertId = buildNewSubscriptionAdminAlertId({
    storeUid: params.storeUid,
    planId: params.planId,
    startedAt: params.startedAt,
  });
  const alertRef = db.collection('admin_alerts').doc(alertId);

  try {
    await alertRef.create({
      type: NEW_SUBSCRIPTION_ALERT_TYPE,
      status: 'sending' satisfies AlertStatus,
      level: 'info',
      message: `New paid subscription for ${params.storeUid} (${params.planId})`,
      createdAt: Date.now(),
      createdBy: 'system:webhook',
      updatedAt: Date.now(),
      storeUid: params.storeUid,
      provider: params.provider,
      planId: params.planId,
      startedAt: params.startedAt,
      expiresAt: params.expiresAt ?? null,
      previousPlanId: params.previousPlanId ?? null,
      previousPlanActive: params.previousPlanActive ?? null,
      merchantId: params.merchantId != null ? String(params.merchantId) : null,
      recipientCount: recipients.length,
    });
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      return {
        sent: false,
        skipped: 'already_recorded',
        alertId,
        recipientCount: recipients.length,
      };
    }

    throw error;
  }

  try {
    const storeSnap = await db.collection('stores').doc(params.storeUid).get();
    const storeData = storeSnap.data() as Record<string, unknown> | undefined;
    const storeName = getStoreName(storeData);
    const { sendEmailDmail } = await import('./email-dmail');
    const merchantId =
      params.merchantId != null
        ? String(params.merchantId)
        : getStoreMerchantId(storeData, params.provider);
    const subject = buildSubject(storeName, params.planId);
    const html = buildHtml({
      storeName,
      storeUid: params.storeUid,
      provider: params.provider,
      planId: params.planId,
      startedAt: params.startedAt,
      expiresAt: params.expiresAt,
      merchantId,
    });

    const deliveryResults = await Promise.allSettled(
      recipients.map((recipient) => sendEmailDmail(recipient, subject, html))
    );

    let successCount = 0;
    const errors: string[] = [];

    for (const result of deliveryResults) {
      if (result.status === 'fulfilled' && result.value.ok) {
        successCount += 1;
        continue;
      }

      if (result.status === 'fulfilled') {
        errors.push(sanitizeError((result.value as { ok: false; error: string }).error));
      } else {
        errors.push(sanitizeError(result.reason));
      }
    }

    const failureCount = recipients.length - successCount;
    const status: AlertStatus =
      successCount === recipients.length ? 'sent' : successCount > 0 ? 'partial' : 'failed';
    const now = Date.now();

    await alertRef.set(
      {
        updatedAt: now,
        status,
        sentAt: successCount > 0 ? now : null,
        successCount,
        failureCount,
        errors: errors.slice(0, 5),
      },
      { merge: true }
    );

    return {
      sent: successCount > 0,
      skipped: successCount > 0 ? undefined : 'delivery_failed',
      alertId,
      recipientCount: recipients.length,
    };
  } catch (error) {
    await alertRef.set(
      {
        updatedAt: Date.now(),
        status: 'failed' satisfies AlertStatus,
        errors: [sanitizeError(error)],
      },
      { merge: true }
    );

    return {
      sent: false,
      skipped: 'delivery_failed',
      alertId,
      recipientCount: recipients.length,
    };
  }
}
