#!/usr/bin/env node

const renderApiBase = process.env.TIDUM_RENDER_API_BASE || "https://api.render.com/v1";
const renderServiceId = process.env.TIDUM_RENDER_SERVICE_ID || "srv-d79heff5r7bs73frlj7g";
const renderApiKey = process.env.TIDUM_RENDER_API_KEY || "";
const shouldRequireDeploy = (process.env.TIDUM_REQUIRE_RENDER_DEPLOY || "1") !== "0";

const isVercelBuild = process.env.VERCEL === "1" || process.env.VERCEL === "true";
const isProductionDeploy = process.env.VERCEL_ENV === "production";

if (!isVercelBuild || !isProductionDeploy) {
  console.log("[render-trigger] Skipping Render trigger outside Vercel production deploys.");
  process.exit(0);
}

if (!renderApiKey) {
  const message = "[render-trigger] Missing TIDUM_RENDER_API_KEY in Vercel production environment.";
  if (shouldRequireDeploy) {
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
  process.exit(0);
}

const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || "unknown";
const branch = process.env.VERCEL_GIT_COMMIT_REF || "unknown";

console.log(
  `[render-trigger] Triggering Render deploy for ${renderServiceId} from commit ${commitSha} on ${branch}.`,
);

const response = await fetch(`${renderApiBase}/services/${renderServiceId}/deploys`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${renderApiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    clearCache: "do_not_clear",
  }),
});

const rawBody = await response.text();

if (!response.ok) {
  const message = `[render-trigger] Failed to create Render deploy (${response.status}): ${rawBody}`;
  if (shouldRequireDeploy) {
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
  process.exit(0);
}

let deploy;

try {
  deploy = JSON.parse(rawBody);
} catch (error) {
  const message = `[render-trigger] Render returned invalid JSON: ${rawBody}`;
  if (shouldRequireDeploy) {
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
  process.exit(0);
}

console.log(
  `[render-trigger] Created Render deploy ${deploy.id || "unknown"} with status ${deploy.status || "unknown"}.`,
);
