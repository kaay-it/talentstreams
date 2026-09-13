ALTER TABLE "contactRequests" ALTER COLUMN "employerToken" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "contactRequests" ALTER COLUMN "employerToken" DROP NOT NULL;--> statement-breakpoint
UPDATE "contactRequests" SET "employerToken" = NULL WHERE "employerToken" = '';--> statement-breakpoint
ALTER TABLE "contactRequests" ADD CONSTRAINT "contactRequests_employerToken_employers_token_fk" FOREIGN KEY ("employerToken") REFERENCES "public"."employers"("token") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contactRequests" DROP COLUMN "stream";--> statement-breakpoint
ALTER TABLE "contactRequests" DROP COLUMN "employerName";--> statement-breakpoint
ALTER TABLE "contactRequests" DROP COLUMN "company";--> statement-breakpoint
ALTER TABLE "contactRequests" DROP COLUMN "employerEmail";