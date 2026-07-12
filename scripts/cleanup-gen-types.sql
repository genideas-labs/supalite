-- Cleanup schema objects used by gen-types tests.

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
