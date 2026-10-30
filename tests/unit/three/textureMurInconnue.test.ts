import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { pixelsTextureMur, textureMur } from '../../../src/three/textureMur.js';
import { textureDesMurs, type MateriauTexture } from '../../../src/model/couleurMur.js';
import { serializeObjects } from '../../../src/io/serialisation.js';
import { poserAvertissementMotsInconnus } from '../../../src/shell/motsInconnus.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Le materiau des murs vu sur place (`batiment.couleurMurs.materiau`, ecrit par un audit) se lit dans le fichier tel quel
// (textureDesMurs ne le verifie pas) : un mot d'une version plus recente arrivait dans la table des peintres, qui ne rendait pas de
// fonction. Decision du 30 octobre 2026 : il se dessine en enduit, Plan le signale une fois par mot, la donnee reste.

let signaux: string[] = [];
beforeEach(() => { signaux = []; poserAvertissementMotsInconnus((m) => signaux.push(m)); });
afterAll(() => poserAvertissementMotsInconnus(null));

const PISE = 'pise' as MateriauTexture;
const maison = (): ObjetPlan => ({
  key: 'm', name: 'Maison', type: 'polygon', fonction: 'batiment', elevation: 6,
  pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }],
  batiment: { couleurMurs: { materiau: PISE } },
} as ObjetPlan);

describe('materiau des murs hors catalogue', () => {
  it('arrive bien du fichier jusqu a la texture : textureDesMurs le rend tel quel', () => {
    expect(textureDesMurs(maison())).toBe('pise');
  });

  it('ne leve pas et se dessine en enduit', () => {
    expect(() => pixelsTextureMur(PISE, 32)).not.toThrow();
    expect(Buffer.from(pixelsTextureMur(PISE, 32)).equals(Buffer.from(pixelsTextureMur('enduit', 32)))).toBe(true);
    // Sans canevas (pas de document), la texture est nulle, comme pour un materiau connu : pas d'erreur.
    expect(textureMur(PISE)).toBeNull();
  });

  it('se signale une fois par mot, et un materiau connu ne signale rien', () => {
    for (let k = 0; k < 3; k++) { pixelsTextureMur(PISE, 8); textureMur(PISE); }
    pixelsTextureMur('brique', 8);
    expect(signaux).toEqual(['Matériau des murs inconnu (« pise »), dessiné en enduit.']);
  });

  it('ne touche pas a la donnee', () => {
    const o = maison();
    const avant = JSON.stringify(serializeObjects([o]));
    pixelsTextureMur(textureDesMurs(o)!, 8);
    expect(JSON.stringify(serializeObjects([o]))).toBe(avant);
    expect(avant).toContain('"materiau":"pise"');
  });
});
