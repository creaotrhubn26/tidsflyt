# Runbook — Routing-backend for auto-kjøregodt

Tidum bruker en *pluggable* distance-provider for å regne ut kjørestrekning
fra miljøarbeiderens GPS-posisjon til sakens registrerte arbeidssted.
Provider-rekkefølge ved hvert kall:

1. **Vegvesen** — stub (ikke implementert ennå)
2. **OpenRouteService (ORS)** — managed, EU-hosted, GDPR-trygg
3. **OSRM** — open-source, self-hosted eller offentlig demo
4. **Haversine** — luftlinje, alltid tilgjengelig som siste fallback

Den første som er konfigurert OG svarer, vinner. Hvis ingen routing-provider
er konfigurert eller alle feiler, faller systemet automatisk tilbake til
Haversine. Da viser `travel_legs.calculated_by` feltet hvilken provider som
faktisk ble brukt — nyttig når miljøarbeider klager over feil km.

---

## Velg riktig oppsett for din skala

| Antall miljøarbeidere | Anbefalt provider | Pris/mnd | Oppsett-tid |
|---|---|---|---|
| 1–5 (under 200 kjøreturer/dag) | OpenRouteService gratis | 0 kr | 10 min |
| 5–20 (under 2000 kjøreturer/dag) | OpenRouteService gratis | 0 kr | 10 min |
| 20+ eller offline-krav | Self-hosted OSRM | ~50–100 kr (Hetzner-VM) | 30 min |
| Spesielle krav (norsk høyfjell-data, lukkede veier) | Statens vegvesen — vent på spec | ? | ? |

**Fremgangsmåte under er rangert fra letteste til mest robuste.**

---

## Vei 1 — OpenRouteService (anbefalt for de fleste)

OpenRouteService er drevet av Heidelberg-universitetet, hostet i EU,
GDPR-trygt, og har en romslig gratis-tier.

### Steg 1: Registrer en konto
1. Gå til <https://openrouteservice.org/dev/#/signup>
2. Bekreft e-post
3. Logg inn → "Profile" → "Request a token"
4. Velg "Free" plan (2000 requests/dag, 40/min)
5. Kopier API-nøkkelen (ser ut som `5b3ce3597851110001cf6248...`)

### Steg 2: Sett env-vars i Render
1. Render-dashboard → ditt service → "Environment"
2. Legg til:
   ```
   ORS_API_KEY=<din-nøkkel-fra-steg-1>
   ```
3. (Valgfritt) `ORS_BASE_URL` hvis du senere vil pekke på en self-hosted ORS:
   ```
   ORS_BASE_URL=https://api.openrouteservice.org
   ```
   (default = den offentlige hosted-tjenesten)
4. Trykk "Save changes" → tjenesten restarter

### Steg 3: Verifiser
Etter restart, kjør en stempling i prod (eller via runbook'en for
auto-kjøregodt). Sjekk i Neon at `travel_legs.calculated_by = 'ors'`:

```sql
SELECT id, kilometers, calculated_by, source, created_at
FROM travel_legs
ORDER BY created_at DESC
LIMIT 5;
```

Hvis du ser `'ors'` — ferdig. ORS er nå primær routing-backend.
Hvis du ser `'haversine'` — sjekk Render-loggen for `[distance-provider] ors failed` og verifiser nøkkelen.

### Når det blir for trangt
- 2000/dag rekker rundt **20 aktive miljøarbeidere** med 5 oppdrag/dag hver.
- Når dere kommer dit, oppgrader til ORS Pro (~199 €/mnd for 50k/dag) ELLER bytt til self-hosted OSRM (vei 2 under).

---

## Vei 2 — Self-hosted OSRM (full kontroll, null tredjepart)

For prod med høyt volum eller skjerpede personvernkrav (kommune,
barnevern). OSRM kjøres som Docker-container på en VPS med norsk
OpenStreetMap-data.

### Velg en VPS
**Anbefalt: Hetzner Cloud CX22** (4 GB RAM, 40 GB disk, EU-data-senter Falkenstein)
- ~50 NOK/måned
- Tysk operatør, GDPR-trygt
- 20 TB trafikk inkludert

Alternativer: DigitalOcean (~80 NOK/mnd), Linode, eller en Render Background Worker (men dyrt).

### Steg 1: Provisjoner serveren
```bash
# På din lokale maskin — bruk SSH til Hetzner-VM-en din
ssh root@<din-vm-ip>

# Installer Docker
apt update && apt install -y docker.io docker-compose-plugin
systemctl enable --now docker
```

### Steg 2: Last ned norsk OSM-data
```bash
mkdir -p /opt/osrm && cd /opt/osrm
wget https://download.geofabrik.de/europe/norway-latest.osm.pbf
```
Filstørrelse: ~700 MB. Tar 1–2 min å laste ned.

### Steg 3: Bygg routing-grafen (én-gangs jobb, ~30 min)
```bash
cd /opt/osrm

# Bilkjøring-profil (alternativer: bicycle, foot)
docker run --rm -v "$(pwd):/data" osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/norway-latest.osm.pbf

docker run --rm -v "$(pwd):/data" osrm/osrm-backend \
  osrm-partition /data/norway-latest.osrm

docker run --rm -v "$(pwd):/data" osrm/osrm-backend \
  osrm-customize /data/norway-latest.osrm
```
Etter dette har du `norway-latest.osrm.*` filer. Bevar disse.

### Steg 4: Start OSRM-tjenesten
Lag `/opt/osrm/docker-compose.yml`:
```yaml
services:
  osrm:
    image: osrm/osrm-backend
    restart: always
    ports:
      - "127.0.0.1:5000:5000"
    volumes:
      - /opt/osrm:/data
    command: osrm-routed --algorithm mld /data/norway-latest.osrm
```

Start:
```bash
cd /opt/osrm && docker compose up -d
```

Verifiser at den svarer (Oslo S → Majorstuen):
```bash
curl 'http://127.0.0.1:5000/route/v1/driving/10.7528,59.9113;10.7152,59.9295?overview=false'
# Forvent: { "code": "Ok", "routes": [{"distance": ..., "duration": ...}] }
```

### Steg 5: Eksponér via reverse proxy (Caddy — enkleste)
```bash
apt install -y caddy
```

Edit `/etc/caddy/Caddyfile`:
```
osrm.tidum.no {
  reverse_proxy 127.0.0.1:5000

  # Begrens tilgang til kun Tidum-serveren (din Render outbound-IP)
  # Fyll inn din Render outbound-IP — finnes under Settings → Outbound IPs
  @blocked not remote_ip <din-render-outbound-ip>
  respond @blocked 403
}
```

Pek DNS `osrm.tidum.no` på VPS-en. Caddy henter Let's Encrypt automatisk.

```bash
systemctl restart caddy
```

### Steg 6: Konfigurér Tidum
Render env:
```
OSRM_BASE_URL=https://osrm.tidum.no
```
(Fjern `ORS_API_KEY` hvis du vil tvinge OSRM som primær — eller behold ORS som backup hvis OSRM faller.)

### Steg 7: Hold OSM-data oppdatert
Geofabrik publiserer ny extract daglig. Lag en cron som oppdaterer ukentlig:

`/opt/osrm/refresh.sh`:
```bash
#!/usr/bin/env bash
set -e
cd /opt/osrm
wget -O norway-latest.new.osm.pbf https://download.geofabrik.de/europe/norway-latest.osm.pbf
docker run --rm -v "$(pwd):/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/norway-latest.new.osm.pbf
docker run --rm -v "$(pwd):/data" osrm/osrm-backend osrm-partition /data/norway-latest.new.osrm
docker run --rm -v "$(pwd):/data" osrm/osrm-backend osrm-customize /data/norway-latest.new.osrm
mv -f norway-latest.new.osm.pbf norway-latest.osm.pbf
for f in norway-latest.new.osrm*; do mv -f "$f" "${f/.new/}"; done
docker compose restart osrm
```

```bash
chmod +x /opt/osrm/refresh.sh
echo "0 3 * * 0 /opt/osrm/refresh.sh >> /var/log/osrm-refresh.log 2>&1" | crontab -
```

Hver søndag kl 03:00 oppdateres routing-grafen automatisk.

---

## Verifisering — hvilken provider brukes?

I prod, kjør:
```sql
SELECT calculated_by, COUNT(*) AS legs, ROUND(AVG(kilometers), 1) AS avg_km
FROM travel_legs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY calculated_by;
```

Forventet etter ORS-oppsett:
```
calculated_by | legs | avg_km
--------------+------+--------
ors           |  142 | 6.4
haversine     |   3  | 4.8     -- ORS var nede 3 ganger, fall-back kicked in
```

Hvis du ser kun `haversine`, er ingen routing-provider konfigurert eller alle feiler. Sjekk Render-loggen for `[distance-provider]`-warnings.

---

## Fremtid: Statens vegvesen-integrasjon

`VEGVESEN_API_KEY`-env er reservert for hvis/når Statens vegvesen
publiserer et offentlig routing-API. Per i dag har de:
- **NVDB** (Nasjonal vegdatabank) — gir nettverksdata, ikke routing
- **Vegkart** — visualizer, ingen API-til-API

Når et premium-endepunkt foreligger, oppdater `VegvesenProviderStub` i
`server/lib/distance-provider.ts` med en faktisk klient.

---

## Vanlige problemer

| Symptom | Årsak | Løsning |
|---|---|---|
| Alle legs bruker `haversine` | Ingen API-key satt | Sett `ORS_API_KEY` i Render |
| ORS gir 401 | Feil eller utløpt nøkkel | Generer ny på openrouteservice.org/dev |
| ORS gir 429 | Daglig kvote oppbrukt | Vent til dagen rulles, eller bytt til OSRM |
| OSRM-self-host: krasj på 4 GB RAM | Norge-extract trenger 4 GB peak | Oppgrader til CX32 (8 GB) eller bygg uten `osrm-customize` |
| OSRM gir 400 på kjente punkter | Sjøkoordinater (off-road) | Sjekk at klient-adressen ikke ligger i sjø/myr — bruk Kartverket-søk |

---

*Sist oppdatert: 2026-04-25 — første runbook for routing-backend.*
