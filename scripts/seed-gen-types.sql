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
DROP VIEW IF EXISTS public.gen_types_profiles_view;
DROP FUNCTION IF EXISTS public.gen_types_void();
DROP FUNCTION IF EXISTS public.gen_types_int_array();
DROP FUNCTION IF EXISTS public.gen_types_unnamed(integer, integer);
DROP FUNCTION IF EXISTS public.gen_types_arr_param(integer[]);
DROP FUNCTION IF EXISTS public.gen_types_users_setof();
DROP FUNCTION IF EXISTS public.gen_types_overload(integer);
DROP FUNCTION IF EXISTS public.gen_types_overload(text);
DROP FUNCTION IF EXISTS public.gen_types_many_args(integer, integer, integer);
DROP FUNCTION IF EXISTS public.gen_types_trigger_fn();
DROP TABLE IF EXISTS public.gen_types_kitchen_sink CASCADE;
DROP TYPE IF EXISTS public.gen_types_meta;
DROP TYPE IF EXISTS public.gen_types_priority;
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

-- Enum with more than two values: exercises multi-line enum rendering
-- (supabase union form) and the array Constants form.
CREATE TYPE public.gen_types_priority AS ENUM ('low', 'medium', 'high');

-- Composite type carrying an array attribute: exercises composite array mapping.
CREATE TYPE public.gen_types_meta AS (
  labels TEXT[],
  count INTEGER
);

-- Table with a boolean column, an "unknown" (point) column, and an enum column.
CREATE TABLE public.gen_types_kitchen_sink (
  id BIGSERIAL PRIMARY KEY,
  is_active BOOLEAN NOT NULL,
  location POINT,
  priority public.gen_types_priority
);

-- View exposing the foreign-key column of gen_types_profiles so that
-- view-to-table / table-to-view / view-to-view relationships are derived.
CREATE VIEW public.gen_types_profiles_view AS
SELECT id, user_id, nickname FROM public.gen_types_profiles;

-- Function returning void -> Returns: undefined.
CREATE OR REPLACE FUNCTION public.gen_types_void()
RETURNS void
LANGUAGE sql
AS $$ SELECT NULL::void $$;

-- Function returning an array type via ARRAY return path.
CREATE OR REPLACE FUNCTION public.gen_types_int_array()
RETURNS integer[]
LANGUAGE sql
AS $$ SELECT ARRAY[1, 2, 3] $$;

-- Function with unnamed parameters -> arg1/arg2 fallback naming (supalite),
-- and unnamed multi-arg suppression (supabase).
CREATE OR REPLACE FUNCTION public.gen_types_unnamed(integer, integer)
RETURNS integer
LANGUAGE sql
AS $$ SELECT $1 + $2 $$;

-- Function with an array parameter -> array parameter mapping.
CREATE OR REPLACE FUNCTION public.gen_types_arr_param(vals integer[])
RETURNS integer
LANGUAGE sql
AS $$ SELECT COALESCE(array_length(vals, 1), 0) $$;

-- Function returning SETOF a base table -> table-column return + SetofOptions.
CREATE OR REPLACE FUNCTION public.gen_types_users_setof()
RETURNS SETOF public.gen_types_users
LANGUAGE sql
AS $$ SELECT * FROM public.gen_types_users $$;

-- Overloaded function (two signatures) -> multi-signature rendering.
CREATE OR REPLACE FUNCTION public.gen_types_overload(a integer)
RETURNS integer
LANGUAGE sql
AS $$ SELECT a $$;

CREATE OR REPLACE FUNCTION public.gen_types_overload(a text)
RETURNS text
LANGUAGE sql
AS $$ SELECT a $$;

-- Function with more than two named args -> multi-line Args (supabase).
CREATE OR REPLACE FUNCTION public.gen_types_many_args(a integer, b integer, c integer)
RETURNS integer
LANGUAGE sql
AS $$ SELECT a + b + c $$;

-- Trigger function -> suppressed in supabase output.
CREATE OR REPLACE FUNCTION public.gen_types_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$ BEGIN RETURN NEW; END; $$;
