import { env } from "cloudflare:workers";

export type RuntimeBindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  CONFIG_ENCRYPTION_KEY?: string;
  APP_BASE_URL?: string;
  PAYMENT_MODE?: "disabled" | "sandbox" | "production";
  PAYMENT_PROVIDER?: "wechat" | "alipay" | "gateway";
  PAYMENT_CHECKOUT_URL?: string;
  PAYMENT_REFUND_URL?: string;
  PAYMENT_CALLBACK_SECRET?: string;
  PAYMENT_MERCHANT_ID?: string;
  PLATFORM_ADMIN_EMAILS?: string;
  OPERATIONS_SWEEP_SECRET?: string;
  QDRANT_URL?: string;
  QDRANT_API_KEY?: string;
  QDRANT_COLLECTION?: string;
  QDRANT_VECTOR_SIZE?: string;
  APP_ENV?: "local" | "production";
  LOCAL_AUTH_EMAIL?: string;
  LOCAL_AUTH_NAME?: string;
  LOCAL_ADMIN_PASSWORD?: string;
  LOCAL_AUTH_SESSION_SECRET?: string;
  PARSER_API_KEY?: string;
  INFINITY_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  SMTP_ENABLED?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USERNAME?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM_EMAIL?: string;
  SMTP_FROM_NAME?: string;
  SMTP_USE_SSL?: string;
  SMTP_USE_STARTTLS?: string;
  MAIL_RELAY_URL?: string;
  MAIL_RELAY_TOKEN?: string;
  EMAIL_CODE_EXPIRY_MINUTES?: string;
  EMAIL_CODE_RESEND_SECONDS?: string;
  EMAIL_CODE_MAX_ATTEMPTS?: string;
  EMAIL_CODE_LENGTH?: string;
};

export function getRuntime(): RuntimeBindings {
  return env as unknown as RuntimeBindings;
}
