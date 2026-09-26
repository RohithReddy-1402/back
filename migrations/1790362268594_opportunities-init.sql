-- Up Migration

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- submitted_by/verified_by are the MongoDB User _id (text, no FK — Postgres
-- can't reference across databases; same approach forum_profiles.user_id
-- uses for the real identity that lives in Mongo).
CREATE TABLE opportunities (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug                   citext NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title                  text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  company_name           text NOT NULL CHECK (length(company_name) BETWEEN 1 AND 150),
  company_logo_key       text,
  company_logo_url       text,
  type                   text NOT NULL CHECK (type IN ('internship', 'full_time', 'part_time',
                            'research_internship', 'research_opportunity', 'fellowship', 'scholarship',
                            'hackathon', 'competition', 'workshop', 'certification', 'government', 'other')),
  short_description      text NOT NULL DEFAULT '' CHECK (length(short_description) <= 300),
  description            text NOT NULL DEFAULT '' CHECK (length(description) <= 20000),
  eligibility_criteria   text NOT NULL DEFAULT '' CHECK (length(eligibility_criteria) <= 2000),
  eligibility_branches   text[] NOT NULL DEFAULT '{}',
  eligibility_batches    text[] NOT NULL DEFAULT '{}',
  eligibility_semesters  text[] NOT NULL DEFAULT '{}',
  min_cgpa               numeric(3,2) CHECK (min_cgpa IS NULL OR (min_cgpa >= 0 AND min_cgpa <= 10)),
  backlogs_allowed       boolean NOT NULL DEFAULT true,
  skills_required        text[] NOT NULL DEFAULT '{}',
  skills_preferred       text[] NOT NULL DEFAULT '{}',
  location_text          text NOT NULL DEFAULT '',
  location_mode          text CHECK (location_mode IN ('remote', 'hybrid', 'onsite')),
  stipend                numeric(10,2),
  salary                 text,
  is_paid                boolean NOT NULL DEFAULT true,
  duration               text,
  application_start_date date,
  application_deadline   timestamptz,
  selection_process      text NOT NULL DEFAULT '' CHECK (length(selection_process) <= 5000),
  openings               integer CHECK (openings IS NULL OR openings > 0),
  application_url        text NOT NULL CHECK (length(application_url) <= 2000),
  company_url            text,
  source_url             text,
  contact                text,
  instructions           text,
  attachments            jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- draft = not yet visible to students (covers both "admin still editing"
  -- and "submitted by a student, awaiting review" — verification_status
  -- below is what distinguishes those two for the admin queue).
  status                 text NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'scheduled', 'published', 'archived', 'rejected')),
  featured               boolean NOT NULL DEFAULT false,
  urgent                 boolean NOT NULL DEFAULT false,
  scheduled_at           timestamptz,
  verification_status    text NOT NULL DEFAULT 'pending'
                            CHECK (verification_status IN ('verified', 'pending', 'expired', 'reported', 'under_review')),
  verified_by            text,
  verified_at            timestamptz,
  rejection_reason       text,
  submitted_by           text NOT NULL CHECK (submitted_by ~ '^[a-f0-9]{24}$'),
  views                  integer NOT NULL DEFAULT 0,
  bookmark_count         integer NOT NULL DEFAULT 0,
  apply_clicks           integer NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- array_to_string() isn't IMMUTABLE on this Postgres version, so it can't
  -- appear in a generated column — skills are matched via the `&&` overlap
  -- operator on the array columns instead (see opportunities_skills_* below),
  -- not through full-text search.
  search_vec tsvector GENERATED ALWAYS AS (
                setweight(to_tsvector('english', title), 'A')
             || setweight(to_tsvector('simple', company_name), 'A')
             || setweight(to_tsvector('english', short_description), 'B')
             ) STORED
);

CREATE INDEX opportunities_feed ON opportunities (application_deadline ASC NULLS LAST, id DESC) WHERE status = 'published';
CREATE INDEX opportunities_feed_new ON opportunities (id DESC) WHERE status = 'published';
CREATE INDEX opportunities_admin ON opportunities (status, created_at DESC);
CREATE INDEX opportunities_pending_review ON opportunities (created_at DESC) WHERE status = 'draft' AND verification_status = 'pending';
CREATE INDEX opportunities_search ON opportunities USING gin (search_vec);
CREATE INDEX opportunities_title_trgm ON opportunities USING gin (title gin_trgm_ops);
CREATE INDEX opportunities_company_trgm ON opportunities USING gin (company_name gin_trgm_ops);
CREATE INDEX opportunities_submitted_by ON opportunities (submitted_by, created_at DESC);
CREATE INDEX opportunities_skills_required ON opportunities USING gin (skills_required);
CREATE INDEX opportunities_skills_preferred ON opportunities USING gin (skills_preferred);

-- Presigned uploads not yet attached to an opportunity (logo/attachment/resume);
-- swept after 24h. Mirrors forum's `uploads` table, but user_id has no FK here
-- since a submitter needn't have a forum profile.
CREATE TABLE opportunity_uploads (
  key          text PRIMARY KEY,
  user_id      text NOT NULL,
  purpose      text NOT NULL CHECK (purpose IN ('opportunity-logo', 'opportunity-attachment', 'resume')),
  bytes        integer,
  content_type text NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'attached')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX opportunity_uploads_pending ON opportunity_uploads (created_at) WHERE status = 'pending';

-- Down Migration

DROP TABLE IF EXISTS opportunity_uploads, opportunities CASCADE;
