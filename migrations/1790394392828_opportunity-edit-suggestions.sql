-- Up Migration

-- Free-text correction requests on an already-published opportunity — no
-- auto-merge; an admin reads the note and applies the fix themselves via the
-- normal edit screen. Simpler and safer than a structured diff/patch system.
CREATE TABLE opportunity_edit_suggestions (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  opportunity_id bigint NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  submitted_by   text NOT NULL CHECK (submitted_by ~ '^[a-f0-9]{24}$'),
  note           text NOT NULL CHECK (length(note) BETWEEN 1 AND 500),
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_by    text,
  resolved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX opportunity_edit_suggestions_queue ON opportunity_edit_suggestions (status, created_at DESC);
CREATE INDEX opportunity_edit_suggestions_opp ON opportunity_edit_suggestions (opportunity_id);

-- Down Migration

DROP TABLE IF EXISTS opportunity_edit_suggestions CASCADE;
