ALTER TABLE "mailingListEntries" ADD COLUMN "streamId" integer;--> statement-breakpoint
ALTER TABLE "streams" ADD COLUMN "status" text DEFAULT 'Активный' NOT NULL;--> statement-breakpoint
ALTER TABLE "mailingListEntries" ADD CONSTRAINT "mailingListEntries_streamId_streams_id_fk" FOREIGN KEY ("streamId") REFERENCES "public"."streams"("id") ON DELETE set null ON UPDATE no action;