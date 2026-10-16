// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

const toasts: string[] = [], bandeaux: string[] = [];
vi.mock('../../../../src/shell/dialogs.js', () => ({
  showToast: (m: string) => { toasts.push(m); }, showErrBanner: (m: string) => { bandeaux.push(m); },
}));

import { creerRegistre } from '../../../../src/app/commandes.js';
import { brancherFaitsLocaux, essayerFaitsLocaux, reglesLocalesDemandees } from '../../../../src/app/ecouteurs/faitsLocaux.js';
import { essayerFaitsToits, essaiDeFaits, faitDuBatiment, FaitsToitsIllisibles } from '../../../../src/regles/toits/faits.js';
import { droits } from './faux.js';
import { entrerEnAdmin } from '../../../../src/app/acces.js';
import type { ObjetAToit } from '../../../../src/app/toitsLidar.js';

// Le mode d'essai des faits des toits (`?regles=local`, MD/spec-regles-toits.md §9.2).

const CLE = 'BATIMENT0000000000000042';
const texte = JSON.stringify({ format: 'plan-faits-toits', version: 1, faits: { [CLE]: { observation: { forme: 'croupes' } } } });
const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }];
const objets = (): ObjetAToit[] => [
  { key: 'a', fonction: 'batiment', pts, toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'lidar' }, bdtopo: { cleabs: CLE }, toitLidarLu: 1 },
  { key: 'b', fonction: 'batiment', pts, toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'lidar' }, bdtopo: { cleabs: 'BATIMENT0000000000000043' }, toitLidarLu: 1 },
  { key: 'c', fonction: 'batiment', pts, toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'saisie' }, bdtopo: { cleabs: CLE }, toitLidarLu: 1 },
];

afterEach(() => { essayerFaitsToits(null); toasts.length = 0; bandeaux.length = 0; });

describe('?regles=local', () => {
  it('se lit dans l adresse', () => {
    expect(reglesLocalesDemandees('?regles=local')).toBe(true);
    expect(reglesLocalesDemandees('?admin&regles=local')).toBe(true);
    expect(reglesLocalesDemandees('?regles=depot')).toBe(false);
    expect(reglesLocalesDemandees('')).toBe(false);
  });

  it('pose les faits essayes et rend a relire les seuls batiments touches dont Plan choisit le toit', () => {
    const o = objets();
    const r = essayerFaitsLocaux(texte, o);
    expect(essaiDeFaits()).toBe(true);
    expect(faitDuBatiment(o[0]!)?.observation.forme).toEqual(['croupes']);
    expect(r).toMatchObject({ faits: 1, relus: 1 });
    expect(o.map((x) => x.toitLidarLu)).toEqual([null, 1, 1]);
    expect(r.message).toMatch(/enregistrés nulle part/);
  });

  it('refuse un fichier abime sans toucher aux faits en vigueur', () => {
    expect(() => essayerFaitsLocaux('{"format":"autre"}', objets())).toThrow(FaitsToitsIllisibles);
    expect(() => essayerFaitsLocaux('pas du json', objets())).toThrow(SyntaxError);
    expect(essaiDeFaits()).toBe(false);
  });

  it('la commande demande un fichier, relance la lecture des toits et le dit', async () => {
    const cmd = creerRegistre(droits());
    const relireToits = vi.fn();
    const o = objets();
    brancherFaitsLocaux({ objets: () => o, relireToits }, cmd);
    expect(cmd.obtenir('admin.faitsLocaux')?.groupe).toBe('admin');
    const clic = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      Object.defineProperty(this, 'files', { value: [new File([texte], 'faits.json', { type: 'application/json' })] });
      this.dispatchEvent(new Event('change'));
    });
    // L'administrateur seulement : hors admin, la commande est inactive.
    expect(cmd.executer('admin.faitsLocaux')).toBe(false);
    entrerEnAdmin();
    expect(cmd.executer('admin.faitsLocaux')).toBe(true);
    await vi.waitFor(() => expect(toasts).toHaveLength(1));
    expect(relireToits).toHaveBeenCalledTimes(1);
    expect(o[0]!.toitLidarLu).toBe(null);
    expect(bandeaux).toEqual([]);
    clic.mockRestore();
  });
});
