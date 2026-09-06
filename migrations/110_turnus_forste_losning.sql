-- migrations/110_turnus_forste_losning.sql
--
-- Records how long the solver took to reach its FIRST valid roster, separately
-- from total search time.
--
-- Why this is its own column and not a key in objektiv_json: byggForklaring()
-- treats every finite top-level number in objektiv_json as a priority weight,
-- so a millisecond value stored there would render in the XAI panel as a
-- phantom priority dimension.
--
-- Why the number matters: CP-SAT runs until max_time_in_seconds whenever it
-- cannot prove optimality, so solve_tid_ms is the configured budget, not the
-- work. Measured on the demo fixture, first solution arrives in ~320 ms while
-- solve_tid_ms reports whatever budget was set (5 000, 10 000, 20 000, 60 000).
-- K-08 asks for measurable generation time; this is the column that answers it.
--
-- Idempotent.
ALTER TABLE tidum_turnus_genereringer
  ADD COLUMN IF NOT EXISTS forste_losning_ms INTEGER;

COMMENT ON COLUMN tidum_turnus_genereringer.forste_losning_ms IS
  'Milliseconds until the solver''s first feasible roster. NULL when infeasible or when no solution was found within the budget. Everything between this and solve_tid_ms is optimisation the planner could have interrupted.';
