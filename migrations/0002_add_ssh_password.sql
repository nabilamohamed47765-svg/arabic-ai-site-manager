ALTER TABLE sites
ADD COLUMN ssh_password_ciphertext TEXT;

ALTER TABLE sites
ADD COLUMN ssh_password_iv TEXT;
