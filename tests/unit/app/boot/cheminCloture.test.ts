// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { brancherCheminCloture, lacherLaSelectionDAccueil } from '../../../../src/app/boot/annexes.js';
import { prendreSectionDemandee } from '../../../../src/app/inspecteur.js';
import { creerRegistre } from '../../../../src/app/commandes.js';
import type { Plan } from '../../../../src/app/boot/plan.js';

// « Clôture, portail » (palette) : le chemin direct vers la cloture et les portails, qui n'existent que dans l'inspecteur de la
// parcelle du projet. La commande la selectionne, ouvre l'inspecteur et demande la section ; elle n'ecrit rien dans le projet.

const TOUT_PERMIS = { branchee: () => false, aCapacite: () => true, aPermission: () => true, reste: () => null };

function monter(classe: 'compact' | 'moyen' | 'large', plus: { vue?: string; inspecteurOuvert?: boolean; sansParcelle?: boolean } = {}) {
  const objets = plus.sansParcelle ? [] : [{ key: 'parcelle', fonction: 'terrain', type: 'polygon', pts: [] }, { key: 'terrasse', fonction: 'terrasse', type: 'polygon', pts: [] }];
  const etat = { objects: objets, selectedKey: 'terrasse' as string | null, selectionAccueil: 'terrasse' as string | null, highlight: { type: 'segment', index: 2 } };
  const magasin = { store: { getState: () => ({ classe, vue: plus.vue ?? 'plan', inspecteurOuvert: plus.inspecteurOuvert ?? false }) }, definirFeuille: vi.fn() };
  const commandes = creerRegistre(TOUT_PERMIS);
  const p = { etat, magasin, commandes, render: vi.fn() } as unknown as Plan;
  const inspecteur = { basculerOuverture: vi.fn() };
  brancherCheminCloture(p, inspecteur);
  return { etat, magasin, commandes, p, inspecteur };
}

describe('« Clôture, portail » mene a la section de la parcelle du projet', () => {
  it('selectionne la parcelle, demande la section Cloture et ouvre l inspecteur de la classe', () => {
    const tel = monter('compact');
    expect(tel.commandes.executer('cloture.ouvrir')).toBe(true);
    expect(tel.etat.selectedKey).toBe('parcelle');
    expect(tel.etat.highlight).toEqual({ type: null, index: null });
    // Un choix de la personne : la Vue 3D le gardera.
    expect(tel.etat.selectionAccueil).toBeNull();
    expect(prendreSectionDemandee()).toBe('cloture');
    expect(prendreSectionDemandee()).toBeNull();
    expect(tel.magasin.definirFeuille).toHaveBeenCalledWith('proprietes');
    expect(tel.p.render).toHaveBeenCalled();

    const tablette = monter('moyen');
    tablette.commandes.executer('cloture.ouvrir');
    expect(tablette.inspecteur.basculerOuverture).toHaveBeenCalledTimes(1);
    expect(tablette.magasin.definirFeuille).not.toHaveBeenCalled();
    prendreSectionDemandee();

    const bureau = monter('large', { inspecteurOuvert: true });
    bureau.commandes.executer('cloture.ouvrir');
    expect(bureau.inspecteur.basculerOuverture).not.toHaveBeenCalled();
    expect(bureau.etat.selectedKey).toBe('parcelle');
    prendreSectionDemandee();
  });

  it('se grise sans parcelle du projet ; lancee depuis la Vue 3D, elle ramene d abord au plan', () => {
    expect(monter('large', { sansParcelle: true }).commandes.etat('cloture.ouvrir').utilisable).toBe(false);
    expect(monter('large').commandes.etat('cloture.ouvrir').utilisable).toBe(true);
    const en3d = monter('large', { vue: 'vue3d', inspecteurOuvert: true });
    const versLePlan = vi.fn();
    en3d.commandes.declarer({ id: 'vue.plan', libelle: 'Plan', groupe: 'vue', executer: versLePlan });
    expect(en3d.commandes.executer('cloture.ouvrir')).toBe(true);
    expect(versLePlan).toHaveBeenCalledTimes(1);
    expect(en3d.etat.selectedKey).toBe('parcelle');
    prendreSectionDemandee();
    const surLePlan = monter('large', { inspecteurOuvert: true });
    surLePlan.commandes.declarer({ id: 'vue.plan', libelle: 'Plan', groupe: 'vue', executer: versLePlan });
    surLePlan.commandes.executer('cloture.ouvrir');
    expect(versLePlan).toHaveBeenCalledTimes(1);
    prendreSectionDemandee();
  });

  it('ne porte pas le droit d ecrire : elle mene a la section, dont les boutons le portent', () => {
    const lecture = { ...TOUT_PERMIS, branchee: () => true, aPermission: () => false };
    const commandes = creerRegistre(lecture);
    const etat = { objects: [{ key: 'parcelle', fonction: 'terrain', type: 'polygon', pts: [] }], selectedKey: null, highlight: { type: null, index: null } };
    brancherCheminCloture({ etat, magasin: { store: { getState: () => ({ classe: 'large', vue: 'plan', inspecteurOuvert: true }) }, definirFeuille: vi.fn() }, commandes, render: vi.fn() } as unknown as Plan, { basculerOuverture: vi.fn() });
    expect(commandes.etat('cloture.ouvrir')).toEqual({ utilisable: true });
  });
});

describe('la selection d accueil lachee en entrant en Vue 3D', () => {
  it('rend le plan quand elle est lachee, et ne fait rien pour une selection choisie', () => {
    const accueil = monter('large');
    lacherLaSelectionDAccueil(accueil.p);
    expect(accueil.etat.selectedKey).toBeNull();
    expect(accueil.p.render).toHaveBeenCalledTimes(1);

    const choisie = monter('large');
    choisie.etat.selectionAccueil = null;
    lacherLaSelectionDAccueil(choisie.p);
    expect(choisie.etat.selectedKey).toBe('terrasse');
    expect(choisie.p.render).not.toHaveBeenCalled();
  });
});
