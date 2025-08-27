-- CreateIndex
CREATE INDEX "idx_rule_created_at" ON "Rule"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_rule_rule_id" ON "Rule"("rule_id");

-- CreateIndex
CREATE INDEX "idx_rule_phase" ON "Rule"("phase");

-- CreateIndex
CREATE INDEX "idx_rule_severity" ON "Rule"("severity_level");

-- CreateIndex
CREATE INDEX "idx_rule_action" ON "Rule"("action");

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 부분검색용 GIN(trigram) 인덱스(컬럼 존재할 때만 생성)
DO $$
BEGIN
  -- rule_name
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='Rule' AND column_name='rule_name'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_rule_rule_name_trgm
             ON "Rule" USING gin (lower("rule_name") gin_trgm_ops)';
  END IF;

  -- target
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='Rule' AND column_name='target'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_rule_target_trgm
             ON "Rule" USING gin (lower("target") gin_trgm_ops)';
  END IF;

  -- operator
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='Rule' AND column_name='operator'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_rule_operator_trgm
             ON "Rule" USING gin (lower("operator") gin_trgm_ops)';
  END IF;
END $$;
