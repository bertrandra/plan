import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { propositionsClaudeDuBatiment } from '../../../../../src/app/audit/parcelle/propositionsClaude.js';
import { cochesParDefaut } from '../../../../../src/app/audit/parcelle/propositions.js';
import { appliquerPropositions } from '../../../../../src/regles/decisions.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { captureVide } from '../../../../../src/model/auditParcelle.js';
import { reponse } from '../../../../fixtures/audit/reponseClaude.js';
import type { Proposition } from '../../../../../src/regles/decisions.js';
import type { CorpsToit, ObjetPlan, PtBrut, ChampsBatiment } from '../../../../../src/model/types.js';

// La forme du toit vue par Claude sur les pignons et les croupes (lot « décisions depuis les
// écarts ») : relue sur la mesure LiDAR de AE 101, jamais fabriquée, décochée avec ses raisons.

function batiment(): { o: ObjetPlan; objets: ObjetPlan[] } {
  const d = JSON.parse(readFileSync('tests/fixtures/toits/vesinet-ae101.json', 'utf8')) as { contour: PtBrut[]; toitMesure: ChampsBatiment['toitMesure']; corps: CorpsToit[] };
  const o = { key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: d.contour, elevation: 6, batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 }, toitMesure: d.toitMesure, corpsToit: d.corps },   } as unknown as ObjetPlan;
  const parcelle = { key: 'parcelle', name: 'p', type: 'polygon', fonction: 'terrain', pts: [{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 50, y: 50 }, { x: -50, y: 50 }] } as unknown as ObjetPlan;
  return { o, objets: [parcelle, o] };
}

const forme = (o: ObjetPlan, objets: ObjetPlan[], valeur: string, gauche = 'indetermine', droite = 'indetermine', ecarts: { indices: never[]; sujet: string; modele: string; observe: string }[] = []): Proposition | undefined => {
  const b = listeDeControle(objets, captureVide('78650000AE0101')).batiments[0]!;
  const r = reponse({ forme: { indices: [{ image: 1, vu: 'deux rampes jusqu’à un sommet' }], valeur }, bouts: { indices: [], gauche, droite }, ecarts });
  return propositionsClaudeDuBatiment(o, b, { reponses: [r, r, r], etiquettes: [{ texte: 'photo de la façade sud de maison', photo: { cle: 'maison', cote: 0, rang: 0 } }] }).find((p) => p.effet.type === 'corpsToit');
};

describe('la forme du toit proposée d’après Claude', () => {
  it('ne propose rien quand Claude voit ce que le modèle dit déjà', () => {
    const { o, objets } = batiment();
    expect(forme(o, objets, 'deux-pans', 'pignon', 'pignon')).toBeUndefined();
  });

  it('propose des croupes relues sur la mesure : l’avant, l’après, l’écart, décochée avec sa raison', () => {
    const { o, objets } = batiment();
    const p = forme(o, objets, 'croupes', 'croupe', 'croupe', [{ indices: [], sujet: 'bouts', modele: 'pignon à gauche', observe: 'croupe à gauche, petit triangle de mur' }]);
    expect(p).toMatchObject({ id: 'maison:claude:formeToit', source: 'claude', objet: 'Forme du toit de maison', avant: 'deux pans', cible: { type: 'batiment', cle: 'maison' } });
    expect(p?.apres).toMatch(/^quatre pans \(croupes\), relue sur la mesure LiDAR/);
    const corps = (p?.effet as { corps: CorpsToit[] }).corps;
    expect(corps[0]?.croupes?.every((h) => h > 0)).toBe(true);
    // Les deux autres corps (annexe, aile) ne bougent pas.
    expect(corps.slice(1)).toEqual((o.batiment?.corpsToit as CorpsToit[]).slice(1));
    expect(p?.indices.map((i) => i.texte)).toEqual(expect.arrayContaining([
      'deux rampes jusqu’à un sommet (photo 1 de la façade)',
      expect.stringMatching(/^Écart à la mesure LiDAR avec cette forme : 0,\d\d m \(aujourd’hui 0,35 m\)$/),
      'Écart avec le rendu : croupe à gauche, petit triangle de mur (le modèle dit : pignon à gauche)',
    ]));
    expect(p?.reserve).toMatch(/non encore mesuré/);
    expect(cochesParDefaut([p as Proposition]).size).toBe(0);
  });

  it('cochée et validée, elle remplace les corps du bâtiment ; le plan d’origine n’est pas touché', () => {
    const { o, objets } = batiment();
    const avant = JSON.stringify(o.batiment?.corpsToit);
    const p = forme(o, objets, 'croupes', 'croupe', 'croupe') as Proposition;
    const copie = { ...o } as ObjetPlan;
    expect(appliquerPropositions([copie], [p], [], '2026-10-17')).toEqual(['maison']);
    expect(copie.batiment?.corpsToit?.[0]?.croupes?.every((h) => h > 0)).toBe(true);
    expect(JSON.stringify(o.batiment?.corpsToit)).toBe(avant);
  });

  it('ne fabrique pas : une forme que Plan ne sait pas lire (Mansart) ou des bouts qui se contredisent restent des observations', () => {
    const { o, objets } = batiment();
    expect(forme(o, objets, 'mansart', 'brisis', 'brisis')).toBeUndefined();
    expect(forme(o, objets, 'demi-croupe', 'demi-croupe', 'demi-croupe')).toBeUndefined();
    expect(forme(o, objets, 'deux-pans', 'pignon', 'croupe')).toBeUndefined();
    expect(forme(o, objets, 'croupes', 'pignon', 'pignon')).toBeUndefined();
    expect(forme(o, objets, 'plat', 'pignon', 'pignon')).toBeUndefined();
  });

  it('sans mesure LiDAR, rien ne se relit : pas de proposition', () => {
    const { o, objets } = batiment();
    delete o.batiment?.toitMesure;
    expect(forme(o, objets, 'croupes', 'croupe', 'croupe')).toBeUndefined();
  });

  it('dit toujours ce que coûte la forme de Claude : un plat sur un deux-pans de 7,5 m se propose avec son écart, décoché', () => {
    const { o, objets } = batiment();
    const p = forme(o, objets, 'plat');
    expect(p?.apres).toMatch(/^plat \(terrasse\)/);
    expect(p?.indices.some((i) => /Écart à la mesure LiDAR avec cette forme : 0,58 m \(aujourd’hui 0,35 m\)/.test(i.texte))).toBe(true);
    expect(cochesParDefaut([p as Proposition]).size).toBe(0);
  });
});
