// src/utils/whatsapp.ts
export async function sendWhatsApp(phone: string, name: string, storeName: string, reviewLink: string) {
  const url = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to: phone.replace(/^0/, '966'), // لو رقم سعودي محلي يبدأ بـ 0
    type: 'template',
    template: {
      name: process.env.WHATSAPP_TEMPLATE_NAME,
      language: {
        code: process.env.WHATSAPP_TEMPLATE_LANG || 'ar',
      },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: name },
            { type: 'text', text: storeName },
            { type: 'text', text: reviewLink },
          ],
        },
      ],
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('WhatsApp Send Error:', error);
    throw new Error('Failed to send WhatsApp message');
  }
}
