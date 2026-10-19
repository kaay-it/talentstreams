ALTER TABLE "candidates" ALTER COLUMN "email" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "candidates" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "candidates" ALTER COLUMN "phone" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "candidates" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
-- "" sentinel can't satisfy UNIQUE (two empty rows would collide) — Postgres never treats two
-- NULLs as equal, so converting the sentinel to NULL here is what makes UNIQUE actually usable
-- for an optional field. Real data checked beforehand: 8 candidates with no email, 11 with no
-- phone, all legacy/placeholder rows — none of this is a real duplicate getting silently merged.
UPDATE "candidates" SET "email" = NULL WHERE "email" = '';--> statement-breakpoint
UPDATE "candidates" SET "phone" = NULL WHERE "phone" = '';--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_phone_unique" UNIQUE("phone");--> statement-breakpoint
ALTER TABLE "employers" ADD CONSTRAINT "employers_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "employers" ADD CONSTRAINT "employers_phone_unique" UNIQUE("phone");