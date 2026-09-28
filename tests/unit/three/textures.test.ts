import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  chargerTexturePolyhaven, libererTexturesPartagees, nombreDeTexturesPartagees,
  estTexturePartagee, METRES_PAR_CARREAU
} from '../../../src/three/chargeurs.js';

// Le partage des textures (24 septembre 2026), et la possession qui va avec.
//
// Le plan de demonstration ne reference que **huit** images ; la scene 3D en fabriquait **178** —
// une par face de lame, de solive, de lambourde, chacune televersee separement sur la carte
// graphique. A 1024 x 1024, une image coute 4 Mio, pres de 5,3 Mio avec ses niveaux de detail :
// environ 950 Mio au lieu de 43. Un onglet de telephone en a quelques centaines, et le depassement
// ne leve aucune erreur rattrapable — le systeme met fin au processus, ce qui se voit comme un
// plantage a l'affichage de la vue 3D.
//
// Partager introduit un piege exact et connu : la demolition de scene liberait toute texture
// rencontree, et libererait donc celle que la scene suivante attend. Ces tests tiennent les deux
// moities — le partage, et le fait que la scene n'est plus proprietaire.

/** Une texture minimale, telle que `TextureLoader` en rend une. */
function textureFactice(url: string) {
  return {
    isTexture: true, url,
    image: undefined as unknown,
    needsUpdate: false,
    wrapS: 0, wrapT: 0,
    repeat: { x: 1, y: 1, set(x: number, y: number) { this.x = x; this.y = y; } },
    libere: 0,
    dispose() { this.libere++; }
  };
}

const rendus: ReturnType<typeof textureFactice>[] = [];

// Le module est importe **une fois**, et le cache vide entre deux essais par sa propre porte de
// sortie. La premiere ecriture reimportait le module a chaque cas, apres `vi.resetModules()` : le
// premier essai payait alors une recompilation qui allait de 300 ms a 3,4 s selon la charge de la
// machine, sous un plafond de 5 s. Il a fini par le depasser, et un essai qui tombe pour cette
// raison-la ne dit plus rien de ce qu'il verifie.
//
// Rien n'est perdu : `chargerTexturePolyhaven` lit `THREE` au moment de l'appel, pas de l'import,
// et `libererTexturesPartagees` est exactement la remise a zero demandee — celle que le programme
// utilise vraiment.
beforeEach(() => {
  rendus.length = 0;
  (globalThis as Record<string, unknown>).THREE = {
    RepeatWrapping: 1000,
    TextureLoader: class {
      load(url: string) { const t = textureFactice(url); rendus.push(t); return t; }
    }
  };
  libererTexturesPartagees();
});

describe('le cache des textures', () => {
  it('rend la MEME instance pour la meme URL', () => {
    const a = chargerTexturePolyhaven('https://exemple/chene.jpg');
    const b = chargerTexturePolyhaven('https://exemple/chene.jpg');
    expect(b).toBe(a);
    expect(rendus.length, 'une seule vraie instance fabriquee').toBe(1);
  });

  it('separe deux URL differentes', () => {
    chargerTexturePolyhaven('https://exemple/chene.jpg');
    chargerTexturePolyhaven('https://exemple/teck.jpg');
    expect(nombreDeTexturesPartagees()).toBe(2);
  });

  it('reproduit le rapport du plan de demonstration : huit images, cent soixante-dix-huit usages', () => {
    // Le chiffre vient du temoin `glb-structure.json` (178 textures) et du temoin `projet.json`
    // (huit URL distinctes). C'est la mesure qui a designe le coupable.
    const huit = Array.from({ length: 8 }, (_, i) => 'https://exemple/image' + i + '.jpg');
    for (let i = 0; i < 178; i++) chargerTexturePolyhaven(huit[i % 8]!);
    expect(nombreDeTexturesPartagees()).toBe(8);
    expect(rendus.length).toBe(8);
  });

  it('pose la repetition lui-meme : aucun appelant n a plus a toucher l instance', () => {
    const carreau = chargerTexturePolyhaven('https://exemple/chene.jpg', 1 / METRES_PAR_CARREAU);
    expect(METRES_PAR_CARREAU).toBe(2);
    expect(carreau.repeat.x).toBeCloseTo(0.5, 9);
    expect(carreau.repeat.y).toBeCloseTo(0.5, 9);
  });

  it('fait le tour une fois par defaut : un cone et une sphere ne se mesurent pas en metres', () => {
    const enroulee = chargerTexturePolyhaven('https://exemple/ecorce.jpg');
    expect(enroulee.repeat.x).toBe(1);
  });

  it('separe les deux echelles d une meme image, parce que Three porte la repetition sur la texture', () => {
    // C'est le piege qui a failli passer : une seule instance par URL aurait donne au cone d'un
    // parasol et a la sphere d'un arbre l'echelle du carreau, alors que leurs coordonnees de
    // texture sont normalisees. On aurait corrige le plantage en abimant deux objets.
    const mur = chargerTexturePolyhaven('https://exemple/chene.jpg', 1 / METRES_PAR_CARREAU);
    const arbre = chargerTexturePolyhaven('https://exemple/chene.jpg');
    expect(arbre).not.toBe(mur);
    expect(mur.repeat.x).toBeCloseTo(0.5, 9);
    expect(arbre.repeat.x).toBe(1);
    expect(nombreDeTexturesPartagees(), 'deux echelles, deux instances, pas une de plus').toBe(2);
  });

  it('marque ce qu il possede, et rien d autre', () => {
    const mienne = chargerTexturePolyhaven('https://exemple/chene.jpg');
    const etrangere = textureFactice('tuile-orthophoto');
    expect(estTexturePartagee(mienne as never)).toBe(true);
    expect(estTexturePartagee(etrangere as never)).toBe(false);
  });
});

describe('qui a le droit de detruire une texture', () => {
  it('la liberation vide le cache et rend chaque instance', () => {
    chargerTexturePolyhaven('https://exemple/chene.jpg');
    chargerTexturePolyhaven('https://exemple/teck.jpg');
    libererTexturesPartagees();
    expect(nombreDeTexturesPartagees()).toBe(0);
    expect(rendus.map((t) => t.libere)).toEqual([1, 1]);
  });

  it('une URL rechargee apres liberation donne une instance neuve', () => {
    // Sinon on distribuerait une texture deja rendue a la carte graphique, et la scene suivante
    // afficherait du noir — l'autre facon de se tromper.
    const avant = chargerTexturePolyhaven('https://exemple/chene.jpg');
    libererTexturesPartagees();
    const apres = chargerTexturePolyhaven('https://exemple/chene.jpg');
    expect(apres).not.toBe(avant);
    expect(rendus.length).toBe(2);
  });
});

describe('ce que la source doit continuer de dire', () => {
  // La scene et ses briques (three/primitives.ts) : le prisme et le ruban vivent dans la seconde.
  const scene = ['scene.ts', 'primitives.ts']
    .map((f) => readFileSync(resolve(__dirname, '../../../src/three/' + f), 'utf8')).join('\n');
  const sansCommentaires = scene.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  it('la scene ne regle plus la repetition d une texture qu elle emprunte', () => {
    // C'etait vrai a deux endroits, et cela rendait le partage impossible : deux objets auraient
    // reecrit la meme instance. Elle la DEMANDE desormais, elle ne la pose plus.
    expect(sansCommentaires).not.toMatch(/\.map\.repeat\.set/);
  });

  it('demande l echelle du carreau la ou les coordonnees sont des metres, et nulle part ailleurs', () => {
    // Deux familles, et le compte de chacune. Un appel de plus dans la mauvaise colonne remettrait
    // un cone de parasol ou une sphere d'arbre a l'echelle d'un mur.
    const appels = sansCommentaires.match(/chargerTexture(?:Polyhaven)?\([^)]*\)/g) || [];
    const avecCarreau = appels.filter((a) => a.includes('METRES_PAR_CARREAU'));
    const sansCarreau = appels.filter((a) => !a.includes('METRES_PAR_CARREAU'));
    expect(avecCarreau.length, 'prisme et ruban : leurs UV sont des metres').toBe(2);
    expect(sansCarreau.length, 'toile de parasol et feuillage : leurs UV sont normalises').toBe(2);
  });

  it('la demolition de scene epargne ce qu elle a emprunte', () => {
    const viewer = readFileSync(resolve(__dirname, '../../../src/three/glbViewer.ts'), 'utf8');
    expect(viewer).toContain('estTexture(v) && !estTexturePartagee(v)');
    expect(viewer).toContain('!estTexturePartagee(scene.background)');
  });

  it('l export GLB serialise la scene de la Vue 3D, donc il herite du partage', () => {
    // C'est ce qui rend la correction valable pour les trois chemins d'un seul geste. L'exportateur
    // de Three range ses textures dans un cache indexe par l'INSTANCE (`cache.textures.has(map)`) :
    // 178 instances distinctes donnaient 178 images embarquees, huit instances en donnent huit.
    const exportGlb = readFileSync(resolve(__dirname, '../../../src/three/exportGlb.ts'), 'utf8');
    expect(exportGlb).toContain('const sc = vue3d.scene;');
    expect(exportGlb).toContain('exporteur.parse(sc.scene');
  });

  it('la visionneuse ne montre que ce que Plan vient d exporter', () => {
    // Elle fabrique ses propres textures, par le lecteur glTF, a partir des images du fichier :
    // elles ne sont ni partagees ni marquees, donc la demolition les libere comme avant. Son gain
    // est indirect et entier — le fichier qu'elle relit ne porte plus les images en double.
    const viewer = readFileSync(resolve(__dirname, '../../../src/three/glbViewer.ts'), 'utf8');
    expect(viewer).toContain('loader.parse(glb.dernierExporte.buffer');
    // Une seule lecture de modele, et c'est celle-la : le jour ou une seconde apparait — un fichier
    // choisi sur le disque, par exemple — le raisonnement ci-dessus cesse de tenir, et ce compte le
    // dira avant qu'un .glb etranger ne fasse revivre le probleme.
    expect(viewer.split('loader.parse(').length - 1, 'une seule source de modele').toBe(1);
  });

  it('libere au retour au plan, jamais a la demolition d une scene', () => {
    // `buildThreeScene` commence par demolir la scene precedente : liberer la viderait le cache a
    // chaque case cochee, et le partage ne servirait plus a rien.
    const modes = readFileSync(resolve(__dirname, '../../../src/app/modes.ts'), 'utf8');
    expect(modes).toContain('libererTexturesPartagees()');
    const viewer = readFileSync(resolve(__dirname, '../../../src/three/glbViewer.ts'), 'utf8');
    expect(viewer).not.toContain('libererTexturesPartagees');
  });
});
