import { describe, it, expect } from 'vitest';
import { propositionsArbitrees } from '../../../../../src/app/audit/parcelle/arbitrages.js';
import { votesDesBatiments } from '../../../../../src/app/audit/parcelle/propositionsClaude.js';
import { couvertureDuVocabulaire } from '../../../../../src/app/regles/sujets/couverture.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { appliquerPropositions } from '../../../../../src/regles/decisions.js';
import { normalizeObjects } from '../../../../../src/model/normalisation.js';
import { COUVERTURES_VUES, libelleDe, resumePartie } from '../../../../../src/model/ceQueJeVois.js';
import { RECONCILIATION } from '../../../../../src/regles/reconciliation.js';
import { LIBELLES_COUVERTURE } from '../../../../../src/ui/champs/facade.js';
import { reponse } from '../../../../fixtures/audit/reponseClaude.js';
import type { CeQueJeVois } from '../../../../../src/model/ceQueJeVois.js';
import type { ObjetBrut, ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// La grande ardoise posee en losange est une couverture comme les autres : se choisit, se voit, se lit chez Claude, s'arbitre et se dessine.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

function monter(vu: CeQueJeVois | null, claude: string | null) {
  const objets = normalizeObjects([
    { key: 'parcelle', name: 'parcelle', type: 'polygon', fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101' } },
    { key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6, batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 } } },
  ] as ObjetBrut[]) as ObjetPlan[];
  const capture = creerCapture('78650000AE0101', () => new Date('2026-10-13T09:00:00Z'));
  if (vu) capture.noterVu('maison', vu);
  const c = capture.lire();
  const votes = claude === null ? {} : votesDesBatiments({ maison: { reponses: [0, 1, 2].map(() => reponse({ couverture: { indices: [{ image: 1, vu: 'ardoises carrees sur la pointe' }], valeur: claude } })), etiquettes: [] } });
  return { objets, e: { objets, liste: listeDeControle(objets, c), capture: c, mesures: new Map() }, votes };
}
const ligne = (t: ReturnType<typeof monter>) => propositionsArbitrees(t.e, t.votes).find((p) => p.id === 'maison:couverture');

describe('la grande ardoise en losange', () => {
  it('est proposee partout ou une couverture se choisit', () => {
    expect(COUVERTURES_VUES.map((c) => c.code)).toContain('ardoise-losange');
    expect(libelleDe(COUVERTURES_VUES, 'ardoise-losange')).toBe('Grande ardoise en losange');
    expect(LIBELLES_COUVERTURE['ardoise-losange']).toBe('Grande ardoise en losange');
    expect(RECONCILIATION.attributs.couverture.valeurs).toContain('ardoise-losange');
    expect(resumePartie({ couverture: 'ardoise-losange' }, 'materiaux')).toMatch(/Grande ardoise en losange/i);
  });

  it('Claude la dit avec le mot du schema, et le projet la comprend', () => {
    expect(couvertureDuVocabulaire('ardoise-losange')).toBe('ardoise-losange');
    expect(couvertureDuVocabulaire('ardoise')).toBe('ardoise');
  });

  it('la personne l a vue sur place : la ligne arrive cochee et l ecrit sur le toit', () => {
    const t = monter({ couverture: 'ardoise-losange' }, null);
    const p = ligne(t);
    expect(p).toMatchObject({ source: 'arbitrage', apres: 'Grande ardoise en losange, vue sur place', effet: { type: 'couverture', couverture: 'ardoise-losange' } });
    appliquerPropositions(t.objets, [p!], [], '2026-10-13');
    expect(t.objets.find((o) => o.key === 'maison')?.batiment?.toit?.couverture).toBe('ardoise-losange');
  });

  it('Claude la voit seul : la ligne attend la personne, comme toute couverture vue par lui seul', () => {
    const p = ligne(monter(null, 'ardoise-losange'));
    expect(p?.apres).toMatch(/^Grande ardoise en losange, d’après Claude/);
    expect(p?.arbitrages?.[0]).toMatchObject({ attribut: 'couverture', decision: 'manuelle' });
  });
});
