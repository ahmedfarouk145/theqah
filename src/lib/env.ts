// src/lib/env.ts
/**
 * C2: Environment Variable Validation with Zod
 * Validates environment variables with helpful error messages
 * Using .optional() for non-critical vars to prevent startup crashes
 */
import { z } from 'zod';

// Server-side environment variables
const server = z.object({
  // App Configuration
  APP_BASE_URL: z.string().url().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Firebase (Required)
  FIREBASE_PROJECT_ID: z.string().min(1, "Firebase project ID is required"),
  FIREBASE_CLIENT_EMAIL: z.string().email("Invalid Firebase client email"),
  FIREBASE_PRIVATE_KEY: z.string().min(100, "Firebase private key seems too short"),

  // Email Configuration (Optional - some features won't work)
  EMAIL_USER: z.string().email().optional(),
  EMAIL_PASS: z.string().optional(),
  DMAIL_HOST: z.string().optional(),
  DMAIL_PORT: z.string().optional(),
  DMAIL_USER: z.string().optional(),
  DMAIL_PASS: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional(),

  // Salla Integration (Optional)
  SALLA_CLIENT_ID: z.string().optional(),
  SALLA_CLIENT_SECRET: z.string().optional(),
  SALLA_WEBHOOK_SECRET: z.string().optional(),
  SALLA_WEBHOOK_TOKEN: z.string().optional(),
  SALLA_APP_TOKEN: z.string().optional(),

  // Zid Integration (Optional)
  ZID_CLIENT_ID: z.string().optional(),
  ZID_CLIENT_SECRET: z.string().optional(),
  ZID_REDIRECT_URI: z.string().url().optional(),

  // SMS (Optional)
  OURSMS_API_KEY: z.string().optional(),
  OURSMS_SENDER: z.string().optional(),

  // AI/OpenAI (Optional)
  OPENAI_API_KEY: z.string().optional(),

  // Redis/KV (Optional - falls back to in-memory)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Cron Jobs
  CRON_SECRET: z.string().optional(),
});

// Client-side environment variables (prefixed with NEXT_PUBLIC_)
const client = z.object({
  NEXT_PUBLIC_BASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().optional(),
  NEXT_PUBLIC_ZID_CLIENT_ID: z.string().optional(),
  NEXT_PUBLIC_ZID_REDIRECT_URI: z.string().url().optional(),
});

// Parse with safeParse to avoid crashing on missing optional vars
function parseEnv<T extends z.ZodObject<z.ZodRawShape>>(
  schema: T,
  env: Record<string, string | undefined>,
  name: string
): z.infer<T> {
  const result = schema.safeParse(env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    const message = `⚠️ Environment validation warnings for ${name}:\n${errors}`;

    // In development, just warn
    if (process.env.NODE_ENV !== "production") {
      console.warn(message);
    }

    // Return partial data (Zod will use defaults for missing optionals)
    return result.data as unknown as z.infer<T>;
  }

  return result.data;
}

// Export validated environment
export const env = {
  server: parseEnv(server, process.env as Record<string, string | undefined>, "server"),
  client: parseEnv(client, process.env as Record<string, string | undefined>, "client"),
};

// Helper to check if specific integrations are configured
export function getConfiguredIntegrations() {
  return {
    salla: !!(process.env.SALLA_CLIENT_ID && process.env.SALLA_CLIENT_SECRET),
    zid: !!(process.env.ZID_CLIENT_ID && process.env.ZID_CLIENT_SECRET),
    sms: !!process.env.OURSMS_API_KEY,
    email: !!(process.env.DMAIL_HOST || process.env.EMAIL_USER),
    redis: !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    openai: !!process.env.OPENAI_API_KEY,
  };
}

// Type exports
export type ServerEnv = z.infer<typeof server>;
export type ClientEnv = z.infer<typeof client>;
