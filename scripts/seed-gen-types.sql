-- Seed schema objects used by gen-types tests and manual generation.
-- Safe to re-run: drops existing objects, then recreates them.

DROP VIEW IF EXISTS public.gen_types_users_view;
DROP TABLE IF EXISTS public.gen_types_profiles CASCADE;
DROP TABLE IF EXISTS public.gen_types_users CASCADE;
DROP FUNCTION IF EXISTS public.gen_types_add(integer, integer);
DROP FUNCTION IF EXISTS public.gen_types_user_summary(bigint);
DROP FUNCTION IF EXISTS public.gen_types_payload(bigint);
DROP FUNCTION IF EXISTS public.gen_types_scalar();
DROP FUNCTION IF EXISTS public.gen_types_set();
DROP TYPE IF EXISTS public.gen_types_payload;
DROP TYPE IF EXISTS public.gen_types_status;
DROP SCHEMA IF EXISTS gen_types_schema CASCADE;

CREATE TYPE public.gen_types_status AS ENUM ('active', 'inactive');

CREATE TABLE public.gen_types_users (
  id BIGSERIAL PRIMARY KEY,
  status public.gen_types_status NOT NULL,
  status_history public.gen_types_status[],
  metadata JSONB,
  tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT
);

CREATE TABLE public.gen_types_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  nickname TEXT NOT NULL,
  CONSTRAINT gen_types_profiles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.gen_types_users (id),
  CONSTRAINT gen_types_profiles_user_id_key UNIQUE (user_id),
  CONSTRAINT gen_types_profiles_nickname_check CHECK (char_length(nickname) > 0)
);

CREATE INDEX gen_types_profiles_nickname_idx ON public.gen_types_profiles (nickname);

CREATE TYPE public.gen_types_payload AS (
  id BIGINT,
  note TEXT
);

CREATE VIEW public.gen_types_users_view AS
SELECT id, status FROM public.gen_types_users;

CREATE OR REPLACE FUNCTION public.gen_types_add(a integer, b integer)
RETURNS integer
LANGUAGE sql
AS $$ SELECT a + b $$;

CREATE OR REPLACE FUNCTION public.gen_types_user_summary(user_id bigint)
RETURNS TABLE (id bigint, status public.gen_types_status)
LANGUAGE sql
AS $$ SELECT id, status FROM public.gen_types_users WHERE id = user_id $$;

CREATE OR REPLACE FUNCTION public.gen_types_payload(user_id bigint)
RETURNS public.gen_types_payload
LANGUAGE sql
AS $$ SELECT user_id, 'note'::text $$;

CREATE OR REPLACE FUNCTION public.gen_types_scalar()
RETURNS integer
LANGUAGE sql
AS $$ SELECT 1 $$;

CREATE OR REPLACE FUNCTION public.gen_types_set()
RETURNS SETOF integer
LANGUAGE sql
AS $$ SELECT 1 UNION ALL SELECT 2 $$;

CREATE SCHEMA gen_types_schema;

CREATE TABLE gen_types_schema.gen_types_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  payload JSONB,
  scores INTEGER[]
);
