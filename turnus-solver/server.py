"""
turnus-solver/server.py

Stdlib HTTP wrapper around solve() so the CP-SAT sidecar can run as its own
service (e.g. a Render Python web service) instead of being spawned per request.
No third-party web framework — just http.server — so deploy needs only ortools.

    POST /            body = SolverRequest JSON      → SolverResponse JSON
    GET  /health      → {"status":"ok","solver":...}

The Node backend calls this when TURNUS_SOLVER_URL is set (see
server/lib/turnus-solver-client.ts); otherwise it spawns cli.py locally.

Run: PORT=8000 python3 turnus-solver/server.py
"""

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from solver import solve, CONTRACT_VERSION, SOLVER_VERSION

MAX_BODY = 8 * 1024 * 1024  # 8 MB cap — reject oversized payloads


class Handler(BaseHTTPRequestHandler):
    def _json(self, code: int, obj: dict) -> None:
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/") == "/health" or self.path == "/":
            self._json(200, {"status": "ok", "solver": SOLVER_VERSION, "contractVersion": CONTRACT_VERSION})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            self._json(413, self._err(f"invalid Content-Length {length}"))
            return
        raw = self.rfile.read(length)
        try:
            request = json.loads(raw)
        except Exception as e:  # noqa: BLE001
            self._json(400, self._err(f"invalid request JSON: {e}"))
            return
        try:
            resp = solve(request)
        except Exception as e:  # noqa: BLE001
            self._json(200, self._err(f"solve failed: {e}"))
            return
        self._json(200, resp)

    @staticmethod
    def _err(msg: str) -> dict:
        return {
            "contractVersion": CONTRACT_VERSION, "status": "error",
            "vakter": [], "bindende": [], "uoppfylte": [], "objektiv": {},
            "solveTidMs": 0, "solverVersjon": SOLVER_VERSION, "feilmelding": msg,
        }

    def log_message(self, *args) -> None:  # keep the default access log quiet
        pass


def main() -> None:
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"turnus-solver HTTP on :{port} (contract v{CONTRACT_VERSION}, {SOLVER_VERSION})")
    server.serve_forever()


if __name__ == "__main__":
    main()
