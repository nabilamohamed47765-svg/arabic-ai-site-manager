-- إضافة دعم مزودي الذكاء الاصطناعي المتعددين وسجل معمارية المواقع (Project Manifests)
ALTER TABLE users ADD COLUMN ai_provider TEXT DEFAULT 'openrouter';
ALTER TABLE users ADD COLUMN ai_base_url TEXT;
ALTER TABLE users ADD COLUMN ai_temperature REAL DEFAULT 0.7;
ALTER TABLE users ADD COLUMN ai_max_tokens INTEGER DEFAULT 4000;

ALTER TABLE sites ADD COLUMN framework TEXT;
ALTER TABLE sites ADD COLUMN project_manifest TEXT;
ALTER TABLE sites ADD COLUMN last_scanned_at TEXT;
