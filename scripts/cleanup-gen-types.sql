-- Cleanup schema objects used by gen-types tests.

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
