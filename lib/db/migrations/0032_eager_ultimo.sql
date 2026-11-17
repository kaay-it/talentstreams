CREATE TABLE "mcpOauthClients" (
	"clientId" text PRIMARY KEY NOT NULL,
	"clientName" text,
	"redirectUris" text[] NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcpOauthCodes" (
	"code" text PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"redirectUri" text NOT NULL,
	"codeChallenge" text NOT NULL,
	"codeChallengeMethod" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcpOauthTokens" (
	"accessToken" text PRIMARY KEY NOT NULL,
	"refreshToken" text NOT NULL,
	"clientId" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mcpOauthTokens_refreshToken_unique" UNIQUE("refreshToken")
);
--> statement-breakpoint
ALTER TABLE "mcpOauthCodes" ADD CONSTRAINT "mcpOauthCodes_clientId_mcpOauthClients_clientId_fk" FOREIGN KEY ("clientId") REFERENCES "public"."mcpOauthClients"("clientId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcpOauthTokens" ADD CONSTRAINT "mcpOauthTokens_clientId_mcpOauthClients_clientId_fk" FOREIGN KEY ("clientId") REFERENCES "public"."mcpOauthClients"("clientId") ON DELETE cascade ON UPDATE no action;