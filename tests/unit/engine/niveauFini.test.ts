import { describe, it, expect, vi } from 'vitest';
import { decaissementPoseMm, elevationOf, hauteurFinieMm, hauteurStructureMm } from '../../../src/engine/hauteurs.js';
import { volumeDecaissementPose } from '../../../src/engine/structure.js';
import { computeTerrasseLayers } from '../../../src/engine/layers.js';
import { computeBOM } from '../../../src/engine/bom.js';
import { computeChantier } from '../../../src/engine/chantier.js';
import { constructionTerrasseNeuve, defaultConstruction } from '../../../src/engine/construction.js';
import { sectionsConstruction } from '../../../src/ui/champs/construction.js';
import type { Construction, ObjetPlan } from '../../../src/model/types.js';
import type { ContexteChamps } from '../../../src/ui/champs/types.js';

// Le niveau fini d'une terrasse par rapport au terrain naturel, et le decaissement de pose qu'il
// impose quand il est plus bas que ce que la structure donne posee sur le terrain.

const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const terrasse = (c: Construction): ObjetPlan => ({ key: 't', name: 'T', type: 'polygon', fonction: 'terrasse', pts: rect(0, 0, 5, 4), construction: c });

describe('niveau fini et decaissement', () => {
  it('sans niveau impose, rien ne change : posee sur le terrain', () => {
    const t = terrasse(constructionTerrasseNeuve());
    // Plot de 10 cm, lambourde 45 x 70, lame 25 mm.
    expect(hauteurStructureMm(t)).toBe(195);
    expect(decaissementPoseMm(t)).toBe(0);
    expect(hauteurFinieMm(t)).toBe(195);
    expect(volumeDecaissementPose({ pts: rect(0, 0, 5, 4), construction: t.construction! }, [])).toBe(0);
    expect(computeBOM(t, computeTerrasseLayers(t, [t])).some(l => l.poste === 'decaissementPose')).toBe(false);
  });

  it('de plain-pied : la terrasse descend de toute sa hauteur, la terre se chiffre', () => {
    const t = terrasse({ ...constructionTerrasseNeuve(), niveauFini: 0 });
    expect(decaissementPoseMm(t)).toBe(195);
    expect(hauteurFinieMm(t)).toBe(0);
    expect(elevationOf(t)).toBe(0);
    const layers = computeTerrasseLayers(t, [t]);
    const ligne = computeBOM(t, layers).find(l => l.poste === 'decaissementPose')!;
    expect(ligne.qte).toBeCloseTo(20 * 0.195);
    expect(ligne.label).toMatch(/Décaissement pour la pose \(19,5 cm\)/);
    const chantier = computeChantier(t, layers);
    const sans = computeChantier(terrasse(constructionTerrasseNeuve()), layers);
    const q = (ch: typeof chantier, cle: string) => ch.lignes.find(l => l.cle === cle)?.qte ?? 0;
    expect(q(chantier, 'decaissement') - q(sans, 'decaissement')).toBeCloseTo(20 * 0.195);
  });

  it('au ras des margelles, sur vis ou sous une dalle debordante', () => {
    const vis = terrasse({ ...defaultConstruction(), niveauFini: 5 });
    expect(hauteurFinieMm(vis)).toBe(50);
    expect(decaissementPoseMm(vis)).toBe(hauteurStructureMm(vis) - 50);
    const dalle = terrasse({ ...constructionTerrasseNeuve(), supportType: 'dalle-beton', niveauFini: 0 });
    // Sous une dalle, la fouille prend son emprise debordante : 5,2 x 4,2 m.
    expect(volumeDecaissementPose({ pts: rect(0, 0, 5, 4), construction: dalle.construction! }, [])).toBeCloseTo(5.2 * 4.2 * 0.195, 3);
  });

  it('plus haut que la structure : pas de decaissement, la structure reste ou elle est', () => {
    const t = terrasse({ ...constructionTerrasseNeuve(), niveauFini: 40 });
    expect(decaissementPoseMm(t)).toBe(0);
    expect(hauteurFinieMm(t)).toBe(195);
  });
});

describe('inspecteur : imposer le niveau fini', () => {
  const contexte = (obj: ObjetPlan) => ({ obj, objets: [obj], construction: () => obj.construction!, elevationOf: () => 0, executerCommande: vi.fn() }) as unknown as ContexteChamps;
  const fondation = () => sectionsConstruction({ visible: () => false }).find(s => s.id === 'implantation')!;

  it('la case pose 0 cm, le champ dit le decaissement, decocher rend la pose sur le terrain', () => {
    const t = terrasse(constructionTerrasseNeuve());
    const c = contexte(t);
    const champs = fondation().champs;
    const caseNiveau = champs.find(ch => ch.cle === 'poseDecaissee')!;
    const niveau = champs.find(ch => ch.cle === 'niveauFini')!;
    const lecture = champs.find(ch => ch.cle === 'decaissementPose')!;
    if (caseNiveau.type !== 'case' || niveau.type !== 'nombre' || lecture.type !== 'lecture') throw new Error('types attendus');
    expect(niveau.visible!(c)).toBe(false);
    expect(caseNiveau.note!(c)).toMatch(/posée sur le terrain, dessus à 19,5 cm/);
    caseNiveau.ecrire(c, true);
    expect(t.construction!.niveauFini).toBe(0);
    expect(niveau.visible!(c)).toBe(true);
    expect(niveau.note!(c)).toMatch(/décaissement de 19,5 cm/);
    expect(lecture.valeur(c)).toMatch(/19,5 cm, 3,90 m³ de terre à évacuer/);
    expect(niveau.ecrire(c, 250)).toBe(false);
    niveau.ecrire(c, 40);
    expect(niveau.note!(c)).toMatch(/⚠ .*relevez les plots/);
    caseNiveau.ecrire(c, false);
    expect('niveauFini' in t.construction!).toBe(false);
  });
});
