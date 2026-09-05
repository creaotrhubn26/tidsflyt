# Tidum Turnus solver (CP-SAT sidecar)

Python OR-Tools CP-SAT rota generator for the Tidum Turnus vertical (phase A1b).

- `solver.py` — pure `solve(request) -> response`; dicts match `shared/turnus-solver-contract.ts` (CONTRACT_VERSION 1).
- `cli.py` — stdin→stdout wrapper the Node backend invokes as a child process.
- `test_solver.py` — golden tests (`python3 -m pytest turnus-solver/`).

## Constraints
Hard: coverage equality, competence, one-shift-per-employee-per-day, daily rest
(AML §10-8, default 11h), weekly cap (§10-6, default 48h), locked shifts. Soft
(weighted): wishes, fairness (min busiest-vs-least spread).

### Registered rules (`regler`)
Rules from `tidum_turnus_regler` are passed in and can override the defaults or
add limits. `ansattId` scopes a rule to one employee (individual exemption) and
wins over an org-wide rule of the same type, so a dispensasjon does not leak to
everyone. Only hard rules constrain the model; soft ones carry `vekt` instead.

| regeltype | parametre | effect |
|---|---|---|
| `aml_daglig_hvile_11t` | `{timer}` | minimum rest between two shifts |
| `aml_max_uketimer` | `{timer}` | worked-hours cap per ISO week |
| `max_netter_paa_rad` | `{antall}` | consecutive night shifts (start ≥20:00 or crossing midnight) |
| `max_vakter_paa_rad` | `{antall}` | consecutive shifts |

Unknown regeltypes are ignored by the model but returned in `anvendteRegler`
with `stottet: false`, so the caller can surface that the rule had no effect
rather than implying it was honoured. The backend records those as a
`regel_ikke_stottet` deviation.

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
