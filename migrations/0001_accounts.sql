CREATE TABLE IF NOT EXISTS accounts (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Le plafond est appliqué dans SQLite, y compris entre deux requêtes simultanées.
CREATE TRIGGER IF NOT EXISTS accounts_limit BEFORE INSERT ON accounts
WHEN NOT EXISTS (SELECT 1 FROM accounts WHERE user_id = NEW.user_id)
AND (SELECT COUNT(*) FROM accounts) >= 25
BEGIN
  SELECT RAISE(IGNORE);
END;
