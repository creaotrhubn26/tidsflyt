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
