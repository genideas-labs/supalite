-- 기존 내용 유지
CREATE TABLE IF NOT EXISTS public.shops (
    id bigint NOT NULL,
    name text,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.shops FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.test_table (
    id SERIAL PRIMARY KEY,
    name TEXT,
    value INTEGER
);
