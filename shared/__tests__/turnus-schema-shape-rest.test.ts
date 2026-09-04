import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  turnusKompetanser, turnusAnsattKompetanser, turnusVaktlinjer, turnusLinjeVakter, turnusKalendervakter,
  turnusBemanningsbehov, turnusPrioriteringsprofil, turnusOrgMembers,
} from "../schema";

it("rest of turnus tables map to migration names", () => {
  expect(getTableConfig(turnusKompetanser).name).toBe("tidum_turnus_kompetanser");
  expect(getTableConfig(turnusAnsattKompetanser).name).toBe("tidum_turnus_ansatt_kompetanser");
  expect(getTableConfig(turnusVaktlinjer).name).toBe("tidum_turnus_vaktlinjer");
  expect(getTableConfig(turnusLinjeVakter).name).toBe("tidum_turnus_linje_vakter");
  expect(getTableConfig(turnusKalendervakter).name).toBe("tidum_turnus_kalendervakter");
  expect(getTableConfig(turnusBemanningsbehov).name).toBe("tidum_turnus_bemanningsbehov");
  expect(getTableConfig(turnusPrioriteringsprofil).name).toBe("tidum_turnus_prioriteringsprofil");
  expect(getTableConfig(turnusOrgMembers).name).toBe("tidum_turnus_org_members");
});
