// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../../../src/shell/dialogs.js', () => ({
  showToast: () => {}, showErrBanner: () => {}, showConfirm: (_m: string, oui: () => void) => { oui(); }
}));

import { creerRegistre } from '../../../../src/app/commandes.js';
import { brancherDoublons } from '../../../../src/app/ecouteurs/doublons.js';
import { nouvelObjet } from '../../../../src/model/creation.js';
import { normalizeObjects } from '../../../../src/model/normalisation.js';
import { vue3d } from '../../../../src/three/etat3d.js';
import { fauxAtelier, droits } from './faux.js';
import type { ObjetPlan } from '../../../../src/model/types.js';

// « Fusionner les doublons », Vue 3D ouverte : la scene se rebatit une fois, par la commande, apres la selection retouchee ; la
// restauration ne la refait pas (audit des PR #621 a #641 : elle etait batie deux fois).

const objet = (key: string): ObjetPlan => normalizeObjects([nouvelObjet({ x: 0, y: 0 }, key, true).obj])[0] as ObjetPlan;

afterEach(() => { (vue3d as { scene: unknown }).scene = null; });

describe('projet.doublons', () => {
  it('retire les doublons en une restauration sans suite, et rebatit la Vue 3D ouverte une fois', () => {
    const a = fauxAtelier({ objects: [objet('a'), objet('b')], measures: [], selectedKey: 'b' });
    a.restoreState = vi.fn((s: { objects: unknown[] }) => { a.etat.objects = s.objects as ObjetPlan[]; });
    const buildThreeScene = vi.fn();
    const cmd = creerRegistre(droits(true));
    brancherDoublons(a, { buildThreeScene }, cmd);
    (vue3d as { scene: unknown }).scene = {};
    cmd.executer('projet.doublons');
    expect(a.etat.objects.map((o) => o.key)).toEqual(['a']);
    expect(a.etat.selectedKey).toBe('a');
    expect(a.restoreState).toHaveBeenCalledWith(expect.anything(), { sansSuite: true });
    expect(buildThreeScene).toHaveBeenCalledTimes(1);
  });
});
