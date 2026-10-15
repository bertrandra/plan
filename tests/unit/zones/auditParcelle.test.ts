// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AuditParcelle } from '../../../src/zones/parcours/AuditParcelle.js';
import { AuditCas } from '../../../src/zones/parcours/AuditCas.js';
import { creerSessionAuditParcelle } from '../../../src/app/audit/parcelle/controleur.js';
import { creerPromenade } from '../../../src/app/audit/promenade.js';
import { creerEtat } from '../../../src/core/state.js';
import { creerRegistre } from '../../../src/app/commandes.js';
import type { ObjetPlan, PtBrut } from '../../../src/model/types.js';
import type { Proposition } from '../../../src/model/propositions.js';

// L'ecran de l'audit de la parcelle (Z8) : la liste de controle par batiment, les gestes qui la
// remplissent, l'ecran de prise ; et « Ce que je vois », le meme composant dans la fiche de la promenade.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const obj = (key: string, plus: Partial<ObjetPlan>): ObjetPlan => ({ key, name: key, type: 'polygon', ...plus } as ObjetPlan);
const quartier = (): ObjetPlan[] => [
  obj('parcelle', { fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: '78650000AE0101', origineLat: 48.9, origineLon: 2.13 } }),
  obj('voisine', { fonction: 'terrain', pts: rect(20, 0, 40, 30), voisinage: true }),
  obj('maison', { name: 'Maison', fonction: 'batiment', pts: rect(5, 10, 15, 20), elevation: 6 }),
  obj('chezVoisin', { name: 'Voisin', fonction: 'batiment', pts: rect(20, 5, 30, 15), elevation: 6, voisinage: true, bdtopo: { surParcellePrincipale: false } }),
];

let racine: Root, hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); });
afterEach(() => { act(() => racine.unmount()); hote.remove(); });

function ecran(objets: ObjetPlan[] = quartier()) {
  const etat = creerEtat({ objects: objets } as never, (o) => o as never);
  const s = creerSessionAuditParcelle({ etat, idu: '78650000AE0101', ouvrir3d: vi.fn(), signaler: () => {}, stockage: null, suivre: () => () => {}, boussole: { suivre: () => () => {}, autoriser: async () => false }, surligner: () => {}, retirerPosition: () => {} });
  const fermer = vi.fn();
  act(() => racine.render(createElement(AuditParcelle, { session: s, commandes: creerRegistre(), fermer })));
  return { s, fermer };
}
const bouton = (texte: string | RegExp) => [...hote.querySelectorAll('button')].find((b) => (typeof texte === 'string' ? b.textContent === texte || b.getAttribute('aria-label') === texte : texte.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))) as HTMLButtonElement | undefined;
const cliquer = (b: HTMLElement | undefined) => { expect(b).toBeDefined(); act(() => b?.click()); };

describe('la liste de controle', () => {
  it('montre les batiments de la parcelle, puis la parcelle, sans la maison voisine, et le compteur', () => {
    ecran();
    expect(hote.querySelector('.titreParcours')?.textContent).toBe('Audit de la parcelle');
    expect(hote.querySelector('.compteurAudit')?.textContent).toMatch(/^0 façade sur \d+, toit à voir, clôture à faire, portail à faire$/);
    const titres = [...hote.querySelectorAll('.titreBatimentAudit')].map((h) => h.textContent);
    expect(titres).toEqual(['Maison', 'La parcelle']);
    // La maison de la parcelle voisine n'est nulle part : ni section, ni liste repliee.
    expect(hote.textContent).not.toContain('Voisin');
    expect(hote.querySelector('details.voisinsAudit')).toBeNull();
    expect(bouton('Lancer l’analyse')?.disabled).toBe(true);
    expect(hote.textContent).toContain('Photographiez au moins une façade pour lancer l’analyse.');
  });

  it('marque une facade inaccessible d une touche, et la rend', () => {
    ecran();
    const b = bouton(/^Marquer inaccessible : Façade sud .* de Maison$/);
    cliquer(b);
    const ligne = [...hote.querySelectorAll('.ligneAudit')].find((li) => li.textContent?.startsWith('Façade sud'));
    expect(ligne?.textContent).toContain('Inaccessible');
    cliquer(bouton(/^Rendre accessible : Façade sud .* de Maison$/));
    expect(ligne?.textContent).toContain('À photographier');
  });

  it('note le toit avec « Ce que je vois », et la ligne passe a « Vu »', () => {
    const { s } = ecran();
    cliquer(bouton('Noter : Toit de Maison'));
    cliquer([...hote.querySelectorAll<HTMLButtonElement>('button[data-controle="vu.forme"]')].find((b) => b.textContent === 'Deux pans'));
    expect(s.capture.lire().batiments.maison?.vu).toEqual({ forme: 'deux-pans' });
    expect(hote.textContent).toContain('Vu · Deux pans');
    // Toucher le choix retenu le retire : on n'affirme que ce que l'on a vu.
    cliquer([...hote.querySelectorAll<HTMLButtonElement>('button[data-controle="vu.forme"]')].find((b) => b.textContent === 'Deux pans'));
    expect(s.capture.lire().batiments.maison?.vu).toEqual({});
  });

  it('note la cloture cote rue', () => {
    const { s } = ecran();
    cliquer([...hote.querySelectorAll<HTMLButtonElement>('button[data-controle="auditParcelle.noter"]')].find((b) => b.textContent?.startsWith('Clôture côté rue')));
    cliquer([...hote.querySelectorAll<HTMLButtonElement>('button[data-controle="auditParcelle.typeCloture"]')].find((b) => b.textContent === 'Mur'));
    expect(s.capture.lire().cloture.type).toBe('mur');
    expect(hote.textContent).toContain('Notée · Mur');
    expect(hote.querySelector('.compteurAudit')?.textContent).toContain('clôture notée');
  });

  it('ouvre l ecran de prise sur la facade choisie, et revient a la liste', () => {
    const { s } = ecran();
    cliquer(bouton(/^Photographier : Façade nord .* de Maison$/));
    expect(s.ecran()).toBe('prise');
    expect(hote.querySelector('.auditPrise .titreParcours')?.textContent).toBe('Photo pour la façade nord de Maison (choisie) — 0 photo');
    expect(hote.querySelector<HTMLInputElement>('input[data-controle="auditParcelle.photo"]')?.disabled).toBe(false);
    cliquer(bouton('Liste'));
    expect(s.ecran()).toBe('liste');
  });

  it('dit qu il attend la position sur l ecran de prise, sans facade a viser', () => {
    const { s } = ecran();
    cliquer(bouton('Photographier en marchant'));
    expect(hote.querySelector('.auditPrise .titreParcours')?.textContent).toBe('En attente de votre position…');
    expect(hote.querySelector<HTMLInputElement>('input[data-controle="auditParcelle.photo"]')?.disabled).toBe(true);
    expect(bouton('Ce n’est pas cette façade')?.disabled).toBe(true);
    expect(s.cible()).toBeNull();
  });
});

describe('ce qui manque', () => {
  it('rend deux facades de meme orientation sans cle React en double', () => {
    // Une maison en L : deux murs regardent l'est, et leurs lignes de « Ce qui manque » ont le meme texte.
    const L: PtBrut[] = [{ x: 5, y: 10 }, { x: 15, y: 10 }, { x: 15, y: 15 }, { x: 10, y: 15 }, { x: 10, y: 20 }, { x: 5, y: 20 }];
    const objets = [quartier()[0]!, obj('maison', { name: 'Maison', fonction: 'batiment', pts: L, elevation: 6 })];
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { s } = ecran(objets);
      // La liste « Ce qui manque » n'apparait qu'une fois une facade photographiee.
      act(() => { s.capture.ajouterPhotoFacade('maison', 0, { type: 'image/jpeg', base64: 'AAAA' }); });
      const lignes = [...hote.querySelectorAll('.manquesAudit li')].map((li) => li.textContent);
      expect(lignes.filter((t) => t === 'façade est de Maison : pas de photo')).toHaveLength(2);
      expect(erreurs.mock.calls.filter((c) => c.some((a) => typeof a === 'string' && /same key/.test(a)))).toEqual([]);
    } finally {
      erreurs.mockRestore();
    }
  });
});

describe('« Ce que je vois » dans la fiche de la promenade', () => {
  it('est le meme composant, facultatif, et s ecrit dans le cas', () => {
    const promenade = creerPromenade({ figer: () => ({ identite: { cleBdtopo: 'X', idu: null, adresse: '2 allée des Limites' }, entrees: { pts: [], bdtopo: null, grille: null, voisins: [] }, sorties: {} as never }) });
    promenade.marquer('b1', { x: 0, y: 0 }, 5);
    act(() => racine.render(createElement(AuditCas, { promenade, cle: 'b1', retirer: () => {}, prise: () => null, fermer: () => {} })));
    expect(hote.querySelector('.sectionVu summary')?.textContent).toBe('Ce que je vois (facultatif)');
    cliquer([...hote.querySelectorAll<HTMLButtonElement>('button[data-controle="vu.cheminees"]')].find((b) => b.textContent === '2'));
    expect(promenade.cas('b1')?.vu).toEqual({ cheminees: { nombre: 2, souches: [{}, {}] } });
    expect(hote.querySelectorAll('.soucheVue')).toHaveLength(2);
    // Revenir a rien retire la section du cas : le fichier n'ecrit pas de section vide.
    cliquer([...hote.querySelectorAll<HTMLButtonElement>('button[data-controle="vu.cheminees"]')].find((b) => b.textContent === '2'));
    expect(promenade.cas('b1')).not.toHaveProperty('vu');
  });
});

describe('la sauvegarde sous la liste de controle', () => {
  it('se montre quand quelqu un peut envoyer : le bouton du registre, puis ce qui est parti', async () => {
    const etat = creerEtat({ objects: quartier() } as never, (o) => o as never);
    const client = {
      envoyer: vi.fn(async () => ({ id: 'd1', retrait: 'r1' })), remplacer: vi.fn(async (id: string, retrait: string) => ({ id, retrait })),
      retirer: vi.fn(async () => {}), lister: vi.fn(async () => []), lire: vi.fn(async () => ''),
    };
    const s = creerSessionAuditParcelle({
      etat, idu: '78650000AE0101', ouvrir3d: vi.fn(), signaler: () => {}, stockage: null, suivre: () => () => {}, boussole: { suivre: () => () => {}, autoriser: async () => false },
      surligner: () => {}, retirerPosition: () => {}, audits: () => client, lireGrille: async () => null, maintenant: () => new Date('2026-10-13T15:42:00Z'),
      sauvegarde: { planifier: () => () => {}, surReseau: () => () => {} },
    });
    const commandes = creerRegistre();
    commandes.declarer({ id: 'audit.envoyerParcelle', libelle: 'Envoyer l’audit au serveur', groupe: 'audit', executer: () => { void s.sauvegarde.envoyer(); } });
    act(() => racine.render(createElement(AuditParcelle, { session: s, commandes, fermer: () => {} })));
    const ligne = hote.querySelector('.sauvegardeAudit');
    expect(ligne?.querySelector('.noteSauvegarde')?.textContent).toBe('Chaque photo part aussi sur le serveur de Plan, quelques secondes après : rien ne se perd si le téléphone s’éteint.');
    const b = ligne?.querySelector<HTMLButtonElement>('button[data-commande="audit.envoyerParcelle"]');
    expect(b?.textContent).toBe('Envoyer l’audit au serveur');
    await act(async () => { b?.click(); await vi.waitFor(() => expect(client.envoyer).toHaveBeenCalledOnce()); });
    await act(async () => { await vi.waitFor(() => expect(s.sauvegarde.etat().etat).toBe('envoye')); });
    expect(hote.querySelector('.noteSauvegarde')?.textContent).toMatch(/^Envoyé (le \d\d\/\d\d )?à \d\d:\d\d\. Chaque photo y part aussi, quelques secondes après\.$/);
  });

  it('n existe pas sans personne pour envoyer', () => {
    ecran();
    expect(hote.querySelector('.sauvegardeAudit')).toBeNull();
  });
});

describe('le verrou d un batiment, sur l ecran de prise', () => {
  const avecAnnexe = (): ObjetPlan[] => [...quartier(), obj('annexe', { name: 'Annexe', fonction: 'batiment', pts: rect(2, 22, 6, 27), elevation: 3 })];

  it('propose un bouton par batiment quand la parcelle porte une annexe, et verrouille sur un geste volontaire', () => {
    const { s } = ecran(avecAnnexe());
    act(() => s.montrer('prise'));
    const groupe = hote.querySelector('[aria-label="Bâtiment photographié"]');
    expect(groupe).not.toBeNull();
    const boutons = [...(groupe?.querySelectorAll('button') ?? [])];
    expect(boutons.map((b) => b.textContent)).toEqual(['Maison', 'Annexe']);
    expect(boutons.every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    // Rien n'est verrouille tant que la personne ne le fait pas.
    expect(s.verrou()).toBeNull();
    cliquer(boutons[1]);
    expect(s.verrou()).toBe('annexe');
    const apres = [...hote.querySelectorAll('[aria-label="Bâtiment photographié"] button')];
    expect(apres.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect(hote.querySelector('[aria-label="Bâtiment photographié"]')?.textContent).toContain('Verrouillé, seul ce bâtiment est visé');
    // Toucher le bouton verrouille rend la main.
    cliquer(apres[1] as HTMLElement);
    expect(s.verrou()).toBeNull();
  });

  it('ne montre rien quand la parcelle n a qu un batiment : il n y a rien a verrouiller', () => {
    const { s } = ecran();
    act(() => s.montrer('prise'));
    expect(hote.querySelector('[aria-label="Bâtiment photographié"]')).toBeNull();
  });
});

describe('sortir de l audit (demande du 16 octobre)', () => {
  const fermeture = () => hote.querySelector<HTMLButtonElement>('[data-controle="auditParcelle.fermer"]');

  it('la prise a son bouton Fermer, a cote du titre : plus de passage obligatoire par la liste', () => {
    const { s, fermer } = ecran();
    cliquer(bouton(/^Photographier : Façade nord .* de Maison$/));
    expect(s.ecran()).toBe('prise');
    expect(fermeture()?.closest('.enteteCarteAudit')?.querySelector('.titreParcours')).not.toBeNull();
    cliquer(fermeture() ?? undefined);
    expect(fermer).toHaveBeenCalledTimes(1);
  });

  it('les propositions aussi', () => {
    const { s, fermer } = ecran();
    act(() => s.montrer('propositions'));
    expect(fermeture()?.closest('.entetePropositions')).not.toBeNull();
    cliquer(fermeture() ?? undefined);
    expect(fermer).toHaveBeenCalledTimes(1);
  });

  it('la liste garde le sien', () => {
    const { fermer } = ecran();
    cliquer(fermeture() ?? undefined);
    expect(fermer).toHaveBeenCalledTimes(1);
  });
});

describe('la consultation d un audit recu : le meme ecran des propositions, en lecture seule', () => {
  const proposition = (id: string, apres: string): Proposition => ({
    id, cible: { type: 'batiment', cle: 'maison' }, objet: 'Murs de Maison', avant: 'enduit', apres, source: 'mesure', indices: [], confiance: 0.9,
    remplaceChoix: null, reserve: null, effet: { type: 'materiauMurs', materiau: 'brique' },
  });

  function consultation() {
    const retour = vi.fn();
    const e = ecran();
    act(() => e.s.validation.figer([
      { ...proposition('maison:materiauMurs', 'brique'), decision: 'validee' as const },
      { ...proposition('maison:couverture', 'ardoise'), decision: 'refusee' as const },
      { ...proposition('maison:cheminees', '2 cheminées'), decision: null },
    ]));
    act(() => racine.render(createElement(AuditParcelle, { session: e.s, commandes: creerRegistre(), fermer: e.fermer, retour })));
    act(() => e.s.montrer('propositions'));
    return { ...e, retour };
  }

  it('montre les lignes du fichier avec la decision de l audit, cases grisees', () => {
    const t = consultation();
    expect(t.s.lectureSeule()).toBe(true);
    expect(hote.querySelector('.auditPropositions .titreParcours')?.textContent).toBe('Avant et après : l’audit reçu');
    const lignes = [...hote.querySelectorAll('.ligneProposition')];
    expect(lignes.map((l) => l.querySelector('.decisionProposition')?.textContent)).toEqual([
      'Décision de l’audit : Validée', 'Décision de l’audit : Refusée', 'Décision de l’audit : En attente',
    ]);
    expect(lignes.map((l) => l.querySelector<HTMLInputElement>('input')?.checked)).toEqual([true, false, false]);
    expect(lignes.every((l) => l.querySelector<HTMLInputElement>('input')?.disabled)).toBe(true);
  });

  it('garde l avant / apres de l audit, sans valider, sans liste, sans partage', () => {
    consultation();
    expect(hote.querySelector('[data-controle="auditParcelle.avantApres"]')).not.toBeNull();
    for (const c of ['auditParcelle.valider', 'auditParcelle.liste', 'auditParcelle.fichier', 'auditParcelle.partagerCorpus']) {
      expect(hote.querySelector('[data-controle="' + c + '"]')).toBeNull();
    }
    expect(hote.textContent).toContain('rien n’est écrit dans ce projet');
  });

  it('revient aux audits par « Retour aux audits », et se ferme comme l audit', () => {
    const t = consultation();
    cliquer(hote.querySelector<HTMLButtonElement>('[data-controle="auditsParcelle.retour"]') ?? undefined);
    expect(t.retour).toHaveBeenCalledTimes(1);
    cliquer(hote.querySelector<HTMLButtonElement>('[data-controle="auditParcelle.fermer"]') ?? undefined);
    expect(t.fermer).toHaveBeenCalledTimes(1);
  });

  it('n a pas de bouton de retour hors consultation', () => {
    const { s } = ecran();
    act(() => s.montrer('propositions'));
    expect(hote.querySelector('[data-controle="auditsParcelle.retour"]')).toBeNull();
    expect(hote.querySelector('[data-controle="auditParcelle.valider"]')).not.toBeNull();
  });
});
