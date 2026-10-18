import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EMPREINTE_SILHOUETTES_TOITS, SILHOUETTES_TOITS, SilhouettesToitsIllisibles, empreinteSilhouettesToits, lireSilhouettesToits } from '../../../../src/regles/toits/silhouettes.js';
import { observationDesSilhouettes } from '../../../../src/facade/regles/toits/silhouettes.js';

// regles/toits/silhouettes.json : la lecture des silhouettes de facades est une donnee du moteur de regles, lue par le
// meme lecteur au chargement du code et dans Admin › Regles, pas un nombre ou une table cachee dans le module.

const brut = () => JSON.parse(readFileSync('regles/toits/silhouettes.json', 'utf8')) as { seuils: Record<string, { valeur: number }>; lecture: Record<string, unknown>[] };
const refuse = (j: unknown) => { try { lireSilhouettesToits(j); return null; } catch (e) { expect(e).toBeInstanceOf(SilhouettesToitsIllisibles); return (e as Error).message; } };

describe('les règles de lecture des silhouettes des façades', () => {
  it('le fichier du dépôt est accepté, avec ses quatre seuils et sa table, et son empreinte est stable', () => {
    expect(SILHOUETTES_TOITS.seuils).toEqual({ TOLERANCE_BOUT_DEG: 30, PART_SECOND_SENS: 0.4, MUR_CORPS_DISTANCE_M: 1, MUR_CORPS_RECOUVREMENT: 0.5 });
    expect(SILHOUETTES_TOITS.lecture.length).toBeGreaterThanOrEqual(9);
    expect(EMPREINTE_SILHOUETTES_TOITS).toBe(empreinteSilhouettesToits(lireSilhouettesToits(brut())));
    // La raison d'une ligne ne change pas ce que la lecture fait.
    const j = brut(); j.lecture[0]!.pourquoi = 'autre raison';
    expect(empreinteSilhouettesToits(lireSilhouettesToits(j))).toBe(EMPREINTE_SILHOUETTES_TOITS);
  });

  it('un seuil ou une ligne qui change la lecture change l’empreinte', () => {
    const j = brut(); j.seuils.TOLERANCE_BOUT_DEG!.valeur = 25;
    expect(empreinteSilhouettesToits(lireSilhouettesToits(j))).not.toBe(EMPREINTE_SILHOUETTES_TOITS);
    const k = brut(); k.lecture[8]!.valeur = 'croupe';
    expect(empreinteSilhouettesToits(lireSilhouettesToits(k))).not.toBe(EMPREINTE_SILHOUETTES_TOITS);
  });

  it('refuse, avec sa raison, ce que le moteur ne saurait pas lire', () => {
    expect(refuse(null)).toMatch(/format inconnu/);
    const sans = brut(); delete (sans.seuils as Record<string, unknown>).PART_SECOND_SENS;
    expect(refuse(sans)).toMatch(/PART_SECOND_SENS sans valeur numerique/);
    const large = brut(); large.seuils.TOLERANCE_BOUT_DEG!.valeur = 60;
    expect(refuse(large)).toMatch(/TOLERANCE_BOUT_DEG hors de \[1, 44\]/);
    const essai = (l: Record<string, unknown>) => { const j = brut(); j.lecture.push({ pourquoi: 'essai', ...l }); return refuse(j); };
    expect(essai({ si: { silhouette: ['rond'] }, role: 'bout', valeur: 'pignon' })).toMatch(/silhouette inconnue/);
    expect(essai({ si: { bout: 'dome' }, role: 'bout', valeur: 'pignon' })).toMatch(/bout « dome » inconnu/);
    expect(essai({ si: {}, role: 'bout', valeur: 'pignon' })).toMatch(/sans bout ni silhouette/);
    expect(essai({ si: { bout: 'pignon' }, role: 'travers', valeur: 'pignon' })).toMatch(/role « travers » inconnu/);
    expect(essai({ si: { bout: 'pignon' }, role: 'bout', valeur: 'dome' })).toMatch(/valeur « dome » inconnue/);
    expect(essai({ si: { bout: 'pignon' }, role: null, valeur: 'pignon' })).toMatch(/n'a pas de valeur/);
    expect(essai({ si: { silhouette: ['trapeze'] }, role: 'long', valeur: 'appentis' })).toMatch(/ne dit que des pignons ou des croupes/);
    expect(essai({ si: { silhouette: ['trapeze'], toitPlat: true }, role: 'long', valeur: 'croupe' })).toMatch(/toitPlat ne vaut que false/);
    expect(essai({ si: { silhouette: ['trapeze'] }, role: 'long', valeur: 'croupe', pourquoi: '' })).toMatch(/sans raison/);
  });

  it('la lecture applique la table et les seuils du fichier : changer une ligne ou un seuil change ce que les murs disent', () => {
    const mur = (nom: string, azimut: number, silhouette: 'triangle' | 'ligne-droite', bout?: 'pignon' | 'sans-objet') => ({ nom, azimut, largeurM: 8, silhouette, ...(bout ? { bout } : {}) });
    const lues = [mur('est', 90, 'triangle'), mur('ouest', 270, 'triangle')];
    expect(observationDesSilhouettes(lues)?.observation.bouts).toEqual(['pignon', 'pignon']);
    // Une table qui lirait un triangle comme une croupe : les bouts changent, sans toucher au code.
    const j = brut();
    j.lecture = j.lecture.map((l) => (l.role === 'bout' && (l.si as { silhouette?: string[] }).silhouette?.includes('triangle') ? { ...l, valeur: 'croupe' } : l));
    expect(observationDesSilhouettes(lues, false, lireSilhouettesToits(j))?.observation.bouts).toEqual(['croupe', 'croupe']);
    // Un mur a 35 degres de l'axe ferme un bout avec 40 degres de tolerance, plus avec 30.
    const biais = [mur('est', 90, 'triangle'), mur('ouest', 270, 'triangle'), { nom: 'nord-est', azimut: 55, largeurM: 8, silhouette: 'triangle' as const }];
    expect(observationDesSilhouettes(biais)?.conflits).toEqual([expect.stringMatching(/deux sens de faîtage \(nord-est/)]);
    const k = brut(); k.seuils.TOLERANCE_BOUT_DEG!.valeur = 40;
    expect(observationDesSilhouettes(biais, false, lireSilhouettesToits(k))?.conflits).toEqual([]);
  });
});
