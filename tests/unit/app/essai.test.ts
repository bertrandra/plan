import { describe, it, expect } from 'vitest';
import { entrerEnEssai, enEssai, retireEnEssai, droitsCourants, peutEcrire, enLectureSeule } from '../../../src/app/acces.js';
import { creerRegistre, type Commande } from '../../../src/app/commandes.js';
import { vitrinePlateforme } from '../../../src/plateforme/config.js';

// La demonstration sans compte (lot 6) : tout s'y modifie, rien ne s'enregistre ; ce qui se vend (cadastre, PLU, relief, partage) ou
// demande un compte (audit, Claude, admin) disparait.

const c = (o: Partial<Commande>): Commande => ({ id: 'x.y', libelle: 'x', groupe: 'objet', executer: () => {}, ...o });

describe('la demonstration sans compte', () => {
  it('permet de modifier, sans enregistrer ni appeler ce qui demande un compte', () => {
    entrerEnEssai();
    expect(enEssai()).toBe(true);
    expect(peutEcrire()).toBe(true);
    expect(enLectureSeule()).toBe(false);
    const cmd = creerRegistre(droitsCourants());
    cmd.declarer(c({ id: 'objet.ajouter.terrasse', permission: 'projects.write' }));
    cmd.declarer(c({ id: 'projet.enregistrer', groupe: 'projet', permission: 'projects.write' }));
    cmd.declarer(c({ id: 'projet.depuisAdresse', groupe: 'projet', capacite: 'plan.cadastre' }));
    cmd.declarer(c({ id: 'audit.parcelle', groupe: 'audit' }));
    cmd.declarer(c({ id: 'vue.3d', groupe: 'vue', capacite: 'plan.3d' }));
    expect(cmd.etat('objet.ajouter.terrasse')).toEqual({ utilisable: true });
    expect(cmd.etat('vue.3d')).toEqual({ utilisable: true });
    for (const id of ['projet.enregistrer', 'projet.depuisAdresse', 'audit.parcelle']) expect(cmd.effacee(id), id).toBe(true);
  });

  it('retire le partage, le relief, le PLU, l assistant et la lecture des toits en fond', () => {
    expect(retireEnEssai(c({ id: 'projet.partager', groupe: 'projet', capacite: 'project_sharing' }))).toBe(true);
    expect(retireEnEssai(c({ id: 'relief.lire', groupe: 'relief' }))).toBe(true);
    expect(retireEnEssai(c({ id: 'assistant.demander', groupe: 'assistant' }))).toBe(true);
    expect(retireEnEssai(c({ id: 'projet.toitsFond', groupe: 'projet' }))).toBe(true);
    expect(retireEnEssai(c({ id: 'export.ouvrirDevis', groupe: 'export' }))).toBe(false);
  });
});

describe('la vitrine de la plateforme', () => {
  it('est sa racine, le produit nomme', () => {
    expect(vitrinePlateforme('https://www.raillard.org', 'plan')).toBe('https://www.raillard.org/?product=plan');
    expect(vitrinePlateforme('https://www.raillard.org/api/v1/', 'plan')).toBe('https://www.raillard.org/?product=plan');
  });
});
