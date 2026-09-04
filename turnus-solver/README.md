# Tidum Turnus solver (CP-SAT sidecar)

Python OR-Tools CP-SAT rota generator for the Tidum Turnus vertical (phase A1b).

- `solver.py` — pure `solve(request) -> response`; dicts match `shared/turnus-solver-contract.ts` (CONTRACT_VERSION 1).
- `cli.py` — stdin→stdout wrapper the Node backend invokes as a child process.
- `test_solver.py` — golden tests (`python3 -m pytest turnus-solver/`).

## Constraints
Hard: coverage equality, competence, one-shift-per-employee-per-day, 11h daily
rest (AML §10-8), 48h weekly cap (§10-6), locked shifts. Soft (weighted):
wishes, fairness (min busiest-vs-least spread).

## Run
```
pip install -r requirements.txt
echo '<SolverRequest JSON>' | python3 cli.py     # from this dir
python3 -m pytest                                # tests
```
Node integration (A1c) calls `cli.py`; a thin HTTP wrapper for Render deploy is a later step.
