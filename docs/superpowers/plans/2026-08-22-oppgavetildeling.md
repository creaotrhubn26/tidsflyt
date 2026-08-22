# Oppgavetildeling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Utvide den eksisterende «Mine oppgaver»-widgeten (`tidum_dashboard_tasks`) med tildeling til andre, ekte frist, og automatisk eskalering ved fristbrudd.

**Architecture:** Tre nye, nullable kolonner på den eksisterende tabellen (bakoverkompatibelt). Tildeling til andre gates av fase 1.6s `canManageUsersDynamic`. Eskalering er en ny daglig cron med egen idempotens-vakt (`escalatedAt`).

**Tech Stack:** Express, Drizzle ORM, PostgreSQL (delt produksjonsdatabase via Neon), node-cron, React Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-22-oppgavetildeling-design.md`

## Global Constraints

- `tidum_dashboard_tasks` sin eksisterende bruk (selvopprettede oppgaver, ingen `assignedByUserId`/`dueAt`) skal fortsette å virke UENDRET — alle tre nye kolonner er nullable, alle eksisterende rader har dem NULL.
- Tildeling til NOEN ANNET enn seg selv krever `canManageUsersDynamic(actorRole)` fra `server/lib/permissions.ts` (fase 1.6) — samme fail-closed-oppførsel.
- Eskalering skjer NØYAKTIG ÉN GANG per oppgave — `escalatedAt` er idempotens-vakten. `rapport-reminder-cron.ts` sitt mønster har eksplisitt INGEN slik vakt og skal IKKE kopieres rått på dette punktet.
- Migrasjon er idempotent (`ADD COLUMN IF NOT EXISTS`), registreres i `server/lib/run-startup-migrations.ts` (posisjon uten avhengighet til andre migrasjoner — legges sist).
- `POST /api/tasks` sin eksisterende oppførsel (uten `assigneeUserId`) er UENDRET.
- Ikke rør prioritetsscoring, duplikat-deteksjon, snooze-logikk, eller «Faste oppgaver» (`client/src/pages/recurring.tsx`, urelatert).

---

### Task 1: Datamodell — migrasjon, skjema, storage

**Files:**
- Create: `migrations/059_task_assignment.sql`
- Modify: `server/lib/run-startup-migrations.ts`
- Modify: `shared/schema.ts` (linje 1620-1630)
- Modify: `server/storage.ts` (linje 362-365, 1093-1120)
- Test: `server/lib/__tests__/dashboard-task-assignment.test.ts`

**Interfaces:**
- Produserer: `DashboardTask` type får `assignedByUserId: string | null`, `dueAt: Date | null`, `escalatedAt: Date | null`. `storage.createDashboardTask(userId, title, linkedUrl?, linkedLabel?, assignedByUserId?, dueAt?)` og `storage.updateDashboardTask(...)` sin `data`-type utvides med `escalatedAt`. Task 2 og 3 konsumerer disse direkte.

- [ ] **Step 1: Skriv migrasjonen**

`migrations/059_task_assignment.sql`:

```sql
ALTER TABLE tidum_dashboard_tasks ADD COLUMN IF NOT EXISTS assigned_by_user_id TEXT;
ALTER TABLE tidum_dashboard_tasks ADD COLUMN IF NOT EXISTS due_at TIMESTAMP;
ALTER TABLE tidum_dashboard_tasks ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_dashboard_tasks_escalation
  ON tidum_dashboard_tasks (due_at)
  WHERE done = false AND escalated_at IS NULL AND assigned_by_user_id IS NOT NULL;
```

Den partielle indeksen dekker eksakt eskalerings-cronens spørring (Task 3) — kun rader som faktisk kan trenge eskalering, ikke hele tabellen.

- [ ] **Step 2: Registrer migrasjonen**

I `server/lib/run-startup-migrations.ts`, legg `"059_task_assignment.sql"` til slutt i `STARTUP_MIGRATIONS`-arrayet (ingen ordre-avhengighet til andre migrasjoner).

- [ ] **Step 3: Utvid Drizzle-skjemaet**

I `shared/schema.ts`, erstatt (linje 1620-1630):

```ts
export const dashboardTasks = pgTable("tidum_dashboard_tasks", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  done: boolean("done").default(false).notNull(),
  linkedUrl: text("linked_url"),
  linkedLabel: text("linked_label"),
  snoozedUntil: timestamp("snoozed_until"),
  assignedByUserId: text("assigned_by_user_id"),
  dueAt: timestamp("due_at"),
  escalatedAt: timestamp("escalated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

(kun de tre nye feltene `assignedByUserId`, `dueAt`, `escalatedAt` er nye — resten uendret. `insertDashboardTaskSchema` (linje 1632) trenger INGEN endring — den er allerede `createInsertSchema(dashboardTasks).omit({id, createdAt, updatedAt})`, som automatisk plukker opp de nye feltene som valgfrie siden de er nullable.)

- [ ] **Step 4: Utvid storage.ts**

I `server/storage.ts`, interface-deklarasjonen (linje 362-365), erstatt:

```ts
  getDashboardTasks(userId: string): Promise<DashboardTask[]>;
  createDashboardTask(userId: string, title: string, linkedUrl?: string, linkedLabel?: string, assignedByUserId?: string, dueAt?: Date): Promise<DashboardTask>;
  updateDashboardTask(id: number, userId: string, data: Partial<Pick<DashboardTask, 'title' | 'done' | 'linkedUrl' | 'linkedLabel' | 'snoozedUntil' | 'escalatedAt'>>): Promise<DashboardTask | undefined>;
  deleteDashboardTask(id: number, userId: string): Promise<boolean>;
```

Implementasjonen (linje 1100-1105), erstatt `createDashboardTask`:

```ts
  async createDashboardTask(userId: string, title: string, linkedUrl?: string, linkedLabel?: string, assignedByUserId?: string, dueAt?: Date): Promise<DashboardTask> {
    const [row] = await db.insert(dashboardTasks)
      .values({
        userId,
        title,
        done: false,
        linkedUrl: linkedUrl ?? null,
        linkedLabel: linkedLabel ?? null,
        assignedByUserId: assignedByUserId ?? null,
        dueAt: dueAt ?? null,
      })
      .returning();
    return row;
  }
```

`updateDashboardTask` (linje 1107-1113) trenger ingen kodeendring — `Partial<Pick<...>>`-typen ovenfor legger allerede til `escalatedAt` som gyldig felt i `data`, og `{...data, updatedAt: new Date()}`-mønsteret plukker det opp automatisk.

- [ ] **Step 5: Skriv testen**

`server/lib/__tests__/dashboard-task-assignment.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { pool } from "../../db";

describe("tidum_dashboard_tasks: assignedByUserId/dueAt/escalatedAt", () => {
  const cleanupIds: number[] = [];
  afterEach(async () => {
    for (const id of cleanupIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_dashboard_tasks WHERE id = $1`, [id]);
    }
  });

  it("selvopprettet oppgave (uten assignedByUserId/dueAt) er uendret", async () => {
    const { storage } = await import("../../storage");
    const userId = `test_selfcreate_${Date.now()}`;
    const task = await storage.createDashboardTask(userId, "Test selvopprettet");
    cleanupIds.push(task.id);

    expect(task.assignedByUserId).toBeNull();
    expect(task.dueAt).toBeNull();
    expect(task.escalatedAt).toBeNull();
  });

  it("tildelt oppgave lagrer assignedByUserId og dueAt korrekt", async () => {
    const { storage } = await import("../../storage");
    const assigneeId = `test_assignee_${Date.now()}`;
    const assignerId = `test_assigner_${Date.now()}`;
    const due = new Date(Date.now() + 86_400_000);

    const task = await storage.createDashboardTask(assigneeId, "Følg opp sak X", undefined, undefined, assignerId, due);
    cleanupIds.push(task.id);

    expect(task.userId).toBe(assigneeId);
    expect(task.assignedByUserId).toBe(assignerId);
    expect(task.dueAt?.getTime()).toBe(due.getTime());

    const fetched = await storage.getDashboardTasks(assigneeId);
    expect(fetched.some((t) => t.id === task.id)).toBe(true);
  });

  it("updateDashboardTask kan sette escalatedAt", async () => {
    const { storage } = await import("../../storage");
    const userId = `test_escalate_update_${Date.now()}`;
    const task = await storage.createDashboardTask(userId, "Test", undefined, undefined, userId, new Date());
    cleanupIds.push(task.id);

    const now = new Date();
    const updated = await storage.updateDashboardTask(task.id, userId, { escalatedAt: now });
    expect(updated?.escalatedAt?.getTime()).toBe(now.getTime());
  });
});
```

- [ ] **Step 6: Kjør testen, bekreft 3/3**

Kjør: `DATABASE_URL='<ekte verdi>' npx vitest run server/lib/__tests__/dashboard-task-assignment.test.ts`
Forventet: 3/3 bestått.

- [ ] **Step 7: Commit**

```bash
git add migrations/059_task_assignment.sql server/lib/run-startup-migrations.ts \
  shared/schema.ts server/storage.ts \
  server/lib/__tests__/dashboard-task-assignment.test.ts
git commit -m "feat: datamodell for oppgavetildeling (eier, frist, eskalering-vakt)"
```

---

### Task 2: Server API — tildeling, varsling, tilgjengelige kollegaer

**Files:**
- Modify: `server/routes.ts` (linje 5440-5453, samt et nytt endepunkt)
- Test: `server/lib/__tests__/task-assignment-routes.test.ts`

**Interfaces:**
- Konsumerer: `storage.createDashboardTask` (Task 1, 6 parametre), `canManageUsersDynamic` fra `./lib/permissions` (fase 1.6, `canManageUsersDynamic(actorRoleName: string, cache?: Map<string, boolean>): Promise<boolean>`), `createNotification` fra `./routes/notification-routes` (`{userId, type, title, message, link?, metadata?, createdBy?}`).
- Produserer: `POST /api/tasks` (utvidet), `GET /api/tasks/assignable-colleagues` → `{ canAssign: boolean, colleagues: Array<{ id: string, name: string }> }`. Task 4 (klient) konsumerer begge.

- [ ] **Step 1: Importer det som trengs i server/routes.ts**

Finn toppen av `server/routes.ts` sine imports (grep etter `from "./lib/permissions"` — kan allerede finnes fra fase 1.6, ikke dupliser). Hvis `canManageUsersDynamic` ikke allerede er importert der:

```ts
import { canManageUsersDynamic } from "./lib/permissions";
```

Bekreft også at `createNotification` er importert (grep etter `notification-routes` — sannsynligvis allerede importert siden andre ruter i denne filen bruker den; hvis ikke:

```ts
import { createNotification } from "./routes/notification-routes";
```

- [ ] **Step 2: Utvid POST /api/tasks**

Erstatt (linje 5440-5453):

```ts
  app.post("/api/tasks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { title, linkedUrl, linkedLabel, assigneeUserId, dueAt } = req.body;
      if (!title || typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "title is required" });
      }

      let targetUserId = userId;
      let assignedByUserId: string | undefined;
      const parsedDueAt = dueAt ? new Date(dueAt) : undefined;

      if (assigneeUserId && assigneeUserId !== userId) {
        const actorRole = String(req.user?.role || "");
        const allowed = await canManageUsersDynamic(actorRole);
        if (!allowed) {
          return res.status(403).json({ error: "Du har ikke rettigheter til å tildele oppgaver til andre." });
        }
        targetUserId = assigneeUserId;
        assignedByUserId = userId;
      }

      const task = await storage.createDashboardTask(
        targetUserId,
        title.trim(),
        linkedUrl,
        linkedLabel,
        assignedByUserId,
        parsedDueAt,
      );

      if (assignedByUserId) {
        await createNotification({
          userId: targetUserId,
          type: "task_assigned",
          title: "Ny oppgave tildelt",
          message: title.trim(),
          link: "/dashboard",
          createdBy: assignedByUserId,
        });
      }

      res.status(201).json(task);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Step 3: Nytt endepunkt GET /api/tasks/assignable-colleagues**

Sett inn rett etter `POST /api/tasks` (før `PATCH /api/tasks/:id`, linje 5455 i det opprinnelige filen — grep etter `app.patch("/api/tasks/:id"` for eksakt innsettingspunkt siden Step 2 forskyver linjenumre):

```ts
  app.get("/api/tasks/assignable-colleagues", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const actorRole = String(req.user?.role || "");
      const canAssign = await canManageUsersDynamic(actorRole);
      if (!canAssign) {
        return res.json({ canAssign: false, colleagues: [] });
      }

      const vendorId = req.user?.vendorId;
      if (!vendorId) {
        return res.json({ canAssign: true, colleagues: [] });
      }

      const colleagueRows = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
        .from(users)
        .where(and(eq(users.vendorId, vendorId), ne(users.id, userId)));

      const colleagues = colleagueRows.map((u) => ({
        id: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || u.id,
      }));

      res.json({ canAssign: true, colleagues });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
```

Bekreft at `ne` er importert fra `drizzle-orm` i `server/routes.ts` (grep etter `from "drizzle-orm"` — legg til `ne` i den eksisterende import-linjen hvis den mangler; ikke opprett en ny import-linje for dette alene).

- [ ] **Step 4: Skriv testen**

`server/lib/__tests__/task-assignment-routes.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "http";
import { pool } from "../../db";

// registerRoutes(httpServer, app) sin httpServer-parameter brukes KUN som
// et rent gjennomgangs-returverdi (server/routes.ts:6608, `return
// httpServer;`) — aldri kalt, aldri lyttet på. En aldri-startet
// http.createServer() er derfor trygg og tilstrekkelig her; ingen ekte
// port åpnes.
//
// VIKTIG: sett IKKE NODE_ENV til "production" i denne testfilen.
// /api/tasks er gatet av isAuthenticated (server/custom-auth.ts:596), som
// har sin EGEN, uavhengige dev-bypass (`isDev = NODE_ENV !== "production"`,
// custom-auth.ts:275) — helt separat fra authenticateAdmin sin
// dev-bypass i smartTimingRoutes.ts som andre tester i denne økten måtte
// forsvare seg mot. isAuthenticated sin dev-bypass gjør bare `return
// next()` UTEN å røre req.user, så den nedenstående middlewarens
// injiserte req.user overlever uendret — nøyaktig det testen trenger.
// Å sette NODE_ENV=production her ville i stedet KREVD en ekte
// passport-sesjon (hasSessionAuth sjekker req.session.passport.user,
// ikke bare req.user) og latt alle testene 401 med vilje feil årsak.
describe("oppgavetildeling: POST /api/tasks + GET /api/tasks/assignable-colleagues", () => {
  const cleanupTaskIds: number[] = [];
  const cleanupNotificationUserIds: string[] = [];
  afterEach(async () => {
    for (const id of cleanupTaskIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_dashboard_tasks WHERE id = $1`, [id]);
    }
    for (const uid of cleanupNotificationUserIds.splice(0)) {
      await pool.query(`DELETE FROM notifications WHERE recipient_id = $1`, [uid]);
    }
  });

  async function appWithUser(user: { id: string; role: string; vendorId?: number | null }) {
    const { registerRoutes } = await import("../../routes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = user;
      req.isAuthenticated = () => true;
      next();
    });
    await registerRoutes(http.createServer(), app);
    return app;
  }

  it("vendor_admin kan tildele en oppgave til en annen bruker, mottakeren får en notifikasjon", async () => {
    const assignerId = `test_assigner_${Date.now()}`;
    const assigneeId = `test_assignee_${Date.now()}`;
    cleanupNotificationUserIds.push(assigneeId);
    const app = await appWithUser({ id: assignerId, role: "vendor_admin" });

    const res = await request(app)
      .post("/api/tasks")
      .send({ title: "Følg opp sak", assigneeUserId: assigneeId, dueAt: new Date(Date.now() + 86_400_000).toISOString() });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(assigneeId);
    expect(res.body.assignedByUserId).toBe(assignerId);
    cleanupTaskIds.push(res.body.id);

    const { rows } = await pool.query(
      `SELECT * FROM notifications WHERE recipient_id = $1 AND type = 'task_assigned'`,
      [assigneeId],
    );
    expect(rows.length).toBe(1);
  });

  it("member kan IKKE tildele en oppgave til noen andre (403)", async () => {
    const memberId = `test_member_${Date.now()}`;
    const targetId = `test_target_${Date.now()}`;
    const app = await appWithUser({ id: memberId, role: "member" });

    const res = await request(app)
      .post("/api/tasks")
      .send({ title: "Skal feile", assigneeUserId: targetId });

    expect(res.status).toBe(403);
  });

  it("en bruker kan fortsatt opprette en oppgave til seg selv uten noen sjekk", async () => {
    const userId = `test_self_${Date.now()}`;
    const app = await appWithUser({ id: userId, role: "member" });

    const res = await request(app).post("/api/tasks").send({ title: "Egen oppgave" });

    expect(res.status).toBe(201);
    expect(res.body.assignedByUserId).toBeNull();
    cleanupTaskIds.push(res.body.id);
  });

  it("GET /api/tasks/assignable-colleagues returnerer canAssign:false for member", async () => {
    const app = await appWithUser({ id: `test_member2_${Date.now()}`, role: "member" });

    const res = await request(app).get("/api/tasks/assignable-colleagues");
    expect(res.status).toBe(200);
    expect(res.body.canAssign).toBe(false);
    expect(res.body.colleagues).toEqual([]);
  });
});
```

**Merk til implementeren:** `registerRoutes` kaller internt `setupCustomAuth(app)`/`setupEidAuth(app)` og en rekke andre `register*Routes(app)`-kall — dette er tungt, men det ER den faktiske, eneste veien `POST /api/tasks` nås gjennom (den er ikke utskilt i en egen, lett rute-modul slik f.eks. `notification-routes.ts` er). Kjør testen og se om oppsettet fungerer som forventet før du evt. leter etter en lettere vei — sannsynligvis fungerer det direkte siden verken auth-middlewaren over (satt FØR `registerRoutes` kalles) eller `registerRoutes` selv krever en ekte lyttende port.

- [ ] **Step 5: Kjør testen**

Kjør: `DATABASE_URL='<ekte verdi>' npx vitest run server/lib/__tests__/task-assignment-routes.test.ts`
Forventet: 4/4 bestått.

- [ ] **Step 6: Commit**

```bash
git add server/routes.ts server/lib/__tests__/task-assignment-routes.test.ts
git commit -m "feat: API for oppgavetildeling — canManageUsersDynamic-gate + varsling"
```

---

### Task 3: Eskalerings-cron

**Files:**
- Create: `server/routes/task-escalation-cron.ts`
- Modify: `server/routes.ts` (registrering, se linje 6538-6569 for mønster)
- Test: `server/lib/__tests__/task-escalation-cron.test.ts`

**Interfaces:**
- Konsumerer: `storage.updateDashboardTask` (Task 1), `createNotification` (eksisterende), `db`/`dashboardTasks`/`users` fra `@shared/schema` og `../db`.
- Produserer: `runTaskEscalations(): Promise<{ escalated: number }>`, `setupTaskEscalationCron()`, `registerTaskEscalationRoutes(app)`. Ingen andre oppgaver konsumerer disse — dette er sisteleddet.

- [ ] **Step 1: Skriv cron-filen**

`server/routes/task-escalation-cron.ts`:

```ts
/**
 * server/routes/task-escalation-cron.ts
 *
 * Daglig: finn tildelte oppgaver hvor fristen er passert uten at
 * oppgaven er fullført, og varsle den som tildelte den. Eskalerer
 * NØYAKTIG ÉN GANG per oppgave — escalated_at er idempotens-vakten
 * (rapport-reminder-cron.ts sitt mønster har bevisst ingen slik vakt;
 * denne cronen trenger en, siden gjentatt daglig eskalering av samme
 * oppgave ville vært spam, ikke en påminnelse).
 */

import type { Express, Request, Response } from "express";
import cron from "node-cron";
import { db } from "../db";
import { and, eq, isNull, isNotNull, lt } from "drizzle-orm";
import { dashboardTasks } from "@shared/schema";
import { createNotification } from "./notification-routes";
import { requireAuth, ADMIN_ROLES } from "../middleware/auth";

function isAdminRole(req: Request): boolean {
  const role = String(((req as any).authUser ?? (req as any).user)?.role || "")
    .toLowerCase().replace(/[\s-]/g, "_");
  return ADMIN_ROLES.includes(role);
}

export async function runTaskEscalations(): Promise<{ escalated: number }> {
  const overdue = await db
    .select()
    .from(dashboardTasks)
    .where(and(
      lt(dashboardTasks.dueAt, new Date()),
      eq(dashboardTasks.done, false),
      isNull(dashboardTasks.escalatedAt),
      isNotNull(dashboardTasks.assignedByUserId),
    ));

  let escalated = 0;
  for (const task of overdue) {
    try {
      await createNotification({
        userId: task.assignedByUserId!,
        type: "task_overdue",
        title: "Oppgave forfalt",
        message: task.title,
        link: "/dashboard",
      });
      await db
        .update(dashboardTasks)
        .set({ escalatedAt: new Date(), updatedAt: new Date() })
        .where(eq(dashboardTasks.id, task.id));
      escalated++;
    } catch (err) {
      console.error(`Failed to escalate task ${task.id}:`, err);
    }
  }
  return { escalated };
}

let cronStarted = false;
export function setupTaskEscalationCron() {
  if (cronStarted) return;
  cron.schedule("0 8 * * *", async () => {
    console.log("⏰ Running task escalation cron…");
    const result = await runTaskEscalations();
    console.log(`Tasks escalated: ${result.escalated}`);
  });
  cronStarted = true;
  console.log("✅ Task escalation cron scheduled (daily 08:00)");
}

/** Manuell trigger-rute for admins til å teste + tvinge en kjøring. */
export function registerTaskEscalationRoutes(app: Express) {
  app.post("/api/task-escalations/run", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isAdminRole(req)) return res.status(403).json({ error: "Kun admin+ kan kjøre eskalering manuelt" });
      const result = await runTaskEscalations();
      res.json({ ok: true, ...result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
```

- [ ] **Step 2: Registrer i server/routes.ts**

Følg eksakt samme mønster som `rapport-reminder-cron.ts` (se linje 15, 6543, 6563 i `server/routes.ts` for de tre stedene å speile):

1. Import øverst i filen: `import { registerTaskEscalationRoutes, setupTaskEscalationCron } from "./routes/task-escalation-cron";`
2. Sammen med de andre `register*Routes(app)`-kallene (nær linje 6543): `registerTaskEscalationRoutes(app);`
3. Inni `if (process.env.RECURRING_CRON_DISABLED !== 'true') { ... }`-blokken (nær linje 6563), sammen med de andre `setup*Cron()`-kallene: `setupTaskEscalationCron();`

- [ ] **Step 3: Skriv testen**

`server/lib/__tests__/task-escalation-cron.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { pool } from "../../db";
import { runTaskEscalations } from "../../routes/task-escalation-cron";

describe("runTaskEscalations", () => {
  const cleanupIds: number[] = [];
  const cleanupNotificationUserIds: string[] = [];
  afterEach(async () => {
    for (const id of cleanupIds.splice(0)) {
      await pool.query(`DELETE FROM tidum_dashboard_tasks WHERE id = $1`, [id]);
    }
    for (const uid of cleanupNotificationUserIds.splice(0)) {
      await pool.query(`DELETE FROM notifications WHERE recipient_id = $1`, [uid]);
    }
  });

  async function insertTask(overrides: {
    userId: string; assignedByUserId: string | null; dueAt: Date | null; done?: boolean; escalatedAt?: Date | null;
  }) {
    const { rows: [row] } = await pool.query(
      `INSERT INTO tidum_dashboard_tasks (user_id, title, done, assigned_by_user_id, due_at, escalated_at)
       VALUES ($1, 'Test oppgave', $2, $3, $4, $5) RETURNING id`,
      [overrides.userId, overrides.done ?? false, overrides.assignedByUserId, overrides.dueAt, overrides.escalatedAt ?? null],
    );
    cleanupIds.push(row.id);
    return row.id;
  }

  it("eskalerer en forfalt, tildelt, ikke-fullført oppgave og varsler tildeleren", async () => {
    const assignerId = `test_esc_assigner_${Date.now()}`;
    const assigneeId = `test_esc_assignee_${Date.now()}`;
    cleanupNotificationUserIds.push(assignerId);
    const yesterday = new Date(Date.now() - 86_400_000);
    const taskId = await insertTask({ userId: assigneeId, assignedByUserId: assignerId, dueAt: yesterday });

    const result = await runTaskEscalations();
    expect(result.escalated).toBeGreaterThanOrEqual(1);

    const { rows: [task] } = await pool.query(`SELECT escalated_at FROM tidum_dashboard_tasks WHERE id = $1`, [taskId]);
    expect(task.escalated_at).not.toBeNull();

    const { rows: notifs } = await pool.query(
      `SELECT * FROM notifications WHERE recipient_id = $1 AND type = 'task_overdue'`,
      [assignerId],
    );
    expect(notifs.length).toBe(1);
  });

  it("eskalerer IKKE på nytt en oppgave som allerede har escalated_at satt (idempotens)", async () => {
    const assignerId = `test_esc_idempotent_${Date.now()}`;
    cleanupNotificationUserIds.push(assignerId);
    const yesterday = new Date(Date.now() - 86_400_000);
    await insertTask({ userId: `test_esc_u_${Date.now()}`, assignedByUserId: assignerId, dueAt: yesterday, escalatedAt: new Date() });

    await runTaskEscalations();

    const { rows: notifs } = await pool.query(
      `SELECT * FROM notifications WHERE recipient_id = $1 AND type = 'task_overdue'`,
      [assignerId],
    );
    expect(notifs.length).toBe(0);
  });

  it("eskalerer IKKE en selvopprettet oppgave (assigned_by_user_id er NULL)", async () => {
    const userId = `test_esc_self_${Date.now()}`;
    const yesterday = new Date(Date.now() - 86_400_000);
    await insertTask({ userId, assignedByUserId: null, dueAt: yesterday });

    const before = (await pool.query(`SELECT count(*)::int AS n FROM notifications WHERE recipient_id = $1`, [userId])).rows[0].n;
    await runTaskEscalations();
    const after = (await pool.query(`SELECT count(*)::int AS n FROM notifications WHERE recipient_id = $1`, [userId])).rows[0].n;

    expect(after).toBe(before);
  });

  it("eskalerer IKKE en fullført oppgave selv om fristen er passert", async () => {
    const assignerId = `test_esc_done_${Date.now()}`;
    cleanupNotificationUserIds.push(assignerId);
    const yesterday = new Date(Date.now() - 86_400_000);
    await insertTask({ userId: `test_esc_done_u_${Date.now()}`, assignedByUserId: assignerId, dueAt: yesterday, done: true });

    await runTaskEscalations();

    const { rows: notifs } = await pool.query(`SELECT * FROM notifications WHERE recipient_id = $1`, [assignerId]);
    expect(notifs.length).toBe(0);
  });
});
```

- [ ] **Step 4: Kjør testen**

Kjør: `DATABASE_URL='<ekte verdi>' npx vitest run server/lib/__tests__/task-escalation-cron.test.ts`
Forventet: 4/4 bestått. Vær oppmerksom på at dette kjører mot ekte, delt database — `insertTask`s rader er alle disponible testrader med unike `test_esc_*`-prefikser, ryddet i `afterEach`.

- [ ] **Step 5: Commit**

```bash
git add server/routes/task-escalation-cron.ts server/routes.ts \
  server/lib/__tests__/task-escalation-cron.test.ts
git commit -m "feat: daglig eskalerings-cron for forfalte, tildelte oppgaver"
```

---

### Task 4: Klient — tildelings-velger, frist, «Tildelt av»-visning

**Files:**
- Modify: `client/src/components/dashboard/dashboard-tasks.tsx`

**Interfaces:**
- Konsumerer: `GET /api/tasks/assignable-colleagues`, utvidet `POST /api/tasks` (Task 2).
- Produserer: ingen — siste oppgave i planen.

- [ ] **Step 1: Utvid UserTask-interfacet**

Erstatt (linje 39-49):

```ts
interface UserTask {
  id: number;
  userId: string;
  title: string;
  done: boolean;
  linkedUrl: string | null;
  linkedLabel: string | null;
  snoozedUntil: string | null;
  assignedByUserId: string | null;
  dueAt: string | null;
  escalatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Hent tilgjengelige kollegaer**

Rett etter der `userTasks`/`prefs` hentes med `useQuery` (grep etter `useQuery` i filen for å finne det eksakte stedet — sannsynligvis nær toppen av komponentfunksjonen, før `createMut`), legg til:

```ts
  const { data: assignableData } = useQuery<{ canAssign: boolean; colleagues: Array<{ id: string; name: string }> }>({
    queryKey: ["/api/tasks/assignable-colleagues"],
  });
  const canAssignToOthers = assignableData?.canAssign ?? false;
  const colleagues = assignableData?.colleagues ?? [];
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string>("");
```

(bruk samme `useQuery`-hook-form som resten av filen allerede benytter for `userTasks`/`prefs` — match nøyaktig import og konvensjon som allerede finnes i filen, ikke innfør et nytt mønster.)

- [ ] **Step 3: Send med i createMut**

Erstatt (linje 297-310, `createMut` og `handleCreate`):

```ts
  const createMut = useMutation({
    mutationFn: (data: { title: string; linkedUrl?: string | null; linkedLabel?: string | null; assigneeUserId?: string | null; dueAt?: string | null }) =>
      apiRequest("POST", "/api/tasks", data),
    onSuccess: (_data, vars) => {
      eventMut.mutate({ type: "task_created", title: vars.title, linkedUrl: vars.linkedUrl ?? null });
      setDraft("");
      setDraftLink(null);
      setAssigneeId(null);
      setDueDate("");
      qc.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const handleCreate = () => {
    const title = draft.trim();
    if (!title) return;
    createMut.mutate({
      title,
      linkedUrl: draftLink?.url ?? null,
      linkedLabel: draftLink?.label ?? null,
      assigneeUserId: assigneeId ?? undefined,
      dueAt: dueDate ? new Date(dueDate).toISOString() : undefined,
    });
  };
```

**Merk til implementeren:** les den EKSAKTE nåværende `createMut`-definisjonen (linje 297-310 i planens research-fase, men bekreft mot fila selv siden linjenumre kan ha forskjøvet seg) før du erstatter — behold alt av dens eksisterende `onSuccess`/optimistic-update-logikk som ikke er vist over (planen viser kun de linjene som faktisk endres; ikke fjern noe annet av mutasjonens eksisterende oppførsel).

- [ ] **Step 4: Legg til tildelings-/frist-velgeren i opprett-raden**

I samme JSX-blokk som den eksisterende «Koble til side»-`Popover` (linje 940-954, `Link2`-ikonet), legg til RETT ETTER den (fortsatt inni raden på linje 890, før raden lukkes) en ny, tilsvarende `Popover` — kun synlig når `canAssignToOthers` er sann:

```tsx
                {canAssignToOthers && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded transition-colors",
                          assigneeId
                            ? "text-primary bg-primary/10"
                            : "text-muted-foreground hover:text-primary hover:bg-accent",
                        )}
                        title="Tildel til"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-64 p-2 space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">
                        Tildel til
                      </p>
                      <div className="space-y-1">
                        {colleagues.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setAssigneeId(assigneeId === c.id ? null : c.id)}
                            className={cn(
                              "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors text-left",
                              assigneeId === c.id && "bg-primary/10 text-primary",
                            )}
                          >
                            {c.name}
                          </button>
                        ))}
                        {colleagues.length === 0 && (
                          <p className="text-xs text-muted-foreground px-2 py-1">Ingen kollegaer funnet.</p>
                        )}
                      </div>
                      <div className="pt-1 border-t border-border/60">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1 block mb-1">
                          Frist
                        </label>
                        <input
                          type="date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          className="w-full rounded-md border border-border/60 bg-transparent px-2 py-1 text-sm"
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
```

Legg til `UserPlus` i lucide-react-importen øverst i filen (linje 3-19) sammen med de andre ikon-importene.

- [ ] **Step 5: Vis «Tildelt av» + frist på oppgaver i listen**

Der `task.linkedUrl && editingId !== task.id` rendres (linje 732-739) OG der den andre forekomsten er (linje 831-838), legg til RETT FØR eller ETTER (samme sted begge steder, samme mønster) en betinget badge:

```tsx
                  {task.assignedByUserId && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground shrink-0">
                      Tildelt
                      {task.dueAt && (
                        <>
                          {" · frist "}
                          {new Date(task.dueAt).toLocaleDateString("nb-NO", { day: "numeric", month: "short" })}
                        </>
                      )}
                    </span>
                  )}
```

(Viser ikke NAVNET på tildeleren i denne runden — API-et returnerer kun `assignedByUserId`, ikke et navn, i den formen `GET /api/tasks` gir tilbake i dag. Å slå opp og vise et lesbart navn her er en naturlig, liten oppfølging, men holdes utenfor denne planen for å unngå å måtte utvide `GET /api/tasks` sin respons-form i denne runden — se spec-ens «Ikke i omfang» for lignende avgrensninger. `assignedByUserId` er nok til å bekrefte at funksjonen virker ende-til-ende.)

- [ ] **Step 6: Manuell verifisering i nettleser**

Start dev-server (`PORT=5053 npm run dev` er allerede verifisert å fungere denne økten — bruk samme port eller en ledig en), logg inn som en rolle med `canManageUsersDynamic = true` (f.eks. `vendor_admin`), åpne dashbordet, bekreft: tildelings-ikonet vises i opprett-raden, en kollega kan velges, en frist kan settes, oppgaven opprettes og dukker opp med «Tildelt»-merket. Logg inn som en rolle UTEN `canManageUsersDynamic` (f.eks. `member`), bekreft tildelings-ikonet IKKE vises.

- [ ] **Step 7: Kjør hele testsuiten, bekreft ingen regresjon**

Kjør: `DATABASE_URL='<ekte verdi>' npx vitest run`
Forventet: alle tidligere bestående tester + de nye fra Task 1-3 består (samme 19 forhåndseksisterende, urelaterte Playwright-kollisjoner som resten av økten).

- [ ] **Step 8: Commit**

```bash
git add client/src/components/dashboard/dashboard-tasks.tsx
git commit -m "feat: klient-UI for oppgavetildeling — velger, frist, tildelt-merke"
```
