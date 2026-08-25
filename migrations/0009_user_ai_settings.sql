-- إضافة إعدادات الذكاء الاصطناعي لكل مستخدم:
-- الموديل المختار + مفتاح OpenRouter الخاص به (مشفر، اختياري)
ALTER TABLE users ADD COLUMN ai_model TEXT DEFAULT 'openrouter/free';
ALTER TABLE users ADD COLUMN openrouter_api_key_ciphertext TEXT;
ALTER TABLE users ADD COLUMN openrouter_api_key_iv TEXT;