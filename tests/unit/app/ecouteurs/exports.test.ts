// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const journal = { toasts: [] as string[], bannieres: [] as string[], blobs: [] as string[], textes: [] as string[] };
vi.mock('../../../../src/shell/dialogs.js', () => ({
  showToast: (m: string) => { journal.toasts.push(m); },
  showErrBanner: (m: string) => { journal.bannieres.push(m); }
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
    buildExportSVG: () => '<svg/>', buildExportDXF: () => '0\nEOF', buildExportPDF: vi.fn(() => '%PDF'), echellePdf: () => 200,
    construireResume: () => 'résumé', construireDossier: () => ({ pdf: '%PDF', pages: 3, terrasses: [1], equipements: new Map([[1, [1, 2]]]) }),
    genererGlb: vi.fn(), clesDossier: () => ['t1'], nomProjet: () => 'Ma maison', resultats, ...plus
  };
  const droits: Droits = { branchee: () => true, aCapacite: () => capacites, aPermission: () => true, reste: () => null };
  const cmd = creerRegistre(droits);
  brancherExports(ctx, cmd);
  return { cmd, ctx, resultats };
}

beforeEach(() => { for (const l of Object.values(journal)) l.length = 0; });

describe('exports', () => {
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
    expect(journal.bannieres).toEqual(['Erreur export SVG: casse']);
    expect(journal.blobs).toEqual([]);
  });

  it('PDF : a l echelle choisie dans le menu, 1/200 a defaut', () => {
    const a = monter({ echellePdf: () => 100 });
    a.cmd.executer('export.pdf');
    expect(a.ctx.buildExportPDF).toHaveBeenCalledWith(100);
    const b = monter({ echellePdf: () => 0 });
    b.cmd.executer('export.pdf');
    expect(b.ctx.buildExportPDF).toHaveBeenCalledWith(200);
    expect(journal.blobs).toEqual(['plan_interactif_export.pdf', 'plan_interactif_export.pdf']);
  });

  it('dossier : demande une terrasse cochee, nomme le fichier d apres le projet, compte pages et equipements', () => {
    const vide = monter({ clesDossier: () => [] });
    vide.cmd.executer('export.dossier');
    expect(journal.textes).toEqual([]);
    expect(journal.toasts).toEqual(['Coche au moins une terrasse pour le dossier.']);
    journal.toasts.length = 0;
    monter().cmd.executer('export.dossier');
    expect(journal.textes).toEqual(['ma-maison-dossier-terrasses.pdf']);
    expect(journal.toasts[0]).toMatch(/^Dossier PDF : 3 page\(s\) — plan de masse \+ 1 terrasse\(s\), 2 equipement/);
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
});
