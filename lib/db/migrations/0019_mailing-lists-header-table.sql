-- Custom SQL migration file, put your code below! --

CREATE TABLE IF NOT EXISTS "mailingLists" (
  "id" text PRIMARY KEY NOT NULL,
  "streamId" integer,
  "targetDate" timestamp NOT NULL,
  "recipientLabel" text DEFAULT '' NOT NULL,
  "sentCampaignId" integer
);
--> statement-breakpoint
INSERT INTO "mailingLists" ("id", "streamId", "targetDate")
SELECT DISTINCT ON ("listId") "listId", "streamId", "targetDate"::timestamp
FROM "mailingListEntries"
ORDER BY "listId";
--> statement-breakpoint
ALTER TABLE "mailingLists" ADD CONSTRAINT "mailingLists_streamId_streams_id_fk"
  FOREIGN KEY ("streamId") REFERENCES "streams"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "mailingListEntries" DROP COLUMN "streamId";
--> statement-breakpoint
ALTER TABLE "mailingListEntries" DROP COLUMN "targetDate";
--> statement-breakpoint
ALTER TABLE "mailingListEntries" ADD CONSTRAINT "mailingListEntries_listId_mailingLists_id_fk"
  FOREIGN KEY ("listId") REFERENCES "mailingLists"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mailingListRecipients" (
  "id" text PRIMARY KEY NOT NULL,
  "listId" text NOT NULL,
  "employerToken" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mailingListRecipients" ADD CONSTRAINT "mailingListRecipients_listId_mailingLists_id_fk"
  FOREIGN KEY ("listId") REFERENCES "mailingLists"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "mailingListRecipients" ADD CONSTRAINT "mailingListRecipients_employerToken_employers_token_fk"
  FOREIGN KEY ("employerToken") REFERENCES "employers"("token") ON DELETE CASCADE;
