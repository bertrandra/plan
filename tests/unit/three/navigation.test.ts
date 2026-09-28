import { describe, it, expect } from 'vitest';
import { cameraDepuisPointDeVue, creerNavigation3d, HAUTEUR_YEUX_M } from '../../../src/three/navigation.js';
import { vue3d, glb, cleDeVue, CLE_SANS_TERRASSE } from '../../../src/three/etat3d.js';

// Le calcul etait ecrit deux fois — une pour la Vue 3D, une pour la visionneuse GLB. Ces tests
// fixent la conversion plan → repere local de la scene, qui est la partie qu'on ne devine pas.

/** Un point de vue : position, puis un second point qui dit ce qu'il regarde. */
function vue(x: number, y: number, vx: number, vy: number, altitude?: number) {
  return { pts: [{ x, y }, { x: vx, y: vy }], altitude };
}

describe('conversion vers le repere de la scene', () => {
  it('pose la camera au point de vue, mesure depuis le centroide', () => {
    const c = cameraDepuisPointDeVue(vue(13, 27, 14, 27), { x: 10, y: 20 });
    expect(c.position.x).toBeCloseTo(3, 9);
    expect(c.position.z).toBeCloseTo(-7, 9);
  });

  it('retourne l axe Nord-Sud : dans la scene, le Nord est en -Z', () => {
    // Le plan compte Y vers le nord, la scene compte Z vers le sud. Un point de vue au nord du
    // centroide doit donc se retrouver a Z negatif.
    const nord = cameraDepuisPointDeVue(vue(0, 10, 0, 11), { x: 0, y: 0 });
    expect(nord.position.z).toBeCloseTo(-10, 9);
  });

  it('prend l altitude du point de vue', () => {
    expect(cameraDepuisPointDeVue(vue(0, 0, 1, 0, 2.4), { x: 0, y: 0 }).position.y).toBe(2.4);
  });

  it('retombe sur 1,60 m quand l altitude manque', () => {
    expect(cameraDepuisPointDeVue(vue(0, 0, 1, 0), { x: 0, y: 0 }).position.y).toBe(1.6);
    expect(HAUTEUR_YEUX_M).toBe(1.6);
  });

  it('traite une altitude nulle comme absente', () => {
    // Verifie apres coup : ce n'est pas une valeur perdue, parce qu'elle ne peut pas etre saisie.
    // Le panneau d'attributs plafonne l'altitude par le bas a 0,10 m (`min='0.1'` et un
    // `Math.max(0.1, …)` a la saisie) : une camera au ras du sol n'est pas un cas prevu, et `0` ne
    // peut venir que d'un fichier de projet ecrit a la main. Le repli sur 1,60 m est alors le meme
    // que pour un champ absent, ce qui est le comportement le moins surprenant.
    expect(cameraDepuisPointDeVue(vue(0, 0, 1, 0, 0), { x: 0, y: 0 }).position.y).toBe(1.6);
  });
});

describe('la direction du regard', () => {
  it('vise a 1,50 m devant, une distance de conversation', () => {
    const c = cameraDepuisPointDeVue(vue(0, 0, 5, 0), { x: 0, y: 0 });
    const d = Math.hypot(c.cible.x - c.position.x, c.cible.z - c.position.z);
    expect(d).toBeCloseTo(1.5, 9);
  });

  it('ne depend que de la direction, pas de la longueur du second segment', () => {
    // Le second point dit OU regarder, pas a quelle distance : l'eloigner ne change rien.
    const proche = cameraDepuisPointDeVue(vue(0, 0, 1, 1), { x: 0, y: 0 });
    const loin = cameraDepuisPointDeVue(vue(0, 0, 40, 40), { x: 0, y: 0 });
    expect(loin.cible.x).toBeCloseTo(proche.cible.x, 9);
    expect(loin.cible.z).toBeCloseTo(proche.cible.z, 9);
  });

  it('regarde vers l est, vers le nord, vers l ouest', () => {
    const est = cameraDepuisPointDeVue(vue(0, 0, 1, 0), { x: 0, y: 0 });
    expect(est.cible.x).toBeCloseTo(1.5, 9);
    expect(est.cible.z).toBeCloseTo(0, 9);
    const nord = cameraDepuisPointDeVue(vue(0, 0, 0, 1), { x: 0, y: 0 });
    expect(nord.cible.z).toBeCloseTo(-1.5, 9);
    const ouest = cameraDepuisPointDeVue(vue(0, 0, -1, 0), { x: 0, y: 0 });
    expect(ouest.cible.x).toBeCloseTo(-1.5, 9);
  });

  it('regarde a l est quand les deux points sont confondus', () => {
    // Direction indefinie : la longueur nulle est remplacee par 1, ce qui donne l'est. Pas un choix,
    // un repli — mais il ne doit pas produire de NaN.
    const c = cameraDepuisPointDeVue(vue(3, 3, 3, 3), { x: 0, y: 0 });
    expect(Number.isNaN(c.cible.x)).toBe(false);
    expect(c.cible.x).toBeCloseTo(4.5, 9);
  });

  it('garde la cible a la hauteur des yeux : on regarde droit devant', () => {
    const c = cameraDepuisPointDeVue(vue(0, 0, 1, 0, 3), { x: 0, y: 0 });
    expect(c.cible.y).toBe(c.position.y);
  });
});

// ------------------------------------------------------------------------------------------------
// D-15 : le rappel d'un point de vue.
//
// Le defaut avait deux moities, et chacune suffisait a elle seule a immobiliser la camera :
//
// 1. le rappel **exigeait une terrasse**, alors que la Vue 3D s'ouvre sans, et que « Enregistrer la
//    vue » y cree des points de vue. Sur un plan importe par adresse — une parcelle et ses
//    batiments — Plan fabriquait donc des points de vue auxquels il refusait ensuite de revenir,
//    par un message qui reclamait une terrasse ;
// 2. il **recalculait le centre** sur cette terrasse au lieu de reprendre celui de la scene. Les
//    deux coincident quand la scene est cadree sur la terrasse trouvee, et divergent sinon.
//
// Ces tests tiennent les deux, et la cle sous laquelle une scene sans terrasse s'enregistre — celle
// que l'attente guette, et qui n'etait ecrite qu'a l'endroit qui construisait la scene.

describe('D-15 — revenir a un point de vue', () => {
  it('nomme la scene sans terrasse par une cle qui n est celle d aucun objet', () => {
    expect(cleDeVue(null)).toBe(CLE_SANS_TERRASSE);
    expect(cleDeVue(undefined)).toBe(CLE_SANS_TERRASSE);
    expect(cleDeVue({ key: 'path123_4' })).toBe('path123_4');
    expect(CLE_SANS_TERRASSE.startsWith('__')).toBe(true);
  });

  /** Une scene minimale : de quoi enregistrer ce qu'on lui demande de poser. */
  function sceneFactice(cen: { x: number; y: number }) {
    const pose = { position: null as unknown, cible: null as unknown, rendus: 0 };
    return {
      pose,
      scene: {
        cen,
        camera: { position: { set: (x: number, y: number, z: number) => { pose.position = { x, y, z }; } } },
        controls: { target: { set: (x: number, y: number, z: number) => { pose.cible = { x, y, z }; } }, update: () => undefined },
        renderer: { render: () => { pose.rendus++; } },
        scene: {}
      }
    };
  }

  function navigation(objets: unknown[], cleCourante: string | null) {
    const etat = { objects: objets, terrasseSelectedKey: cleCourante, scene: { W: 0, H: 0 } };
    const dits: string[] = [];
    const nav = creerNavigation3d(etat as never, {
      showErrBanner: (m: string) => dits.push('banniere:' + m),
      hauteurFinieMm: () => 0,
      ouvrirVue3d: () => dits.push('ouvre')
    });
    return { nav, dits, etat };
  }

  const pointDeVue = { pts: [{ x: 13, y: 27 }, { x: 14, y: 27 }] };

  it('y va sur un plan SANS terrasse, au lieu d en reclamer une', () => {
    const f = sceneFactice({ x: 10, y: 20 });
    vue3d.scene = f.scene as never;
    vue3d.dernierObjKey = CLE_SANS_TERRASSE;
    const { nav, dits } = navigation([{ key: 'parcelle', fonction: 'terrain' }], null);
    nav.allerAuPointDeVue(pointDeVue as never);
    expect(dits).toEqual(['ouvre']);                       // il ouvre la vue, il ne refuse rien
    expect(f.pose.position).toEqual({ x: 3, y: 1.6, z: -7 });
    expect(f.pose.rendus).toBe(1);
  });

  it('prend le centre de la scene, pas un centroide refait sur la terrasse', () => {
    // La scene est cadree sur { 0, 0 } ; la terrasse trouvee est ailleurs. L'ancienne version
    // mesurait depuis la terrasse et posait la camera a cote.
    const f = sceneFactice({ x: 0, y: 0 });
    vue3d.scene = f.scene as never;
    vue3d.dernierObjKey = 'terr1';
    const terrasse = { key: 'terr1', fonction: 'terrasse', type: 'poly', pts: [{ x: 100, y: 100 }, { x: 102, y: 100 }, { x: 102, y: 102 }] };
    const { nav } = navigation([terrasse], 'terr1');
    nav.allerAuPointDeVue(pointDeVue as never);
    expect(f.pose.position).toEqual({ x: 13, y: 1.6, z: -27 });
  });

  it('fait de la terrasse trouvee la terrasse courante, comme avant', () => {
    const f = sceneFactice({ x: 0, y: 0 });
    vue3d.scene = f.scene as never;
    vue3d.dernierObjKey = 'terr2';
    const { nav, etat } = navigation([{ key: 'terr2', fonction: 'terrasse' }], null);
    nav.allerAuPointDeVue(pointDeVue as never);
    expect(etat.terrasseSelectedKey).toBe('terr2');
  });

  it('attend la bonne scene : celle d une autre terrasse ne compte pas', () => {
    const f = sceneFactice({ x: 0, y: 0 });
    vue3d.scene = f.scene as never;
    vue3d.dernierObjKey = 'une_autre';
    const { nav } = navigation([{ key: 'terr3', fonction: 'terrasse' }], 'terr3');
    nav.allerAuPointDeVue(pointDeVue as never);
    expect(f.pose.position).toBe(null);   // rien n'est pose dans la scene precedente
  });

  it('dans la visionneuse, mesure depuis le centre parti avec le modele', () => {
    const f = sceneFactice({ x: 999, y: 999 });   // la visionneuse n'a pas de `cen` a elle
    glb.scene = f.scene as never;
    glb.dernierExporte = { buffer: new ArrayBuffer(0), nomTerrasse: 'T', date: new Date(), centre: { x: 10, y: 20 } };
    const { nav } = navigation([], null);
    nav.allerAuPointDeVueGlb(pointDeVue as never);
    expect(f.pose.position).toEqual({ x: 3, y: 1.6, z: -7 });
  });

  it('ne fait rien dans la visionneuse tant qu aucun modele n a ete exporte', () => {
    const f = sceneFactice({ x: 0, y: 0 });
    glb.scene = f.scene as never;
    glb.dernierExporte = null;
    const { nav } = navigation([], null);
    nav.allerAuPointDeVueGlb(pointDeVue as never);
    expect(f.pose.position).toBe(null);
  });
});

describe('D-15 — la liste des points de vue', () => {
  // Second symptome, trouve en cherchant le premier : la liste « Aller a un point de vue
  // enregistre… » ne se remplissait qu'a la construction de la scene. On creait un point de vue, la
  // liste restait vide, et il fallait sortir de la Vue 3D puis y revenir pour le voir apparaitre.
  // C'est ce decalage qui a fait croire, pendant la liste de fumee, que la liste portait les cles
  // d'un autre plan. Depuis, la liste est rendue par le panneau (zones/vue3d/communs.tsx) a partir
  // des objets du plan : il suffit que la creation le signale.
  it('se remplit des qu un point de vue est cree, sans attendre une reconstruction', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(__dirname, '../../../src/app/ecouteurs/vue3d.ts'), 'utf8');
    const i = source.indexOf("'3d.enregistrerPointDeVue'");
    expect(i, 'la commande a ete renommee').toBeGreaterThan(0);
    const bloc = source.slice(i, source.indexOf('showToast(', i));
    expect(bloc).toContain('signaler3d()');
  });
});
