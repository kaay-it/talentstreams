ALTER TABLE "contactRequests" ADD COLUMN "streamId" integer;--> statement-breakpoint
ALTER TABLE "contactRequests" ADD CONSTRAINT "contactRequests_streamId_streams_id_fk" FOREIGN KEY ("streamId") REFERENCES "public"."streams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "contactRequests" cr SET "streamId" = s.id FROM "streams" s WHERE s.name = cr."stream";