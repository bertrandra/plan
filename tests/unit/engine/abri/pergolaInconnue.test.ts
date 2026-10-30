import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { calculerPergola, chiffrerPergola, longueursPergola, materiauPergolaInconnu, metrageParSection, pergolaDe, prixMlDe, toitPergolaInconnu } from '../../../../src/engine/abri/pergola.js';
import { noteDeCalcul } from '../../../../src/engine/abri/noteCalcul.js';
import { ouvragesDeclares } from '../../../../src/export/cerfa13703.js';
import { construireNoteCalculPDF } from '../../../../src/export/noteCalculPdf.js';
import { sectionsObjet } from '../../../../src/ui/champs/objet.js';
import { serializeObjects } from '../../../../src/io/serialisation.js';
import { poserAvertissementMotsInconnus } from '../../../../src/shell/motsInconnus.js';
import type { ContexteChamps, ChampChoix } from '../../../../src/ui/champs/types.js';
import type { MateriauPergola, ObjetPlan, Pergola, ToitPergola } from '../../../../src/model/types.js';

// Une pergola dont le materiau ou le toit est hors catalogue (fichier d'une version plus recente, ou mot corrompu). Decision du 30
// octobre 2026 : elle se calcule comme une pergola neuve (bois, le toit par defaut de l'ouvrage), Plan le signale une fois par mot,
// les exports ecrivent le mot lu, et l'objet reste tel quel.

let signaux: string[] = [];
beforeEach(() => { signaux = []; poserAvertissementMotsInconnus((m) => signaux.push(m)); });
afterAll(() => poserAvertissementMotsInconnus(null));

const ACIER = 'acier' as MateriauPergola, VOUTE = 'voute' as ToitPergola;
const abri = (p: Pergola, fonction = 'pergola'): ObjetPlan => ({
  key: 'p', name: 'Pergola 1', type: 'polygon', fonction,
  pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }], pergola: p,
} as ObjetPlan);
const calcul: NonNullable<Pergola['calcul']> = { zoneNeige: 'C1', zoneVent: 2, altitude: 300 };

describe('pergola hors catalogue : le calcul', () => {
  it('se calcule en bois avec le toit de l ouvrage, comme une pergola neuve, sans NaN ni undefined', () => {
    const o = abri({ materiau: ACIER, toit: VOUTE, calcul });
    const r = pergolaDe(o);
    expect(r).toEqual(pergolaDe(abri({ calcul })));
    expect(pergolaDe(abri({ toit: VOUTE }, 'carport')).toit).toBe('appentis');
    const calc = calculerPergola(o)!;
    const chiffrage = chiffrerPergola(calc, metrageParSection(calc));
    expect(chiffrage).toEqual(chiffrerPergola(calculerPergola(abri({ calcul }))!));
    expect(Number.isFinite(chiffrage.total)).toBe(true);
    expect(longueursPergola(r)).toEqual([6, 5, 4, 3, 2.5]);
    expect(prixMlDe(r, '75x200')).toBe(18);
    expect(() => noteDeCalcul(o)).not.toThrow();
    expect(noteDeCalcul(o)).toEqual(noteDeCalcul(abri({ calcul })));
  });

  it('un mot du prototype n est pas un toit : il se calcule comme un inconnu', () => {
    const o = abri({ toit: 'constructor' as ToitPergola });
    expect(pergolaDe(o).toit).toBe('toile');
    expect(Number.isFinite(pergolaDe(o).pente)).toBe(true);
  });

  it('se signale une fois par mot, pas a chaque calcul', () => {
    const o = abri({ materiau: ACIER, toit: VOUTE, calcul });
    for (let k = 0; k < 4; k++) { calculerPergola(o); noteDeCalcul(o); }
    expect(signaux).toEqual(['Toit inconnu (« voute »), calculé en chevrons et toile.', 'Matériau inconnu (« acier »), calculé en bois.']);
  });

  it('une pergola du catalogue, ou sans materiau, ne signale rien', () => {
    for (const p of [{}, { materiau: 'aluminium', toit: 'quatre-pans' }, { materiau: 'bois', toit: 'appentis' }] as Pergola[]) calculerPergola(abri(p));
    expect(signaux).toEqual([]);
    expect(materiauPergolaInconnu(abri({}))).toBeNull();
    expect(toitPergolaInconnu(abri({ toit: 'appentis' }))).toBeNull();
  });

  it('ne touche pas a la donnee : l export du projet reste identique a l octet', () => {
    const o = abri({ materiau: ACIER, toit: VOUTE, calcul });
    const avant = JSON.stringify(serializeObjects([o]));
    calculerPergola(o); noteDeCalcul(o); ouvragesDeclares([o]); construireNoteCalculPDF(o, { appVersion: '9.9.9' });
    expect(JSON.stringify(serializeObjects([o]))).toBe(avant);
    expect(avant).toContain('"materiau":"acier"');
    expect(avant).toContain('"toit":"voute"');
  });
});

describe('pergola hors catalogue : les exports ecrivent le mot lu', () => {
  it('la description du CERFA dit le materiau et le toit lus, jamais ceux du repli', () => {
    const [d] = ouvragesDeclares([abri({ materiau: ACIER, toit: VOUTE })]);
    expect(d!.description).toContain('une pergola en acier');
    expect(d!.description).toContain('toit voute');
    expect(d!.description).not.toContain('bois');
    expect(d!.description).not.toContain('undefined');
    // Une pergola du catalogue s'ecrit comme avant.
    expect(ouvragesDeclares([abri({})])[0]!.description).toContain('une pergola en bois');
  });

  it('la note de calcul en PDF dit le mot lu et ce sur quoi elle est calculee', () => {
    const res = construireNoteCalculPDF(abri({ materiau: ACIER, toit: VOUTE, calcul }), { appVersion: '9.9.9' })!;
    // Les parentheses s'echappent dans le flux du PDF.
    expect(res.pdf).toContain('Materiau : acier \\(inconnu, calcule en bois\\) ; toit : voute \\(inconnu, calcule en chevrons et toile\\)');
    expect(res.pdf).not.toContain('undefined');
    expect(construireNoteCalculPDF(abri({ calcul }), { appVersion: '9.9.9' })!.pdf).toContain('Materiau : Bois ; toit : Chevrons et toile ;');
  });
});

describe('pergola hors catalogue : l inspecteur', () => {
  const contexte = (o: ObjetPlan) => ({ obj: o, objets: [o], elevationOf: () => 2.4 }) as unknown as ContexteChamps;
  const champ = (o: ObjetPlan, cle: string) => sectionsObjet(contexte(o)).find((s) => s.id === 'pergola')!.champs.find((c) => c.cle === cle) as ChampChoix;

  it('montre le mot lu, et le reprendre n ecrit rien', () => {
    const o = abri({ materiau: ACIER, toit: VOUTE, sectionPoteau: '120x120' });
    const materiau = champ(o, 'materiau'), toit = champ(o, 'toit');
    expect(materiau.lire(contexte(o))).toBe('acier');
    expect(materiau.options(contexte(o))).toContainEqual({ valeur: 'acier', libelle: 'Matériau inconnu (« acier »), calculé en bois' });
    expect(toit.lire(contexte(o))).toBe('voute');
    expect(toit.options(contexte(o))).toContainEqual({ valeur: 'voute', libelle: 'Toit inconnu (« voute »), calculé en chevrons et toile' });
    materiau.ecrire(contexte(o), 'acier');
    toit.ecrire(contexte(o), 'voute');
    expect(o.pergola).toEqual({ materiau: ACIER, toit: VOUTE, sectionPoteau: '120x120' });
    // Un choix du catalogue s'ecrit comme avant.
    materiau.ecrire(contexte(o), 'aluminium');
    expect(o.pergola?.materiau).toBe('aluminium');
  });

  it('une pergola du catalogue n a pas d option de plus', () => {
    const o = abri({ materiau: 'bois' });
    expect(champ(o, 'materiau').options(contexte(o)).map((x) => x.valeur)).toEqual(['bois', 'aluminium']);
    expect(champ(o, 'materiau').lire(contexte(o))).toBe('bois');
  });
});
