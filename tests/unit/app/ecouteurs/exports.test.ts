// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Les PDF se construisent apres le chargement de leur module (AD-10) : on laisse la promesse se resoudre. */
const attendre = () => new Promise((r) => { setTimeout(r, 0); });

const journal = { toasts: [] as string[], bannieres: [] as string[], blobs: [] as string[], textes: [] as string[] };
vi.mock('../../../../src/shell/dialogs.js', () => ({
  showToast: (m: string) => { journal.toasts.push(m); },
  showErrBanner: (m: string) => { journal.bannieres.push(m); },
  // Une erreur dite en clair (util/erreurFichier.ts) : la phrase, et le detail technique apres « | ».
  showErreur: (t: string, d = '') => { journal.bannieres.push(t + (d ? ' | ' + d : '')); }
}));
vi.mock('../../../../src/shell/download.js', () => ({
  telechargerBlob: (nom: string) => { journal.blobs.push(nom); },
  telechargerTexte: (nom: string) => { journal.textes.push(nom); }
}));

import { creerRegistre, type Droits } from '../../../../src/app/commandes.js';
import { brancherExports, type ContexteExports } from '../../../../src/app/ecouteurs/exports.js';
import type { Resultats } from '../../../../src/app/resultats.js';

// Les exports (app/ecouteurs/exports.ts) : chacun produit son fichier, le dit, et montre le texte
// copiable quand il en a un ; une erreur de production se dit sans rien telecharger.

function monter(plus: Partial<ContexteExports> = {}, capacites = true) {
  const resultats = { afficherResume: vi.fn(), copierResume: vi.fn() } as unknown as Resultats;
  const ctx: ContexteExports = {
    buildExportSVG: () => '<svg/>', buildExportDXF: () => '0\nEOF', buildExportPDF: vi.fn(async () => '%PDF'), echellePdf: () => 200,
    construireResume: () => 'résumé', construireDossier: async () => ({ pdf: '%PDF', pages: 3, terrasses: [1], equipements: new Map([[1, [1, 2]]]) }),
    construireDossierPiscine: async () => ({ pdf: '%PDF', pages: 7, piscine: { name: 'Piscine 1' }, regime: 'declaration' }),
    genererGlb: vi.fn(), clesDossier: () => ['t1'], nomProjet: () => 'Ma maison', resultats,
    construireNoteCalcul: async () => ({ pdf: '%PDF', nom: 'pergola-1-note-de-calcul.pdf' }), noteCalculPossible: () => true,
    construireDeclaration: async () => ({ pdf: new Uint8Array([37]), nom: 'maison-declaration-prealable.pdf', relecture: [{ cle: 'cerfa.signature', gravite: 'a-completer', cerfa: true, texte: 'la signature' }], regime: 'declaration', pieces: ['DP1', 'DP2'] }),
    declarationPossible: () => true,
    construireDevis: async () => ({ pdf: new Uint8Array([37]), nomFichier: 'devis-ma-maison-20261116.pdf', pages: 1 }),
    construireListeAchat: async (format) => ({ contenu: format === 'csv' ? '\uFEFFRayon' : new Uint8Array([37]), nomFichier: 'liste-achat-ma-maison-20261116.' + format }), ...plus
  };
  const droits: Droits = { branchee: () => true, aCapacite: () => capacites, aPermission: () => true, reste: () => null };
  const cmd = creerRegistre(droits);
  brancherExports(ctx, cmd);
  return { cmd, ctx, resultats };
}

beforeEach(() => { for (const l of Object.values(journal)) l.length = 0; });

describe('exports', () => {
  it('liste d achat : un PDF et un CSV, chacun dit son nom ; rien a acheter, rien ne part', async () => {
    const { cmd } = monter();
    cmd.executer('export.listeAchatPdf'); cmd.executer('export.listeAchatCsv');
    await attendre();
    expect(journal.blobs).toEqual(['liste-achat-ma-maison-20261116.pdf', 'liste-achat-ma-maison-20261116.csv']);
    expect(journal.toasts).toEqual(['Liste d’achat téléchargée : liste-achat-ma-maison-20261116.pdf.', 'Liste d’achat téléchargée : liste-achat-ma-maison-20261116.csv.']);
    const vide = monter({ construireListeAchat: async () => null });
    vide.cmd.executer('export.listeAchatCsv');
    await attendre();
    expect(journal.blobs.length).toBe(2);
    expect(journal.toasts[2]).toMatch(/^Rien à acheter/);
  });

  it('devis : telecharge le PDF et dit le nom du fichier ; sans terrasse, le dit sans rien telecharger', async () => {
    const { cmd } = monter();
    cmd.executer('export.devis');
    await attendre();
    expect(journal.blobs).toEqual(['devis-ma-maison-20261116.pdf']);
    expect(journal.toasts).toEqual(['Devis téléchargé : devis-ma-maison-20261116.pdf.']);
    const vide = monter({ construireDevis: async () => null });
    vide.cmd.executer('export.devis');
    await attendre();
    expect(journal.blobs).toEqual(['devis-ma-maison-20261116.pdf']);
    expect(journal.toasts[1]).toMatch(/Dessinez d’abord une terrasse/);
  });

  it('SVG et DXF : montrent le texte copiable, telechargent, le disent', () => {
    const { cmd, resultats } = monter();
    cmd.executer('export.svg'); cmd.executer('export.dxf');
    expect(resultats.afficherResume).toHaveBeenCalledWith('<svg/>');
    expect(resultats.afficherResume).toHaveBeenCalledWith('0\nEOF');
    expect(journal.blobs).toEqual(['plan_interactif_export.svg', 'plan_interactif_export.dxf']);
    expect(journal.toasts).toEqual(['Téléchargement lancé : plan_interactif_export.svg.', 'Téléchargement lancé : plan_interactif_export.dxf.']);
  });

  it('une erreur de production se dit, et rien ne part', () => {
    const { cmd } = monter({ buildExportSVG: () => { throw new Error('casse'); } });
    cmd.executer('export.svg');
    expect(journal.bannieres).toEqual(['Le plan en SVG n’a pas pu être produit. Réessayez ; si l’erreur revient, copiez le détail technique et transmettez-le au support. | casse']);
    expect(journal.blobs).toEqual([]);
  });

  it('PDF : a l echelle choisie dans le menu, 1/200 a defaut', async () => {
    const a = monter({ echellePdf: () => 100 });
    a.cmd.executer('export.pdf');
    expect(a.ctx.buildExportPDF).toHaveBeenCalledWith(100);
    const b = monter({ echellePdf: () => 0 });
    b.cmd.executer('export.pdf');
    expect(b.ctx.buildExportPDF).toHaveBeenCalledWith(200);
    await attendre();
    expect(journal.blobs).toEqual(['plan_interactif_export.pdf', 'plan_interactif_export.pdf']);
  });

  it('dossier : demande une terrasse cochee, nomme le fichier d apres le projet, compte pages et equipements', async () => {
    const vide = monter({ clesDossier: () => [] });
    vide.cmd.executer('export.dossier');
    expect(journal.textes).toEqual([]);
    expect(journal.toasts).toEqual(['Cochez au moins une terrasse pour le dossier (dans l’explorateur).']);
    journal.toasts.length = 0;
    monter().cmd.executer('export.dossier');
    await attendre();
    expect(journal.textes).toEqual(['ma-maison-dossier-terrasses.pdf']);
    expect(journal.toasts[0]).toMatch(/^Dossier PDF : 3 page\(s\) — plan de masse \+ 1 terrasse\(s\), 2 équipement\(s\) coté\(s\)\.$/);
  });

  it('dossier mairie : nomme le fichier d apres le projet et la piscine, dit le regime ; sans piscine, dit quoi faire', async () => {
    monter().cmd.executer('export.dossierPiscine');
    await attendre();
    expect(journal.textes).toEqual(['ma-maison-piscine-1-dossier-mairie.pdf']);
    expect(journal.toasts[0]).toMatch(/^Dossier mairie : 7 page\(s\) — déclaration préalable pour « Piscine 1 »/);
    journal.toasts.length = 0;
    monter({ construireDossierPiscine: () => Promise.reject(new Error('aucune piscine')) }).cmd.executer('export.dossierPiscine');
    await attendre();
    expect(journal.toasts).toEqual(['Ajoutez d\'abord une piscine au plan (outil « Piscine » de la palette).']);
    expect(journal.textes).toHaveLength(1);
  });

  it('resume, copie et GLB passent par leur service', () => {
    const { cmd, ctx, resultats } = monter();
    cmd.executer('export.resume'); cmd.executer('export.copierResume'); cmd.executer('export.glb');
    expect(resultats.afficherResume).toHaveBeenCalledWith('résumé');
    expect(resultats.copierResume).toHaveBeenCalledTimes(1);
    expect(ctx.genererGlb).toHaveBeenCalledWith(true);
  });

  it('sans la capacite, DXF, dossier et GLB s effacent ; SVG et PDF restent', () => {
    const { cmd } = monter({}, false);
    for (const id of ['export.dxf', 'export.dossier', 'export.glb']) expect(cmd.effacee(id), id).toBe(true);
    for (const id of ['export.svg', 'export.pdf', 'export.resume']) expect(cmd.effacee(id), id).toBe(false);
  });

  it('note de calcul : telecharge le PDF de l\'abri, et se grise sans regions choisies', async () => {
    const { cmd } = monter();
    cmd.executer('export.noteCalcul');
    await attendre();
    expect(journal.textes).toContain('pergola-1-note-de-calcul.pdf');
    const sans = monter({ noteCalculPossible: () => false }).cmd;
    expect(sans.etat('export.noteCalcul').utilisable).toBe(false);
  });
});
