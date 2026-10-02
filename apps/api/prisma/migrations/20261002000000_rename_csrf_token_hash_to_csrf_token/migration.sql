-- AlterTable: rename csrf_token_hash to csrf_token per ADR-026 (Option B)
ALTER TABLE "sessions" RENAME COLUMN "csrf_token_hash" TO "csrf_token";
