ALTER TABLE public."User"
  ADD COLUMN IF NOT EXISTS "role" TEXT;

ALTER TABLE public."User"
  ALTER COLUMN "role" SET DEFAULT 'user';