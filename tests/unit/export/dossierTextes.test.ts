import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as lib from 'pdf-lib';
import { assemblerDossierMairie, couperEnLignes, piecesDuDossier, relireAvantExport } from '../../../src/export/dossierMairie.js';
import { remplirCerfa13703 } from '../../../src/export/cerfa13703.js';
import { empreinteFaits, faitsDuDossier, texteDesFaits } from '../../../src/export/faitsDossier.js';
import { relireDossier } from '../../../src/export/relecture.js';
import { distancesAuxLimites } from '../../../src/export/piecesDP.js';
import type { DossierProjet } from '../../../src/regles/textes/dossier.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Les textes du dossier et la relecture avant l'export (lot L5) : un texte valide s'imprime a l'identique a chaque export, et seul
// lui ; la page de notice n'existe qu'avec un texte valide ; un brouillon perime est dit ; la relecture d'un meme projet est la meme.

const cerfa = new Uint8Array(readFileSync(resolve(__dirname, '../../../public/cerfa/cerfa_13703-12.pdf')));
// Une image JPEG de 1 x 1 pixel.
const JPEG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

function projet(dossier?: DossierProjet): ObjetPlan[] {
  const rect = (x: number, y: number, L: number, l: number) => [{ x, y }, { x: x + L, y }, { x: x + L, y: y + l }, { x, y: y + l }];
  return [
    {
      key: 'parcelle', name: 'Parcelle AB 123', type: 'polygon', fonction: 'terrain', pts: rect(0, 0, 30, 20),
      cadastre: { idu: '78650000AB0123', section: 'AB', numero: '0123', contenanceM2: 612, commune: 'Le Vésinet', adresse: '12 bis Rue des Lilas 78110 Le Vésinet' },
      declaration: { nom: 'Dupont', prenom: 'Claire', naissance: '1980-04-17', voie: 'Rue des Lilas', localite: 'Le Vésinet' },
      ...(dossier ? { dossier } : {}),
    },
    { key: 'maison', name: 'Maison', type: 'polygon', fonction: 'batiment', elevation: 6, pts: rect(10, 10, 10, 8) },
    { key: 'p', name: 'Pergola 1', type: 'polygon', fonction: 'pergola', pts: rect(2, 2, 4, 3), pergola: { debord: 0.2 } },
  ] as ObjetPlan[];
}

const NOTICE = 'Le terrain porte une maison individuelle.\n\nLe projet consiste en une pergola en bois de 4,00 x 3,00 m, implantée à 2 m des limites.';
const valide = (objets: ObjetPlan[]): DossierProjet => ({ textes: [
  { piece: 'description', valide: { texte: 'Pergola en bois de 4,00 x 3,00 m adossée à la maison.', le: '2026-10-30', entrees: empreinteFaits(objets) } },
  { piece: 'notice', valide: { texte: NOTICE, le: '2026-10-30', entrees: empreinteFaits(objets) } },
] });
const pages = async (pdf: Uint8Array) => (await lib.PDFDocument.load(pdf)).getPageCount();

describe('les faits du projet envoyes a Claude', () => {
  it('sont deterministes, sans rien du declarant, et leur empreinte suit le projet', () => {
    const a = texteDesFaits(faitsDuDossier(projet())), b = texteDesFaits(faitsDuDossier(projet()));
    expect(a).toBe(b);
    expect(a).not.toMatch(/Dupont|1980/);
    const f = faitsDuDossier(projet());
    expect(f.terrain).toEqual({ adresse: '12 bis Rue des Lilas 78110 Le Vésinet', commune: 'Le Vésinet', references: ['000 AB 123'], superficieM2: 612 });
    expect(f.ouvrages).toHaveLength(1);
    expect(f.ouvrages[0]!.description).toMatch(/une pergola en bois de 4,00 x 3,00 m/);
    expect(f.existant[0]).toMatchObject({ nom: 'Maison', nature: 'bâtiment' });
    const autre = projet();
    (autre[2] as { pts: { x: number; y: number }[] }).pts = [{ x: 2, y: 2 }, { x: 7, y: 2 }, { x: 7, y: 5 }, { x: 2, y: 5 }];
    expect(empreinteFaits(autre)).not.toBe(empreinteFaits(projet()));
    // Le dossier lui-meme (textes, photos) n'entre pas dans les faits : valider un texte ne le perime pas.
    expect(empreinteFaits(projet(valide(projet())))).toBe(empreinteFaits(projet()));
  });
});

describe('le texte valide dans le dossier', () => {
  it('sans texte valide, le cerfa garde la description calculee et le dossier n a pas de page de notice', async () => {
    const brouillon = { textes: [{ piece: 'notice' as const, brouillon: { texte: 'Brouillon de notice.', reserves: [], le: '2026-10-30', modele: 'claude-haiku-5-5', prompt: 1, schema: 1, entrees: empreinteFaits(projet()), cout: null } }] };
    expect(remplirCerfa13703(projet(brouillon), new Date(2026, 9, 5), []).textes.C2ZD1_description).toBe(remplirCerfa13703(projet(), new Date(2026, 9, 5), []).textes.C2ZD1_description);
    const sans = await assemblerDossierMairie(lib, cerfa, projet(), { date: new Date(2026, 9, 5), meta: {} });
    const avecBrouillon = await assemblerDossierMairie(lib, cerfa, projet(brouillon), { date: new Date(2026, 9, 5), meta: {} });
    expect(await pages(avecBrouillon.pdf)).toBe(await pages(sans.pdf));
  }, 30000);

  it('imprime le texte valide dans le cerfa et sur une page de notice, a l identique a chaque export', async () => {
    const objets = projet();
    objets[0]!.dossier = valide(objets);
    const r = remplirCerfa13703(objets, new Date(2026, 9, 5), []);
    expect(r.textes.C2ZD1_description).toBe('Pergola en bois de 4,00 x 3,00 m adossée à la maison.');
    const a = await assemblerDossierMairie(lib, cerfa, objets, { date: new Date(2026, 9, 5), meta: {} });
    const b = await assemblerDossierMairie(lib, cerfa, objets, { date: new Date(2026, 9, 5), meta: {} });
    const sans = await assemblerDossierMairie(lib, cerfa, projet(), { date: new Date(2026, 9, 5), meta: {} });
    expect(await pages(a.pdf)).toBe(await pages(sans.pdf) + 1);
    const relu = await lib.PDFDocument.load(a.pdf);
    expect(relu.getForm().getTextField('C2ZD1_description').getText()).toBe('Pergola en bois de 4,00 x 3,00 m adossée à la maison.');
    // Deux exports du meme projet : la page de notice a le meme contenu (ni date ni heure), et elle dit le texte.
    const notice = async (pdf: Uint8Array) => {
      const d = await lib.PDFDocument.load(pdf);
      const c = d.getPage(d.getPageCount() - 1).node.Contents();
      const flux = c instanceof lib.PDFArray ? c.asArray().map((r) => d.context.lookup(r)) : [c];
      return flux.map((f) => Buffer.from(lib.decodePDFRawStream(f as lib.PDFRawStream).decode()).toString('latin1')).join('');
    };
    const [na, nb] = [await notice(a.pdf), await notice(b.pdf)];
    expect(na).toBe(nb);
    const hex = (t: string) => Buffer.from(t, 'latin1').toString('hex').toUpperCase();
    expect(na).toContain(hex('Le terrain porte une maison individuelle.'));
    expect(await notice(sans.pdf)).not.toContain(hex('Le terrain porte'));
  }, 30000);

  it('coupe le texte en lignes aux espaces, paragraphes gardes', () => {
    const mesure = (t: string) => t.length;
    expect(couperEnLignes('un deux trois quatre\n\ncinq', 9, mesure)).toEqual(['un deux', 'trois', 'quatre', '', 'cinq']);
    expect(couperEnLignes('anticonstitutionnellement x', 5, mesure)).toEqual(['anticonstitutionnellement', 'x']);
  });

  it('joint une photographie DP7 choisie, et coche sa case du bordereau', async () => {
    const objets = projet({ textes: [], photos: [{ piece: 'DP7', image: 'data:image/jpeg;base64,' + JPEG, source: 'audit', largeur: 1, hauteur: 1, choisieLe: '2026-10-30' }] });
    expect(piecesDuDossier(objets, { carte: false, vue3d: false })).toEqual(['DP1', 'DP2', 'DP4', 'DP7']);
    const res = await assemblerDossierMairie(lib, cerfa, objets, { date: new Date(2026, 9, 5), meta: {} });
    expect(res.pieces).toContain('DP7');
    expect((await lib.PDFDocument.load(res.pdf)).getForm().getCheckBox('P3GG1').isChecked()).toBe(true);
    // Sortie vers l'appareil (image a null) : elle ne part pas, et la relecture le dit.
    const ailleurs = projet({ textes: [], photos: [{ piece: 'DP7', image: null, photoLocale: 'pabc', source: 'audit', largeur: 1, hauteur: 1, choisieLe: '' }] });
    expect(piecesDuDossier(ailleurs, { carte: false, vue3d: false })).not.toContain('DP7');
    expect(relireAvantExport(ailleurs, { carte: false, vue3d: false }).map((p) => p.cle)).toContain('photo.DP7');
  }, 30000);
});

describe('la relecture avant l export', () => {
  it('dit ce que le cerfa disait manquer, memes phrases, meme ordre, et est la meme a chaque fois', () => {
    const a = relireDossier(projet(), ['DP1', 'DP2', 'DP4']);
    expect(a).toEqual(relireDossier(projet(), ['DP1', 'DP2', 'DP4']));
    expect(a.filter((p) => p.cerfa).map((p) => p.texte)).toEqual([
      'les protections patrimoniales (consultez le PLU de la parcelle pour les cocher)',
      'la signature du déclarant',
      'la pièce DP6 (insertion) : ouvrez la Vue 3D, cadrez le projet comme vu de la rue, puis générez le dossier depuis le menu Exporter sans quitter la 3D',
      'les photographies DP7 (environnement proche) et DP8 (paysage lointain), si le projet est visible depuis l\'espace public',
    ]);
    const vide = relireDossier([projet()[0]!], []);
    expect(vide.map((p) => p.cle)).toEqual(expect.arrayContaining(['cerfa.ouvrage', 'cerfa.signature']));
    // Chaque point qui a un geste nomme une commande du registre.
    expect(a.find((p) => p.cle === 'cerfa.DP6')?.geste).toEqual({ commande: 'vue.3d', libelle: 'Ouvrir la Vue 3D' });
  });

  it('dit un brouillon perime, un brouillon non valide, et un texte valide sur un projet qui a change', () => {
    const objets = projet();
    const juste = empreinteFaits(objets);
    objets[0]!.dossier = { textes: [
      { piece: 'notice', brouillon: { texte: 'Brouillon.', reserves: [], le: '2026-10-30', modele: 'm', prompt: 1, schema: 1, entrees: juste, cout: null } },
      { piece: 'insertion', brouillon: { texte: 'Ancien.', reserves: [], le: '2026-10-29', modele: 'm', prompt: 1, schema: 1, entrees: '0'.repeat(64), cout: null } },
      { piece: 'description', valide: { texte: 'Valide.', le: '2026-10-29', entrees: '1'.repeat(64) } },
    ] };
    const points = relireDossier(objets, ['DP1', 'DP2', 'DP4', 'DP6', 'DP7', 'DP8']);
    const de = (cle: string) => points.find((p) => p.cle === cle);
    expect(de('texte.notice.brouillon')).toMatchObject({ gravite: 'a-verifier', geste: { commande: 'export.validerTexte', valeur: 'notice' } });
    expect(de('texte.insertion.brouillon')).toMatchObject({ gravite: 'alerte', geste: { commande: 'export.redigerTexte', valeur: 'insertion' } });
    expect(de('texte.insertion.brouillon')!.texte).toMatch(/périmé/);
    expect(de('texte.description.date')).toMatchObject({ gravite: 'alerte' });
    // Avec toutes les pieces, plus rien du cerfa sur DP6, DP7 ni DP8.
    expect(points.map((p) => p.cle)).not.toEqual(expect.arrayContaining(['cerfa.DP6']));
    expect(points.some((p) => /DP7|DP8/.test(p.cle))).toBe(false);
  });

  it('dit un ouvrage en limite, que le plan de masse ne cote pas', () => {
    const objets = projet();
    (objets[2] as { pts: { x: number; y: number }[] }).pts = [{ x: 0, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 5 }, { x: 0, y: 5 }];
    objets[2]!.pergola = { debord: 0 };
    expect(distancesAuxLimites(objets).find((x) => x.objet.key === 'p')?.distance).toBeNull();
    expect(relireDossier(objets, []).find((p) => p.cle === 'dp2.p')?.texte).toMatch(/« Pergola 1 » touche une limite/);
    expect(distancesAuxLimites(projet()).find((x) => x.objet.key === 'p')?.distance).toBeGreaterThan(0.05);
  });
});
