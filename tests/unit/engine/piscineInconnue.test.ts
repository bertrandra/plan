import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { calculerPiscine, chiffrerPiscine, libellePiscine, motInconnuPiscine, noteDeCalcul, piscineDe } from '../../../src/engine/piscine.js';
import { construireDossierPiscine } from '../../../src/export/dossierPiscine.js';
import { sectionsObjet } from '../../../src/ui/champs/objet.js';
import { nouvellePiscine } from '../../../src/model/creation.js';
import { serializeObjects } from '../../../src/io/serialisation.js';
import { poserAvertissementMotsInconnus } from '../../../src/shell/motsInconnus.js';
import type { ChampChoix, ContexteChamps } from '../../../src/ui/champs/types.js';
import type { ObjetPlan, Piscine } from '../../../src/model/types.js';

// Une piscine dont un reglage a vocabulaire ferme porte un mot hors catalogue (fichier d'une version plus recente, ou abime).
// `piscineDe` se repliait deja sur la valeur par defaut, en silence, et les exports ecrivaient le libelle du repli. Decision du
// 30 octobre 2026 (suite de #528) : meme repli, signale une fois par mot ; les exports ecrivent « mot (inconnu, calculé en X) » ;
// l'inspecteur montre le mot ; la donnee reste.

let signaux: string[] = [];
beforeEach(() => { signaux = []; poserAvertissementMotsInconnus((m) => signaux.push(m)); });
afterAll(() => poserAvertissementMotsInconnus(null));

const parcelle: ObjetPlan = {
  key: 'parcelle', name: 'Parcelle', type: 'polygon', fonction: 'terrain',
  pts: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 25 }, { x: 0, y: 25 }],
};
const bassin = (p: Piscine): ObjetPlan => {
  const o = nouvellePiscine('rectangle', { x: 15, y: 8 }, 'p', 1).obj;
  o.piscine = { ...(o.piscine ?? {}), ...p };
  return o;
};
const INCONNUS = {
  implantation: 'flottante', structure: 'inox', fond: 'vague', plage: 'sable', traitement: 'uv', chauffage: 'geothermie', securite: 'drone', local: 'cabane',
} as unknown as Piscine;

describe('piscine hors vocabulaire : le calcul', () => {
  it('se calcule sur les valeurs par defaut, comme avant, sans NaN ni undefined', () => {
    const o = bassin(INCONNUS), neuve = bassin({});
    expect(piscineDe(o)).toEqual(piscineDe(neuve));
    const calc = calculerPiscine(o, [parcelle, o])!;
    expect(calc).toEqual(calculerPiscine(neuve, [parcelle, neuve]));
    const ch = chiffrerPiscine(calc, o);
    expect(Number.isFinite(ch.bas) && Number.isFinite(ch.haut)).toBe(true);
    expect(ch.lignes.map((l) => [l.poste, l.qte, l.prixBas])).toEqual(chiffrerPiscine(calculerPiscine(neuve, [parcelle, neuve])!).lignes.map((l) => [l.poste, l.qte, l.prixBas]));
  });

  it('un mot du prototype n est pas une essence : il se calcule comme un inconnu', () => {
    const o = bassin({ plage: 'terrasse-bois', essencePlage: 'constructor' });
    expect(piscineDe(o).essencePlage).toBe('pin-classe4');
    expect(motInconnuPiscine(o, 'essencePlage')).toBe('constructor');
  });

  it('se signale une fois par mot, au genre du reglage', () => {
    const o = bassin(INCONNUS);
    for (let k = 0; k < 3; k++) calculerPiscine(o, [parcelle, o]);
    expect(signaux).toEqual([
      'Implantation inconnue (« flottante »), calculée en enterrée.',
      'Structure inconnue (« inox »), calculée en coque polyester.',
      'Fond inconnu (« vague »), calculé en fond plat.',
      'Plage inconnue (« sable »), calculée en aucune (gazon, gravier).',
      'Traitement inconnu (« uv »), calculé en chlore.',
      'Chauffage inconnu (« geothermie »), calculé en aucun.',
      'Sécurité inconnue (« drone »), calculée en alarme (nf p90-307).',
      'Local technique inconnu (« cabane »), calculé en local technique enterré préfabriqué.',
    ]);
  });

  it('ne signale rien pour une piscine du catalogue, ni pour un mot qui ne sert pas', () => {
    calculerPiscine(bassin({ structure: 'maconnerie', revetement: 'carrelage', fond: 'fosse', plage: 'dallage' }), []);
    // Un revetement connu que la structure n'admet pas suit la regle d'avant ; l'essence d'une plage qui n'est pas en bois ne sert pas.
    calculerPiscine(bassin({ structure: 'coque', revetement: 'liner', essencePlage: 'bambou' }), []);
    const rond = nouvellePiscine('ronde', { x: 15, y: 8 }, 'r', 1).obj;
    rond.piscine = { ...(rond.piscine ?? {}), fond: 'vague' as NonNullable<Piscine['fond']> };
    calculerPiscine(rond, []);
    expect(signaux).toEqual([]);
  });

  it('ne touche pas a la donnee : l export du projet reste identique a l octet', () => {
    const o = bassin(INCONNUS);
    const avant = JSON.stringify(serializeObjects([o]));
    const calc = calculerPiscine(o, [parcelle, o])!;
    chiffrerPiscine(calc, o); noteDeCalcul(calc, o); construireDossierPiscine([parcelle, o], null, { appVersion: '9.9.9', dateDuJour: () => '30/10/2026' });
    expect(JSON.stringify(serializeObjects([o]))).toBe(avant);
    expect(avant).toContain('"structure":"inox"');
  });
});

describe('piscine hors vocabulaire : les exports ecrivent le mot lu', () => {
  it('libellePiscine : le libelle retenu, ou le mot et ce sur quoi on calcule', () => {
    const o = bassin(INCONNUS), r = piscineDe(o);
    expect(libellePiscine(o, r, 'structure')).toBe('inox (inconnu, calculé en coque polyester)');
    expect(libellePiscine(o, r, 'revetement', (l) => l.toLowerCase())).toBe('gelcoat (coque)');
    const connue = bassin({ structure: 'maconnerie' });
    expect(libellePiscine(connue, piscineDe(connue), 'structure', (l) => l.toLowerCase())).toBe('maçonnerie (blocs à bancher)');
    expect(libellePiscine(null, r, 'structure')).toBe('Coque polyester');
  });

  it('la note de calcul et le chiffrage disent le mot lu', () => {
    const o = bassin({ ...INCONNUS, plage: 'terrasse-bois', essencePlage: 'bambou' });
    const calc = calculerPiscine(o, [parcelle, o])!;
    const note = JSON.stringify(noteDeCalcul(calc, o));
    for (const t of ['inox (inconnu, calculé en coque polyester)', 'flottante (inconnu, calculé en enterrée)', 'vague (inconnu, calculé en fond plat)',
      'uv (inconnu, calculé en chlore)', 'geothermie (inconnu, calculé en aucun)', 'drone (inconnu, calculé en alarme (nf p90-307))',
      'cabane (inconnu, calculé en local technique enterré préfabriqué)', 'bambou (inconnu, calculé en pin classe 4 (autoclave))']) expect(note).toContain(t);
    expect(note).not.toContain('undefined');
    const lignes = chiffrerPiscine(calc, o).lignes.map((l) => l.label);
    expect(lignes).toContain('cabane (inconnu, calculé en local technique enterré préfabriqué)');
    expect(lignes).toContain('Sécurité : drone (inconnu, calculé en alarme (nf p90-307))');
    expect(lignes.some((l) => l.includes('bambou (inconnu'))).toBe(true);
    // Sans l'objet, les libelles d'avant.
    expect(JSON.stringify(noteDeCalcul(calc))).not.toContain('inox');
  });

  it('le dossier de mairie ecrit le mot lu, jamais undefined', () => {
    const o = bassin(INCONNUS);
    const d = construireDossierPiscine([parcelle, o], null, { appVersion: '9.9.9', dateDuJour: () => '30/10/2026' });
    const t = d.pdf.replace(/\\\(/g, '(').replace(/\\\)/g, ')');
    for (const mot of ['inox', 'flottante', 'cabane', 'drone']) expect(t).toContain(mot);
    expect(t).not.toContain('undefined');
  });
});

describe('piscine hors vocabulaire : l inspecteur', () => {
  const contexte = (o: ObjetPlan) => ({ obj: o, objets: [parcelle, o], elevationOf: () => 0 }) as unknown as ContexteChamps;
  const champ = (o: ObjetPlan, cle: string) => sectionsObjet(contexte(o)).flatMap((s) => s.champs).find((c) => c.cle === cle) as ChampChoix;

  it('montre le mot lu, et le reprendre n ecrit rien', () => {
    const o = bassin(INCONNUS);
    const avant = JSON.stringify(serializeObjects([o]));
    for (const [cle, mot] of [['structure', 'inox'], ['implantation', 'flottante'], ['local', 'cabane'], ['plage', 'sable'], ['securite', 'drone']] as const) {
      const ch = champ(o, cle);
      expect(ch.lire(contexte(o))).toBe(mot);
      expect(ch.options(contexte(o)).at(-1)?.valeur).toBe(mot);
      ch.ecrire(contexte(o), mot);
    }
    expect(champ(o, 'structure').options(contexte(o)).at(-1)?.libelle).toBe('Structure inconnue (« inox »), calculée en coque polyester');
    expect(JSON.stringify(serializeObjects([o]))).toBe(avant);
    // Un choix du catalogue s'ecrit comme avant.
    champ(o, 'structure').ecrire(contexte(o), 'maconnerie');
    expect(o.piscine?.structure).toBe('maconnerie');
  });

  it('une piscine du catalogue n a pas d option de plus', () => {
    const o = bassin({});
    expect(champ(o, 'structure').options(contexte(o)).map((x) => x.valeur)).toEqual(['coque', 'maconnerie', 'kit']);
    expect(champ(o, 'structure').lire(contexte(o))).toBe('coque');
  });
});
