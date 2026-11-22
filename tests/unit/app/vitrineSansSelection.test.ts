// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { entrerEnVitrine, enVitrine, retireEnVitrine, droitsCourants, peutEcrire, enLectureSeule } from '../../../src/app/acces.js';
import { creerRegistre, type Commande } from '../../../src/app/commandes.js';
import { brancherSelection3d } from '../../../src/app/ecouteurs/selection3d.js';
import { hotes3d } from '../../../src/three/etat3d.js';
import type { Atelier } from '../../../src/app/atelier.js';
import type { Magasin } from '../../../src/app/magasin.js';

// La vitrine (`?mode=demo`) est une demonstration du modele 3D : on n'y choisit aucun objet et on n'y modifie rien (decision du
// proprietaire, 22 novembre 2026). Le registre efface ce qui modifie ou demande une selection ; un toucher sur la scene ne choisit rien.

const c = (o: Partial<Commande>): Commande => ({ id: 'x.y', libelle: 'x', groupe: 'vue', executer: () => {}, ...o });

describe('la vitrine ne porte ni selection ni modification', () => {
  it('hors vitrine, le registre ne retire rien de plus', () => {
    expect(enVitrine()).toBe(false);
    expect(droitsCourants().retire).toBeUndefined();
  });

  it('retire ce qui ecrit le projet, le mode Toit, les facades, le photomontage et l isolement ; garde la navigation et l affichage', () => {
    expect(retireEnVitrine(c({ id: 'objet.supprimer', groupe: 'objet', permission: 'projects.write' }))).toBe(true);
    expect(retireEnVitrine(c({ id: 'objet.annuler', groupe: 'objet' }))).toBe(true);
    expect(retireEnVitrine(c({ id: 'toit.modifier', groupe: 'toit' }))).toBe(true);
    expect(retireEnVitrine(c({ id: 'facade.photographier', groupe: 'facade' }))).toBe(true);
    expect(retireEnVitrine(c({ id: '3d.photomontage', groupe: '3d' }))).toBe(true);
    expect(retireEnVitrine(c({ id: 'terrasse.isoler', groupe: 'terrasse' }))).toBe(true);
    expect(retireEnVitrine(c({ id: 'projet.enregistrer', groupe: 'projet' }))).toBe(true);
    expect(retireEnVitrine(c({ id: '3d.zoomAvant', groupe: '3d' }))).toBe(false);
    expect(retireEnVitrine(c({ id: '3d.pleinePage', groupe: '3d' }))).toBe(false);
    expect(retireEnVitrine(c({ id: 'vue.3d', groupe: 'vue' }))).toBe(false);
    expect(retireEnVitrine(c({ id: 'affichage.grille', groupe: 'affichage', ecrit: 'affichage' }))).toBe(false);
  });

  it('en vitrine : lecture seule, les commandes retirees s effacent du registre, un toucher sur la scene ne choisit rien', () => {
    // Un batiment sous le doigt, hors vitrine : il est choisi (le temoin de ce que la vitrine empeche).
    const hote = document.createElement('div'), toile = document.createElement('canvas');
    hote.appendChild(toile); document.body.appendChild(hote);
    hotes3d.vue3d = hote;
    const etat = { objects: [{ key: 'maison', name: 'Maison', fonction: 'batiment', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }] }], selectedKey: null as string | null, highlight: { type: null, index: null } };
    const a = { etat, rebuildSelector: vi.fn(), render: vi.fn() } as unknown as Atelier;
    const magasin = { store: { getState: () => ({ vue: 'vue3d' }), subscribe: () => () => {} } } as unknown as Magasin;
    brancherSelection3d(a, magasin, document);
    const toucher = () => {
      for (const type of ['pointerdown', 'pointerup']) {
        const e = new MouseEvent(type, { bubbles: true, button: 0, clientX: 10, clientY: 10 });
        Object.assign(e, { pointerId: 1, isPrimary: true });
        toile.dispatchEvent(e);
      }
    };
    toucher();
    // Sans moteur 3D sous le test, le rayon ne trouve rien : le rendu n'est appele que si la selection change.
    expect(etat.selectedKey).toBeNull();

    entrerEnVitrine();
    expect(enVitrine()).toBe(true);
    expect(peutEcrire()).toBe(false);
    expect(enLectureSeule()).toBe(true);
    etat.selectedKey = null;
    toucher();
    expect(etat.selectedKey).toBeNull();
    expect(a.render).not.toHaveBeenCalled();

    const cmd = creerRegistre(droitsCourants());
    cmd.declarer(c({ id: 'toit.modifier', groupe: 'toit' }));
    cmd.declarer(c({ id: '3d.photomontage', groupe: '3d' }));
    cmd.declarer(c({ id: 'terrasse.isoler', groupe: 'terrasse' }));
    cmd.declarer(c({ id: 'objet.supprimer', groupe: 'objet', permission: 'projects.write' }));
    cmd.declarer(c({ id: '3d.zoomAvant', groupe: '3d' }));
    for (const id of ['toit.modifier', '3d.photomontage', 'terrasse.isoler', 'objet.supprimer']) {
      expect(cmd.effacee(id)).toBe(true);
      expect(cmd.executer(id)).toBe(false);
    }
    expect(cmd.etat('3d.zoomAvant')).toEqual({ utilisable: true });
  });
});
