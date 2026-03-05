-- Add is_active toggle to API keys
ALTER TABLE sys_api_keys ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
