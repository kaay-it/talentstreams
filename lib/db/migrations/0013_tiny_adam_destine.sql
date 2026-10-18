CREATE TABLE "candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"stream" text[] DEFAULT '{}' NOT NULL,
	"level" text DEFAULT '' NOT NULL,
	"countryPrimary" text DEFAULT '' NOT NULL,
	"countryDesired" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"excludedCompanies" text[] DEFAULT '{}' NOT NULL,
	"excludedIndustries" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'На проверке' NOT NULL,
	"activeSince" date,
	"registrationTimestamp" timestamp DEFAULT now() NOT NULL,
	"coverLetter" text DEFAULT '' NOT NULL,
	"resumeUrl" text DEFAULT '' NOT NULL
);
