import { describe, expect, it } from 'vitest';
import { byggForklaring, narrer } from '../turnus-xai';

describe('byggForklaring (deterministic XAI)', () => {
  it('fullfort: sorts priorities by weight and reports unmet goals', () => {
    const f = byggForklaring({
      status: 'fullfort',
      objektivJson: { onske: 8, kostnad: 2, helgefrekvens: 5 },
      solveTidMs: 120,
      avvik: [{ type: 'onske', alvor: 'advarsel', referanse: 'onske:ansatt=3:2026-01-10', forklaring: 'Ønske om fri kunne ikke oppfylles.' }],
    });
    expect(f.status).toBe('fullfort');
    // highest weight first
    expect(f.prioriteringer[0].dimensjon).toBe('onske');
    expect(f.prioriteringer.map((p) => p.dimensjon)).toEqual(['onske', 'helgefrekvens', 'kostnad']);
    expect(f.uoppfylte).toHaveLength(1);
    expect(f.sammendrag).toContain('ansattes ønsker');
    expect(f.sammendrag).toContain('120 ms');
  });

  it('infeasible: summarizes the conflict set', () => {
    const f = byggForklaring({
      status: 'infeasible',
      objektivJson: {},
      solveTidMs: 30,
      avvik: [{ type: 'infeasible_constraint', alvor: 'feil', referanse: 'dekning:avd=1:2026-01-05:vaktkode=1', forklaring: 'Bare 1 kvalifisert ansatt for et krav om 2.' }],
    });
    expect(f.status).toBe('infeasible');
    expect(f.konflikter).toHaveLength(1);
    expect(f.sammendrag).toContain('ingen lovlig turnus');
    expect(f.sammendrag).toContain('Bare 1 kvalifisert');
  });

  it('narrer falls back to the deterministic summary when no OpenAI key', async () => {
    // test env has no OPENAI_API_KEY → openai client is null → returns sammendrag
    const f = byggForklaring({ status: 'feilet', objektivJson: {}, solveTidMs: null, avvik: [] });
    expect(await narrer(f)).toBe(f.sammendrag);
  });
});
