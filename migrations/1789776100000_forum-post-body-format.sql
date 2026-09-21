-- Rich (HTML) blog-style posts alongside the existing markdown posts.
-- `body_format` defaults to 'markdown' so every existing post keeps
-- rendering exactly as before; new posts written with the rich editor are
-- stored as sanitized HTML with body_format = 'html'.
ALTER TABLE posts
  ADD COLUMN body_format text NOT NULL DEFAULT 'markdown'
    CHECK (body_format IN ('markdown', 'html'));
