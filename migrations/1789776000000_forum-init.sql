-- Up Migration

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ------------------------------------------------------------------ ranking
-- Reddit's hot formula. Newer posts get a permanently higher baseline, so the
-- value never needs recomputing over time — only when the score changes.
CREATE FUNCTION forum_hot(score integer, created timestamptz) RETURNS double precision
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT sign(score) * log(greatest(abs(score), 1))
       + (extract(epoch FROM created) - 1767225600) / 45000.0  -- 2026-01-01
$$;

-- Wilson score lower bound (80% confidence), Reddit's "best" comment sort.
CREATE FUNCTION forum_wilson(up integer, down integer) RETURNS double precision
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN up + down = 0 THEN 0 ELSE
    ((up::float8 / (up + down)) + 1.642374 / (2 * (up + down))
      - 1.281552 * sqrt(((up::float8 / (up + down)) * (1 - up::float8 / (up + down))
                         + 1.642374 / (4 * (up + down))) / (up + down)))
    / (1 + 1.642374 / (up + down))
  END
$$;

-- ----------------------------------------------------------------- profiles
-- The forum identity. user_id is the MongoDB User _id; real identity never
-- leaves Mongo, so every author join stays inside Postgres.
CREATE TABLE forum_profiles (
  user_id           text PRIMARY KEY CHECK (user_id ~ '^[a-f0-9]{24}$'),
  -- The API limits chosen handles to 3-20 chars; 32 fits "deleted_<user_id>".
  handle            citext NOT NULL UNIQUE CHECK (handle ~ '^[A-Za-z0-9_]{3,32}$'),
  avatar_key        text,
  bio               text NOT NULL DEFAULT '' CHECK (length(bio) <= 300),
  post_karma        integer NOT NULL DEFAULT 0,
  comment_karma     integer NOT NULL DEFAULT 0,
  banned_until      timestamptz,
  ban_reason        text,
  accepted_terms_at timestamptz NOT NULL,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX forum_profiles_handle_trgm ON forum_profiles USING gin (handle gin_trgm_ops);

-- -------------------------------------------------------------- communities
CREATE TABLE communities (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         citext NOT NULL UNIQUE CHECK (name ~ '^[A-Za-z0-9_]{3,21}$'),
  title        text NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  description  text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  rules        jsonb NOT NULL DEFAULT '[]'::jsonb,
  icon_key     text,
  banner_key   text,
  type         text NOT NULL DEFAULT 'public' CHECK (type IN ('public', 'restricted')),
  allow_images boolean NOT NULL DEFAULT true,
  created_by   text NOT NULL REFERENCES forum_profiles(user_id),
  member_count integer NOT NULL DEFAULT 0,
  post_count   integer NOT NULL DEFAULT 0,
  removed_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  search_vec   tsvector GENERATED ALWAYS AS (
                 setweight(to_tsvector('simple', name::text), 'A')
              || setweight(to_tsvector('english', title), 'A')
              || setweight(to_tsvector('english', description), 'B')) STORED
);
CREATE INDEX communities_search ON communities USING gin (search_vec);
CREATE INDEX communities_name_trgm ON communities USING gin (name gin_trgm_ops);
CREATE INDEX communities_popular ON communities (member_count DESC, id DESC) WHERE removed_at IS NULL;
CREATE INDEX communities_created_by ON communities (created_by, created_at DESC);

CREATE TABLE community_members (
  community_id bigint NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      text NOT NULL REFERENCES forum_profiles(user_id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'owner')),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);
CREATE INDEX community_members_user ON community_members (user_id, joined_at DESC);
CREATE INDEX community_members_mods ON community_members (community_id) WHERE role <> 'member';

-- via_ref ("p:<id36>" / "c:<id36>") marks a ban issued from anonymous
-- content: listed without the handle, one row per item (like user_blocks),
-- so moderators never learn who the anonymous author is.
CREATE TABLE community_bans (
  community_id bigint NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      text NOT NULL REFERENCES forum_profiles(user_id) ON DELETE CASCADE,
  via_ref      text,
  reason       text NOT NULL DEFAULT '',
  banned_by    text NOT NULL REFERENCES forum_profiles(user_id),
  expires_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX community_bans_unique ON community_bans (community_id, user_id, coalesce(via_ref, ''));

-- -------------------------------------------------------------------- posts
CREATE TABLE posts (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  community_id   bigint NOT NULL REFERENCES communities(id),
  author_id      text NOT NULL REFERENCES forum_profiles(user_id),
  is_anonymous   boolean NOT NULL DEFAULT false,
  kind           text NOT NULL CHECK (kind IN ('text', 'image', 'link', 'video')),
  title          text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  body           text NOT NULL DEFAULT '' CHECK (length(body) <= 40000),
  url            text CHECK (url IS NULL OR length(url) <= 2000),
  flair          text,
  score          integer NOT NULL DEFAULT 1,
  upvotes        integer NOT NULL DEFAULT 1,
  downvotes      integer NOT NULL DEFAULT 0,
  hot_rank       double precision NOT NULL DEFAULT 0,
  comment_count  integer NOT NULL DEFAULT 0,
  report_count   integer NOT NULL DEFAULT 0,
  is_pinned      boolean NOT NULL DEFAULT false,
  is_locked      boolean NOT NULL DEFAULT false,
  removed_at     timestamptz,
  removed_by     text,
  removal_reason text,
  deleted_at     timestamptz,
  edited_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  search_vec     tsvector GENERATED ALWAYS AS (
                   setweight(to_tsvector('english', title), 'A')
                || setweight(to_tsvector('english', body), 'B')) STORED
);

CREATE FUNCTION posts_set_hot_rank() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.hot_rank := forum_hot(NEW.score, NEW.created_at);
  RETURN NEW;
END $$;
CREATE TRIGGER posts_hot_rank BEFORE INSERT OR UPDATE OF score ON posts
  FOR EACH ROW EXECUTE FUNCTION posts_set_hot_rank();

-- "visible" = not removed by a mod and not deleted by its author.
CREATE INDEX posts_comm_hot ON posts (community_id, hot_rank DESC, id DESC) WHERE removed_at IS NULL AND deleted_at IS NULL;
-- "New" sorts by id: ids are sequential, and keyset cursors on timestamps
-- lose microseconds in JS.
CREATE INDEX posts_comm_new ON posts (community_id, id DESC) WHERE removed_at IS NULL AND deleted_at IS NULL;
CREATE INDEX posts_comm_top ON posts (community_id, score DESC, id DESC) WHERE removed_at IS NULL AND deleted_at IS NULL;
CREATE INDEX posts_all_hot ON posts (hot_rank DESC, id DESC) WHERE removed_at IS NULL AND deleted_at IS NULL;
CREATE INDEX posts_all_new ON posts (id DESC) WHERE removed_at IS NULL AND deleted_at IS NULL;
CREATE INDEX posts_all_top ON posts (score DESC, id DESC) WHERE removed_at IS NULL AND deleted_at IS NULL;
CREATE INDEX posts_author ON posts (author_id, id DESC);
CREATE INDEX posts_pinned ON posts (community_id) WHERE is_pinned;
CREATE INDEX posts_search ON posts USING gin (search_vec);
CREATE INDEX posts_title_trgm ON posts USING gin (title gin_trgm_ops);

CREATE TABLE post_images (
  post_id  bigint NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 3),
  key      text NOT NULL UNIQUE,
  width    integer NOT NULL CHECK (width > 0),
  height   integer NOT NULL CHECK (height > 0),
  bytes    integer NOT NULL,
  PRIMARY KEY (post_id, position)
);

-- Presigned uploads not yet attached to a post; swept after 24h.
CREATE TABLE uploads (
  key          text PRIMARY KEY,
  user_id      text NOT NULL REFERENCES forum_profiles(user_id) ON DELETE CASCADE,
  bytes        integer NOT NULL,
  content_type text NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'attached')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX uploads_pending ON uploads (created_at) WHERE status = 'pending';

CREATE TABLE post_votes (
  user_id    text NOT NULL REFERENCES forum_profiles(user_id) ON DELETE CASCADE,
  post_id    bigint NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  value      smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX post_votes_post ON post_votes (post_id);

-- ----------------------------------------------------------------- comments
-- root_id (top-level ancestor, itself for top-level) + depth let a thread be
-- loaded with two indexed queries and no recursion.
CREATE TABLE comments (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id        bigint NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  parent_id      bigint REFERENCES comments(id),
  root_id        bigint,
  depth          smallint NOT NULL DEFAULT 0 CHECK (depth >= 0),
  author_id      text NOT NULL REFERENCES forum_profiles(user_id),
  is_anonymous   boolean NOT NULL DEFAULT false,
  body           text NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  score          integer NOT NULL DEFAULT 1,
  upvotes        integer NOT NULL DEFAULT 1,
  downvotes      integer NOT NULL DEFAULT 0,
  best_rank      double precision NOT NULL DEFAULT 0,
  reply_count    integer NOT NULL DEFAULT 0,
  report_count   integer NOT NULL DEFAULT 0,
  removed_at     timestamptz,
  removed_by     text,
  removal_reason text,
  deleted_at     timestamptz,
  edited_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION comments_set_ranks() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.best_rank := forum_wilson(NEW.upvotes, NEW.downvotes);
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NULL THEN
    NEW.root_id := NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER comments_ranks BEFORE INSERT OR UPDATE OF upvotes, downvotes ON comments
  FOR EACH ROW EXECUTE FUNCTION comments_set_ranks();

CREATE INDEX comments_top_best ON comments (post_id, best_rank DESC, id DESC) WHERE depth = 0;
CREATE INDEX comments_top_score ON comments (post_id, score DESC, id DESC) WHERE depth = 0;
CREATE INDEX comments_top_new ON comments (post_id, id DESC) WHERE depth = 0;
CREATE INDEX comments_root ON comments (root_id, depth);
CREATE INDEX comments_parent ON comments (parent_id);
CREATE INDEX comments_author ON comments (author_id, id DESC);

CREATE TABLE comment_votes (
  user_id    text NOT NULL REFERENCES forum_profiles(user_id) ON DELETE CASCADE,
  comment_id bigint NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  value      smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, comment_id)
);
CREATE INDEX comment_votes_comment ON comment_votes (comment_id);

-- -------------------------------------------------------- per-user lists
CREATE TABLE saved_posts (
  user_id    text NOT NULL REFERENCES forum_profiles(user_id) ON DELETE CASCADE,
  post_id    bigint NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX saved_posts_list ON saved_posts (user_id, created_at DESC);

CREATE TABLE hidden_posts (
  user_id    text NOT NULL REFERENCES forum_profiles(user_id) ON DELETE CASCADE,
  post_id    bigint NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

-- Required by App Store guideline 1.2 and Google Play's UGC policy.
-- via_ref is set ("p:<id36>" / "c:<id36>") when the block was made from
-- anonymous content; such blocks are listed without the handle. Each one is
-- its own row: merging them would reveal two anonymous posts share an author.
CREATE TABLE user_blocks (
  blocker_id text NOT NULL REFERENCES forum_profiles(user_id) ON DELETE CASCADE,
  blocked_id text NOT NULL REFERENCES forum_profiles(user_id) ON DELETE CASCADE,
  via_ref    text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (blocker_id <> blocked_id)
);
CREATE UNIQUE INDEX user_blocks_unique ON user_blocks (blocker_id, blocked_id, coalesce(via_ref, ''));

-- --------------------------------------------------------------- moderation
CREATE TABLE reports (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_type  text NOT NULL CHECK (target_type IN ('post', 'comment')),
  target_id    bigint NOT NULL,
  community_id bigint NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  reporter_id  text NOT NULL REFERENCES forum_profiles(user_id) ON DELETE CASCADE,
  reason       text NOT NULL CHECK (reason IN ('spam', 'harassment', 'hate', 'sexual',
                                               'personal_info', 'misinformation', 'other')),
  details      text NOT NULL DEFAULT '' CHECK (length(details) <= 500),
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_by  text,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, target_type, target_id)
);
CREATE INDEX reports_queue ON reports (community_id, status, created_at DESC);
CREATE INDEX reports_target ON reports (target_type, target_id) WHERE status = 'open';
CREATE INDEX reports_open_all ON reports (created_at DESC) WHERE status = 'open';

CREATE TABLE mod_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  community_id bigint REFERENCES communities(id) ON DELETE CASCADE,
  actor_id     text NOT NULL,
  action       text NOT NULL,
  target_type  text,
  target_id    text,
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mod_log_community ON mod_log (community_id, created_at DESC);

-- Down Migration

DROP TABLE IF EXISTS mod_log, reports, user_blocks, hidden_posts, saved_posts,
  comment_votes, comments, post_votes, uploads, post_images, posts,
  community_bans, community_members, communities, forum_profiles CASCADE;
DROP FUNCTION IF EXISTS comments_set_ranks, posts_set_hot_rank, forum_wilson, forum_hot;
