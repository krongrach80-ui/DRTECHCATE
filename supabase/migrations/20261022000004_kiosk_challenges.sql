-- ========================================================================
-- KIOSK CHALLENGES (Short-lived Liveness Challenge nonces for Face Auth)
-- ========================================================================

CREATE TABLE IF NOT EXISTS kiosk_challenges (
  nonce TEXT PRIMARY KEY,
  device_id UUID REFERENCES kiosk_devices(id) ON DELETE CASCADE,
  steps JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_used BOOLEAN DEFAULT false NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kiosk_challenges_expires ON kiosk_challenges(expires_at, is_used);

-- Enable RLS: Strictly private table for server-side service role only
ALTER TABLE kiosk_challenges ENABLE ROW LEVEL SECURITY;
-- No policies granted to public or authenticated users.
