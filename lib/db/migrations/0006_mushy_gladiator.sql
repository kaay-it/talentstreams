ALTER TABLE "contactRequests" DROP CONSTRAINT "contactRequests_employerToken_employers_token_fk";
--> statement-breakpoint
ALTER TABLE "contactRequests" ALTER COLUMN "employerToken" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "contactRequests" ADD CONSTRAINT "contactRequests_employerToken_employers_token_fk" FOREIGN KEY ("employerToken") REFERENCES "public"."employers"("token") ON DELETE cascade ON UPDATE no action;