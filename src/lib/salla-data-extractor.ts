// Enhanced Salla data extraction with better error handling

export interface ExtractedOrderData {
  orderId: string | null;
  merchantId: string | number | null;
  customer: {
    name?: string;
    email?: string;
    mobile?: string;
  } | null;
  items: Array<{
    id: string | number;
    productId: string | number;
  }>;
  storeDomain: string | null;
  statuses: {
    orderStatus: string;
    paymentStatus: string;
  };
}

export function extractSallaOrderData(
  body: Record<string, unknown>,
  data: Record<string, unknown>
): ExtractedOrderData {
  // Extract Order ID with multiple fallbacks
  const orderId = extractOrderId(data);
  
  // Extract Merchant ID with multiple fallbacks
  const merchantId = extractMerchantId(body, data);
  
  // Extract customer data with null-safety
  const customer = extractCustomerData(data);
  
  // Extract items with validation
  const items = extractOrderItems(data);
  
  // Extract domain with validation
  const storeDomain = extractStoreDomain(data);
  
  // Extract statuses with normalization
  const statuses = extractStatuses(data);
  
  return {
    orderId,
    merchantId,
    customer,
    items,
    storeDomain,
    statuses,
  };
}

function extractOrderId(data: Record<string, unknown>): string | null {
  const candidates = [
    data.id,
    data.order_id,
    data.order_name,
    (data as any).order?.id,
    (data as any).order?.order_id,
  ];
  
  for (const candidate of candidates) {
    if (candidate != null && candidate !== "") {
      return String(candidate);
    }
  }
  
  console.warn('[SALLA] No order ID found in:', Object.keys(data));
  return null;
}

function extractMerchantId(
  body: Record<string, unknown>,
  data: Record<string, unknown>
): string | number | null {
  // Try body.merchant first
  if (body.merchant) {
    return typeof body.merchant === 'number' ? body.merchant : 
           typeof body.merchant === 'string' ? body.merchant : null;
  }
  
  // Try merchant_id field
  if (data.merchant_id) {
    return typeof data.merchant_id === 'number' ? data.merchant_id :
           typeof data.merchant_id === 'string' ? data.merchant_id : null;
  }
  
  // Try nested merchant object
  const merchant = data.merchant;
  if (merchant && typeof merchant === 'object') {
    const merchantData = merchant as Record<string, unknown>;
    if (merchantData.id) {
      return typeof merchantData.id === 'number' ? merchantData.id :
             typeof merchantData.id === 'string' ? merchantData.id : null;
    }
  }
  
  console.warn('[SALLA] No merchant ID found in:', { body: Object.keys(body), data: Object.keys(data) });
  return null;
}

function extractCustomerData(data: Record<string, unknown>) {
  // Direct customer object
  let customer = data.customer;
  
  // Try nested order.customer
  if (!customer && (data as any).order?.customer) {
    customer = (data as any).order.customer;
  }
  
  if (!customer || typeof customer !== 'object') {
    return null;
  }
  
  const customerData = customer as Record<string, unknown>;
  
  const name = typeof customerData.name === 'string' ? customerData.name : undefined;
  const email = typeof customerData.email === 'string' && 
                 customerData.email.includes('@') ? customerData.email : undefined;
  const mobile = typeof customerData.mobile === 'string' && 
                  customerData.mobile.length > 5 ? customerData.mobile : undefined;
  
  // Return null if no valid contact info
  if (!name && !email && !mobile) {
    console.warn('[SALLA] No valid customer data found:', customer);
    return null;
  }
  
  return { name, email, mobile };
}

function extractOrderItems(data: Record<string, unknown>) {
  let items = data.items;
  
  // Try nested order.items
  if (!items && (data as any).order?.items) {
    items = (data as any).order.items;
  }
  
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }
  
  return items.map((item: unknown, index: number) => {
    if (!item || typeof item !== 'object') {
      console.warn(`[SALLA] Invalid item at index ${index}:`, item);
      return { id: String(index), productId: String(index) };
    }
    
    const itemData = item as Record<string, unknown>;
    
    // Try multiple product ID sources
    const productId = 
      itemData.product_id ||
      itemData.id ||
      (itemData.product && typeof itemData.product === 'object' && 
       (itemData.product as Record<string, unknown>).id) ||
      'unknown';
    
    return {
      id: String(itemData.id || index),
      productId: String(productId),
    };
  });
}

function extractStoreDomain(data: Record<string, unknown>): string | null {
  const candidates = [
    data.domain,
    data.store_url,
    data.url,
    data.store && typeof data.store === 'object' ? 
      (data.store as Record<string, unknown>).domain : undefined,
    data.merchant && typeof data.merchant === 'object' ? 
      (data.merchant as Record<string, unknown>).domain : undefined,
  ];
  
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      try {
        const url = new URL(candidate.startsWith('http') ? candidate : `https://${candidate}`);
        return url.hostname.replace(/^www\./, '');
      } else {
        return candidate.trim();
      }
    }
  }
  
  return null;
}

function extractStatuses(data: Record<string, unknown>) {
  const orderStatus = [
    data.status,
    data.order_status,
    data.new_status,
    data.shipment_status,
  ].find(s => typeof s === 'string' && s.trim()) || '';
  
  const paymentStatus = data.payment_status && 
    typeof data.payment_status === 'string' ? data.payment_status : '';
  
  return {
    orderStatus: orderStatus.toLowerCase().trim(),
    paymentStatus: paymentStatus.toLowerCase().trim(),
  };
}
