ALTER TABLE "selections" DROP CONSTRAINT "selections_listId_mailingLists_id_fk";
--> statement-breakpoint
ALTER TABLE "selections" ALTER COLUMN "listId" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "selections" ADD COLUMN "streamId" integer;
--> statement-breakpoint
UPDATE "selections" SET "streamId" = "mailingLists"."streamId" FROM "mailingLists" WHERE "mailingLists"."id" = "selections"."listId";
--> statement-breakpoint
ALTER TABLE "selections" ALTER COLUMN "streamId" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "selections" ADD CONSTRAINT "selections_streamId_streams_id_fk" FOREIGN KEY ("streamId") REFERENCES "public"."streams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "selections" ADD CONSTRAINT "selections_listId_mailingLists_id_fk" FOREIGN KEY ("listId") REFERENCES "public"."mailingLists"("id") ON DELETE set null ON UPDATE no action;
