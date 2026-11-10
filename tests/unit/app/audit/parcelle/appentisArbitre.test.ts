import { describe, it, expect } from 'vitest';
import { propositionsArbitrees } from '../../../../../src/app/audit/parcelle/arbitrages.js';
import { creerCapture } from '../../../../../src/app/audit/parcelle/capture.js';
import { listeDeControle } from '../../../../../src/app/audit/parcelle/liste.js';
import { appliquerPropositions, cocheeParDefaut } from '../../../../../src/regles/decisions.js';
import { normalizeObjects } from '../../../../../src/model/normalisation.js';
import { serializeObjects } from '../../../../../src/io/serialisation.js';
import { resumePartie, type CeQueJeVois } from '../../../../../src/model/ceQueJeVois.js';
import type { CorpsToit, ObjetBrut, ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// Un appentis (galerie, porche) est ouvert ou ferme : ce que la personne a vu sur place, ou ce qu'elle force dans l'avant/apres.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y1 > y0 ? y0 : y1 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const MAISON: CorpsToit = { pts: rect(5, 10, 15, 18), posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 };
const GALERIE: CorpsToit = { pts: [{ x: 5, y: 7 }, { x: 15, y: 7 }, { x: 15, y: 10 }, { x: 5, y: 10 }], posFaitage: 3, faitage: 3.4, egouts: [2.4, 3.4], pignons: [], ecart: 0.1 };

function monter(vu: CeQueJeVois | null, corps: CorpsToit[] = [MAISON, GALERIE]) {
  const objets = normalizeObjects([
    { key: 'parcelle', name: 'parcelle', type: 'polygon', fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101' } },
    { key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6, batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 }, corpsToit: corps },  },
  ] as ObjetBrut[]) as ObjetPlan[];
  const capture = creerCapture('78650000AE0101', () => new Date('2026-10-13T09:00:00Z'));
  if (vu) capture.noterVu('maison', vu);
  const c = capture.lire();
  return { objets, e: { objets, liste: listeDeControle(objets, c), capture: c, mesures: new Map() } };
}
const ligne = (t: ReturnType<typeof monter>, choix = {}) => propositionsArbitrees(t.e, {}, undefined, choix).find((p) => p.id === 'maison:appentis');

describe('l appentis ouvert ou ferme', () => {
  it('la personne l a vu ouvert : la ligne arrive cochee et ecrit sur les appentis du batiment, pas sur le deux-pans', () => {
    const t = monter({ appentis: 'ouvert' });
    const p = ligne(t);
    expect(p).toMatchObject({ source: 'arbitrage', objet: 'Appentis de maison', avant: 'sans indication (le toit seul)', effet: { type: 'appentis', corps: [1], ouvert: true } });
    expect(p?.apres).toMatch(/^Ouvert : des poteaux, pas de mur extérieur/);
    expect(p?.arbitrages?.[0]).toMatchObject({ attribut: 'appentis', decision: 'auto' });
    expect(cocheeParDefaut(p!)).toBe(true);
    appliquerPropositions(t.objets, [p!], [], '2026-10-13');
    const corps = t.objets.find((o) => o.key === 'maison')?.batiment?.corpsToit as CorpsToit[];
    expect(corps.map((c) => c.ouvert)).toEqual([undefined, true]);
  });

  it('l option survit a l enregistrement et a la relecture du projet', () => {
    const t = monter({ appentis: 'ferme' });
    appliquerPropositions(t.objets, [ligne(t)!], [], '2026-10-13');
    const relu = normalizeObjects(JSON.parse(JSON.stringify(serializeObjects(t.objets))) as ObjetBrut[]) as ObjetPlan[];
    expect(relu.find((o) => o.key === 'maison')?.batiment?.corpsToit?.[1]?.ouvert).toBe(false);
  });

  it('sans rien de noté, personne ne propose rien ; forcee dans l avant/apres, elle se propose', () => {
    expect(ligne(monter(null))).toBeUndefined();
    const p = ligne(monter(null), { 'batiment:maison|appentis': { type: 'force', valeur: 'ouvert' } });
    expect(p?.arbitrages?.[0]).toMatchObject({ decision: 'forcee' });
    expect(p?.apres).toMatch(/choisi par vous/);
    expect(p?.effet).toMatchObject({ ouvert: true });
  });

  it('un batiment sans appentis ne propose rien, meme si l option est notee', () => {
    expect(ligne(monter({ appentis: 'ouvert' }, [MAISON]))).toBeUndefined();
  });

  it('rien quand l appentis est deja comme on l a vu', () => {
    const t = monter({ appentis: 'ouvert' }, [MAISON, { ...GALERIE, ouvert: true }]);
    expect(ligne(t)).toBeUndefined();
  });

  it('le resume de « Ce que je vois » dit l appentis', () => {
    expect(resumePartie({ appentis: 'ouvert' }, 'toit')).toBe('Appentis ouvert');
    expect(resumePartie({ forme: 'deux-pans', appentis: 'ferme' }, 'toit')).toMatch(/appentis fermé/);
  });
});
