# Hemmelighetshvelv og nøkkelrotasjonsøvelse

## Formål og leveransegrense

Tidum er systemleverandør og har ansvar for at applikasjonen aldri skriver
integrasjonshemmeligheter i klartekst, at nøkkeltilgang følger minste
privilegium, og at rotasjon kan gjennomføres og dokumenteres. Halden må
godkjenne driftsplattform, datalokasjon, tilgangsmodell og eventuell kundeeid
nøkkel før produksjon.

Runbooken beskriver applikasjonsgrensen som nå er implementert. Den er ikke i
seg selv bevis på at Render eller en fremtidig norsk plattform er et godkjent
hemmelighetshvelv.

## Støttede hvelvgrenser

Hvelvet eller plattformens secret-mekanisme skal levere nøkkelringen på én av
to måter:

1. `TIDUM_SECRET_KEYRING` som hvelv-injisert runtime-miljøverdi; eller
2. `TIDUM_SECRET_KEYRING_FILE` som absolutt sti til en montert JSON-fil.

Kildene er gjensidig utelukkende. Filen må være en vanlig fil, maksimalt 64
KiB og i produksjon ikke lesbar for gruppe/andre (bruk normalt `0400` eller
`0600`). Dette passer blant annet hvelv-sidecar eller CSI-mount uten at
applikasjonen bindes til Azure, AWS eller Kubernetes. Aktiv versjon velges med
`TIDUM_SECRET_ACTIVE_KEY_ID`.

`TIDUM_SECRET_KEY` er bare en midlertidig dekrypteringsnøkkel for `enc:v1`.
Produksjon starter ikke med denne alene; en versjonert nøkkelring og eksplisitt
aktiv nøkkel-ID er obligatorisk.

## Fail-closed oppstart og readiness

Før migrasjoner, ruter, cronjobber og lyttesocket validerer serveren
nøkkelringen. Produksjonsoppstart avbrytes ved:

- manglende eller ugyldig nøkkelring;
- både miljø- og filkilde samtidig;
- relativ, for stor eller for åpent tilgjengelig fil;
- manglende eksplisitt aktiv nøkkel eller ukjent nøkkel-ID;
- legacy-only oppsett.

`GET /api/health` returnerer bare grov status (`database`/`secrets`) og 503 ved
runtime-feil. Den eksponerer ikke filsti, nøkkel-ID, nøkkelantall eller rå
backendfeil. Ordinær produksjonslesing av en klarteksthemmelighet avvises; bare
den avgrensede ompakkingfunksjonen kan lese en legacy-verdi og må skrive den
forseglet før videre bruk.

## Kontroll før rotasjon

Global system-`super_admin` henter hemmelighetsfri status:

```http
GET /api/admin/security/secret-runtime
```

Responsen viser kilde, aktiv nøkkel-ID, antall nøkkelversjoner og aggregerte
resttall for sikker dialog, arkiv, FIKS og PowerOffice. Den returnerer aldri
hemmelighetsverdier eller chiffertekst.

Kontroller også:

- godkjent endringssak og to-personers kontroll;
- backup og dokumentert rollback-vindu;
- at gammel og ny nøkkel finnes i hvelvet;
- at ny nøkkel er minst 32 tilfeldige bytes og har en unik, ikke-hemmelig ID;
- alarm, tilgangslogg og break-glass i valgt hvelv.

## To-faset rotasjon

1. Legg gammel og ny versjon i nøkkelringen, med gammel fortsatt aktiv.
2. Deploy og kontroller `/api/health` og runtime-status.
3. Bytt `TIDUM_SECRET_ACTIVE_KEY_ID` til ny versjon og deploy.
4. Start en avgrenset batch:

```http
POST /api/admin/security/rotate-secrets
Content-Type: application/json

{"confirm":"ROTATE","limit":100}
```

5. Gjenta til alle felter i `remaining` er 0.
6. Les representative dialoger og test arkiv-, FIKS- og PowerOffice-koblinger
   som faktisk er aktivert i miljøet.
7. Vent ut rollback-vinduet før gammel nøkkel fjernes.

Hver manuell og planlagt kjøring får en `runId` og en append-only rad i
`tidum_secret_rotation_runs`. Raden inneholder operatør-ID, aktiv nøkkel-ID,
status, aggregerte roterte/resttall og eventuelt en generisk feilkode – aldri
hemmeligheter. Migrasjon 082 gjør UPDATE og DELETE av audit-rader umulig.

## Rollback og feil

- Hvis dekryptering feiler: legg gammel nøkkelversjon tilbake; ikke omskriv
  konvolutter manuelt.
- Hvis rotasjonen stopper delvis: behold begge nøkler og kjør samme idempotente
  batch på nytt.
- Hvis audit ikke kan lagres: operasjonen rapporteres ikke som vellykket.
  Kontroller inventory, database og migrasjon 082 før ny kjøring.
- Ikke fjern en gammel nøkkel før `remaining` er 0 og representative lesetester
  er signert.

## Akseptansebevis

Produksjonsprotokollen skal minst inneholde endrings-ID, tidspunkt, operatører,
hvelv/region, gammel og ny nøkkel-ID, `runId`, før-/etter-inventory,
readiness-resultat, representative lesetester, rollbacktest og godkjenning.
Ingen skjermdump eller logg skal inneholde nøkkelverdier.

Fortsatt ekstern restanse: valg og avtale for norsk/akseptert KMS/hvelv,
plattform-RBAC, alarm/tilgangsreview, backup/restore av nøkkelmateriale og en
signert øvelse i det faktiske produksjonsmiljøet.
