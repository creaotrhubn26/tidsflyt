/**
 * server/lib/turnus-xai.ts
 *
 * Explainability (XAI) for a generated turnus. The STRUCTURED explanation is
 * deterministic and network-free — it narrates the solver's own recorded facts
 * (objective weights + deviations + status), never invents. An OPTIONAL OpenAI
 * pass rewrites that structured summary into flowing Norwegian; when no API key
 * is configured (or the call fails) it falls back to the deterministic summary,
 * so the feature works fully offline.
 *
 * Mirrors the OpenAI-guard pattern in sakerRapportRoutes.ts.
 */

import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const DIM_LABEL: Record<string, string> = {
  onske: 'ansattes ønsker',
  helgefrekvens: 'rettferdig helgefordeling',
  rettferdighet: 'rettferdig vaktfordeling',
  kontinuitet: 'kontinuitet for brukere',
  kostnad: 'kostnadseffektivitet',
};

export interface GenereringForklaringInput {
  status: string; // fullfort | infeasible | feilet
  /** Weight dimensions plus non-numeric context (e.g. anvendteRegler). */
  objektivJson: Record<string, unknown>;
  solveTidMs: number | null;
  avvik: Array<{ type: string; alvor: string; referanse: string | null; forklaring: string }>;
}

export interface StrukturertForklaring {
  status: string;
  prioriteringer: Array<{ dimensjon: string; etikett: string; vekt: number }>;
  uoppfylte: Array<{ type: string; forklaring: string }>;
  konflikter: Array<{ referanse: string | null; forklaring: string }>;
  sammendrag: string;
}

/** Deterministic structured explanation built purely from recorded solver facts. */
export function byggForklaring(input: GenereringForklaringInput): StrukturertForklaring {
  // objektiv_json also carries non-numeric context (anvendteRegler); only the
  // numeric weight dimensions are priorities.
  const prioriteringer = Object.entries(input.objektivJson ?? {})
    .filter(([, vekt]) => typeof vekt === 'number' && Number.isFinite(vekt))
    .map(([dimensjon, vekt]) => ({
      dimensjon,
      etikett: DIM_LABEL[dimensjon] ?? dimensjon,
      vekt: Number(vekt),
    }))
    .sort((a, b) => b.vekt - a.vekt);

  const konflikter = input.avvik
    .filter((a) => a.type === 'infeasible_constraint')
    .map((a) => ({ referanse: a.referanse, forklaring: a.forklaring }));
  const uoppfylte = input.avvik
    .filter((a) => a.type !== 'infeasible_constraint')
    .map((a) => ({ type: a.type, forklaring: a.forklaring }));

  let sammendrag: string;
  if (input.status === 'fullfort') {
    const topp = prioriteringer.slice(0, 3).map((p) => p.etikett).join(', ');
    const tid = input.solveTidMs != null ? ` (${input.solveTidMs} ms)` : '';
    const uoppfyltDel = uoppfylte.length
      ? ` ${uoppfylte.length} ønske/mål kunne ikke oppfylles fullt ut.`
      : ' Alle harde krav og prioriterte hensyn ble oppfylt.';
    sammendrag = `Turnusen ble generert${tid}. Prioriteringene som styrte forslaget: ${topp || 'ingen vektlagt'}.${uoppfyltDel}`;
  } else if (input.status === 'infeasible') {
    const k = konflikter.length
      ? ` Årsak: ${konflikter.map((c) => c.forklaring).join(' ')}`
      : '';
    sammendrag = `Det finnes ingen lovlig turnus som oppfyller alle harde krav (dekning, kompetanse, arbeidsmiljøloven).${k}`;
  } else {
    sammendrag = 'Genereringen kunne ikke fullføres på grunn av en teknisk feil.';
  }

  return { status: input.status, prioriteringer, uoppfylte, konflikter, sammendrag };
}

/**
 * Optional OpenAI narration of the structured explanation. Narrates the facts
 * in the structured object — the prompt forbids adding claims. Returns the
 * deterministic `sammendrag` when no key is configured or the call fails.
 */
export async function narrer(f: StrukturertForklaring): Promise<string> {
  if (!openai) return f.sammendrag;
  // Redact the payload sent to the third-party model: drop `referanse` strings
  // (which carry internal ansatt/avdeling ids) and keep only aggregate facts +
  // the already-aggregate deterministic summary. No per-employee id leaves the org.
  const trygg = {
    status: f.status,
    prioriteringer: f.prioriteringer.map((p) => ({ etikett: p.etikett, vekt: p.vekt })),
    antallUoppfylte: f.uoppfylte.length,
    antallKonflikter: f.konflikter.length,
    sammendrag: f.sammendrag,
  };
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'Du forklarer en KI-generert turnus for en norsk turnusplanlegger. '
            + 'Skriv 2–4 korte setninger på norsk. Bruk KUN faktaene i JSON-en du får '
            + '(status, prioriteringer med vekt, antall uoppfylte mål/konflikter, sammendrag). '
            + 'Ikke legg til påstander som ikke står i dataene. Ikke finn på tall.',
        },
        { role: 'user', content: JSON.stringify(trygg) },
      ],
    }, { timeout: 15_000 });
    return completion.choices[0]?.message?.content?.trim() || f.sammendrag;
  } catch {
    return f.sammendrag;
  }
}
