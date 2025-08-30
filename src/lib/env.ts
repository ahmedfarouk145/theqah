// src/lib/env.ts
import { z } from 'zod';

const server = z.object({
  APP_BASE_URL: z.string().url(),
  FIREBASE_PROJECT_ID: z.string(),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  FIREBASE_PRIVATE_KEY: z.string().min(100),
  EMAIL_USER: z.string().email(),
  EMAIL_PASS: z.string().min(8),
  ZID_CLIENT_ID: z.string(),
  ZID_CLIENT_SECRET: z.string().min(16),
  ZID_REDIRECT_URI: z.string().url(),
  OPENAI_API_KEY: z.string().min(20),
  CRON_SECRET: z.string().min(8),
});

const client = z.object({
  NEXT_PUBLIC_BASE_URL: z.string().url(),
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string(),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string(),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string(),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string(),
  NEXT_PUBLIC_ZID_CLIENT_ID: z.string(),
  NEXT_PUBLIC_ZID_REDIRECT_URI: z.string().url(),
});

export const env = {
  server: server.parse({
    APP_BASE_URL: process.env.APP_BASE_URL,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_PASS: process.env.EMAIL_PASS,
    ZID_CLIENT_ID: process.env.ZID_CLIENT_ID,
    ZID_CLIENT_SECRET: process.env.ZID_CLIENT_SECRET,
    ZID_REDIRECT_URI: process.env.ZID_REDIRECT_URI,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
  }),
  client: client.parse({
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_ZID_CLIENT_ID: process.env.NEXT_PUBLIC_ZID_CLIENT_ID,
    NEXT_PUBLIC_ZID_REDIRECT_URI: process.env.NEXT_PUBLIC_ZID_REDIRECT_URI,
  }),
};
