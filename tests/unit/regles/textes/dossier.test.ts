import { describe, it, expect } from 'vitest';
import { dossierEnregistre, longueurMax, photoDe, texteDe, texteValide, LONGUEUR_MAX_DESCRIPTION } from '../../../../src/regles/textes/dossier.js';

// Le dossier de declaration garde dans le projet (lot L5) : relu d'un fichier, verifie, copie ; ce qui ne se lit pas est retire.

const brouillon = { texte: 'Brouillon.', reserves: ['la couleur'], le: '2026-10-30T10:00:00Z', modele: 'claude-haiku-5-5', prompt: 1, schema: 1, entrees: 'a'.repeat(64), cout: 0.002 };

describe('dossierEnregistre', () => {
  it('relit les textes et les photos, une piece par nom, et copie en profondeur', () => {
    const brut = {
      textes: [
        { piece: 'notice', brouillon, valide: { texte: 'Notice validée.', le: '2026-10-30', entrees: 'b'.repeat(64) } },
        { piece: 'notice', valide: { texte: 'doublon', le: '2026-10-30' } },
        { piece: 'description', valide: { texte: 'Description validée.', le: '2026-10-30' } },
      ],
      photos: [{ piece: 'DP7', image: 'data:image/jpeg;base64,QUJD', source: 'audit', largeur: 4, hauteur: 3, choisieLe: '2026-10-30' }],
    };
    const d = dossierEnregistre(brut)!;
    expect(d.textes.map((t) => t.piece)).toEqual(['notice', 'description']);
    expect(texteValide(d, 'notice')).toBe('Notice validée.');
    expect(texteDe(d, 'notice')?.brouillon).toEqual(brouillon);
    expect(photoDe(d, 'DP7')).toMatchObject({ image: 'data:image/jpeg;base64,QUJD', largeur: 4 });
    expect(photoDe(d, 'DP8')).toBeUndefined();
    brut.textes[0]!.valide!.texte = 'change';
    expect(texteValide(d, 'notice')).toBe('Notice validée.');
  });

  it('retire ce qui ne se lit pas, et rend null quand il ne reste rien', () => {
    expect(dossierEnregistre(null)).toBeNull();
    expect(dossierEnregistre({ textes: [{ piece: 'inconnue', valide: { texte: 'x', le: '' } }, { piece: 'notice', valide: { texte: '   ', le: '' } }] })).toBeNull();
    expect(dossierEnregistre({ textes: [], photos: [{ piece: 'DP7', image: 'https://exemple.test/a.jpg' }] })).toBeNull();
    // Une photo sortie vers l'appareil (io/photosLocales.ts) garde sa cle et se relit sans image.
    expect(dossierEnregistre({ textes: [], photos: [{ piece: 'DP8', image: null, photoLocale: 'pabc' }] })?.photos).toEqual([{ piece: 'DP8', image: null, photoLocale: 'pabc', source: 'audit', largeur: 0, hauteur: 0, choisieLe: '' }]);
  });

  it('borne un texte valide a la longueur de sa piece (la case du cerfa tient 1 000 caracteres)', () => {
    expect(longueurMax('description')).toBe(LONGUEUR_MAX_DESCRIPTION);
    const d = dossierEnregistre({ textes: [{ piece: 'description', valide: { texte: 'x'.repeat(1200), le: '' } }] });
    expect(texteValide(d, 'description')).toHaveLength(LONGUEUR_MAX_DESCRIPTION);
  });
});
