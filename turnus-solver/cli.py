"""
turnus-solver/cli.py

Thin stdin->stdout wrapper so Node can invoke the solver as a child process:
    echo '<SolverRequest JSON>' | python3 turnus-solver/cli.py
Reads one JSON SolverRequest on stdin, writes one JSON SolverResponse on stdout.
Any exception is reported as a status:"error" response, never a nonzero crash,
so the Node side always gets a parseable envelope.
"""

import json
import sys
import time

from solver import solve, CONTRACT_VERSION, SOLVER_VERSION


def main() -> int:
    t0 = time.time()
    try:
        raw = sys.stdin.read()
        request = json.loads(raw)
    except Exception as e:  # noqa: BLE001 - report any parse failure as an envelope
        json.dump({
            "contractVersion": CONTRACT_VERSION,
            "status": "error",
            "vakter": [], "bindende": [], "uoppfylte": [], "objektiv": {},
            "solveTidMs": int((time.time() - t0) * 1000),
            "solverVersjon": SOLVER_VERSION,
            "feilmelding": f"invalid request JSON: {e}",
        }, sys.stdout)
        return 0
    try:
        resp = solve(request)
    except Exception as e:  # noqa: BLE001
        resp = {
            "contractVersion": CONTRACT_VERSION,
            "status": "error",
            "vakter": [], "bindende": [], "uoppfylte": [], "objektiv": {},
            "solveTidMs": int((time.time() - t0) * 1000),
            "solverVersjon": SOLVER_VERSION,
            "feilmelding": f"solve failed: {e}",
        }
    json.dump(resp, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
