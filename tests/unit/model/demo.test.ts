import { describe, it, expect } from 'vitest';
import { DEMO_OBJECTS, DEMO_DESSINES, DEMO_TEMOIN_OBJECTS, PALETTE_DEMO } from '../../../src/model/demo.js';
import { APPARENCES_IGN } from '../../../src/geo/cadastreObjets.js';
import { pointInPolygon, centroid } from '../../../src/geometry/basic.js';
import { serializeObjects } from '../../../src/io/serialisation.js';
import type { PtBrut } from '../../../src/model/types.js';

// Le plan de demonstration existe en deux versions depuis la 2.1.1 (src/model/demo.ts) : le temoin,
// dont les golden files sont captures, et le plan que l'utilisateur ouvre. Depuis le 11 octobre 2026,
// le second est le temoin recolore, actualise par « Actualiser le projet » avec un voisinage de
// 100 m. Ce fichier tient la promesse qui le rend inoffensif : les objets dessines sont ceux du
// temoin, aux couleurs pres ; seuls la parcelle et le voisinage viennent de l'IGN.

const parTemoin = new Map(DEMO_TEMOIN_OBJECTS.map(o => [o.key, o]));
const parDemo = new Map(DEMO_OBJECTS.map(o => [o.key, o]));

describe('le plan de demonstration ouvert', () => {
  it('garde les objets dessines du temoin, aux couleurs de la maquette pres', () => {
    expect(DEMO_DESSINES).toHaveLength(DEMO_TEMOIN_OBJECTS.length - 1);
    DEMO_DESSINES.forEach(d => {
      const o = parDemo.get(d.key);
      expect(o, d.key).toBeDefined();
      // La demo est un export : on compare sous la forme ecrite, champs par defaut compris. Trois
      // ecarts sont voulus : le chiffrage garde en cache (`construction.bom`) est celui du sol en
      // relief ; la maison a recu la couleur de son toit, lue sur l'orthophoto ; un parasol pose
      // sur la terrasse se recentre au dix-millieme de metre pres.
      const ecrit = (x: object) => {
        const e = JSON.parse(JSON.stringify(serializeObjects([x as never])[0]));
        if (e.construction) delete e.construction.bom;
        if (e.toit) { delete e.toit.couleur; delete e.toit.origineCouleur; }
        if (e.center) e.center = { x: Math.round(e.center.x * 1000) / 1000, y: Math.round(e.center.y * 1000) / 1000 };
        return e;
      };
      expect(ecrit(o!), d.name).toEqual(ecrit(d));
      const t = parTemoin.get(d.key)!;
      expect({ ...d, fill: t.fill, stroke: t.stroke }).toEqual(t);
    });
  });

  it('recolore chaque objet dessine, et garde distinctes deux couleurs qui l etaient', () => {
    DEMO_DESSINES.forEach(d => expect(d.fill, d.name).not.toBe(parTemoin.get(d.key)!.fill));
    const remplissages = [...new Set(DEMO_TEMOIN_OBJECTS.map(o => o.fill!))];
    const nouveaux = new Set(remplissages.map(c => PALETTE_DEMO[c]));
    expect(nouveaux.size).toBe(remplissages.length);
  });

  it('porte la parcelle du temoin, a son apparence d import, avec son relief et son gazon', () => {
    const p = parDemo.get('parcelle')!, t = parTemoin.get('parcelle')!;
    expect(p.fill).toBe(APPARENCES_IGN.parcelle.fill);
    // Le contour relu au cadastre : celui du temoin a moins d'un centimetre (« ecart max 0 cm »).
    const pp = (p as { pts: PtBrut[] }).pts, tt = (t as { pts: PtBrut[] }).pts;
    expect(pp).toHaveLength(tt.length);
    pp.forEach((q, i) => { expect(Math.hypot(q.x - tt[i]!.x, q.y - tt[i]!.y)).toBeLessThan(0.01); });
    expect(p.gazon3d).toBeUndefined();
    expect(p.relief).toMatchObject({ source: 'lidar-hd', pas: 0.5, maxCellules: 50000 });
    expect(p.relief?.paysage).toMatchObject({ pas: 2 });
  });

  it('porte un voisinage de 100 m, verrouille, et rien de lui sur la parcelle', () => {
    const voisinage = DEMO_OBJECTS.filter(o => o.voisinage);
    const parcelles = voisinage.filter(o => o.fonction === 'terrain'), batiments = voisinage.filter(o => o.fonction === 'batiment');
    expect(parcelles.length).toBeGreaterThan(40);
    expect(batiments.length).toBeGreaterThan(40);
    expect(voisinage.every(o => o.locked)).toBe(true);
    expect(batiments.filter(o => o.batiment?.corpsToit?.length).length).toBeGreaterThan(batiments.length * 0.8);
    const contour = (parDemo.get('parcelle') as { pts: PtBrut[] }).pts;
    batiments.forEach(b => expect(pointInPolygon(centroid((b as { pts: PtBrut[] }).pts), contour), b.key).toBe(false));
    expect(DEMO_OBJECTS).toHaveLength(DEMO_DESSINES.length + 1 + voisinage.length);
  });

  it('ne touche pas au temoin', () => {
    expect(parTemoin.get('parcelle')!.fill).toBe('#1b5e0d');
    expect(DEMO_TEMOIN_OBJECTS.some(o => o.voisinage)).toBe(false);
  });
});
