// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const journal = { toasts: [] as string[], bannieres: [] as string[] };
vi.mock('../../../../src/shell/dialogs.js', () => ({
  showToast: (m: string) => { journal.toasts.push(m); },
  showErrBanner: (m: string) => { journal.bannieres.push(m); }
}));

import { creerRegistre } from '../../../../src/app/commandes.js';
import { brancherFichiers, IMPORT_JSON_TAILLE_MAX, type ContexteFichiers } from '../../../../src/app/ecouteurs/fichiers.js';
import { droits } from './faux.js';

// Les fichiers (app/ecouteurs/fichiers.ts) : les commandes ouvrent les champs fichier caches ; un
// projet JSON est valide avant d'etre applique, refuse proprement sinon, et l'option « remplacer »
// est lue au moment du choix du fichier.

function monter(plus: Partial<ContexteFichiers> = {}, ecrire = true) {
  document.body.innerHTML = '<input type="file" id="importSvgFile"><input type="file" id="importJsonFile">';
  const ctx: ContexteFichiers = {
    importerSVG: vi.fn(), exportProjetJSON: vi.fn(), validerProjetJSON: vi.fn((b: unknown) => ({ brut: b }) as never),
    appliquerProjetImporte: vi.fn(), remplacerImportJson: () => true, ...plus
  };
  const cmd = creerRegistre(droits(ecrire));
  brancherFichiers(ctx, cmd);
  return { cmd, ctx };
}

/** Choisit un fichier dans un champ, comme le ferait la personne, et attend la lecture. */
async function choisir(id: string, contenu: string, taille?: number): Promise<void> {
  const input = document.getElementById(id) as HTMLInputElement;
  const f = new File([contenu], 'f.txt');
  if (taille !== undefined) Object.defineProperty(f, 'size', { value: taille });
  Object.defineProperty(input, 'files', { value: [f], configurable: true });
  input.dispatchEvent(new Event('change'));
  await new Promise((ok) => setTimeout(ok, 30));
}

beforeEach(() => { journal.toasts.length = 0; journal.bannieres.length = 0; });

describe('fichiers', () => {
  it('ouvrent les champs fichier, et seulement avec le droit d ecrire', () => {
    const { cmd } = monter();
    const clic = vi.spyOn(document.getElementById('importJsonFile') as HTMLInputElement, 'click');
    cmd.executer('fichier.importerJson');
    expect(clic).toHaveBeenCalledTimes(1);
    const lecteur = monter({}, false);
    expect(lecteur.cmd.executer('fichier.importerSvg')).toBe(false);
    expect(lecteur.cmd.executer('fichier.exporterJson')).toBe(true);
    expect(lecteur.ctx.exportProjetJSON).toHaveBeenCalledTimes(1);
  });

  it('importent un SVG lu', async () => {
    const { ctx } = monter();
    await choisir('importSvgFile', '<svg/>');
    expect(ctx.importerSVG).toHaveBeenCalledWith('<svg/>');
  });

  it('appliquent un projet JSON valide avec l option remplacer du moment', async () => {
    const { ctx } = monter({ remplacerImportJson: () => false });
    await choisir('importJsonFile', '{"objects":[]}');
    expect(ctx.validerProjetJSON).toHaveBeenCalledWith({ objects: [] });
    expect(ctx.appliquerProjetImporte).toHaveBeenCalledWith({ brut: { objects: [] } }, false);
  });

  it('refusent un fichier illisible ou trop recent sans toucher au plan, en le disant', async () => {
    const illisible = monter();
    await choisir('importJsonFile', 'pas du json');
    expect(illisible.ctx.appliquerProjetImporte).not.toHaveBeenCalled();
    expect(journal.toasts[0]).toMatch(/^Import annule - fichier illisible/);
    const recent = monter({ validerProjetJSON: () => { throw Object.assign(new Error('schéma 9'), { motif: 'schema' }); } });
    await choisir('importJsonFile', '{}');
    expect(recent.ctx.appliquerProjetImporte).not.toHaveBeenCalled();
    expect(journal.toasts[1]).toBe('Import refuse : schéma 9');
  });

  it('refusent avant lecture un fichier de plus de 5 Mo', async () => {
    const { ctx } = monter();
    await choisir('importJsonFile', '{}', IMPORT_JSON_TAILLE_MAX + 1);
    expect(ctx.validerProjetJSON).not.toHaveBeenCalled();
    expect(journal.toasts[0]).toMatch(/^Fichier trop volumineux \(5 Mo, maximum 5 Mo\)/);
  });
});
