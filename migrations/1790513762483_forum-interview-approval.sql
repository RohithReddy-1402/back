ALTER TABLE communities
  ADD COLUMN requires_approval boolean NOT NULL DEFAULT false;

ALTER TABLE posts
  ADD COLUMN status  text NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'pending', 'rejected')),
  ADD COLUMN company text CHECK (company IS NULL OR length(company) <= 120),
  ADD COLUMN tags    text[] NOT NULL DEFAULT '{}';

CREATE INDEX posts_status_pending ON posts (id DESC) WHERE status = 'pending';
CREATE INDEX posts_tags_gin ON posts USING gin (tags);
