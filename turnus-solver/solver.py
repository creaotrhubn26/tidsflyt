"""
turnus-solver/solver.py

CP-SAT rota generator for Tidum Turnus. Pure function: solve(request) -> response,
both plain dicts matching shared/turnus-solver-contract.ts (CONTRACT_VERSION 1).

Hard constraints:
  - Coverage: each DekningsKrav filled by exactly antallKrevd eligible employees.
  - Competence: an employee may fill a krav only if they hold kompetanseKravId.
  - One shift per employee per day.
  - Daily rest: two shifts giving <11h rest for the same employee are mutually
    exclusive (AML §10-8).
  - Weekly worked <= 48h per employee per ISO week (AML §10-6).
  - Locked shifts (laasteVakter) are forced on.

Soft objective (maximized), each scaled by its priority weight:
  - Wishes: +reward for a satisfied onske_vakt, -penalty for a violated onske_fri.
  - Fairness: minimize the spread between the busiest and least-busy employee.

The response carries XAI material: which coverage constraints bound the result,
which wishes went unmet, and a per-dimension objective breakdown.
"""

from __future__ import annotations

import datetime as _dt
import time
from typing import Any

from ortools.sat.python import cp_model

CONTRACT_VERSION = 1
SOLVER_VERSION = "cp-sat/9.15"


def _parse_hm(hm: str) -> int:
    """Minutes since midnight for 'HH:MM'."""
    h, m = hm[:5].split(":")
    return int(h) * 60 + int(m)


def _shift_minutes(start: str, end: str) -> int:
    """Worked minutes, overnight-safe (end<=start means next day)."""
    s = _parse_hm(start)
    e = _parse_hm(end)
    if e <= s:
        e += 24 * 60
    return e - s


def _abs_start(dato: str, start: str) -> _dt.datetime:
    d = _dt.date.fromisoformat(dato)
    mins = _parse_hm(start)
    return _dt.datetime(d.year, d.month, d.day) + _dt.timedelta(minutes=mins)


def _abs_end(dato: str, start: str, end: str) -> _dt.datetime:
    return _abs_start(dato, start) + _dt.timedelta(minutes=_shift_minutes(start, end))


def _iso_week(dato: str) -> str:
    d = _dt.date.fromisoformat(dato)
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


#: regeltype -> (parameter key, default value). Anything not listed is
#: ignored by the model but still reported back as stottet=False.
_REGEL_DEFAULTS = {
    "aml_daglig_hvile_11t": ("timer", 11.0),
    "aml_max_uketimer": ("timer", 48.0),
    "max_netter_paa_rad": ("antall", None),
    "max_vakter_paa_rad": ("antall", None),
}


def _regel_verdi(regler, regeltype, ansatt_id, default):
    """Resolve a rule's numeric value for one employee.

    An employee-scoped rule wins over an org-wide one, so a dispensasjon for a
    single person does not leak to the rest of the org. Among rules of equal
    scope the last one registered wins.
    """
    key = _REGEL_DEFAULTS.get(regeltype, (None, None))[0]
    if key is None:
        return default
    value = default
    for r in regler:
        if r.get("regeltype") != regeltype:
            continue
        scope = r.get("ansattId")
        if scope is not None and scope != ansatt_id:
            continue
        raw = (r.get("parametre") or {}).get(key)
        if raw is None:
            continue
        try:
            val = float(raw)
        except (TypeError, ValueError):
            continue
        if scope == ansatt_id:
            return val  # most specific match — stop here
        value = val
    return value


def _anvendte_regler(regler, emp_ids) -> list[dict[str, Any]]:
    """Report what each registered rule resolved to, for the XAI panel (K-14).

    stottet=False means the solver has no implementation for that regeltype, so
    the UI can say plainly that the rule had no effect on the result rather than
    implying it was honoured.
    """
    ut = []
    for r in regler:
        rt = r.get("regeltype")
        scope = r.get("ansattId")
        gjelder = [a for a in emp_ids if scope is None or scope == a]
        stottet = rt in _REGEL_DEFAULTS
        verdi = None
        if stottet and gjelder:
            verdi = _regel_verdi(regler, rt, gjelder[0], None)
        ut.append({
            "regeltype": rt,
            "haard": bool(r.get("haard")),
            "gjelderAnsatte": gjelder,
            "stottet": stottet,
            "verdi": verdi,
        })
    return ut


def _er_natt(start: str, slutt: str) -> bool:
    """A shift counts as a night when it starts at/after 20:00 or crosses midnight."""
    return _parse_hm(start) >= 20 * 60 or _parse_hm(slutt) <= _parse_hm(start)


def solve(request: dict[str, Any]) -> dict[str, Any]:
    t0 = time.time()

    if request.get("contractVersion") != CONTRACT_VERSION:
        return _error(f"contractVersion mismatch: expected {CONTRACT_VERSION}, got {request.get('contractVersion')}", t0)

    vaktkoder = {vk["vaktkodeId"]: vk for vk in request.get("vaktkoder", [])}
    ansatte = request.get("ansatte", [])
    krav = request.get("dekningskrav", [])
    onsker = request.get("onsker", [])
    vekter = request.get("vekter", {})
    laaste = request.get("laasteVakter", [])
    regler = request.get("regler") or []
    max_sec = float(request.get("maxSekunder") or 10)

    komp = {a["ansattId"]: set(a.get("kompetanser", [])) for a in ansatte}
    emp_ids = [a["ansattId"] for a in ansatte]

    model = cp_model.CpModel()

    # Decision var per (employee, krav-index) when the employee is eligible.
    x: dict[tuple[int, int], Any] = {}
    for ki, k in enumerate(krav):
        need_komp = k.get("kompetanseKravId")
        for a in emp_ids:
            if need_komp is not None and need_komp not in komp.get(a, set()):
                continue
            x[(a, ki)] = model.NewBoolVar(f"x_{a}_{ki}")

    # Hard: coverage equality per krav.
    coverage_krav: list[dict[str, Any]] = []
    for ki, k in enumerate(krav):
        vars_for_k = [x[(a, ki)] for a in emp_ids if (a, ki) in x]
        model.Add(sum(vars_for_k) == int(k["antallKrevd"]))
        coverage_krav.append(k)

    # Hard: one shift per employee per day.
    by_emp_day: dict[tuple[int, str], list[Any]] = {}
    for (a, ki), var in x.items():
        d = krav[ki]["dato"]
        by_emp_day.setdefault((a, d), []).append(var)
    for (a, d), vs in by_emp_day.items():
        if len(vs) > 1:
            model.Add(sum(vs) <= 1)

    # Precompute each krav's absolute start/end from its vaktkode.
    span: list[tuple[_dt.datetime, _dt.datetime, int]] = []  # (start, end, worked_min)
    for k in krav:
        vk = vaktkoder.get(k["vaktkodeId"], {})
        st = vk.get("startTid", "08:00")
        en = vk.get("sluttTid", "16:00")
        span.append((_abs_start(k["dato"], st), _abs_end(k["dato"], st, en), _shift_minutes(st, en)))

    # Hard: too-short rest between two shifts for the same employee are exclusive.
    # The minimum defaults to AML §10-8's 11h but a registered rule (typically a
    # dispensasjon, which AML permits down to 8h by agreement) can lower it for
    # the whole org or one employee.
    for a in emp_ids:
        hvile_min = _regel_verdi(regler, "aml_daglig_hvile_11t", a, 11.0) * 60
        mine = [ki for ki in range(len(krav)) if (a, ki) in x]
        for idx_i in range(len(mine)):
            for idx_j in range(idx_i + 1, len(mine)):
                ki, kj = mine[idx_i], mine[idx_j]
                si, ei, _ = span[ki]
                sj, ej, _ = span[kj]
                # rest = later.start - earlier.end
                if sj >= si:
                    rest_min = (sj - ei).total_seconds() / 60
                else:
                    rest_min = (si - ej).total_seconds() / 60
                if 0 <= rest_min < hvile_min:
                    model.Add(x[(a, ki)] + x[(a, kj)] <= 1)

    # Hard: weekly worked hours per employee per ISO week (AML §10-6 default 48h,
    # overridable by a registered local agreement / særavtale).
    for a in emp_ids:
        uketimer = _regel_verdi(regler, "aml_max_uketimer", a, 48.0)
        weeks: dict[str, list[tuple[Any, int]]] = {}
        for ki in range(len(krav)):
            if (a, ki) in x:
                weeks.setdefault(_iso_week(krav[ki]["dato"]), []).append((x[(a, ki)], span[ki][2]))
        for _wk, items in weeks.items():
            model.Add(sum(var * mins for var, mins in items) <= int(uketimer * 60))

    # Registered consecutive-run limits: at most N nights (or shifts) in any
    # window of N+1 consecutive days. Hard rules constrain the model; soft ones
    # are left to the objective (they carry vekt, not a bound).
    dager_sortert = sorted({k["dato"] for k in krav})
    natt_ki = {
        ki for ki, k in enumerate(krav)
        if _er_natt(vaktkoder.get(k["vaktkodeId"], {}).get("startTid", "08:00"),
                    vaktkoder.get(k["vaktkodeId"], {}).get("sluttTid", "16:00"))
    }
    for regeltype, bare_natt in (("max_netter_paa_rad", True), ("max_vakter_paa_rad", False)):
        harde = [r for r in regler if r.get("regeltype") == regeltype and r.get("haard")]
        if not harde:
            continue
        for a in emp_ids:
            grense = _regel_verdi(regler, regeltype, a, None)
            if grense is None or grense < 0:
                continue
            n = int(grense)
            # Only employees the rule actually scopes to.
            if not any(r.get("ansattId") in (None, a) for r in harde):
                continue
            for start_i in range(0, max(0, len(dager_sortert) - n)):
                vindu = dager_sortert[start_i:start_i + n + 1]
                vars_i_vindu = [
                    x[(a, ki)] for ki, k in enumerate(krav)
                    if (a, ki) in x and k["dato"] in vindu and (not bare_natt or ki in natt_ki)
                ]
                if len(vars_i_vindu) > n:
                    model.Add(sum(vars_i_vindu) <= n)

    # Hard: locked shifts forced on (match by ansatt+dato+vaktkode).
    locked_keys = {(l["ansattId"], l["dato"], l.get("vaktkodeId")) for l in laaste}
    for ki, k in enumerate(krav):
        for a in emp_ids:
            if (a, ki) in x and (a, k["dato"], k["vaktkodeId"]) in locked_keys:
                model.Add(x[(a, ki)] == 1)

    # Soft objective.
    obj_terms = []
    w_onske = int(vekter.get("vektOnsker", 5))
    w_fair = int(vekter.get("vektRettferdighet", 5))

    # Wishes: reward onske_vakt hit, penalize onske_fri hit.
    wish_reward_vars: list[tuple[Any, dict[str, Any]]] = []
    for o in onsker:
        a = o["ansattId"]
        for ki, k in enumerate(krav):
            if (a, ki) not in x:
                continue
            if k["dato"] != o["dato"]:
                continue
            if o.get("vaktkodeId") not in (None, k["vaktkodeId"]):
                continue
            if o["type"] == "onske_vakt":
                obj_terms.append(w_onske * 10 * x[(a, ki)])
                wish_reward_vars.append((x[(a, ki)], o))
            elif o["type"] == "onske_fri":
                obj_terms.append(-w_onske * 10 * x[(a, ki)])
                wish_reward_vars.append((x[(a, ki)], o))

    # Fairness: minimize (max shifts - min shifts) across employees.
    if emp_ids:
        counts = []
        for a in emp_ids:
            c = model.NewIntVar(0, len(krav), f"cnt_{a}")
            model.Add(c == sum(x[(a, ki)] for ki in range(len(krav)) if (a, ki) in x))
            counts.append(c)
        cmax = model.NewIntVar(0, len(krav), "cmax")
        cmin = model.NewIntVar(0, len(krav), "cmin")
        model.AddMaxEquality(cmax, counts)
        model.AddMinEquality(cmin, counts)
        spread = model.NewIntVar(0, len(krav), "spread")
        model.Add(spread == cmax - cmin)
        obj_terms.append(-w_fair * spread)

    w_helg = int(vekter.get("vektHelgefrekvens", 5))
    w_kont = int(vekter.get("vektKontinuitet", 5))
    w_kost = int(vekter.get("vektKostnad", 5))

    def _is_weekend(dato: str) -> bool:
        return _dt.date.fromisoformat(dato).isoweekday() >= 6  # Sat=6, Sun=7

    # Helgefrekvens: fair spread of weekend (Sat/Sun) shifts across employees.
    if emp_ids:
        wknd = []
        for a in emp_ids:
            wc = model.NewIntVar(0, len(krav), f"wknd_{a}")
            model.Add(wc == sum(
                x[(a, ki)] for ki in range(len(krav))
                if (a, ki) in x and _is_weekend(krav[ki]["dato"])))
            wknd.append(wc)
        wmax = model.NewIntVar(0, len(krav), "wmax")
        wmin = model.NewIntVar(0, len(krav), "wmin")
        model.AddMaxEquality(wmax, wknd)
        model.AddMinEquality(wmin, wknd)
        wspread = model.NewIntVar(0, len(krav), "wspread")
        model.Add(wspread == wmax - wmin)
        obj_terms.append(-w_helg * wspread)

    # Kontinuitet: reward the same employee working consecutive calendar days
    # (continuity for users/patients). y[a,date] is 1 iff employee a works that
    # day; a bonus fires when both a day and its successor are worked.
    dates_sorted = sorted({k["dato"] for k in krav})
    next_day = {}
    for i in range(len(dates_sorted) - 1):
        d0 = _dt.date.fromisoformat(dates_sorted[i])
        d1 = _dt.date.fromisoformat(dates_sorted[i + 1])
        if (d1 - d0).days == 1:
            next_day[dates_sorted[i]] = dates_sorted[i + 1]
    y: dict[tuple[int, str], Any] = {}
    for a in emp_ids:
        for d in dates_sorted:
            same_day = [x[(a, ki)] for ki in range(len(krav)) if (a, ki) in x and krav[ki]["dato"] == d]
            if same_day:
                yv = model.NewBoolVar(f"y_{a}_{d}")
                model.Add(yv == sum(same_day))  # sum is 0/1 (one-per-day enforced)
                y[(a, d)] = yv
    for a in emp_ids:
        for d, dn in next_day.items():
            if (a, d) in y and (a, dn) in y:
                b = model.NewBoolVar(f"cont_{a}_{d}")
                model.Add(b <= y[(a, d)])
                model.Add(b <= y[(a, dn)])
                model.Add(b >= y[(a, d)] + y[(a, dn)] - 1)
                obj_terms.append(w_kont * b)

    # Kostnad: penalize weekly overtime beyond each employee's contracted norm
    # (stillingsprosent × 37.5 t/uke). Coverage is fixed, so this steers *who*
    # absorbs extra hours toward those with headroom, not the total.
    prosent = {a["ansattId"]: float(a.get("stillingsprosent") or 100) for a in ansatte}
    for a in emp_ids:
        weeks: dict[str, list[tuple[Any, int]]] = {}
        for ki in range(len(krav)):
            if (a, ki) in x:
                weeks.setdefault(_iso_week(krav[ki]["dato"]), []).append((x[(a, ki)], span[ki][2]))
        norm_min = int(prosent.get(a, 100) / 100 * 37.5 * 60)
        for wk, items in weeks.items():
            worked = model.NewIntVar(0, 7 * 24 * 60, f"wk_{a}_{wk}")
            model.Add(worked == sum(var * mins for var, mins in items))
            over = model.NewIntVar(0, 7 * 24 * 60, f"ot_{a}_{wk}")
            model.Add(over >= worked - norm_min)  # floored at 0 by domain
            over_h = model.NewIntVar(0, 168, f"oth_{a}_{wk}")
            model.AddDivisionEquality(over_h, over, 60)  # overtime in whole hours
            obj_terms.append(-w_kost * over_h)

    if obj_terms:
        model.Maximize(sum(obj_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max_sec
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)

    solve_ms = int((time.time() - t0) * 1000)

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        vakter = []
        for (a, ki), var in x.items():
            if solver.Value(var) == 1:
                k = krav[ki]
                vk = vaktkoder.get(k["vaktkodeId"], {})
                vakter.append({
                    "ansattId": a,
                    "dato": k["dato"],
                    "startTid": vk.get("startTid", "08:00"),
                    "sluttTid": vk.get("sluttTid", "16:00"),
                    "vaktkodeId": k["vaktkodeId"],
                })
        # Unmet wishes: onske_vakt that ended up 0 / onske_fri that ended up 1.
        uoppfylte = []
        for var, o in wish_reward_vars:
            val = solver.Value(var)
            if (o["type"] == "onske_vakt" and val == 0) or (o["type"] == "onske_fri" and val == 1):
                uoppfylte.append({
                    "type": "onske",
                    "referanse": f"onske:ansatt={o['ansattId']}:{o['dato']}",
                    "avvik": 1,
                    "forklaring": f"Ønske ({o['type']}, prioritet {o.get('prioritet')}) for {o['dato']} kunne ikke oppfylles.",
                })
        # Every coverage krav is an equality, so each is binding.
        bindende = [{
            "type": "dekning",
            "referanse": f"dekning:avd={k['avdelingId']}:{k['dato']}:vaktkode={k['vaktkodeId']}",
            "forklaring": f"Krav om {k['antallKrevd']} på vaktkode {k['vaktkodeId']} {k['dato']} bandt løsningen.",
        } for k in coverage_krav]
        return {
            "contractVersion": CONTRACT_VERSION,
            "status": "optimal" if status == cp_model.OPTIMAL else "feasible",
            "vakter": vakter,
            "bindende": bindende,
            "uoppfylte": uoppfylte,
            "anvendteRegler": _anvendte_regler(regler, emp_ids),
            "objektiv": {
                "onske": float(w_onske),
                "rettferdighet": float(w_fair),
                "helgefrekvens": float(w_helg),
                "kontinuitet": float(w_kont),
                "kostnad": float(w_kost),
            },
            "solveTidMs": solve_ms,
            "solverVersjon": SOLVER_VERSION,
        }

    if status == cp_model.INFEASIBLE:
        # Best-effort conflict set: the coverage krav whose eligible pool is too
        # small to ever meet antallKrevd (a common, explainable infeasibility).
        konflikt = []
        for ki, k in enumerate(krav):
            pool = sum(1 for a in emp_ids if (a, ki) in x)
            if pool < int(k["antallKrevd"]):
                konflikt.append({
                    "type": "dekning",
                    "referanse": f"dekning:avd={k['avdelingId']}:{k['dato']}:vaktkode={k['vaktkodeId']}",
                    "forklaring": f"Bare {pool} kvalifiserte ansatte for et krav om {k['antallKrevd']}.",
                })
        return {
            "contractVersion": CONTRACT_VERSION,
            "status": "infeasible",
            "vakter": [],
            "bindende": [],
            "uoppfylte": [],
            "objektiv": {},
            "konfliktsett": konflikt,
            "solveTidMs": solve_ms,
            "solverVersjon": SOLVER_VERSION,
        }

    return _error(f"solver status {solver.StatusName(status)}", t0)


def _error(msg: str, t0: float) -> dict[str, Any]:
    return {
        "contractVersion": CONTRACT_VERSION,
        "status": "error",
        "vakter": [],
        "bindende": [],
        "uoppfylte": [],
        "objektiv": {},
        "solveTidMs": int((time.time() - t0) * 1000),
        "solverVersjon": SOLVER_VERSION,
        "feilmelding": msg,
    }
