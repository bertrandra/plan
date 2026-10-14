import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contextesFacades, mesurerFacadesAuditees } from '../../../src/facade/contexteFacade.js';
import { lireFichierAuditParcelle } from '../../../src/model/fichierAuditParcelle.js';
import { HAUTEUR_NIVEAU_DEFAUT_M } from '../../../src/model/mesureFacade.js';
import { HAUTEUR_ETAGE_M } from '../../../src/geo/bdtopo.js';
import type { Toit } from '../../../src/model/types.js';

// Le contexte des facades d'un batiment et la mesure des facades d'un audit de parcelle (lot G11,
// MD/spec-facades-calage-detection.md §15.1).

/** Un rectangle de 10 x 8 m, trace dans le sens trigonometrique : cote 0 au sud, 1 a l'est, 2 au nord, 3 a l'ouest. */
const RECT = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }];
const DEUX_PANS: Toit = { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 };
const VOISIN_EST = { pts: [{ x: 10, y: 1 }, { x: 14, y: 1 }, { x: 14, y: 6 }, { x: 10, y: 6 }] };

describe('le contexte des facades', () => {
  it('un deux-pans au faitage est-ouest a ses pignons a l est et a l ouest', () => {
    const c = contextesFacades({ pts: RECT, toit: DEUX_PANS });
    expect([0, 1, 2, 3].map((k) => c.get(k)?.pignon)).toEqual([false, true, false, true]);
    // Sans voisins ni rue connus, on ne sait rien de plus.
    expect(c.get(0)).toEqual({ surRue: null, pignon: false, coteVoisin: null });
  });

  it('un toit plat ou a croupes n a pas de pignon ; sans toit, on ne sait pas', () => {
    const plat = contextesFacades({ pts: RECT, toit: { forme: 'plat', hauteur: 0, angleFaitage: 0 } });
    expect([...plat.values()].every((x) => x.pignon === false)).toBe(true);
    const croupes = contextesFacades({ pts: RECT, toit: { forme: 'croupes', hauteur: 3, angleFaitage: 0 } });
    expect([...croupes.values()].every((x) => x.pignon === false)).toBe(true);
    expect(contextesFacades({ pts: RECT }).get(1)?.pignon).toBeNull();
  });

  it('le mur contre un batiment voisin est cote voisin, les autres non', () => {
    const c = contextesFacades({ pts: RECT, voisins: [VOISIN_EST] });
    expect([0, 1, 2, 3].map((k) => c.get(k)?.coteVoisin)).toEqual([false, true, false, false]);
  });

  it('le mur qui tourne le dos a la rue est l arriere ; les murs lateraux restent inconnus', () => {
    const c = contextesFacades({ pts: RECT, cotesRue: [0] });
    expect([0, 1, 2, 3].map((k) => c.get(k)?.surRue)).toEqual([true, null, false, null]);
  });

  it('la hauteur de niveau par defaut est celle de la BD TOPO', () => {
    expect(HAUTEUR_NIVEAU_DEFAUT_M).toBe(HAUTEUR_ETAGE_M);
  });
});

describe('les facades d un audit de parcelle', () => {
  const brut: unknown = JSON.parse(readFileSync(join(__dirname, '../../fixtures/audit-parcelle/audit-parcelle-exemple-synthetique.json'), 'utf8'));
  const f = lireFichierAuditParcelle(brut);

  it('mesure chaque facade relevee, avec son type : rue, pignon aveugle cote voisin, arriere', () => {
    const m = mesurerFacadesAuditees(f);
    expect(m.map((x) => [x.cle, x.cote, x.mesure.type, x.mesure.aveugle, x.mesure.coteVoisin])).toEqual([
      ['maison', 0, 'rue', false, false],
      ['maison', 1, 'pignon', true, true],
      ['maison', 2, 'arriere', false, false],
    ]);
    // La facade sur rue est celle de la scene 02 du banc.
    expect(m[0]?.mesure).toMatchObject({ fenetre: { n: 5, largeurM: 1.2, hauteurM: 1.35, appuiM: 0.9 }, entraxeM: 3.1, baiesParNiveau: [3, 3], porte: { position: 'centre', alignee: true } });
  });

  it('sans cas fige, une photo de rue suffit a dire la rue ; le reste est inconnu', () => {
    const sansCas = { ...f, batiments: f.batiments.map((b) => ({ ...b, cas: null })) };
    expect(mesurerFacadesAuditees(sansCas).map((x) => x.mesure.type)).toEqual(['rue', null, null]);
  });
});
