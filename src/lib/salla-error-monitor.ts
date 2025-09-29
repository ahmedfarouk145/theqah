// Enhanced error monitoring for Salla webhooks

import { dbAdmin } from "./firebaseAdmin";

export interface SallaError {
  timestamp: number;
  event: string;
  merchantId?: string | number;
  orderId?: string;
  error: string;
  rawData?: Record<string, unknown>;
  context: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export async function logSallaDataIssue(error: SallaError) {
  const db = dbAdmin();
  
  try {
    // Store in multiple collections for different analysis
    await Promise.all([
      // Main error log
      db.collection('salla_errors').add({
        ...error,
        at: Date.now(),
      }),
      
      // Pattern analysis
      db.collection('salla_error_patterns').doc(error.context).set({
        context: error.context,
        lastSeen: Date.now(),
        count: 1, // You'd increment this in production
        examples: [error],
      }, { merge: true }),
      
      // Severity-based logging
      error.severity === 'critical' ? 
        db.collection('salla_critical_errors').add(error) : 
        Promise.resolve(),
    ]);
    
    // Console logging with details
    const level = error.severity === 'critical' ? 'ERROR' : 
                  error.severity === 'high' ? 'WARN' : 'INFO';
    console.log(`[SALLA ${level}] ${error.context}: ${error.error}`, {
      event: error.event,
      merchantId: error.merchantId,
      orderId: error.orderId,
    });
  } catch (e) {
    console.error('[SALLA] Failed to log error:', e);
  }
}

export function detectCommonSallaIssues(data: Record<string, unknown>, event: string): SalleIssue[] {
  const issues: SalleIssue[] = [];
  
  // Check for missing order ID
  if (['order.', 'shipment.'].some(prefix => event.startsWith(prefix))) {
    const orderId = data.id || data.order_id || data.order_name;
    if (!orderId) {
      issues.push({
        type: 'missing_order_id',
        message: 'Order ID not found in webhook data',
        severity: 'high',
        suggestedFix: 'Check Salla webhook configuration or contact Salla support',
      });
    }
  }
  
  // Check for missing customer data
  const customer = data.customer || (data as any).order?.customer;
  if (['order.payment.updated', 'shipment.updated'].includes(event)) {
    if (!customer) {
      issues.push({
        type: 'missing_customer',
        message: 'Customer data not found for order processing',
        severity: 'medium',
        suggestedFix: 'Verify customer data mapping from Salla API',
      });
    } else {
      const c = customer as Record<string, unknown>;
      if (!c.email && !c.mobile) {
        issues.push({
          type: 'missing_contact_info',
          message: 'Customer has no email or phone for notifications',
          severity: 'medium',
          suggestedFix: 'Orders may be processed but notifications cannot be sent',
        });
      }
    }
  }
  
  // Check for domain issues
  if (event.startsWith('app.')) {
    const domain = 
      data.domain || 
      data.store_url || 
      data.url ||
      (data.store && typeof data.store === 'object' ? 
        (data.store as Record<string, unknown>).domain : undefined);
    
    if (!domain) {
      issues.push({
        type: 'missing_domain',
        message: 'Store domain cannot be determined',
        severity: 'medium',
        suggestedFix: 'May need to fetch domain from Salla API separately',
      });
    }
  }
  
  // Check for merchant/store ID issues
  const merchantId = 
    data.merchant_id ||
    (data.merchant && typeof data.merchant === 'object' && 
     (data.merchant as Record<string, unknown>).id);
  
  if (!merchantId) {
    issues.push({
      type: 'missing_merchant_id',
      message: 'Merchant/Store ID cannot be determined',
      severity: 'high',
      suggestedFix: 'Required for store identification and processing',
    });
  }
  
  return issues;
}

interface SalleIssue {
  type: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  suggestedFix: string;
}

// Usage in your webhook handler:
export async function validateSallaWebhookData(
  event: string,
  body: Record<string, unknown>,
  data: Record<string, unknown>
): Promise<void> {
  const issues = detectCommonSallaIssues(data, event);
  
  for (const issue of issues) {
    await logSallaDataIssue({
      timestamp: Date.now(),
      event,
      merchantId: body.merchant as string | number,
      orderId: String(data.id || data.order_id || 'unknown'),
      error: issue.message,
      rawData: { dataKeys: Object.keys(data), bodyKeys: Object.keys(body) },
      context: issue.type,
      severity: issue.severity === 'critical' ? 'critical' :
                issue.severity === 'high' ? 'high' :
                issue.severity === 'medium' ? 'medium' : 'low',
    });
  }
  
  // Throw if critical issues
  const criticalIssues = issues.filter(i => i.severity === 'critical');
  if (criticalIssues.length > 0) {
    throw new Error(`Critical Salla data issues: ${criticalIssues.map(i => i.message).join(', ')}`);
  }
}
