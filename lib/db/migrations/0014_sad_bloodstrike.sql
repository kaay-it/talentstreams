ALTER TABLE "contactRequests" ALTER COLUMN "candidateId" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "contactRequests" ALTER COLUMN "candidateId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mailingListEntries" ALTER COLUMN "candidateId" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "mailingListEntries" ALTER COLUMN "candidateId" DROP NOT NULL;--> statement-breakpoint
-- "" sentinel ("no candidate" — general inquiries / defensive default) can't satisfy a FK to
-- candidates.id (no candidate has id=""), and orphan pre-check (scripts/_backfill-candidates-to-neon.mjs)
-- found 0 non-empty orphans in either table — so this UPDATE only ever touches the "" sentinel rows.
UPDATE "contactRequests" SET "candidateId" = NULL WHERE "candidateId" = '';--> statement-breakpoint
UPDATE "mailingListEntries" SET "candidateId" = NULL WHERE "candidateId" = '';--> statement-breakpoint
ALTER TABLE "candidateResumes" ADD CONSTRAINT "candidateResumes_candidateId_candidates_id_fk" FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contactRequests" ADD CONSTRAINT "contactRequests_candidateId_candidates_id_fk" FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailingListEntries" ADD CONSTRAINT "mailingListEntries_candidateId_candidates_id_fk" FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;