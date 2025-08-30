export async function registerZidWebhooks({
  accessToken,
  managerToken,
  targetBaseUrl,
}: {
  accessToken: string;
  managerToken?: string;
  targetBaseUrl: string;
}) {
  const target = `${targetBaseUrl.replace(/\/$/,'')}/api/zid/webhook`;

  async function create(event: string, conditions?: Record<string, string>) {
    const r = await fetch('https://api.zid.sa/v1/managers/webhooks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        ...(managerToken ? { 'X-Manager-Token': managerToken } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ event, target_url: target, conditions }),
    });
    if (!r.ok) {
      const t = await r.text().catch(()=> '');
      console.error('register webhook failed', event, t);
    }
  }

  await create('order.payment_status.update', { payment_status: 'paid' });
  await create('order.status.update', { status: 'delivered' });
}
