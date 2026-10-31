CREATE TABLE "selectionEmployers" (
	"id" text PRIMARY KEY NOT NULL,
	"selectionId" text NOT NULL,
	"employerToken" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "selectionEntries" (
	"id" text PRIMARY KEY NOT NULL,
	"selectionId" text NOT NULL,
	"candidateId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "selections" (
	"id" text PRIMARY KEY NOT NULL,
	"listId" text NOT NULL,
	"label" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "selectionEmployers" ADD CONSTRAINT "selectionEmployers_selectionId_selections_id_fk" FOREIGN KEY ("selectionId") REFERENCES "public"."selections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selectionEmployers" ADD CONSTRAINT "selectionEmployers_employerToken_employers_token_fk" FOREIGN KEY ("employerToken") REFERENCES "public"."employers"("token") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selectionEntries" ADD CONSTRAINT "selectionEntries_selectionId_selections_id_fk" FOREIGN KEY ("selectionId") REFERENCES "public"."selections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selectionEntries" ADD CONSTRAINT "selectionEntries_candidateId_candidates_id_fk" FOREIGN KEY ("candidateId") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selections" ADD CONSTRAINT "selections_listId_mailingLists_id_fk" FOREIGN KEY ("listId") REFERENCES "public"."mailingLists"("id") ON DELETE cascade ON UPDATE no action;