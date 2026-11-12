CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "embedding" vector(768);--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "embeddingSourceText" text;