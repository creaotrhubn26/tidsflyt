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

ALTER TABLE tidum_turnus_genereringer
  ADD COLUMN IF NOT EXISTS antall_forbedringer INTEGER;

COMMENT ON COLUMN tidum_turnus_genereringer.antall_forbedringer IS
  'How many strictly better rosters replaced the first one during the search. Measured on the demo fixture the objective climbs 380 -> 1440 between a 1s and a 30s budget across ~131 improvements, while shift count and unmet-goal count stay identical — so this is the only field that shows the extra time did work.';

COMMENT ON COLUMN tidum_turnus_genereringer.forste_losning_ms IS
  'Milliseconds until the solver''s first feasible roster. NULL when infeasible or when no solution was found within the budget. Everything between this and solve_tid_ms is optimisation, and it is not idle: see antall_forbedringer.';
