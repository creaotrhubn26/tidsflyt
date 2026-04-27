-- Migration 039: DPA-mal (databehandleravtale, vedlegg 1)
--
-- Refereres i §4.2 i hovedavtalen. Kommune-/offentlige kunder krever
-- en separat databehandleravtale iht. GDPR art. 28. Lagres som en
-- ekstra rad i salg_contract_templates, ikke isDefault — admin kan
-- velge denne i kontrakt-generator-flyten ("Generer DPA").
--
-- Idempotent: ON CONFLICT på (name) hindrer dobbeltinnsats.

-- Sikre unik constraint på name (hvis den ikke finnes alt)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'idx_salg_contract_templates_name_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_salg_contract_templates_name_unique
      ON salg_contract_templates(name);
  END IF;
END$$;

INSERT INTO salg_contract_templates (name, version, body_md, is_default, is_active)
VALUES (
  'Databehandleravtale (DPA) — vedlegg 1', 1,
E'# DATABEHANDLERAVTALE\n\n*Vedlegg 1 til Abonnementsavtalen mellom {{leverandor_navn}} og {{kunde_navn}}*\n\nDenne databehandleravtalen ("DPA") inngås mellom **{{kunde_navn}}** (org.nr. {{kunde_org_nr}}), heretter "Behandlingsansvarlig", og **{{leverandor_navn}}** (org.nr. {{leverandor_org_nr}}), heretter "Databehandler", iht. personvernforordningen (GDPR) artikkel 28.\n\n## §1 Formål og avgrensning\n1.1 Avtalen regulerer Databehandlers behandling av personopplysninger på vegne av Behandlingsansvarlig i forbindelse med leveranse av SaaS-tjenesten **{{leverandor_drifter_tjeneste}}**.\n1.2 Behandlingen skjer kun for å levere tjenesten iht. hovedavtalen og dokumenterte instrukser fra Behandlingsansvarlig.\n\n## §2 Behandlingens art og omfang\n2.1 **Type personopplysninger:** kontaktinformasjon (navn, e-post, telefon), brukeridentifikatorer, aktivitetslogger, tids- og rapportdata generert i tjenesten.\n2.2 **Kategorier av registrerte:** ansatte og brukere hos Behandlingsansvarlig, samt klienter/brukere som dokumenteres i rapporter (anonymisert iht. instruks).\n2.3 **Behandlingens varighet:** så lenge hovedavtalen er aktiv + lovpålagt oppbevaringsperiode etter opphør (jf. §6).\n\n## §3 Databehandlers forpliktelser\n3.1 Behandle personopplysninger kun iht. dokumenterte instrukser fra Behandlingsansvarlig (hovedavtalen + denne DPA + skriftlige tilleggs­instrukser).\n3.2 Sørge for at personell med tilgang er taushetsbelagt eller underlagt lovbestemt taushetsplikt.\n3.3 Iverksette tekniske og organisatoriske sikkerhetstiltak iht. GDPR art. 32 — herunder kryptering i transit (TLS 1.2+) og at-rest, tilgangsstyring, logging og periodisk sikkerhetsgjennomgang.\n3.4 Bistå Behandlingsansvarlig med å besvare henvendelser fra registrerte (innsyn, retting, sletting, dataportabilitet).\n3.5 Bistå med konsekvensvurderinger (DPIA) og forhåndsdrøftelser med Datatilsynet ved behov.\n3.6 Varsle Behandlingsansvarlig **uten ugrunnet opphold** og senest innen 24 timer ved kjent eller mistenkt brudd på personopplysningssikkerhet.\n\n## §4 Underleverandører (sub-databehandlere)\n4.1 Behandlingsansvarlig gir generelt forhåndssamtykke til at Databehandler kan benytte underleverandører for hosting og driftstjenester.\n4.2 Liste over godkjente underleverandører ved avtaleinngåelse:\n- Render Inc. (web-hosting, region EU)\n- Neon Inc. (database, region EU eu-west-2)\n- Cloudflare Inc. (CDN/DNS, EU edge-noder)\n- Stripe Inc. (betaling, behandler kun fakturaringsdata)\n4.3 Endringer (nye eller fjernede underleverandører) varsles minst 30 dager i forveien. Behandlingsansvarlig kan motsette seg endringen skriftlig innen fristen.\n4.4 Databehandler er ansvarlig for at underleverandører er bundet av tilsvarende databehandleravtale.\n\n## §5 Overføring til tredjeland\n5.1 Personopplysninger oppbevares og behandles innenfor EU/EØS.\n5.2 Eventuell overføring til tredjeland skjer kun ved bruk av EU-Kommisjonens standardkontrakter (SCC) og dokumentert risikovurdering (TIA).\n\n## §6 Sletting og retur av data\n6.1 Ved opphør av hovedavtalen får Behandlingsansvarlig all data eksportert i strukturert maskinlesbart format (JSON/CSV) innen 30 dager.\n6.2 Etter ytterligere 60 dager slettes all kunde-data permanent fra produksjons- og backup-systemer, med mindre lov pålegger lengre oppbevaring.\n6.3 Sletteattest utstedes på forespørsel.\n\n## §7 Revisjonsrett\n7.1 Behandlingsansvarlig har rett til å revidere Databehandlers etterlevelse av DPA — én gang per år, eller oftere ved konkret mistanke om brudd.\n7.2 Revisjonen kan skje ved (a) skriftlig spørreskjema, (b) gjennomgang av Databehandlers ISMS-/sikkerhets­dokumentasjon, eller (c) fysisk besøk etter forhåndsavtale.\n7.3 Databehandler dekker egne kostnader; Behandlingsansvarlig dekker egne reise- og personalkostnader.\n\n## §8 Ansvar og erstatning\n8.1 Hver part er ansvarlig overfor registrerte og tilsynsmyndigheter iht. GDPR for sin del av behandlingen.\n8.2 Internt mellom partene gjelder ansvarsbegrensningen i hovedavtalens §7.\n\n## §9 Endringer\nEndringer i denne DPA krever skriftlig enighet. Ved motstrid mellom denne DPA og hovedavtalen, går denne DPA foran på personvernspørsmål.\n\n## §10 Lovvalg og verneting\nNorsk rett. Verneting: {{leverandor_lovvalg_by}} tingrett.\n\n---\n\nSted/dato: ___________________     Sted/dato: ___________________\n\nFor {{leverandor_navn}}                For {{kunde_navn}}\n\n___________________                    ___________________\n',
  FALSE, TRUE
)
ON CONFLICT (name) DO NOTHING;
