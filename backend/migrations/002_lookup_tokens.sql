ALTER TABLE tool_submissions ADD COLUMN lookup_token_hash TEXT;
ALTER TABLE newsletter_subscriptions ADD COLUMN unsubscribe_token_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_submission_lookup_token
  ON tool_submissions(lookup_token_hash)
  WHERE lookup_token_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_unsubscribe_token
  ON newsletter_subscriptions(unsubscribe_token_hash)
  WHERE unsubscribe_token_hash IS NOT NULL;

PRAGMA user_version = 2;
