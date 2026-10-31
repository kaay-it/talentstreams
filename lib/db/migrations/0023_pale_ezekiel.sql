ALTER TABLE "selections" ADD COLUMN "targetDate" timestamp;
--> statement-breakpoint
UPDATE "selections" SET "targetDate" = "mailingLists"."targetDate" FROM "mailingLists" WHERE "mailingLists"."id" = "selections"."listId";
--> statement-breakpoint
UPDATE "selections" SET "targetDate" = now() WHERE "targetDate" IS NULL;
--> statement-breakpoint
ALTER TABLE "selections" ALTER COLUMN "targetDate" SET NOT NULL;
