from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

out_dir = Path('/Users/usmanqazi/tidum/tidsflyt/output/pdf')
out_dir.mkdir(parents=True, exist_ok=True)

png_path = out_dir / 'tidsflyt-onepager-imagegen.png'
pdf_path = out_dir / 'tidsflyt-onepager-imagegen.pdf'

W, H = 2480, 3508
img = Image.new('RGB', (W, H), '#f7faf9')
d = ImageDraw.Draw(img)

try:
    title_font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 86)
    h1_font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 44)
    body_font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 31)
    small_font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 26)
except Exception:
    title_font = ImageFont.load_default()
    h1_font = ImageFont.load_default()
    body_font = ImageFont.load_default()
    small_font = ImageFont.load_default()

margin = 120
content_w = W - margin * 2

d.rounded_rectangle((margin, 70, W-margin, 350), radius=42, fill='#0f3d46')
d.text((margin+50, 120), 'Tidsflyt - One-Page App Summary', font=title_font, fill='white')
d.text((margin+52, 245), 'Repository: creaotrhubn26/tidsflyt', font=small_font, fill='#d6ecf0')

y = 410

def wrap_text(text, font, max_width):
    words = text.split()
    lines = []
    line = ''
    for w in words:
        t = (line + ' ' + w).strip()
        if d.textlength(t, font=font) <= max_width:
            line = t
        else:
            lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines

def draw_section(title, lines, bullet=False, box='#ffffff', border='#d5e5e1'):
    global y
    inner_pad = 34
    title_h = 56
    text_lines = []
    if bullet:
        for line in lines:
            wrapped = wrap_text(line, body_font, content_w - inner_pad*2 - 40)
            for i, wl in enumerate(wrapped):
                text_lines.append(('• ' + wl) if i == 0 else ('  ' + wl))
    else:
        for line in lines:
            text_lines.extend(wrap_text(line, body_font, content_w - inner_pad*2))

    h = inner_pad + title_h + len(text_lines)*44 + inner_pad
    d.rounded_rectangle((margin, y, W-margin, y+h), radius=28, fill=box, outline=border, width=3)
    d.text((margin+inner_pad, y+inner_pad-6), title, font=h1_font, fill='#143e47')

    ty = y + inner_pad + title_h
    for line in text_lines:
        d.text((margin+inner_pad, ty), line, font=body_font, fill='#2a4c53')
        ty += 44

    y += h + 26

draw_section('What it is', [
    'Tidsflyt is a full-stack web app for workforce time tracking, case reporting, and role-based operations.',
    'It also includes a CMS/blog stack for public pages, forms, SEO, and publishing.'
])

draw_section("Who it\'s for", [
    'Primary users are staff, team leads, and admins in service organizations coordinating follow-up and documentation.',
    'Explicit product-team persona naming: Not found in repo.'
])

draw_section('What it does', [
    'Time tracking with create/list/delete, bulk registration, chart/report views, and exports.',
    'Live timer session persistence (elapsed, paused, running) for cross-session continuity.',
    'Case-report workflow: draft/edit/submit, threaded comments, unread count, approval/rejection/feedback.',
    'Role-based route/API access for super admin, vendor admin, team roles, and members.',
    'Vendor API management with enablement, key lifecycle, and vendor-scoped controls.',
    'CMS/blog features: builder pages, templates, versions, media, forms, SEO, analytics, and posts.'
], bullet=True)

draw_section('How it works (repo-evidenced architecture)', [
    'Frontend: React + Vite SPA with lazy routes, React Query, ThemeProvider, and AuthGuard gates.',
    'Backend: Express app with modular routes (core routes + SmartTiming routes + vendor API router).',
    'Auth: Passport Google OAuth + Postgres-backed sessions, with JWT paths for admin APIs.',
    'Data: PostgreSQL via node-postgres + Drizzle ORM with shared schema types.',
    'Flow: UI -> /api handlers -> auth/validation -> DB -> JSON -> React Query state.'
], bullet=True)

draw_section('How to run (minimal)', [
    '1) Copy .env.example to .env and set DATABASE_URL + SESSION_SECRET (OAuth keys optional).',
    '2) npm install',
    '3) npm run db:push',
    '4) npm run dev (default PORT 5000 serves API + client).'
], bullet=True, box='#f2f8f6')

d.text((margin, H-90), 'Generated with image-first one-pager layout.', font=small_font, fill='#5f767b')

img.save(png_path)

c = canvas.Canvas(str(pdf_path), pagesize=A4)
a4_w, a4_h = A4
c.drawImage(str(png_path), 0, 0, width=a4_w, height=a4_h)
c.showPage()
c.save()

print(f'PNG: {png_path}')
print(f'PDF: {pdf_path}')
