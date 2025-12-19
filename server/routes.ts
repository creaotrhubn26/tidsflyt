import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import type { InsertTimeEntry } from "@shared/schema";
import { getUncachableGitHubClient } from "./github";
import { registerSmartTimingRoutes } from "./smartTimingRoutes";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Skip seeding when using external database
  if (!process.env.EXTERNAL_DATABASE_URL) {
    try {
      await storage.seedData();
      console.log("Database initialization complete");
    } catch (error) {
      console.error("Database seed error:", error);
    }
  } else {
    console.log("Connected to external database - skipping seed");
  }
  
  // Register Smart Timing API routes
  registerSmartTimingRoutes(app);
  
  app.get("/api/github/repos", async (req, res) => {
    try {
      const octokit = await getUncachableGitHubClient();
      const { data } = await octokit.repos.listForAuthenticatedUser({
        sort: 'updated',
        per_page: 100
      });
      res.json(data.map(r => ({ name: r.name, full_name: r.full_name, description: r.description, html_url: r.html_url })));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/stats", async (req, res) => {
    try {
      const { range } = req.query;
      const stats = await storage.getStats(range as string);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/users", async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users.map(u => ({ ...u, password: undefined })));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ ...user, password: undefined });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.updateUser(req.params.id, req.body);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ ...user, password: undefined });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/time-entries", async (req, res) => {
    try {
      const { userId, startDate, endDate, status } = req.query;
      const entries = await storage.getTimeEntries({
        userId: userId as string,
        startDate: startDate as string,
        endDate: endDate as string,
        status: status as string,
      });
      res.json(entries);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/time-entries", async (req, res) => {
    try {
      const { userId, caseNumber, description, hours, date, status, createdAt } = req.body;
      const entry = await storage.createTimeEntry({
        userId,
        caseNumber,
        description,
        hours,
        date,
        status: status || 'pending',
        createdAt: createdAt || new Date().toISOString(),
      });
      await storage.createActivity({
        userId,
        action: "time_logged",
        description: `Registrerte ${hours} timer: ${description}`,
        timestamp: new Date().toISOString(),
      });
      res.status(201).json(entry);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/time-entries/:id", async (req, res) => {
    try {
      const entry = await storage.updateTimeEntry(req.params.id, req.body);
      if (!entry) return res.status(404).json({ error: "Entry not found" });
      res.json(entry);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/time-entries/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteTimeEntry(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Entry not found" });
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/activities", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const activities = await storage.getActivities(limit);
      const users = await storage.getAllUsers();
      const userMap = new Map(users.map(u => [u.id, u]));
      
      const enriched = activities.map(a => ({
        ...a,
        userName: userMap.get(a.userId)?.name || "Ukjent bruker",
      }));
      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/reports", async (req, res) => {
    try {
      const { startDate, endDate, userId, status } = req.query;
      const entries = await storage.getTimeEntries({
        userId: userId as string,
        startDate: startDate as string,
        endDate: endDate as string,
        status: status as string,
      });
      const users = await storage.getAllUsers();
      const userMap = new Map(users.map(u => [u.id, u]));
      
      const reports = entries.map(e => ({
        ...e,
        userName: userMap.get(e.userId)?.name || "Ukjent",
        department: userMap.get(e.userId)?.department || "-",
      }));
      
      res.json(reports);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/chart-data", async (req, res) => {
    try {
      const entries = await storage.getTimeEntries({});
      const users = await storage.getAllUsers();
      
      const dayNames = ["Son", "Man", "Tir", "Ons", "Tor", "Fre", "Lor"];
      const today = new Date();
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() + 1);
      
      const hoursPerDay = Array(7).fill(0).map((_, i) => {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        const dayHours = entries
          .filter(e => e.date === dateStr)
          .reduce((sum, e) => sum + e.hours, 0);
        return { day: dayNames[(i + 1) % 7], hours: dayHours };
      });
      
      const heatmapData = entries.reduce((acc, entry) => {
        const existing = acc.find(d => d.date === entry.date);
        if (existing) {
          existing.hours += entry.hours;
        } else {
          acc.push({ date: entry.date, hours: entry.hours });
        }
        return acc;
      }, [] as { date: string; hours: number }[]);
      
      res.json({ hoursPerDay, heatmapData });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/reports/export", async (req, res) => {
    try {
      const { format, startDate, endDate, userId, status } = req.query;
      const entries = await storage.getTimeEntries({
        userId: userId as string,
        startDate: startDate as string,
        endDate: endDate as string,
        status: status as string,
      });
      const users = await storage.getAllUsers();
      const userMap = new Map(users.map(u => [u.id, u]));
      
      const data = entries.map(e => ({
        Dato: e.date,
        Bruker: userMap.get(e.userId)?.name || "Ukjent",
        Avdeling: userMap.get(e.userId)?.department || "-",
        Saksnummer: e.caseNumber || "-",
        Beskrivelse: e.description,
        Timer: e.hours,
        Status: e.status,
      }));

      if (format === "csv") {
        const headers = Object.keys(data[0] || {}).join(",");
        const rows = data.map(d => Object.values(d).map(v => `"${v}"`).join(",")).join("\n");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", "attachment; filename=rapport.csv");
        res.send(`\uFEFF${headers}\n${rows}`);
      } else if (format === "excel") {
        const headers = Object.keys(data[0] || {}).join(";");
        const rows = data.map(d => Object.values(d).map(v => `"${v}"`).join(";")).join("\n");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", "attachment; filename=rapport.xls");
        res.send(`\uFEFF${headers}\n${rows}`);
      } else if (format === "pdf") {
        const totalHours = data.reduce((sum: number, d: any) => sum + (parseFloat(d.Timer) || 0), 0);
        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Timerapport</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; }
    h1 { color: #1e40af; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #1e40af; color: white; }
    tr:nth-child(even) { background-color: #f9fafb; }
    .summary { margin-top: 20px; padding: 15px; background: #f0f9ff; border-radius: 8px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>Timerapport - Smart Timing</h1>
  <p>Generert: ${new Date().toLocaleDateString('nb-NO')}</p>
  <div class="summary">
    <strong>Totalt timer:</strong> ${totalHours.toFixed(1)} timer<br>
    <strong>Antall registreringer:</strong> ${data.length}
  </div>
  <table>
    <thead>
      <tr>${Object.keys(data[0] || {}).map(k => `<th>${k}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${data.map((d: any) => `<tr>${Object.values(d).map(v => `<td>${v}</td>`).join('')}</tr>`).join('\n')}
    </tbody>
  </table>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(html);
      } else {
        res.json(data);
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
