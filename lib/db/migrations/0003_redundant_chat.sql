CREATE TABLE "employers" (
	"token" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"primaryContact" text DEFAULT '' NOT NULL,
	"telegram" text DEFAULT '' NOT NULL,
	"linkedin" text DEFAULT '' NOT NULL,
	"streams" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'На проверке' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"additionalCountries" text[] DEFAULT '{}' NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
