from __future__ import annotations

from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas


def wrap_text(text: str, font_name: str, font_size: float, width: float) -> list[str]:
    words = text.split()
    if not words:
        return [""]

    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if pdfmetrics.stringWidth(candidate, font_name, font_size) <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def draw_paragraph(
    c: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    width: float,
    font_name: str,
    font_size: float,
    leading: float,
) -> float:
    lines = wrap_text(text, font_name, font_size, width)
    c.setFont(font_name, font_size)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def draw_bullet(
    c: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    width: float,
    font_name: str,
    font_size: float,
    leading: float,
) -> float:
    bullet = "- "
    bullet_width = pdfmetrics.stringWidth(bullet, font_name, font_size)
    wrapped = wrap_text(text, font_name, font_size, width - bullet_width)

    c.setFont(font_name, font_size)
    if wrapped:
        c.drawString(x, y, bullet)
        c.drawString(x + bullet_width, y, wrapped[0])
        y -= leading
        for line in wrapped[1:]:
            c.drawString(x + bullet_width, y, line)
            y -= leading
    return y


def build_single_page_pdf(output_path: Path) -> None:
    width, height = letter
    margin = 48
    content_width = width - (margin * 2)

    title = "Tidum App Summary (Repo-based)"

    sections = [
        (
            "What it is",
            [
                "Tidum is a web app for logging work time, managing workforce workflows, and handling case-report processes.",
                "The codebase combines a React frontend with Express APIs and PostgreSQL/Drizzle storage.",
            ],
            False,
        ),
        (
            "Who it is for",
            [
                "Primary persona (inferred from role model and pages): Norwegian operations teams where staff log hours/case work and team leads/admins review operations.",
                "Formal persona document: Not found in repo.",
            ],
            False,
        ),
        (
            "What it does",
            [
                "Track time with live timer, manual entry, bulk entry, and CRUD endpoints.",
                "View dashboard stats, activity feed, and chart analytics.",
                "Handle leave, overtime, recurring entries, and invoices (including invoice PDF endpoint).",
                "Manage case reports through draft, submit, review, approve/reject, and comment states.",
                "Use role-based auth and admin controls, including vendor API key management and /api/v1/vendor/* access.",
                "Edit public content in CMS: builder pages, blog, forms, media, SEO, versions, and scheduling.",
            ],
            True,
        ),
        (
            "How it works (architecture)",
            [
                "Client: React + Wouter (client/src/App.tsx) with TanStack Query (client/src/lib/queryClient.ts).",
                "Server: Express app in server/index.ts wires registerRoutes, registerSmartTimingRoutes, and vendorApi.",
                "Data: PostgreSQL (pg pool) + Drizzle in server/db.ts with shared tables in shared/schema.ts.",
                "Flow: Browser -> /api/* routes + middleware -> Drizzle queries -> JSON -> React Query cache -> UI.",
            ],
            True,
        ),
        (
            "How to run (minimal)",
            [
                "Prereqs: Node.js 20+ and PostgreSQL 14+ (CONTRIBUTING.md).",
                "npm install",
                "cp .env.example .env, then set at least DATABASE_URL and SESSION_SECRET.",
                "npm run db:push",
                "npm run dev, then open http://localhost:5000",
            ],
            True,
        ),
    ]

    # Try several scale factors to guarantee one-page fit.
    for scale in [1.0, 0.96, 0.93, 0.9]:
        c = canvas.Canvas(str(output_path), pagesize=letter)
        y = height - margin

        title_size = 24 * scale
        heading_size = 13.5 * scale
        body_size = 11.0 * scale
        title_leading = 28 * scale
        heading_leading = 17 * scale
        body_leading = 13.6 * scale
        section_gap = 8 * scale

        c.setTitle("Tidum App Summary")

        c.setFillColor(colors.HexColor("#132031"))
        c.setFont("Helvetica-Bold", title_size)
        c.drawString(margin, y, title)
        y -= title_leading

        c.setStrokeColor(colors.HexColor("#D8DEE9"))
        c.setLineWidth(1)
        c.line(margin, y + 4, width - margin, y + 4)
        y -= 8 * scale

        y -= 1 * scale

        overflow = False

        for section_title, lines, as_bullets in sections:
            c.setFillColor(colors.HexColor("#163B5A"))
            c.setFont("Helvetica-Bold", heading_size)
            c.drawString(margin, y, section_title)
            y -= heading_leading

            c.setFillColor(colors.black)
            for line in lines:
                if as_bullets:
                    y = draw_bullet(
                        c,
                        line,
                        margin,
                        y,
                        content_width,
                        "Helvetica",
                        body_size,
                        body_leading,
                    )
                else:
                    y = draw_paragraph(
                        c,
                        line,
                        margin,
                        y,
                        content_width,
                        "Helvetica",
                        body_size,
                        body_leading,
                    )

            y -= section_gap

            if y < margin + 8:
                overflow = True
                break

        if not overflow:
            c.save()
            return

        c.save()

    # If everything overflows, keep the smallest scale output anyway.
    return


def main() -> None:
    output_path = Path("output/pdf/tidum-app-summary.pdf")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    build_single_page_pdf(output_path)
    print(output_path.resolve())


if __name__ == "__main__":
    main()
