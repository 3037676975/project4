import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Legacy single-workspace tables retained so existing data can be adopted into a tenant.
export const providerConfigs = sqliteTable("provider_configs", {
  id: text("id").primaryKey(), provider: text("provider").notNull().default("deepseek"),
  baseUrl: text("base_url").notNull(), model: text("model").notNull(),
  apiKeyCiphertext: text("api_key_ciphertext"), apiKeyIv: text("api_key_iv"),
  apiKeyHint: text("api_key_hint"), updatedAt: text("updated_at").notNull(),
});

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(), name: text("name").notNull(), slug: text("slug").notNull(),
  status: text("status").notNull().default("active"), creditsBalance: integer("credits_balance").notNull().default(10000),
  companyName: text("company_name").notNull().default(""), billingEmail: text("billing_email").notNull().default(""),
  privacyRetentionDays: integer("privacy_retention_days").notNull().default(180),
  onboardingCompleted: integer("onboarding_completed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("tenants_slug_unique").on(table.slug)]);

export const userAccounts = sqliteTable("user_accounts", {
  id: text("id").primaryKey(), email: text("email").notNull(), displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(), passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull().default(310000),
  status: text("status").notNull().default("active"), emailVerifiedAt: text("email_verified_at"),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
  failedLoginCount: integer("failed_login_count").notNull().default(0), lockedUntil: text("locked_until"),
  lastLoginAt: text("last_login_at"), passwordChangedAt: text("password_changed_at"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("user_accounts_email_unique").on(table.email), index("user_accounts_status_idx").on(table.status)]);

export const userSessions = sqliteTable("user_sessions", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull(), tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(), revokedAt: text("revoked_at"), ipHash: text("ip_hash"),
  userAgentHash: text("user_agent_hash"), createdAt: text("created_at").notNull(), lastSeenAt: text("last_seen_at").notNull(),
}, (table) => [uniqueIndex("user_sessions_token_unique").on(table.tokenHash), index("user_sessions_account_idx").on(table.accountId, table.expiresAt)]);

export const authSliderChallenges = sqliteTable("auth_slider_challenges", {
  id: text("id").primaryKey(), purpose: text("purpose").notNull(), portal: text("portal").notNull(),
  targetPosition: integer("target_position").notNull(), ticketHash: text("ticket_hash"), attempts: integer("attempts").notNull().default(0),
  expiresAt: text("expires_at").notNull(), verifiedAt: text("verified_at"), consumedAt: text("consumed_at"),
  ipHash: text("ip_hash").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("auth_slider_expiry_idx").on(table.expiresAt), index("auth_slider_ip_idx").on(table.ipHash, table.createdAt)]);

export const emailVerificationCodes = sqliteTable("email_verification_codes", {
  id: text("id").primaryKey(), email: text("email").notNull(), purpose: text("purpose").notNull(), portal: text("portal").notNull(),
  codeHash: text("code_hash").notNull(), attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5), expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"), ipHash: text("ip_hash").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [
  index("email_codes_lookup_idx").on(table.email, table.purpose, table.portal, table.createdAt),
  index("email_codes_expiry_idx").on(table.expiresAt),
]);

export const tenantMembers = sqliteTable("tenant_members", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), accountId: text("account_id"), email: text("email").notNull(),
  displayName: text("display_name"), role: text("role").notNull().default("member"), status: text("status").notNull().default("active"),
  activeKnowledgeBaseId: text("active_knowledge_base_id"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("tenant_members_tenant_email_unique").on(table.tenantId, table.email), index("tenant_members_email_idx").on(table.email)]);

export const tenantInvitations = sqliteTable("tenant_invitations", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), email: text("email").notNull(),
  role: text("role").notNull().default("member"), tokenHash: text("token_hash").notNull(),
  createdByMemberId: text("created_by_member_id").notNull(), status: text("status").notNull().default("pending"),
  expiresAt: text("expires_at").notNull(), acceptedAt: text("accepted_at"), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("tenant_invitations_token_unique").on(table.tokenHash), index("tenant_invitations_scope_idx").on(table.tenantId, table.email, table.status)]);

export const platformAdmins = sqliteTable("platform_admins", {
  id: text("id").primaryKey(), accountId: text("account_id"), email: text("email").notNull(), displayName: text("display_name"),
  role: text("role").notNull().default("super_admin"), status: text("status").notNull().default("active"),
  lastLoginAt: text("last_login_at"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("platform_admins_email_unique").on(table.email), index("platform_admins_status_idx").on(table.status)]);

export const platformAuditLogs = sqliteTable("platform_audit_logs", {
  id: text("id").primaryKey(), adminId: text("admin_id").notNull(), adminEmail: text("admin_email").notNull(),
  action: text("action").notNull(), targetType: text("target_type").notNull(), targetId: text("target_id"),
  detailJson: text("detail_json").notNull().default("{}"), createdAt: text("created_at").notNull(),
}, (table) => [index("platform_audit_logs_created_idx").on(table.createdAt), index("platform_audit_logs_admin_idx").on(table.adminId, table.createdAt)]);

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(), code: text("code").notNull(), name: text("name").notNull(),
  monthlyPriceCents: integer("monthly_price_cents").notNull().default(0), requestQuota: integer("request_quota").notNull(),
  tokenQuota: integer("token_quota").notNull(), storageQuotaBytes: integer("storage_quota_bytes").notNull(),
  monthlyCredits: integer("monthly_credits").notNull(), apiKeyLimit: integer("api_key_limit").notNull(),
  memberLimit: integer("member_limit").notNull(), widgetConversationQuota: integer("widget_conversation_quota").notNull().default(100),
  leadQuota: integer("lead_quota").notNull().default(20), featuresJson: text("features_json").notNull().default("[]"),
  active: integer("active", { mode: "boolean" }).notNull().default(true), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("plans_code_unique").on(table.code)]);

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), planId: text("plan_id").notNull(),
  status: text("status").notNull().default("active"), source: text("source").notNull().default("manual"),
  startsAt: text("starts_at").notNull(), expiresAt: text("expires_at"), autoRenew: integer("auto_renew", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("subscriptions_tenant_idx").on(table.tenantId)]);

export const billingOrders = sqliteTable("billing_orders", {
  id: text("id").primaryKey(), orderNo: text("order_no").notNull(), tenantId: text("tenant_id").notNull(),
  planId: text("plan_id").notNull(), subscriptionId: text("subscription_id"), provider: text("provider").notNull(),
  billingCycle: text("billing_cycle").notNull().default("monthly"), amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("CNY"), status: text("status").notNull().default("pending"),
  providerTradeNo: text("provider_trade_no"), paymentUrl: text("payment_url"), clientRequestId: text("client_request_id"),
  paidAt: text("paid_at"), fulfilledAt: text("fulfilled_at"), expiresAt: text("expires_at").notNull(),
  createdByMemberId: text("created_by_member_id").notNull(), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("billing_orders_no_unique").on(table.orderNo), uniqueIndex("billing_orders_client_request_unique").on(table.tenantId, table.clientRequestId), index("billing_orders_tenant_idx").on(table.tenantId, table.createdAt)]);

export const paymentEvents = sqliteTable("payment_events", {
  id: text("id").primaryKey(), provider: text("provider").notNull(), eventId: text("event_id").notNull(),
  orderNo: text("order_no").notNull(), eventType: text("event_type").notNull(), signatureValid: integer("signature_valid", { mode: "boolean" }).notNull().default(false),
  payloadHash: text("payload_hash").notNull(), processingStatus: text("processing_status").notNull().default("received"),
  errorMessage: text("error_message"), receivedAt: text("received_at").notNull(), processedAt: text("processed_at"),
}, (table) => [uniqueIndex("payment_events_provider_event_unique").on(table.provider, table.eventId), index("payment_events_order_idx").on(table.orderNo, table.receivedAt)]);

export const platformPaymentConfigs = sqliteTable("platform_payment_configs", {
  id: text("id").primaryKey(), mode: text("mode").notNull().default("disabled"),
  provider: text("provider").notNull().default("gateway"), merchantName: text("merchant_name").notNull().default(""),
  merchantId: text("merchant_id").notNull().default(""), checkoutUrl: text("checkout_url").notNull().default(""),
  refundUrl: text("refund_url").notNull().default(""), callbackSecretCiphertext: text("callback_secret_ciphertext"),
  callbackSecretIv: text("callback_secret_iv"), callbackSecretHint: text("callback_secret_hint"),
  status: text("status").notNull().default("active"), updatedByAdminId: text("updated_by_admin_id"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
});

export const platformSettings = sqliteTable("platform_settings", {
  key: text("key").primaryKey(), value: text("value").notNull(), updatedBy: text("updated_by"), updatedAt: text("updated_at").notNull(),
});

export const platformMailConfigs = sqliteTable("platform_mail_configs", {
  id: text("id").primaryKey(), enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  host: text("host").notNull().default("smtp.qq.com"), port: integer("port").notNull().default(465),
  username: text("username").notNull().default(""), passwordCiphertext: text("password_ciphertext"), passwordIv: text("password_iv"),
  passwordHint: text("password_hint"), fromEmail: text("from_email").notNull().default(""),
  fromName: text("from_name").notNull().default("KnowFlow"), useSsl: integer("use_ssl", { mode: "boolean" }).notNull().default(true),
  useStarttls: integer("use_starttls", { mode: "boolean" }).notNull().default(false), relayUrl: text("relay_url").notNull().default(""),
  relayTokenCiphertext: text("relay_token_ciphertext"), relayTokenIv: text("relay_token_iv"), relayTokenHint: text("relay_token_hint"),
  codeExpiryMinutes: integer("code_expiry_minutes").notNull().default(10), resendSeconds: integer("resend_seconds").notNull().default(60),
  maxAttempts: integer("max_attempts").notNull().default(5), codeLength: integer("code_length").notNull().default(6),
  orderNotifications: integer("order_notifications", { mode: "boolean" }).notNull().default(true),
  updatedByAdminId: text("updated_by_admin_id"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
});

export const platformProviderConfigs = sqliteTable("platform_provider_configs", {
  id: text("id").primaryKey(), kind: text("kind").notNull(), provider: text("provider").notNull(),
  baseUrl: text("base_url").notNull(), model: text("model").notNull(), secondaryModel: text("secondary_model"),
  dimensions: integer("dimensions"), apiKeyCiphertext: text("api_key_ciphertext"), apiKeyIv: text("api_key_iv"),
  apiKeyHint: text("api_key_hint"), reuseApiKeyFrom: text("reuse_api_key_from"),
  credentialIdCiphertext: text("credential_id_ciphertext"), credentialIdIv: text("credential_id_iv"),
  credentialIdHint: text("credential_id_hint"), region: text("region"), candidateCount: integer("candidate_count"),
  topN: integer("top_n"), status: text("status").notNull().default("active"),
  migratedFromTenantId: text("migrated_from_tenant_id"), updatedByAdminId: text("updated_by_admin_id"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("platform_provider_kind_unique").on(table.kind)]);

export const orderFulfillments = sqliteTable("order_fulfillments", {
  id: text("id").primaryKey(), orderId: text("order_id").notNull(), tenantId: text("tenant_id").notNull(),
  subscriptionId: text("subscription_id").notNull(), creditsGranted: integer("credits_granted").notNull().default(0),
  status: text("status").notNull().default("success"), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("order_fulfillments_order_unique").on(table.orderId), index("order_fulfillments_tenant_idx").on(table.tenantId, table.createdAt)]);

export const refundRequests = sqliteTable("refund_requests", {
  id: text("id").primaryKey(), orderId: text("order_id").notNull(), tenantId: text("tenant_id").notNull(),
  amountCents: integer("amount_cents").notNull(), reason: text("reason").notNull(), status: text("status").notNull().default("requested"),
  providerRefundNo: text("provider_refund_no"), requestedByMemberId: text("requested_by_member_id").notNull(),
  reviewedByMemberId: text("reviewed_by_member_id"), reviewedAt: text("reviewed_at"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("refund_requests_tenant_idx").on(table.tenantId, table.createdAt)]);

export const entitlements = sqliteTable("entitlements", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), feature: text("feature").notNull(),
  limitValue: integer("limit_value"), usedValue: integer("used_value").notNull().default(0), resetAt: text("reset_at"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("entitlements_tenant_feature_unique").on(table.tenantId, table.feature)]);

export const creditLedger = sqliteTable("credit_ledger", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(), reason: text("reason").notNull(), referenceId: text("reference_id"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("credit_ledger_tenant_idx").on(table.tenantId, table.createdAt)]);

export const tenantUsageMonthly = sqliteTable("tenant_usage_monthly", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), month: text("month").notNull(),
  requestCount: integer("request_count").notNull().default(0), tokenCount: integer("token_count").notNull().default(0),
  creditsUsed: integer("credits_used").notNull().default(0), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("tenant_usage_month_unique").on(table.tenantId, table.month)]);

export const costSettings = sqliteTable("cost_settings", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), modelPattern: text("model_pattern").notNull(),
  inputMicrosPerMillion: integer("input_micros_per_million").notNull().default(0), outputMicrosPerMillion: integer("output_micros_per_million").notNull().default(0),
  requestMicros: integer("request_micros").notNull().default(0), ocrMicrosPerPage: integer("ocr_micros_per_page").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("cost_settings_tenant_model_unique").on(table.tenantId, table.modelPattern)]);

export const tenantProviderConfigs = sqliteTable("tenant_provider_configs", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), kind: text("kind").notNull(),
  provider: text("provider").notNull(), baseUrl: text("base_url").notNull(), model: text("model").notNull(),
  secondaryModel: text("secondary_model"), dimensions: integer("dimensions"), apiKeyCiphertext: text("api_key_ciphertext"),
  apiKeyIv: text("api_key_iv"), apiKeyHint: text("api_key_hint"), reuseApiKeyFrom: text("reuse_api_key_from"),
  credentialIdCiphertext: text("credential_id_ciphertext"), credentialIdIv: text("credential_id_iv"),
  credentialIdHint: text("credential_id_hint"), region: text("region"),
  candidateCount: integer("candidate_count"), topN: integer("top_n"), status: text("status").notNull().default("active"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("tenant_provider_kind_unique").on(table.tenantId, table.kind)]);

export const knowledgeBases = sqliteTable("knowledge_bases", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), name: text("name").notNull(),
  description: text("description").notNull().default(""), status: text("status").notNull().default("active"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false), position: integer("position").notNull().default(0),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("knowledge_bases_tenant_idx").on(table.tenantId, table.position)]);

export const knowledgeCategories = sqliteTable("knowledge_categories", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), knowledgeBaseId: text("knowledge_base_id").notNull(),
  name: text("name").notNull(), position: integer("position").notNull().default(0),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("knowledge_categories_name_unique").on(table.tenantId, table.knowledgeBaseId, table.name),
  index("knowledge_categories_scope_idx").on(table.tenantId, table.knowledgeBaseId, table.position),
]);

export const knowledgeDocuments = sqliteTable("knowledge_documents", {
  id: text("id").primaryKey(), tenantId: text("tenant_id"), knowledgeBaseId: text("knowledge_base_id"),
  categoryId: text("category_id"), position: integer("position").notNull().default(0),
  name: text("name").notNull(), mimeType: text("mime_type").notNull(), objectKey: text("object_key").notNull(),
  extractedText: text("extracted_text").notNull(), charCount: integer("char_count").notNull(), pageCount: integer("page_count"),
  status: text("status").notNull().default("ready"), indexStatus: text("index_status").notNull().default("pending"),
  chunkCount: integer("chunk_count").notNull().default(0), ocrUsed: integer("ocr_used", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("knowledge_documents_tenant_idx").on(table.tenantId, table.knowledgeBaseId, table.categoryId, table.position)]);

export const knowledgeChunks = sqliteTable("knowledge_chunks", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), knowledgeBaseId: text("knowledge_base_id").notNull(),
  categoryId: text("category_id"), documentId: text("document_id").notNull(), chunkIndex: integer("chunk_index").notNull(), content: text("content").notNull(),
  tokenEstimate: integer("token_estimate").notNull(), embeddingJson: text("embedding_json"), embeddingModel: text("embedding_model"),
  vectorDim: integer("vector_dim"), vectorStore: text("vector_store").notNull().default("d1"), vectorPointId: text("vector_point_id"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("knowledge_chunks_doc_index_unique").on(table.tenantId, table.knowledgeBaseId, table.documentId, table.chunkIndex),
  index("knowledge_chunks_tenant_idx").on(table.tenantId, table.knowledgeBaseId, table.categoryId),
]);

export const assistants = sqliteTable("assistants", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), knowledgeBaseId: text("knowledge_base_id").notNull(),
  slug: text("slug").notNull(), name: text("name").notNull(), modelAlias: text("model_alias").notNull(),
  systemPrompt: text("system_prompt").notNull(), temperatureMilli: integer("temperature_milli").notNull().default(200),
  topK: integer("top_k").notNull().default(5), status: text("status").notNull().default("active"), version: integer("version").notNull().default(1),
  publicId: text("public_id"), publicEnabled: integer("public_enabled", { mode: "boolean" }).notNull().default(false),
  brandName: text("brand_name").notNull().default("智能客服"),
  welcomeMessage: text("welcome_message").notNull().default("您好，我是企业智能客服。您可以咨询产品、使用方法和售后政策。"),
  themeColor: text("theme_color").notNull().default("#6d4aff"),
  leadCaptureEnabled: integer("lead_capture_enabled", { mode: "boolean" }).notNull().default(true),
  handoffEnabled: integer("handoff_enabled", { mode: "boolean" }).notNull().default(true),
  handoffLabel: text("handoff_label").notNull().default("转人工服务"),
  industryTemplate: text("industry_template").notNull().default("manufacturing_after_sales"),
  suggestedQuestionsJson: text("suggested_questions_json").notNull().default("[]"),
  qualityThresholdMilli: integer("quality_threshold_milli").notNull().default(620),
  fallbackMessage: text("fallback_message").notNull().default("当前资料不足以可靠回答这个问题。您可以换一种说法，或点击转人工服务。"),
  allowedDomainsJson: text("allowed_domains_json").notNull().default("[]"),
  privacyNotice: text("privacy_notice").notNull().default("为便于回复您的咨询，我们仅在您同意后收集必要的联系方式和问题描述。"),
  privacyPolicyUrl: text("privacy_policy_url").notNull().default(""), privacyVersion: text("privacy_version").notNull().default("2026-08-01"),
  retentionDays: integer("retention_days").notNull().default(180),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("assistants_tenant_alias_unique").on(table.tenantId, table.modelAlias),
  uniqueIndex("assistants_public_id_unique").on(table.publicId),
]);

export const customerConversations = sqliteTable("customer_conversations", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), assistantId: text("assistant_id").notNull(),
  visitorId: text("visitor_id").notNull(), visitorIdHash: text("visitor_id_hash"), channel: text("channel").notNull().default("web_widget"),
  accessTokenHash: text("access_token_hash"), mode: text("mode").notNull().default("ai"), assignedMemberId: text("assigned_member_id"),
  status: text("status").notNull().default("open"), firstQuestion: text("first_question").notNull().default(""),
  lastQuestion: text("last_question").notNull().default(""), messageCount: integer("message_count").notNull().default(0),
  sourceHitCount: integer("source_hit_count").notNull().default(0), aiResolved: integer("ai_resolved", { mode: "boolean" }).notNull().default(false),
  verifiedResolved: integer("verified_resolved", { mode: "boolean" }).notNull().default(false),
  feedbackStatus: text("feedback_status").notNull().default("none"), qualityScoreMilli: integer("quality_score_milli").notNull().default(0),
  leadId: text("lead_id"), startedAt: text("started_at").notNull(), lastMessageAt: text("last_message_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("customer_conversations_tenant_idx").on(table.tenantId, table.startedAt),
  index("customer_conversations_assistant_idx").on(table.assistantId, table.lastMessageAt),
]);

export const customerFaqs = sqliteTable("customer_faqs", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), assistantId: text("assistant_id").notNull(),
  question: text("question").notNull(), answer: text("answer").notNull(), keywordsJson: text("keywords_json").notNull().default("[]"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true), priority: integer("priority").notNull().default(100),
  hitCount: integer("hit_count").notNull().default(0), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("customer_faqs_tenant_idx").on(table.tenantId, table.assistantId, table.enabled, table.priority),
  index("customer_faqs_updated_idx").on(table.tenantId, table.updatedAt),
]);

export const customerMessages = sqliteTable("customer_messages", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(), content: text("content").notNull(), traceId: text("trace_id"),
  sourceCount: integer("source_count").notNull().default(0), feedback: text("feedback"), feedbackReason: text("feedback_reason"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("customer_messages_conversation_idx").on(table.tenantId, table.conversationId, table.createdAt)]);

export const customerLeads = sqliteTable("customer_leads", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), assistantId: text("assistant_id").notNull(),
  conversationId: text("conversation_id"), name: text("name").notNull().default(""), company: text("company").notNull().default(""),
  visitorIdHash: text("visitor_id_hash"), contact: text("contact").notNull(), need: text("need").notNull().default(""), status: text("status").notNull().default("new"),
  assigneeMemberId: text("assignee_member_id"),
  estimatedValueCents: integer("estimated_value_cents").notNull().default(0), notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("customer_leads_tenant_idx").on(table.tenantId, table.createdAt)]);

export const supportTickets = sqliteTable("support_tickets", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), assistantId: text("assistant_id").notNull(),
  conversationId: text("conversation_id"), leadId: text("lead_id"), subject: text("subject").notNull(),
  visitorIdHash: text("visitor_id_hash"), description: text("description").notNull(), contact: text("contact").notNull().default(""),
  priority: text("priority").notNull().default("normal"), status: text("status").notNull().default("open"),
  assigneeMemberId: text("assignee_member_id"), slaDueAt: text("sla_due_at"), firstResponseAt: text("first_response_at"), resolvedAt: text("resolved_at"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("support_tickets_tenant_idx").on(table.tenantId, table.createdAt)]);

export const ticketEvents = sqliteTable("ticket_events", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), ticketId: text("ticket_id").notNull(),
  actorType: text("actor_type").notNull(), actorId: text("actor_id"), eventType: text("event_type").notNull(),
  detailJson: text("detail_json").notNull().default("{}"), createdAt: text("created_at").notNull(),
}, (table) => [index("ticket_events_ticket_idx").on(table.tenantId, table.ticketId, table.createdAt)]);

export const privacyConsents = sqliteTable("privacy_consents", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), assistantId: text("assistant_id").notNull(),
  visitorHash: text("visitor_hash").notNull(), purpose: text("purpose").notNull(), privacyVersion: text("privacy_version").notNull(),
  granted: integer("granted", { mode: "boolean" }).notNull(), ipHash: text("ip_hash").notNull(), userAgentHash: text("user_agent_hash").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("privacy_consents_scope_idx").on(table.tenantId, table.assistantId, table.visitorHash, table.createdAt)]);

export const privacyRequests = sqliteTable("privacy_requests", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), assistantId: text("assistant_id"),
  requestType: text("request_type").notNull(), verificationContact: text("verification_contact").notNull(),
  visitorIdHash: text("visitor_id_hash"), status: text("status").notNull().default("pending"), notes: text("notes").notNull().default(""),
  completedAt: text("completed_at"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("privacy_requests_tenant_idx").on(table.tenantId, table.createdAt)]);

export const notificationConfigs = sqliteTable("notification_configs", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), channel: text("channel").notNull(),
  endpointCiphertext: text("endpoint_ciphertext"), endpointIv: text("endpoint_iv"), endpointHint: text("endpoint_hint"),
  secretCiphertext: text("secret_ciphertext"), secretIv: text("secret_iv"), secretHint: text("secret_hint"),
  eventsJson: text("events_json").notNull().default("[]"), status: text("status").notNull().default("disabled"), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("notification_configs_tenant_channel_unique").on(table.tenantId, table.channel)]);

export const notificationOutbox = sqliteTable("notification_outbox", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), channel: text("channel").notNull(),
  eventType: text("event_type").notNull(), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(),
  payloadJson: text("payload_json").notNull(), status: text("status").notNull().default("pending"), attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: text("next_attempt_at").notNull(), sentAt: text("sent_at"), lastError: text("last_error"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("notification_outbox_pending_idx").on(table.status, table.nextAttemptAt), index("notification_outbox_tenant_idx").on(table.tenantId, table.createdAt)]);

export const qualityTestCases = sqliteTable("quality_test_cases", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), assistantId: text("assistant_id").notNull(),
  question: text("question").notNull(), expectedAnswer: text("expected_answer").notNull(), expectedDocument: text("expected_document"),
  shouldRefuse: integer("should_refuse", { mode: "boolean" }).notNull().default(false), active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("quality_test_cases_tenant_idx").on(table.tenantId, table.assistantId, table.createdAt)]);

export const qualityTestRuns = sqliteTable("quality_test_runs", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), testCaseId: text("test_case_id").notNull(), traceId: text("trace_id"),
  answer: text("answer").notNull(), grounded: integer("grounded", { mode: "boolean" }).notNull(), qualityScoreMilli: integer("quality_score_milli").notNull(),
  passed: integer("passed", { mode: "boolean" }).notNull(), failureReason: text("failure_reason"), createdAt: text("created_at").notNull(),
}, (table) => [index("quality_test_runs_case_idx").on(table.tenantId, table.testCaseId, table.createdAt)]);

export const channelConfigs = sqliteTable("channel_configs", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), assistantId: text("assistant_id").notNull(),
  channel: text("channel").notNull(), appIdCiphertext: text("app_id_ciphertext"), appIdIv: text("app_id_iv"), appIdHint: text("app_id_hint"),
  secretCiphertext: text("secret_ciphertext"), secretIv: text("secret_iv"), secretHint: text("secret_hint"),
  verifyTokenCiphertext: text("verify_token_ciphertext"), verifyTokenIv: text("verify_token_iv"),
  status: text("status").notNull().default("disabled"), configJson: text("config_json").notNull().default("{}"), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("channel_configs_tenant_channel_unique").on(table.tenantId, table.channel)]);

export const channelEvents = sqliteTable("channel_events", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), channel: text("channel").notNull(), externalEventId: text("external_event_id").notNull(),
  assistantId: text("assistant_id").notNull(), externalUserHash: text("external_user_hash").notNull(), direction: text("direction").notNull().default("inbound"),
  question: text("question").notNull(), answer: text("answer"), traceId: text("trace_id"), status: text("status").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("channel_events_external_unique").on(table.tenantId, table.channel, table.externalEventId), index("channel_events_tenant_idx").on(table.tenantId, table.createdAt)]);

export const widgetRateBuckets = sqliteTable("widget_rate_buckets", {
  id: text("id").primaryKey(), assistantId: text("assistant_id").notNull(), visitorHash: text("visitor_hash").notNull(),
  windowMinute: text("window_minute").notNull(), requestCount: integer("request_count").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("widget_rate_bucket_unique").on(table.assistantId, table.visitorHash, table.windowMinute)]);

export const assistantSettings = sqliteTable("assistant_settings", {
  id: text("id").primaryKey(), name: text("name").notNull(), systemPrompt: text("system_prompt").notNull(),
  temperature: integer("temperature_milli").notNull().default(200), topK: integer("top_k").notNull().default(4), updatedAt: text("updated_at").notNull(),
});

export const customerApiKeys = sqliteTable("customer_api_keys", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull(), keyHash: text("key_hash").notNull(), assistantId: text("assistant_id"),
  scopesJson: text("scopes_json").notNull(), rpmLimit: integer("rpm_limit").notNull().default(60),
  tpmLimit: integer("tpm_limit").notNull().default(100000), expiresAt: text("expires_at"), revokedAt: text("revoked_at"),
  lastUsedAt: text("last_used_at"), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("customer_api_keys_hash_unique").on(table.keyHash), index("customer_api_keys_tenant_idx").on(table.tenantId)]);

export const apiRateBuckets = sqliteTable("api_rate_buckets", {
  id: text("id").primaryKey(), apiKeyId: text("api_key_id").notNull(), windowMinute: text("window_minute").notNull(),
  requestCount: integer("request_count").notNull().default(0), tokenCount: integer("token_count").notNull().default(0), updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("api_rate_bucket_unique").on(table.apiKeyId, table.windowMinute)]);

export const traces = sqliteTable("traces", {
  id: text("id").primaryKey(), requestId: text("request_id").notNull(), tenantId: text("tenant_id").notNull(),
  apiKeyId: text("api_key_id"), assistantId: text("assistant_id").notNull(), model: text("model").notNull(),
  question: text("question").notNull(), answer: text("answer"), sourcesJson: text("sources_json").notNull().default("[]"),
  promptTokens: integer("prompt_tokens").notNull().default(0), completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0), latencyMs: integer("latency_ms").notNull().default(0),
  credits: integer("credits").notNull().default(0), costMicros: integer("cost_micros").notNull().default(0),
  grounded: integer("grounded", { mode: "boolean" }).notNull().default(false), qualityScoreMilli: integer("quality_score_milli").notNull().default(0),
  status: text("status").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("traces_tenant_idx").on(table.tenantId, table.createdAt), uniqueIndex("traces_request_unique").on(table.requestId)]);

export const usageRecords = sqliteTable("usage_records", {
  id: text("id").primaryKey(), tenantId: text("tenant_id"), requestId: text("request_id"), model: text("model").notNull(),
  promptTokens: integer("prompt_tokens").notNull().default(0), completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0), latencyMs: integer("latency_ms").notNull().default(0),
  sourceCount: integer("source_count").notNull().default(0), credits: integer("credits").notNull().default(0),
  costMicros: integer("cost_micros").notNull().default(0), status: text("status").notNull(), createdAt: text("created_at").notNull(),
});
