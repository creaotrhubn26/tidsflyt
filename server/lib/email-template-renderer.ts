import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { salgEmailTemplates, type SalgEmailTemplate } from "@shared/schema";
import { loadPricingSettings } from "./pricing-service";
import { getAppBaseUrl } from "./app-base-url";

// Rendrer subject/intro/title/body/cta-label/cta-url med {{placeholders}}.
// Henter mal fra DB basert på slug. Returnerer null hvis mal mangler eller
// er deaktivert — kalleren bør håndtere fallback selv.

export interface RenderedEmail {
  template: SalgEmailTemplate;
  subject: string;
  badge: string;
  title: string;
  intro: string;
  bodyHtml: string;          // body_md → rudimentær HTML (paragrafer + bold)
  ctaLabel: string | null;
  ctaUrl: string | null;
}

function substitute(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (m, k) =>
    vars[k] !== undefined ? vars[k] : m,
  );
}

// Minimal Markdown → HTML for e-postkroppen. Støtter:
//   **bold**
//   - bullet (per linje)
//   tomme linjer = paragraf
function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(`<li>${escapeHtml(lines[i].slice(2)).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")}</li>`);
        i++;
      }
      out.push(`<ul style="margin:8px 0 16px;padding-left:22px;color:#486168;font-size:15px;line-height:1.7;">${items.join("")}</ul>`);
      continue;
    }
    // Paragraph: collect until blank/bullet
    const para: string[] = [line];
    while (
      i + 1 < lines.length &&
      lines[i + 1].trim() !== "" &&
      !lines[i + 1].startsWith("- ")
    ) {
      i++;
      para.push(lines[i]);
    }
    const text = escapeHtml(para.join(" ")).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out.push(`<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#486168;">${text}</p>`);
    i++;
  }
  return out.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function renderEmailTemplate(
  slug: string,
  vars: Record<string, string | null | undefined>,
): Promise<RenderedEmail | null> {
  const [tmpl] = await db
    .select()
    .from(salgEmailTemplates)
    .where(and(eq(salgEmailTemplates.slug, slug), eq(salgEmailTemplates.isActive, true)))
    .limit(1);
  if (!tmpl) return null;

  const settings = await loadPricingSettings();
  const merged: Record<string, string> = {
    leverandor_navn: settings.leverandorNavn || "",
    leverandor_org_nr: settings.leverandorOrgNr || "",
    leverandor_drifter_tjeneste: "Tidum",
    app_url: getAppBaseUrl(),
  };
  for (const [k, v] of Object.entries(vars)) {
    if (v != null) merged[k] = String(v);
    else merged[k] = "";
  }

  return {
    template: tmpl,
    subject: substitute(tmpl.subject, merged),
    badge: substitute(tmpl.badge, merged),
    title: substitute(tmpl.title, merged),
    intro: substitute(tmpl.intro, merged),
    bodyHtml: mdToHtml(substitute(tmpl.bodyMd, merged)),
    ctaLabel: tmpl.ctaLabel ? substitute(tmpl.ctaLabel, merged) : null,
    ctaUrl: tmpl.ctaUrl ? substitute(tmpl.ctaUrl, merged) : null,
  };
}
