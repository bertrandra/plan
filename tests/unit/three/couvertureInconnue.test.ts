import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { dessinCouverture, pixelsCouverture, matiereCouverture, textureCouverture, poserAvertissementCouverture } from '../../../src/three/couverture.js';
import { ajouterToitCorps3d, NOM_TOIT_CORPS } from '../../../src/three/toitCorps3d.js';
import { serializeObjects } from '../../../src/io/serialisation.js';
import { versMemoire } from '../../../src/model/champsFonction.js';
import type { MateriauCouverture } from '../../../src/model/couleurToit.js';
import type { CorpsToit, ObjetPlan, PtBrut } from '../../../src/model/types.js';

// Une couverture hors du catalogue (fichier ecrit par une version plus recente, ou mot inconnu) : Plan 2.2.0 plantait a
// l'ouverture d'un audit (« fAe[e] is not a function »). Decision du 30 octobre 2026 : elle se dessine en tuile, Plan le signale
// une fois par mot, et la donnee reste telle quelle dans l'objet et dans le fichier.

const INCONNUE = 'lauze-solaire' as MateriauCouverture;
let signaux: string[] = [];
beforeEach(() => { signaux = []; poserAvertissementCouverture((m) => signaux.push(m)); });

// Un canevas et une bibliotheque 3D minimes : assez pour que la texture se dessine dans la table (la ou l'ecran plantait).
class Attr { constructor(public array: number[], public itemSize: number) {} }
class Geo { attributes: Record<string, Attr> = {}; index: number[] = []; setAttribute(n: string, a: Attr) { this.attributes[n] = a; } setIndex(i: number[]) { this.index = i; } computeVertexNormals() {} }
class Mesh { name = ''; constructor(public geometry: Geo, public material: unknown) {} }
class CanvasTexture { wrapS = 0; wrapT = 0; anisotropy = 1; repeat = { set() {} }; constructor(public image: { donnees: Uint8ClampedArray | null }) {} }
const g = globalThis as Record<string, unknown>;
let documentAvant: unknown;
beforeAll(() => {
  documentAvant = g.document;
  g.THREE = { BufferGeometry: Geo, Float32BufferAttribute: Attr, Mesh, CanvasTexture, RepeatWrapping: 1000, MeshStandardMaterial: class { constructor(public p: Record<string, unknown>) {} }, DoubleSide: 2 };
  g.document = {
    createElement: () => {
      const canevas = { width: 0, height: 0, donnees: null as Uint8ClampedArray | null, getContext: () => ({
        createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: (img: { data: Uint8ClampedArray }) => { canevas.donnees = new Uint8ClampedArray(img.data); },
      }) };
      return canevas;
    },
  };
});
afterAll(() => { g.document = documentAvant; poserAvertissementCouverture(null); });

describe('couverture hors catalogue', () => {
  it('ne leve pas : le dessin, les pixels, la matiere et la texture sont ceux de la tuile', () => {
    expect(dessinCouverture(INCONNUE)).toBe('tuile');
    // Une pose qui se dessinerait sur une ardoise ne change rien : la tuile n'en admet pas.
    expect(dessinCouverture(INCONNUE, 'losange')).toBe('tuile');
    expect(() => pixelsCouverture(INCONNUE)).not.toThrow();
    expect(Buffer.from(pixelsCouverture(INCONNUE)).equals(Buffer.from(pixelsCouverture('tuile')))).toBe(true);
    expect(matiereCouverture(INCONNUE)).toEqual(matiereCouverture('tuile'));
    const tex = textureCouverture(INCONNUE) as unknown as CanvasTexture;
    expect(tex).toBe(textureCouverture('tuile'));
    expect(Buffer.from(tex.image.donnees!).equals(Buffer.from(pixelsCouverture('tuile')))).toBe(true);
  });

  it('se signale une fois par mot et par session, pas a chaque rendu', () => {
    for (let k = 0; k < 5; k++) { dessinCouverture(INCONNUE); textureCouverture(INCONNUE); matiereCouverture(INCONNUE); pixelsCouverture(INCONNUE); }
    expect(signaux).toEqual(['Couverture inconnue (« lauze-solaire »), dessinée en tuile.']);
    dessinCouverture('chaume' as MateriauCouverture);
    dessinCouverture('chaume' as MateriauCouverture);
    expect(signaux).toHaveLength(2);
    expect(signaux[1]).toContain('chaume');
  });

  it('un materiau du catalogue ne signale rien', () => {
    for (const m of ['tuile', 'ardoise', 'zinc', 'terrasse', 'vegetale'] as const) { dessinCouverture(m, 'losange'); textureCouverture(m); }
    expect(signaux).toEqual([]);
  });

  it('dessine le toit d un batiment sans toucher a sa donnee : l export du projet reste identique a l octet', () => {
    const p = (x: number, y: number): PtBrut => ({ x, y });
    const corps: CorpsToit = { pts: [p(0, 0), p(10, 0), p(10, 6), p(0, 6)], posFaitage: 3, faitage: 8, egouts: [5, 5], pignons: [], ecart: 0.1 };
    const o = versMemoire({
      key: 'maison', fonction: 'batiment', type: 'polygon', elevation: 5, pts: corps.pts,
      batiment: { toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, couverture: INCONNUE, pose: 'losange' }, corpsToit: [corps], modeToit: 'corps' },
    }) as unknown as ObjetPlan;
    const avant = JSON.stringify(serializeObjects([o]));
    const enfants: Mesh[] = [];
    const ctx = { scene: { add: (m: Mesh) => { enfants.push(m); } } as never, toLocal: (q: PtBrut) => ({ x: q.x, z: -q.y }) as never, couleurMur: '#ffffff', textures: true,
      couverture: { choix: o.batiment!.toit!.couverture ?? null } };
    expect(() => ajouterToitCorps3d(ctx, [corps], o.batiment!.toit, null)).not.toThrow();
    const toit = enfants.find((m) => m.name === NOM_TOIT_CORPS)!;
    expect((toit.material as { p: { map: unknown } }).p.map).toBe(textureCouverture('tuile'));
    expect(o.batiment!.toit!.couverture).toBe(INCONNUE);
    expect(o.batiment!.toit!.pose).toBe('losange');
    expect(JSON.stringify(serializeObjects([o]))).toBe(avant);
    expect(avant).toContain('"couverture":"lauze-solaire"');
    expect(signaux).toHaveLength(1);
  });
});
