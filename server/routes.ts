import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getUncachableGitHubClient } from "./github";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Get list of user's GitHub repositories
  app.get("/api/github/repos", async (req, res) => {
    try {
      const octokit = await getUncachableGitHubClient();
      const { data } = await octokit.repos.listForAuthenticatedUser({
        sort: 'updated',
        per_page: 100
      });
      res.json(data);
    } catch (error: any) {
      console.error("GitHub API error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch repositories" });
    }
  });

  // Get repository contents (files/folders)
  app.get("/api/github/repos/:owner/:repo/contents/*", async (req, res) => {
    try {
      const octokit = await getUncachableGitHubClient();
      const { owner, repo } = req.params;
      const path = req.params[0] || '';
      
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path
      });
      res.json(data);
    } catch (error: any) {
      console.error("GitHub API error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch contents" });
    }
  });

  // Get repository root contents
  app.get("/api/github/repos/:owner/:repo/contents", async (req, res) => {
    try {
      const octokit = await getUncachableGitHubClient();
      const { owner, repo } = req.params;
      
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path: ''
      });
      res.json(data);
    } catch (error: any) {
      console.error("GitHub API error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch contents" });
    }
  });

  return httpServer;
}
