"""Smoke test for the HTTP sidecar wrapper (server.py): /health + a POST round-trip."""
import json
import threading
import urllib.request
from http.server import ThreadingHTTPServer

from server import Handler
from solver import CONTRACT_VERSION


def _serve():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd, port


def test_health():
    httpd, port = _serve()
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=5) as r:
            body = json.loads(r.read())
        assert body["status"] == "ok"
        assert body["contractVersion"] == CONTRACT_VERSION
    finally:
        httpd.shutdown()


def test_post_solves_a_request():
    httpd, port = _serve()
    req = {
        "contractVersion": CONTRACT_VERSION, "planId": 1, "orgId": 1, "rotasjonUker": 1,
        "startDato": "2026-01-05",
        "ansatte": [{"ansattId": 1, "stillingsprosent": 100, "kompetanser": []},
                    {"ansattId": 2, "stillingsprosent": 100, "kompetanser": []}],
        "vaktkoder": [{"vaktkodeId": 1, "startTid": "08:00", "sluttTid": "16:00", "tellerSomArbeid": True}],
        "dekningskrav": [{"avdelingId": 1, "dato": "2026-01-05", "vaktkodeId": 1, "antallKrevd": 2}],
        "onsker": [], "vekter": {"vektOnsker": 5, "vektHelgefrekvens": 5, "vektRettferdighet": 5,
                                 "vektKontinuitet": 5, "vektKostnad": 5},
        "laasteVakter": [], "maxSekunder": 5,
    }
    try:
        r = urllib.request.urlopen(
            urllib.request.Request(
                f"http://127.0.0.1:{port}/",
                data=json.dumps(req).encode(),
                headers={"Content-Type": "application/json"}),
            timeout=15)
        body = json.loads(r.read())
        assert body["status"] in ("optimal", "feasible")
        assert len(body["vakter"]) == 2
    finally:
        httpd.shutdown()


def test_bad_json_is_error_envelope():
    httpd, port = _serve()
    try:
        r = urllib.request.urlopen(
            urllib.request.Request(f"http://127.0.0.1:{port}/", data=b"{not json",
                                   headers={"Content-Type": "application/json"}),
            timeout=5)
        body = json.loads(r.read())
        assert body["status"] == "error"
    except urllib.error.HTTPError as e:
        body = json.loads(e.read())
        assert body["status"] == "error"
    finally:
        httpd.shutdown()
