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
## Deploy as a Render service (sidecar-drift)

`server.py` is a stdlib HTTP wrapper (no framework, only ortools) exposing:

- `POST /` — SolverRequest JSON → SolverResponse JSON
- `GET /health` — liveness

Local:
```
pip install -r requirements.txt
PORT=8000 python3 server.py
curl -s localhost:8000/health
```

Render — a separate Python web service (see `../render.yaml` `turnus-solver`):
build `pip install -r turnus-solver/requirements.txt`, start
`cd turnus-solver && python3 server.py` (Render sets `$PORT`).

Wiring: set `TURNUS_SOLVER_URL=https://<sidecar>.onrender.com/` on the Node
backend. `server/lib/turnus-solver-client.ts` then calls the sidecar over HTTP
(with the request timeout); when the var is unset it spawns `cli.py` locally, so
dev needs no separate service.
