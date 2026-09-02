import type { PlatformContext } from "./platform-admin";
import { writePlatformAudit } from "./platform-admin";
import { getRuntime } from "./runtime";
import type { ProviderKind } from "./provider";

export type ProviderConfigRow = {
  id: string; kind: ProviderKind; provider: string; base_url: string; model: string; secondary_model: string | null;
  dimensions: number | null; api_key_ciphertext: string | null; api_key_iv: string | null; api_key_hint: string | null;
  credential_id_ciphertext: string | null; credential_id_iv: string | null; credential_id_hint: string | null;
  region: string | null; reuse_api_key_from: ProviderKind | null; candidate_count: number | null; top_n: number | null;
  status: string; updated_at: string;
};

export const PROVIDER_SELECT_COLUMNS = `id, kind, provider, base_url, model, secondary_model, dimensions,
  api_key_ciphertext, api_key_iv, api_key_hint, credential_id_ciphertext, credential_id_iv, credential_id_hint,
  region, reuse_api_key_from, candidate_count, top_n, status, updated_at`;

export async function loadPlatformProviderRows() {
  const result = await getRuntime().DB.prepare(`SELECT ${PROVIDER_SELECT_COLUMNS}
    FROM platform_provider_configs WHERE status = 'active'`).all<ProviderConfigRow>();
  return result.results;
}

export async function ensurePlatformProviderConfigs(admin: PlatformContext) {
  const { DB } = getRuntime();
  const existing = await DB.prepare("SELECT kind FROM platform_provider_configs WHERE status = 'active'").all<{ kind: ProviderKind }>();
  const present = new Set(existing.results.map((row) => row.kind));
  if (present.size >= 4) return { adopted: 0, tenantId: null as string | null };

  const now = new Date().toISOString();
  let adopted = 0;
  let sourceTenantId: string | null = null;
  const source = await DB.prepare(`SELECT tpc.tenant_id, COUNT(*) AS config_count, MAX(tpc.updated_at) AS latest,
      MAX(CASE WHEN tm.id IS NOT NULL THEN 1 ELSE 0 END) AS belongs_to_admin
    FROM tenant_provider_configs tpc
    LEFT JOIN tenant_members tm ON tm.tenant_id = tpc.tenant_id AND tm.status = 'active'
      AND ((? IS NOT NULL AND tm.account_id = ?) OR tm.email = ?)
    WHERE tpc.status = 'active'
      AND (tpc.api_key_ciphertext IS NOT NULL OR tpc.reuse_api_key_from = 'embedding')
    GROUP BY tpc.tenant_id
    ORDER BY belongs_to_admin DESC, config_count DESC, latest DESC
    LIMIT 1`).bind(admin.accountId, admin.accountId, admin.email).first<{ tenant_id: string; config_count: number }>();

  if (source?.tenant_id) {
    sourceTenantId = source.tenant_id;
    for (const kind of ["generation", "embedding", "rerank", "ocr"] as const) {
      if (present.has(kind)) continue;
      const row = await DB.prepare(`SELECT ${PROVIDER_SELECT_COLUMNS}
        FROM tenant_provider_configs WHERE tenant_id = ? AND kind = ? AND status = 'active' LIMIT 1`)
        .bind(source.tenant_id, kind).first<ProviderConfigRow>();
      if (!row) continue;
      await DB.prepare(`INSERT OR IGNORE INTO platform_provider_configs
        (id, kind, provider, base_url, model, secondary_model, dimensions, api_key_ciphertext, api_key_iv, api_key_hint,
         credential_id_ciphertext, credential_id_iv, credential_id_hint, region, reuse_api_key_from, candidate_count, top_n,
         status, migrated_from_tenant_id, updated_by_admin_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`)
        .bind(`pprov_${kind}`, kind, row.provider, row.base_url, row.model, row.secondary_model, row.dimensions,
          row.api_key_ciphertext, row.api_key_iv, row.api_key_hint, row.credential_id_ciphertext, row.credential_id_iv,
          row.credential_id_hint, row.region, row.reuse_api_key_from, row.candidate_count, row.top_n,
          source.tenant_id, admin.id, now, row.updated_at || now).run();
      present.add(kind);
      adopted += 1;
    }
  }

  if (!present.has("rerank")) {
    const embedding = await DB.prepare(`SELECT base_url, api_key_hint FROM platform_provider_configs
      WHERE kind = 'embedding' AND provider = 'siliconflow' AND status = 'active' LIMIT 1`)
      .first<{ base_url: string; api_key_hint: string | null }>();
    if (embedding) {
      await DB.prepare(`INSERT OR IGNORE INTO platform_provider_configs
        (id, kind, provider, base_url, model, secondary_model, dimensions, api_key_ciphertext, api_key_iv, api_key_hint,
         credential_id_ciphertext, credential_id_iv, credential_id_hint, region, reuse_api_key_from, candidate_count, top_n,
         status, updated_by_admin_id, created_at, updated_at)
        VALUES ('pprov_rerank', 'rerank', 'siliconflow', ?, 'BAAI/bge-reranker-v2-m3', NULL, NULL, NULL, NULL, ?,
          NULL, NULL, NULL, NULL, 'embedding', 12, 3, 'active', ?, ?, ?)`)
        .bind(embedding.base_url, embedding.api_key_hint, admin.id, now, now).run();
      present.add("rerank");
      adopted += 1;
    }
  }

  if (adopted) {
    await writePlatformAudit(admin, "provider_configs.adopted", "platform_provider", null, {
      sourceTenantId, adoptedKinds: adopted,
    });
  }
  return { adopted, tenantId: sourceTenantId };
}

export async function loadEffectiveProviderRows(tenantId: string) {
  const { DB } = getRuntime();
  const [platform, tenant] = await Promise.all([
    loadPlatformProviderRows(),
    DB.prepare(`SELECT ${PROVIDER_SELECT_COLUMNS} FROM tenant_provider_configs
      WHERE tenant_id = ? AND status = 'active'`).bind(tenantId).all<ProviderConfigRow>(),
  ]);
  const rows = new Map<ProviderKind, { row: ProviderConfigRow; scope: "platform" | "tenant" }>();
  for (const row of tenant.results) rows.set(row.kind, { row, scope: "tenant" });
  for (const row of platform) rows.set(row.kind, { row, scope: "platform" });
  return rows;
}
