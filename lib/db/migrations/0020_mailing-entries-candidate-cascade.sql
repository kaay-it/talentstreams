ALTER TABLE "mailingListEntries" DROP CONSTRAINT "mailingListEntries_candidateId_candidates_id_fk";
--> statement-breakpoint
ALTER TABLE "mailingListEntries" ALTER COLUMN "candidateId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mailingListEntries" ADD CONSTRAINT "mailingListEntries_candidateId_candidates_id_fk" FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;