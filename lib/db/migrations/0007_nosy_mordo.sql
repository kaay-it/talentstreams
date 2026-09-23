CREATE TABLE "mailingListEntries" (
	"id" text PRIMARY KEY NOT NULL,
	"listId" text NOT NULL,
	"stream" text DEFAULT '' NOT NULL,
	"targetDate" date NOT NULL,
	"candidateId" text DEFAULT '' NOT NULL
);
