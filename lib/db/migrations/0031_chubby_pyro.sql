CREATE TABLE "billingPlans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billingPlans_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "employerSubscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"employerToken" text NOT NULL,
	"planId" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"currentPeriodStart" timestamp NOT NULL,
	"currentPeriodEnd" timestamp NOT NULL,
	"provider" text NOT NULL,
	"providerCustomerId" text,
	"providerSubscriptionId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"canceledAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"employerSubscriptionId" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text NOT NULL,
	"providerPaymentId" text,
	"failureReason" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planPrices" (
	"id" serial PRIMARY KEY NOT NULL,
	"planId" integer NOT NULL,
	"currency" text NOT NULL,
	"amount" integer NOT NULL,
	CONSTRAINT "planPrices_planId_currency_unique" UNIQUE("planId","currency")
);
--> statement-breakpoint
ALTER TABLE "employerSubscriptions" ADD CONSTRAINT "employerSubscriptions_employerToken_employers_token_fk" FOREIGN KEY ("employerToken") REFERENCES "public"."employers"("token") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employerSubscriptions" ADD CONSTRAINT "employerSubscriptions_planId_billingPlans_id_fk" FOREIGN KEY ("planId") REFERENCES "public"."billingPlans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_employerSubscriptionId_employerSubscriptions_id_fk" FOREIGN KEY ("employerSubscriptionId") REFERENCES "public"."employerSubscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planPrices" ADD CONSTRAINT "planPrices_planId_billingPlans_id_fk" FOREIGN KEY ("planId") REFERENCES "public"."billingPlans"("id") ON DELETE cascade ON UPDATE no action;