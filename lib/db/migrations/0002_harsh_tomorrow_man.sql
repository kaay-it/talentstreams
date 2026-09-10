CREATE TABLE "candidateResumes" (
	"id" text PRIMARY KEY NOT NULL,
	"candidateId" text NOT NULL,
	"kind" text NOT NULL,
	"filename" text DEFAULT '' NOT NULL,
	"url" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
