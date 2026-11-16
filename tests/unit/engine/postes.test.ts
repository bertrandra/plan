import { describe, it, expect } from 'vitest';
import { creerEtat } from '../../../src/core/state.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import { DEMO_TEMOIN_OBJECTS, DEMO_MEASURES } from '../../../src/model/demo.js';
import { computeBOM } from '../../../src/engine/bom.js';
import { computeTerrasseLayers } from '../../../src/engine/layers.js';
import { computeDebitLames, computeDebitsBois } from '../../../src/engine/debit.js';
import { setPrixBarre } from '../../../src/engine/prix.js';
import { solDuProjet } from '../../../src/engine/sol.js';
import { ensureConstruction } from '../../../src/engine/construction.js';
import { RAYONS, avecTva, chiffrerProjet, chiffrerTerrasse, posteDeLigne, rayonDuPoste, totalDesPostes } from '../../../src/engine/postes.js';
import type { ObjetBrut, ObjetPlan, ObjetPolygone } from '../../../src/model/types.js';

// Les postes du chiffrage (engine/postes.ts) : les lignes du BOM, rangees par rayon, et d'ou vient leur prix. Le devis et la
// liste d'achat les impriment ; aucune quantite n'y est recomptee.

function demo() {
  const etat = creerEtat({ objects: JSON.parse(JSON.stringify(DEMO_TEMOIN_OBJECTS)), measures: DEMO_MEASURES } as Parameters<typeof creerEtat>[0],
    (b: ObjetBrut[]) => normalizeObjects(b) as ObjetPlan[]);
  const terrasse = etat.objects.find((o) => o.key === 'terrasse') as ObjetPolygone;
  return { objets: etat.objects, terrasse };
}

describe('les postes du chiffrage', () => {
  it('reprennent ligne a ligne la nomenclature de la terrasse, dans l ordre des rayons', () => {
    const { objets, terrasse } = demo();
    const bom = computeBOM(terrasse, computeTerrasseLayers(terrasse, objets), solDuProjet(objets));
    const t = chiffrerTerrasse(terrasse, objets);
    // Chaque ligne a acheter du BOM est un poste, avec sa quantite, son unite et son libelle.
    const aAcheter = bom.filter((l) => l.qte > 0 && (l.prixBas || l.prixHaut || l.prixReel !== null));
    expect(t.postes.map((p) => p.poste).sort()).toEqual(aAcheter.map((l) => l.poste).sort());
    for (const p of t.postes) {
      const l = bom.find((x) => x.poste === p.poste)!;
      expect([p.qte, p.unite, p.libelle]).toEqual([l.qte, l.unite, l.label]);
    }
    const ordre = t.postes.map((p) => RAYONS.findIndex((r) => r.id === p.rayon));
    expect(ordre).toEqual([...ordre].sort((a, b) => a - b));
    expect(t.postes.map((p) => p.rayon)).toEqual(['appuis', 'structure', 'structure', 'lames', 'visserie', 'finitions']);
  });

  it('retient un prix saisi, et laisse en fourchette un prix que le moteur a pris par defaut', () => {
    const { objets, terrasse } = demo();
    const t = chiffrerTerrasse(terrasse, objets);
    const vis = t.postes.find((p) => p.poste === 'vis')!;
    // La demonstration porte le prix d'une vis (35 €) : saisi, au total du BOM.
    expect(vis.prix).toEqual({ saisi: true, total: 1295, unitaire: 35 });
    // Les lames n'ont aucun prix de barre saisi : la fourchette du BOM, au metre lineaire.
    const lames = t.postes.find((p) => p.poste === 'lames')!;
    expect(lames.prix.saisi).toBe(false);
    const bom = computeBOM(terrasse, computeTerrasseLayers(terrasse, objets), solDuProjet(objets));
    const l = bom.find((x) => x.poste === 'lames')!;
    expect(lames.prix).toEqual({ saisi: false, unitaire: { bas: l.prixBas, haut: l.prixHaut }, total: { bas: l.prixBas * l.qte, haut: l.prixHaut * l.qte } });
  });

  it('une ligne debitee devient saisie quand chaque longueur achetee a son prix', () => {
    const { objets, terrasse } = demo();
    const c = ensureConstruction(terrasse);
    const couches = computeTerrasseLayers(terrasse, objets);
    const longueurs = Object.entries(computeDebitLames(terrasse, couches).achats).filter(([, n]) => n > 0).map(([L]) => parseFloat(L));
    const [premiere, ...autres] = longueurs;
    setPrixBarre(c, 'lames', premiere!, 9);
    expect(chiffrerTerrasse(terrasse, objets).postes.find((p) => p.poste === 'lames')!.prix.saisi, 'une seule longueur saisie').toBe(autres.length === 0);
    autres.forEach((L) => setPrixBarre(c, 'lames', L, 9));
    const lames = chiffrerTerrasse(terrasse, objets).postes.find((p) => p.poste === 'lames')!;
    const l = computeBOM(terrasse, couches, solDuProjet(objets)).find((x) => x.poste === 'lames')!;
    expect(lames.prix).toEqual({ saisi: true, total: l.prixReel, unitaire: l.prixReel! / l.qte });
    // Le bois porteur, lui, reste estime.
    expect(computeDebitsBois(terrasse, couches).length).toBeGreaterThan(0);
    expect(chiffrerTerrasse(terrasse, objets).postes.filter((p) => p.rayon === 'structure').every((p) => !p.prix.saisi)).toBe(true);
  });

  it('un prix saisi a la main sur une ligne (visserie) est retenu tel quel', () => {
    const { objets, terrasse } = demo();
    const c = ensureConstruction(terrasse);
    c.bom = computeBOM(terrasse, computeTerrasseLayers(terrasse, objets), solDuProjet(objets));
    c.bom.find((l) => l.poste === 'visserie')!.prixReel = 210;
    const v = chiffrerTerrasse(terrasse, objets).postes.find((p) => p.poste === 'visserie')!;
    expect(v.prix.saisi).toBe(true);
    expect(v.prix.saisi && v.prix.total).toBe(210);
  });

  it('une ligne sans quantite ou sans aucun prix n a rien a acheter', () => {
    expect(posteDeLigne({ poste: 'lameRive', label: 'Lame de rive', qte: 12, unite: 'ml', prixBas: 0, prixHaut: 0, prixReel: null }, false)).toBeNull();
    expect(posteDeLigne({ poste: 'concasse', label: 'Concasse', qte: 0, unite: 'm³', prixBas: 30, prixHaut: 50, prixReel: null }, false)).toBeNull();
    expect(rayonDuPoste('concasse')).toBe('terrassement');
    expect(rayonDuPoste('posteInconnu')).toBe('divers');
  });

  it('les totaux : un prix saisi compte aux deux bornes, la TVA suit le taux donne', () => {
    const { objets, terrasse } = demo();
    const t = chiffrerTerrasse(terrasse, objets);
    expect(t.total).toEqual(totalDesPostes(t.postes));
    let bas = 0, haut = 0;
    for (const p of t.postes) { if (p.prix.saisi) { bas += p.prix.total; haut += p.prix.total; } else { bas += p.prix.total.bas; haut += p.prix.total.haut; } }
    expect(t.total).toEqual({ bas, haut });
    const projet = chiffrerProjet(objets, ['terrasse', 'table']);
    expect(projet.terrasses.map((x) => x.nom)).toEqual(['Terrasse', 'Table']);
    expect(projet.total.bas).toBeCloseTo(projet.terrasses[0]!.total.bas + projet.terrasses[1]!.total.bas, 9);
    expect(projet.toutSaisi).toBe(false);
    expect(avecTva({ bas: 1000, haut: 2000 }, 20)).toEqual({ tva: { bas: 200, haut: 400 }, ttc: { bas: 1200, haut: 2400 } });
    expect(chiffrerProjet(objets, []).terrasses).toEqual([]);
  });
});
