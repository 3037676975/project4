UPDATE platform_provider_configs
SET provider = 'siliconflow', base_url = 'https://api.siliconflow.cn/v1', model = 'BAAI/bge-m3', dimensions = 1024,
    api_key_ciphertext = NULL, api_key_iv = NULL, api_key_hint = NULL, reuse_api_key_from = NULL, updated_at = CURRENT_TIMESTAMP
WHERE kind = 'embedding' AND provider = 'infinity';

UPDATE platform_provider_configs
SET provider = 'siliconflow', base_url = 'https://api.siliconflow.cn/v1', model = 'BAAI/bge-reranker-v2-m3', dimensions = NULL,
    api_key_ciphertext = NULL, api_key_iv = NULL, api_key_hint = NULL, reuse_api_key_from = 'embedding', updated_at = CURRENT_TIMESTAMP
WHERE kind = 'rerank' AND provider = 'infinity';

UPDATE tenant_provider_configs
SET provider = 'siliconflow', base_url = 'https://api.siliconflow.cn/v1', model = 'BAAI/bge-m3', dimensions = 1024,
    api_key_ciphertext = NULL, api_key_iv = NULL, api_key_hint = NULL, reuse_api_key_from = NULL, updated_at = CURRENT_TIMESTAMP
WHERE kind = 'embedding' AND provider = 'infinity';

UPDATE tenant_provider_configs
SET provider = 'siliconflow', base_url = 'https://api.siliconflow.cn/v1', model = 'BAAI/bge-reranker-v2-m3', dimensions = NULL,
    api_key_ciphertext = NULL, api_key_iv = NULL, api_key_hint = NULL, reuse_api_key_from = 'embedding', updated_at = CURRENT_TIMESTAMP
WHERE kind = 'rerank' AND provider = 'infinity';
