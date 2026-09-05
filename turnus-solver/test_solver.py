"""
Golden tests for the CP-SAT rota solver. Run: python3 -m pytest turnus-solver/
(or: cd turnus-solver && python3 -m pytest). No network/DB — pure solve().
"""

from solver import solve, CONTRACT_VERSION

VK = [
    {"vaktkodeId": 1, "startTid": "08:00", "sluttTid": "16:00", "varighetTimer": 7.5, "tellerSomArbeid": True},
    {"vaktkodeId": 2, "startTid": "22:00", "sluttTid": "06:00", "varighetTimer": 7.5, "tellerSomArbeid": True},
]


def base(**over):
    req = {
        "contractVersion": CONTRACT_VERSION,
        "planId": 1, "orgId": 1, "rotasjonUker": 1, "startDato": "2026-01-05",
        "ansatte": [
            {"ansattId": 1, "stillingsprosent": 100, "kompetanser": [10]},
            {"ansattId": 2, "stillingsprosent": 100, "kompetanser": [10]},
        ],
        "vaktkoder": VK,
        "dekningskrav": [],
        "onsker": [],
        "vekter": {"vektOnsker": 5, "vektHelgefrekvens": 5, "vektRettferdighet": 5,
                   "vektKontinuitet": 5, "vektKostnad": 5},
        "laasteVakter": [],
        "maxSekunder": 5,
    }
    req.update(over)
    return req


def test_contract_version_mismatch_is_error():
    r = solve(base(contractVersion=999))
    assert r["status"] == "error"


def test_simple_feasible_coverage():
    r = solve(base(dekningskrav=[
        {"avdelingId": 1, "dato": "2026-01-05", "vaktkodeId": 1, "antallKrevd": 2},
    ]))
    assert r["status"] in ("optimal", "feasible")
    assert len(r["vakter"]) == 2
    assert {v["ansattId"] for v in r["vakter"]} == {1, 2}
    assert len(r["bindende"]) == 1


def test_infeasible_when_pool_too_small():
    # need 2 with competence 99 but nobody has it
    r = solve(base(dekningskrav=[
        {"avdelingId": 1, "dato": "2026-01-05", "vaktkodeId": 1, "antallKrevd": 2,
         "kompetanseKravId": 99},
    ]))
    assert r["status"] == "infeasible"
    assert len(r["konfliktsett"]) >= 1


def test_wish_for_shift_is_honored_when_optional():
    # 1 slot, 2 candidates; employee 2 wishes it -> should get it
    r = solve(base(
        dekningskrav=[{"avdelingId": 1, "dato": "2026-01-05", "vaktkodeId": 1, "antallKrevd": 1}],
        onsker=[{"ansattId": 2, "dato": "2026-01-05", "vaktkodeId": 1, "type": "onske_vakt", "prioritet": "bor"}],
    ))
    assert r["status"] in ("optimal", "feasible")
    assert r["vakter"][0]["ansattId"] == 2
    assert r["uoppfylte"] == []


def test_rest_11h_forbids_night_then_morning():
    # employee 1 is the only candidate for BOTH a night shift and next-morning shift.
    # 22:00-06:00 then 08:00-16:00 next day = 2h rest < 11h -> infeasible to fill both.
    r = solve(base(
        ansatte=[{"ansattId": 1, "stillingsprosent": 100, "kompetanser": [10]}],
        dekningskrav=[
            {"avdelingId": 1, "dato": "2026-01-05", "vaktkodeId": 2, "antallKrevd": 1},  # night
            {"avdelingId": 1, "dato": "2026-01-06", "vaktkodeId": 1, "antallKrevd": 1},  # morning
        ],
    ))
    # Only one employee, rest rule forbids both -> cannot satisfy both coverage reqs.
    assert r["status"] == "infeasible"


def test_weekend_load_is_shared_when_weighted():
    # Two weekend day-slots (Sat + Sun), 2 employees. With helgefrekvens weight,
    # the fair solution gives each employee one weekend day (spread 0), not both
    # to the same person.
    r = solve(base(
        vekter={"vektOnsker": 0, "vektHelgefrekvens": 10, "vektRettferdighet": 0,
                "vektKontinuitet": 0, "vektKostnad": 0},
        dekningskrav=[
            {"avdelingId": 1, "dato": "2026-01-10", "vaktkodeId": 1, "antallKrevd": 1},  # Sat
            {"avdelingId": 1, "dato": "2026-01-11", "vaktkodeId": 1, "antallKrevd": 1},  # Sun
        ],
    ))
    assert r["status"] in ("optimal", "feasible")
    per_emp = {}
    for v in r["vakter"]:
        per_emp[v["ansattId"]] = per_emp.get(v["ansattId"], 0) + 1
    assert set(per_emp.values()) == {1}  # one weekend day each, not {2}
    assert "helgefrekvens" in r["objektiv"]


def test_continuity_prefers_same_employee_consecutive_days():
    # 1 slot on Mon and 1 on Tue, 2 employees. With only continuity weighted,
    # the same employee should take both consecutive days.
    r = solve(base(
        vekter={"vektOnsker": 0, "vektHelgefrekvens": 0, "vektRettferdighet": 0,
                "vektKontinuitet": 10, "vektKostnad": 0},
        dekningskrav=[
            {"avdelingId": 1, "dato": "2026-01-05", "vaktkodeId": 1, "antallKrevd": 1},  # Mon
            {"avdelingId": 1, "dato": "2026-01-06", "vaktkodeId": 1, "antallKrevd": 1},  # Tue
        ],
    ))
    assert r["status"] in ("optimal", "feasible")
    assert len({v["ansattId"] for v in r["vakter"]}) == 1  # one person, both days


def test_objektiv_includes_all_five_dimensions():
    r = solve(base(dekningskrav=[
        {"avdelingId": 1, "dato": "2026-01-05", "vaktkodeId": 1, "antallKrevd": 1}]))
    assert set(r["objektiv"]) == {"onske", "rettferdighet", "helgefrekvens", "kontinuitet", "kostnad"}


def test_locked_shift_is_kept():
    r = solve(base(
        dekningskrav=[{"avdelingId": 1, "dato": "2026-01-05", "vaktkodeId": 1, "antallKrevd": 1}],
        laasteVakter=[{"ansattId": 1, "dato": "2026-01-05", "startTid": "08:00",
                       "sluttTid": "16:00", "vaktkodeId": 1}],
    ))
    assert r["status"] in ("optimal", "feasible")
    assert r["vakter"][0]["ansattId"] == 1


# ── Registrerte regler (K-01/K-02/K-03): avtaler, dispensasjoner, unntak ──────

def _hvile_case(regler):
    """Night 22-06 then next-morning 08-16 with a single employee: only solvable
    when the required rest is relaxed below 2h."""
    return solve(base(
        ansatte=[{"ansattId": 1, "stillingsprosent": 100, "kompetanser": [10]}],
        dekningskrav=[
            {"avdelingId": 1, "dato": "2026-01-05", "vaktkodeId": 2, "antallKrevd": 1},
            {"avdelingId": 1, "dato": "2026-01-06", "vaktkodeId": 1, "antallKrevd": 1},
        ],
        regler=regler,
    ))


def test_dispensasjon_relaxes_daily_rest():
    # Without a rule the 11h default makes this infeasible (see the test above).
    r = _hvile_case([{
        "regeltype": "aml_daglig_hvile_11t", "haard": True, "vekt": 0,
        "parametre": {"timer": 2}, "ansattId": None, "avdelingId": None,
    }])
    assert r["status"] in ("optimal", "feasible")
    assert len(r["vakter"]) == 2


def test_employee_scoped_rule_does_not_leak_to_others():
    # The dispensasjon is bound to employee 2, so employee 1 keeps the 11h rest
    # and the pair of shifts stays unfillable.
    r = _hvile_case([{
        "regeltype": "aml_daglig_hvile_11t", "haard": True, "vekt": 0,
        "parametre": {"timer": 2}, "ansattId": 2, "avdelingId": None,
    }])
    assert r["status"] == "infeasible"


def test_weekly_hours_rule_tightens_the_default_cap():
    # Five day-shifts (7.5h each = 37.5h) for one employee, capped at 20h/week.
    krav = [{"avdelingId": 1, "dato": d, "vaktkodeId": 1, "antallKrevd": 1}
            for d in ("2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09")]
    r = solve(base(
        ansatte=[{"ansattId": 1, "stillingsprosent": 100, "kompetanser": [10]}],
        dekningskrav=krav,
        regler=[{"regeltype": "aml_max_uketimer", "haard": True, "vekt": 0,
                 "parametre": {"timer": 20}, "ansattId": None, "avdelingId": None}],
    ))
    assert r["status"] == "infeasible"


def test_max_consecutive_nights_is_enforced():
    # Three consecutive nights, one employee, rule allows at most 2 in a row.
    krav = [{"avdelingId": 1, "dato": d, "vaktkodeId": 2, "antallKrevd": 1}
            for d in ("2026-01-05", "2026-01-06", "2026-01-07")]
    r = solve(base(
        ansatte=[{"ansattId": 1, "stillingsprosent": 100, "kompetanser": [10]}],
        dekningskrav=krav,
        regler=[{"regeltype": "max_netter_paa_rad", "haard": True, "vekt": 0,
                 "parametre": {"antall": 2}, "ansattId": None, "avdelingId": None}],
    ))
    assert r["status"] == "infeasible"


def test_soft_rule_does_not_block_the_solution():
    # Same three nights, but the rule is soft: it must not constrain the model.
    krav = [{"avdelingId": 1, "dato": d, "vaktkodeId": 2, "antallKrevd": 1}
            for d in ("2026-01-05", "2026-01-06", "2026-01-07")]
    r = solve(base(
        ansatte=[{"ansattId": 1, "stillingsprosent": 100, "kompetanser": [10]}],
        dekningskrav=krav,
        regler=[{"regeltype": "max_netter_paa_rad", "haard": False, "vekt": 8,
                 "parametre": {"antall": 2}, "ansattId": None, "avdelingId": None}],
    ))
    assert r["status"] in ("optimal", "feasible")
    assert len(r["vakter"]) == 3


def test_unsupported_rule_is_reported_not_silently_ignored():
    r = solve(base(
        dekningskrav=[{"avdelingId": 1, "dato": "2026-01-05", "vaktkodeId": 1, "antallKrevd": 1}],
        regler=[{"regeltype": "helt_ukjent_regel", "haard": True, "vekt": 0,
                 "parametre": {}, "ansattId": None, "avdelingId": None}],
    ))
    assert r["status"] in ("optimal", "feasible")
    anvendt = {a["regeltype"]: a for a in r["anvendteRegler"]}
    assert anvendt["helt_ukjent_regel"]["stottet"] is False


def test_supported_rule_is_reported_with_resolved_value():
    r = solve(base(
        dekningskrav=[{"avdelingId": 1, "dato": "2026-01-05", "vaktkodeId": 1, "antallKrevd": 1}],
        regler=[{"regeltype": "aml_max_uketimer", "haard": True, "vekt": 0,
                 "parametre": {"timer": 35}, "ansattId": None, "avdelingId": None}],
    ))
    anvendt = {a["regeltype"]: a for a in r["anvendteRegler"]}
    assert anvendt["aml_max_uketimer"]["stottet"] is True
    assert anvendt["aml_max_uketimer"]["verdi"] == 35
    assert anvendt["aml_max_uketimer"]["gjelderAnsatte"] == [1, 2]


def test_no_regler_key_keeps_default_behaviour():
    # Backwards compatibility: an old caller that omits `regler` still gets the
    # AML defaults (11h rest makes this infeasible).
    r = _hvile_case(None) if False else solve(base(
        ansatte=[{"ansattId": 1, "stillingsprosent": 100, "kompetanser": [10]}],
        dekningskrav=[
            {"avdelingId": 1, "dato": "2026-01-05", "vaktkodeId": 2, "antallKrevd": 1},
            {"avdelingId": 1, "dato": "2026-01-06", "vaktkodeId": 1, "antallKrevd": 1},
        ],
    ))
    assert r["status"] == "infeasible"


# ── K-08: skala — ~25 turnuslinjer med målbar generingstid ────────────────────

def test_scale_25_lines_four_weeks_produces_a_complete_roster():
    """Anbudets K-08: generere turnus for ~25 linjer med målbar tid.

    25 ansatte, 4 uker, D/A/N hver dag = 84 dekningskrav / 236 vakter og
    2 100 beslutningsvariabler.

    Målt oppførsel: CP-SAT finner en komplett, lovlig turnus raskt (fylte all
    dekning også med 3 sekunders budsjett), men beviser ikke optimalitet på
    denne størrelsen — den bruker hele budsjettet på å lete etter bedre
    løsninger og returnerer 'feasible'. maxSekunder er derfor en kvalitets-
    knapp, ikke en risiko for å ende opp uten svar.

    Testen fester det som betyr noe: full dekning, ingen dobbeltbooking, og
    at tiden rapporteres og holder seg innenfor budsjettet.
    """
    import datetime as dt

    budsjett_sek = 10
    ansatte = [{"ansattId": i, "stillingsprosent": 100, "kompetanser": [10]}
               for i in range(1, 26)]
    vaktkoder = [
        {"vaktkodeId": 1, "startTid": "07:00", "sluttTid": "15:00", "tellerSomArbeid": True},
        {"vaktkodeId": 2, "startTid": "15:00", "sluttTid": "23:00", "tellerSomArbeid": True},
        {"vaktkodeId": 3, "startTid": "23:00", "sluttTid": "07:00", "tellerSomArbeid": True},
    ]
    start = dt.date(2026, 1, 5)
    krav = []
    for d in range(28):
        dato = (start + dt.timedelta(days=d)).isoformat()
        helg = (start + dt.timedelta(days=d)).isoweekday() >= 6
        for vk, antall in ((1, 3 if helg else 4), (2, 2 if helg else 3), (3, 2)):
            krav.append({"avdelingId": 1, "dato": dato, "vaktkodeId": vk, "antallKrevd": antall})

    r = solve(base(
        ansatte=ansatte, vaktkoder=vaktkoder, dekningskrav=krav,
        rotasjonUker=4, maxSekunder=budsjett_sek,
    ))

    assert r["status"] in ("optimal", "feasible"), r.get("feilmelding")
    assert len(r["vakter"]) == sum(k["antallKrevd"] for k in krav)  # full dekning
    assert r["solveTidMs"] > 0                                     # målbar tid
    # Toleranse: solveTidMs måler hele solve()-kallet, ikke bare CP-SAT-loopen.
    assert r["solveTidMs"] < (budsjett_sek + 5) * 1000

    # Ingen ansatt får to vakter samme dag — invariant som lett ryker i skala.
    per_ansatt_dag: dict[tuple[int, str], int] = {}
    for v in r["vakter"]:
        nokkel = (v["ansattId"], v["dato"])
        per_ansatt_dag[nokkel] = per_ansatt_dag.get(nokkel, 0) + 1
    assert max(per_ansatt_dag.values()) == 1
