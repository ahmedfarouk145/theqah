// src/pages/api/settings/validate.ts
import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' })
  }

  const {
    email,
    store_name,
    whatsapp_number,
    logo_url,
    enable_auto_reviews,
  } = req.body

  // Email validation
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ message: 'Invalid email address' })
  }

  // Store name required
  if (!store_name || typeof store_name !== 'string' || store_name.length < 3) {
    return res.status(400).json({ message: 'Store name must be at least 3 characters' })
  }

  // WhatsApp number (basic)
  if (!whatsapp_number || !/^\+?\d{10,15}$/.test(whatsapp_number)) {
    return res.status(400).json({ message: 'Invalid WhatsApp number' })
  }

  // Logo URL check (if provided)
  if (logo_url && typeof logo_url === 'string' && !logo_url.startsWith('https://')) {
    return res.status(400).json({ message: 'Logo URL must be a valid HTTPS link' })
  }

  // Optional boolean field check
  if (enable_auto_reviews && typeof enable_auto_reviews !== 'boolean') {
    return res.status(400).json({ message: 'enable_auto_reviews must be a boolean' })
  }

  return res.status(200).json({ valid: true })
}
