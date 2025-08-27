-- DropIndex
DROP INDEX IF EXISTS "idx_rule_rule_id";

-- CreateIndex
CREATE INDEX "idx_rule_created_at_id" ON "Rule"("created_at" DESC, "id" DESC);
