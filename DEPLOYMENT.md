# Tidum Hosting Guide

Tidum skal beholde eget navn, egen UI og egne juridiske sider, men driftes av Creatorhub AS.

Anbefalt produksjonsoppsett:

- `tidum.no` og `www.tidum.no` peker til Vercel
- `api.tidum.no` peker til Render
- Google OAuth bruker samme Google Cloud-prosjekt som Creatorhub (`Creatorhubn1`) med en egen OAuth web client for Tidum

## Arkitektur

- Vercel hoster frontend fra dette repoet
- Render hoster Node/Express-backend fra dette repoet
- Vercel proxier alle `/api/*`-kall videre til `https://api.tidum.no`
- Backend bruker `APP_BASE_URL=https://tidum.no`
- Google callback går til `https://tidum.no/api/auth/google/callback`

Dette gjør at brukeren alltid holder seg på Tidum-domenet, selv om API-et kjører på Render.

## Miljøvariabler

Bruk `.env.example` som utgangspunkt.

Minimum for backend:

```bash
NODE_ENV=production
DATABASE_URL=postgresql://...
SESSION_SECRET=...
JWT_SECRET=...
APP_BASE_URL=https://tidum.no
APP_URL=https://tidum.no
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://tidum.no/api/auth/google/callback
```

Vanlige tillegg:

```bash
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM_NAME=Tidum
SMTP_FROM_EMAIL=support@tidum.no
SMTP_REPLY_TO=support@tidum.no
MANAGER_EMAIL=support@tidum.no
GITHUB_TOKEN=...
```

## Google OAuth i `Creatorhubn1`

Bruk det eksisterende Google Cloud-prosjektet `Creatorhubn1`, men opprett en egen OAuth web client for Tidum.

### Consent screen

Sørg for at consent screen allerede er `External` og publisert. For Tidum bør disse URL-ene være tilgjengelige og korrekte:

- Hjemmeside: `https://tidum.no`
- Privacy: `https://tidum.no/personvern`
- Terms: `https://tidum.no/vilkar`

Hvis du vil bruke engelske lenker i Google senere, finnes det også alias-ruter:

- `https://tidum.no/privacy-policy`
- `https://tidum.no/terms-and-conditions`

### OAuth client

Opprett en ny **Web application** client i samme prosjekt med:

Authorized JavaScript origins:

- `https://tidum.no`
- `https://www.tidum.no`
- `http://localhost:5000`

Authorized redirect URIs:

- `https://tidum.no/api/auth/google/callback`
- `https://www.tidum.no/api/auth/google/callback`
- `http://localhost:5000/api/auth/google/callback`

Legg `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` og `GOOGLE_REDIRECT_URI` inn på Render-backenden.

## Render

Repoet inneholder nå en `render.yaml` for backend.

### Opprett service

1. Koble repoet til Render.
2. Opprett Blueprint eller en vanlig web service fra `render.yaml`.
3. Sett miljøvariablene fra `.env.example`.
4. Sett custom domain til `api.tidum.no`.

Viktige Render-innstillinger:

- Build command: `npm ci && npm run build`
- Start command: `npm run start`
- Health check: `/api/health`

### DNS for Render

I Domeneshop:

- opprett `CNAME` for `api.tidum.no`
- pek den til Render-hostnavnet tjenesten får tildelt

## Vercel

Repoet inneholder nå `vercel.json`.

### Opprett prosjekt

1. Importer repoet i Vercel.
2. La root være repo-roten.
3. Deploy.
4. Koble custom domains:
   - `tidum.no`
   - `www.tidum.no`

`vercel.json` gjør to viktige ting:

- bygger frontend til `dist/public`
- sender `/api/*` videre til `https://api.tidum.no/api/*`

### DNS for Vercel

I Domeneshop:

- pek apex-domenet `tidum.no` til Vercel etter instruksjonene i prosjektets Domain-visning
- pek `www.tidum.no` til Vercel med `CNAME`

## Lokal utvikling

Start lokalt:

```bash
npm ci
npm run build
npm run dev
```

Lokale URL-er:

- App: `http://localhost:5000`
- Google callback: `http://localhost:5000/api/auth/google/callback`

## Verifisering etter deploy

Når Vercel og Render er oppe:

1. Åpne `https://tidum.no`
2. Sjekk at `Personvern` og `Vilkår` er synlige
3. Åpne `https://tidum.no/personvern`
4. Åpne `https://tidum.no/vilkar`
5. Test `https://tidum.no/api/health`
6. Test Google-login via Tidum
7. Bekreft at callback ender tilbake på Tidum-domenet

## Notater

- Tidum-branding beholdes i produktet.
- Juridisk leverandør er `Creatorhub AS`.
- Creatorhub eier hosting og Google-prosjekt, men sluttbrukeren skal møte Tidum som produkt.
