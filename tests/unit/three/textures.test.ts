import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

beforeEach(() => {
  vi.resetModules();
  rendus.length = 0;
  (globalThis as Record<string, unknown>).THREE = {
    RepeatWrapping: 1000,
    TextureLoader: class {
      load(url: string) { const t = textureFactice(url); rendus.push(t); return t; }
    }
  };
});

async function chargeurs() {
  // Reimporte a chaque essai : le cache est un etat de module, et un essai ne doit pas heriter de
  // celui du precedent.
  return await import('../../../src/three/chargeurs.js');
}

describe('le cache des textures', () => {
  it('rend la MEME instance pour la meme URL', async () => {
    const { chargerTexturePolyhaven } = await chargeurs();
    const a = chargerTexturePolyhaven('https://exemple/chene.jpg');
    const b = chargerTexturePolyhaven('https://exemple/chene.jpg');
    expect(b).toBe(a);
    expect(rendus.length, 'une seule vraie instance fabriquee').toBe(1);
  });

  it('separe deux URL differentes', async () => {
    const { chargerTexturePolyhaven, nombreDeTexturesPartagees } = await chargeurs();
    chargerTexturePolyhaven('https://exemple/chene.jpg');
    chargerTexturePolyhaven('https://exemple/teck.jpg');
    expect(nombreDeTexturesPartagees()).toBe(2);
  });

  it('reproduit le rapport du plan de demonstration : huit images, cent soixante-dix-huit usages', async () => {
    // Le chiffre vient du temoin `glb-structure.json` (178 textures) et du temoin `projet.json`
    // (huit URL distinctes). C'est la mesure qui a designe le coupable.
    const { chargerTexturePolyhaven, nombreDeTexturesPartagees } = await chargeurs();
    const huit = Array.from({ length: 8 }, (_, i) => 'https://exemple/image' + i + '.jpg');
    for (let i = 0; i < 178; i++) chargerTexturePolyhaven(huit[i % 8]!);
    expect(nombreDeTexturesPartagees()).toBe(8);
    expect(rendus.length).toBe(8);
  });

  it('pose la repetition lui-meme : aucun appelant n a plus a toucher l instance', async () => {
    const { chargerTexturePolyhaven, METRES_PAR_CARREAU } = await chargeurs();
    const t = chargerTexturePolyhaven('https://exemple/chene.jpg');
    expect(METRES_PAR_CARREAU).toBe(2);
    expect(t.repeat.x).toBeCloseTo(1 / METRES_PAR_CARREAU, 9);
    expect(t.repeat.y).toBeCloseTo(1 / METRES_PAR_CARREAU, 9);
  });

  it('marque ce qu il possede, et rien d autre', async () => {
    const { chargerTexturePolyhaven, estTexturePartagee } = await chargeurs();
    const mienne = chargerTexturePolyhaven('https://exemple/chene.jpg');
    const etrangere = textureFactice('tuile-orthophoto');
    expect(estTexturePartagee(mienne as never)).toBe(true);
    expect(estTexturePartagee(etrangere as never)).toBe(false);
  });
});

describe('qui a le droit de detruire une texture', () => {
  it('la liberation vide le cache et rend chaque instance', async () => {
    const { chargerTexturePolyhaven, libererTexturesPartagees, nombreDeTexturesPartagees } = await chargeurs();
    chargerTexturePolyhaven('https://exemple/chene.jpg');
    chargerTexturePolyhaven('https://exemple/teck.jpg');
    libererTexturesPartagees();
    expect(nombreDeTexturesPartagees()).toBe(0);
    expect(rendus.map((t) => t.libere)).toEqual([1, 1]);
  });

  it('une URL rechargee apres liberation donne une instance neuve', async () => {
    // Sinon on distribuerait une texture deja rendue a la carte graphique, et la scene suivante
    // afficherait du noir — l'autre facon de se tromper.
    const { chargerTexturePolyhaven, libererTexturesPartagees } = await chargeurs();
    const avant = chargerTexturePolyhaven('https://exemple/chene.jpg');
    libererTexturesPartagees();
    const apres = chargerTexturePolyhaven('https://exemple/chene.jpg');
    expect(apres).not.toBe(avant);
    expect(rendus.length).toBe(2);
  });
});

describe('ce que la source doit continuer de dire', () => {
  const scene = readFileSync(resolve(__dirname, '../../../src/three/scene.ts'), 'utf8');
  const sansCommentaires = scene.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  it('la scene ne regle plus la repetition d une texture qu elle emprunte', () => {
    // C'etait vrai a deux endroits, et cela rendait le partage impossible : deux objets auraient
    // reecrit la meme instance. Si quelqu'un le refait, ce test tombe avant l'affichage.
    expect(sansCommentaires).not.toMatch(/\.map\.repeat\.set/);
    expect(sansCommentaires).not.toMatch(/METRES_PAR_CARREAU/);
  });

  it('la demolition de scene epargne ce qu elle a emprunte', () => {
    const viewer = readFileSync(resolve(__dirname, '../../../src/three/glbViewer.ts'), 'utf8');
    expect(viewer).toContain('estTexture(v) && !estTexturePartagee(v)');
    expect(viewer).toContain('!estTexturePartagee(scene.background)');
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
