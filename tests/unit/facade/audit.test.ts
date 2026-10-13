import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lireFichierPromenade, type CasAudit, type SortiesCas } from '../../../src/model/audit.js';
import { rejouerCas, ecartsSorties, memesCorps, propositionsAuRejeu, facadesEcartees, type EcartSorties } from '../../../src/facade/audit.js';
import { ECART_TEINTE } from '../../../src/model/couleurMur.js';
import { lireFaitsToits } from '../../../src/model/faitsToits.js';

// La non-regression du corpus d'audit (MD/spec-audit.md §23, MD/spec-regles-toits.md §8.2).
//
// Chaque fichier de tests/fixtures/audit/ est relu comme Plan le relit (versions 1 et 2), puis chaque
// cas `valide` est rejoue avec le code et les reglages courants : ses corps doivent rester ceux de
// l'attendu au centimetre, comme AE 101, et la couleur et la source de ses murs les memes. Un attendu
// qui doit changer (une amelioration voulue) se change dans la PR qui le fait bouger, avec une ligne
// d'historique. Les cas `a_corriger` et `corrige` sont listes en `it.todo` : ils ne bloquent pas la
// CI ; celui qui satisfait deja son attendu le dit, il est pret a etre valide.

const DOSSIER = join(__dirname, '../../fixtures/audit');
const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith('.json')).sort();
const lus = fichiers.map((nom) => ({ nom, brut: JSON.parse(readFileSync(join(DOSSIER, nom), 'utf8')) as { version: number }, fichier: lireFichierPromenade(JSON.parse(readFileSync(join(DOSSIER, nom), 'utf8'))) }));

/** Ce que la CI compare sur un cas valide (spec §23) : les corps, la couleur et la source des murs. */
const CHAMPS_VALIDES: EcartSorties['champ'][] = ['corps', 'couleurMurs', 'sourceMurs'];
const dire = (e: readonly EcartSorties[]) => e.map((x) => x.champ + ' : ' + x.avant + ' -> ' + x.apres).join(' ; ');

describe('corpus d’audit : tests/fixtures/audit/', () => {
  it('se relit, fichiers de version 1 comme de version 2', () => {
    expect(fichiers.length).toBeGreaterThan(0);
    expect(new Set(lus.map((l) => l.brut.version))).toEqual(new Set([1, 2]));
    for (const l of lus) {
      expect(l.fichier.version).toBe(2);
      for (const c of l.fichier.cas) expect(Array.isArray(c.constat.photos)).toBe(true);
    }
  });

  it('ne garde que des statuts connus, un attendu pour chaque cas valide, un historique pour chaque cas', () => {
    for (const { nom, fichier } of lus) for (const c of fichier.cas) {
      expect(['a_corriger', 'corrige', 'valide', 'sans_suite'], nom + ' ' + c.id).toContain(c.statut);
      if (c.statut === 'valide') expect(c.attendu, nom + ' ' + c.id + ' : un cas valide sans attendu').not.toBeNull();
      expect(c.historique.length, nom + ' ' + c.id).toBeGreaterThan(0);
    }
  });

  for (const { nom, fichier } of lus) for (const c of fichier.cas) {
    const titre = nom + ' ' + c.id + ' (' + (c.identite.adresse ?? c.cle) + ')';
    if (c.statut === 'valide') {
      it(titre + ' : valide, rejoue a l’identique (corps au centimetre, couleur et source des murs)', () => {
        const r = rejouerCas(c);
        expect(r.rejoue).toBe(true);
        const ecarts = ecartsSorties(r.sorties, c.attendu as SortiesCas, CHAMPS_VALIDES);
        expect(dire(ecarts), 'un cas valide a bouge : changer son attendu dans la PR, avec une ligne d’historique').toBe('');
      });
    } else if (c.statut === 'a_corriger' || c.statut === 'corrige') {
      const r = rejouerCas(c);
      const pret = c.attendu && !ecartsSorties(r.sorties, c.attendu, CHAMPS_VALIDES).length;
      it.todo(titre + ' : ' + c.statut + ' [' + c.constat.problemes.join(', ') + ']' + (pret ? ' - satisfait deja son attendu : pret a valider' : ''));
    }
  }
});

/** Un cas de synthese : un mur de brique (materiau 4 des fichiers fonciers), sans grille. */
function casSynthese(lue: string | null, problemes: string[] = [], materiau: string | null = '40'): CasAudit {
  const sorties: SortiesCas = { mode: 'entier', elevation: 6, toit: null, corps: null, toitMesure: null, couleurMurs: null, sourceMurs: null };
  return {
    id: 'c1', cle: 'b', statut: 'a_corriger',
    constat: { categorie: 'facade', problemes, note: '', t: '2026-10-13T12:00:00Z', position: { x: 0, y: 0, precisionM: null }, photos: [] },
    identite: { cleBdtopo: null, idu: null, adresse: null },
    entrees: { pts: [], bdtopo: materiau ? { materiauxMurs: materiau, hauteurRetenueM: 6 } : null, grille: null, voisins: [] },
    sorties, attendu: null, historique: [{ t: '2026-10-13T12:00:00Z', texte: 'synthese' }],
    ...(lue ? { lectures: { facades: [{ cote: 2, couleur: lue, source: 'automatique' as const, photo: 0, pixels: 400 }] } } : {}),
  };
}

describe('rejeu d’un cas', () => {
  it('sans grille : seule la couleur des murs se refait, celle du materiau', () => {
    const r = rejouerCas(casSynthese(null));
    expect(r.rejoue).toBe(false);
    expect(r.sorties.couleurMurs).toBe('#A0523B');
    expect(r.sorties.sourceMurs).toBe('materiau');
    expect(r.sorties.corps).toBeNull();
  });

  it('la couleur lue sur une photo Panoramax ne se relit pas sans reseau : elle reste telle que notee', () => {
    const c = casSynthese(null);
    c.sorties = { ...c.sorties, couleurMurs: '#d8c8a8', sourceMurs: 'photo' };
    expect(rejouerCas(c).sorties).toMatchObject({ couleurMurs: '#d8c8a8', sourceMurs: 'photo' });
  });

  it('dit ce qui a change : corps, murs, hauteur', () => {
    const a: SortiesCas = { mode: 'entier', elevation: 6, toit: null, corps: null, toitMesure: null, couleurMurs: '#A0523B', sourceMurs: 'materiau' };
    expect(ecartsSorties(a, a)).toEqual([]);
    expect(ecartsSorties({ ...a, elevation: 6.004 }, a)).toEqual([]);
    expect(ecartsSorties({ ...a, elevation: 6.4, couleurMurs: '#a0523b' }, a).map((e) => e.champ)).toEqual(['elevation']);
    expect(ecartsSorties({ ...a, sourceMurs: 'photo' }, a, ['corps']).length).toBe(0);
  });

  it('compare les corps au centimetre', () => {
    const corps = [{ pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }], posFaitage: 3, faitage: 7.5, egouts: [4.2, 4.2] as [number, number], pignons: [], ecart: 0.12 }];
    expect(memesCorps(corps, JSON.parse(JSON.stringify(corps)))).toBe(true);
    expect(memesCorps(corps, [{ ...corps[0]!, faitage: 7.501 }])).toBe(true);
    expect(memesCorps(corps, [{ ...corps[0]!, faitage: 7.6 }])).toBe(false);
    expect(memesCorps(null, null)).toBe(true);
    expect(memesCorps(corps, null)).toBe(false);
  });

  it('se rejoue avec un autre jeu de faits : les images d apres d une PR qui ajoute un fait', () => {
    const c = lus.flatMap((l) => l.fichier.cas).find((x) => x.identite.cleBdtopo === 'BATIMENT0000000349542179');
    expect(c, 'le pavillon est de la longere d Hucqueliers').toBeDefined();
    const sans = rejouerCas(c!);
    const cle = 'BATIMENT0000000349542179';
    const contrainte = lireFaitsToits({ format: 'plan-faits-toits', faits: { [cle]: { observation: { corps: { max: 1 } } } } });
    const r = rejouerCas(c!, contrainte);
    expect(r.rejoue).toBe(true);
    expect(sans.sorties.corps!.length).toBeGreaterThan(1);
    expect(r.sorties.corps).toHaveLength(1);
    // Un remplacement se rejoue meme sans grille.
    const remplacement = lireFaitsToits({ format: 'plan-faits-toits', faits: { [cle]: { observation: { forme: 'deux-pans' }, application: 'remplacement', dimensions: { egoutM: 5, faitageM: 9 } } } });
    const sansGrille = rejouerCas({ ...c!, entrees: { ...c!.entrees, grille: null } }, remplacement);
    expect(sansGrille.rejoue).toBe(true);
    expect(sansGrille.sorties).toMatchObject({ elevation: 5, toit: { forme: 'deux-pans', hauteur: 4 } });
    expect(sansGrille.sorties.corps![0]).toMatchObject({ faitage: 9, egouts: [5, 5] });
  });
});

describe('facade.couleur propose au rejeu (spec §18.4)', () => {
  it('quand la facade lue sur la photo s’ecarte de la couleur retenue de plus que le seuil de model/couleurMur.ts', () => {
    // Un enduit beige lu sur la photo, un mur de brique d'apres les fichiers fonciers.
    const c = casSynthese('#d9c7a5');
    const r = rejouerCas(c).sorties;
    const e = facadesEcartees(c, r);
    expect(e).toHaveLength(1);
    expect(e[0]!.ecart).toBeGreaterThan(ECART_TEINTE);
    expect(propositionsAuRejeu(c, r)).toEqual(['facade.couleur']);
  });

  it('pas quand la teinte est la meme a la lecture pres', () => {
    const c = casSynthese('#a8583f');
    expect(propositionsAuRejeu(c, rejouerCas(c).sorties)).toEqual([]);
  });

  it('pas quand le probleme est deja coche, ni sans couleur retenue', () => {
    const coche = casSynthese('#d9c7a5', ['facade.couleur']);
    expect(propositionsAuRejeu(coche, rejouerCas(coche).sorties)).toEqual([]);
    const sansMateriau = casSynthese('#d9c7a5', [], null);
    expect(propositionsAuRejeu(sansMateriau, rejouerCas(sansMateriau).sorties)).toEqual([]);
  });
});
