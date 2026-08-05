CREATE TABLE "contactRequests" (
	"id" text PRIMARY KEY NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"listId" text DEFAULT '' NOT NULL,
	"stream" text DEFAULT '' NOT NULL,
	"candidateId" text DEFAULT '' NOT NULL,
	"employerToken" text DEFAULT '' NOT NULL,
	"employerName" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"employerEmail" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Новый запрос' NOT NULL
);
