// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FacadeAudit } from '../../../src/zones/parcours/FacadeAudit.js';
import { creerRegistre } from '../../../src/app/commandes.js';
import type { SessionAuditParcelle } from '../../../src/app/audit/parcelle/controleur.js';
import type { MesureFacade } from '../../../src/app/audit/parcelle/mesures.js';
import type { IdEtape, EtatAffiche } from '../../../src/model/etapeFacade.js';
import type { RunEnregistre } from '../../../src/regles/facades/observations.js';
import type { ReleveFacade } from '../../../src/model/types.js';

// L'audit discret (MD/spec-facade-calage-audit.md §4 ter.3, §4 ter.5, lot F3) : la barre de progression de la calibration, posee sur
// une facade de l'audit ; une etape cachee qui a reussi ne se montre pas, une etape qui echoue apparait aussitot avec son geste ;
// seuls les points de validation et ce qui doute s'ouvrent.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let racine: Root, hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); });
afterEach(() => { act(() => racine.unmount()); hote.remove(); });

type Etape = { id: IdEtape; etat: EtatAffiche; resume: string };
const OK: Etape[] = [
  { id: 'preparation', etat: 'ok', resume: 'Mur de 10 × 6 m.' },
  { id: 'prises', etat: 'ok', resume: '2 photos du mur.' },
  { id: 'redressement', etat: 'ok', resume: '2 photos redressées sur 2.' },
  { id: 'assemblage', etat: 'ok', resume: 'Fusionnée : 2 photos assemblées en une image.' },
  { id: 'calage', etat: 'ok', resume: 'Coins du mur trouvés sur la photo.' },
  { id: 'silhouette', etat: 'ok', resume: 'Le haut lu sur la photo : un triangle.' },
  { id: 'diagnostic', etat: 'saute', resume: 'Pas de corps du toit pour cette façade.' },
  { id: 'texture', etat: 'ok', resume: 'Texture de 10 × 8 m.' },
  { id: 'ouvertures', etat: 'ok', resume: '3 ouvertures trouvées, aucune devinée.' },
  { id: 'toit', etat: 'saute', resume: 'Aucune proposition de toit : le toit calculé reste, ses hauteurs aussi.' },
  { id: 'validation', etat: 'saute', resume: 'Pas encore de bilan de la façade.' },
];

const RUN: RunEnregistre = { le: '2026-10-29T08:30:00.000Z', modele: 'claude-haiku-5-5', prompt: 2, schema: 2, passes: 3, sorties: [], cout: 0.0046, tokens: { entree: 12600, sortie: 2700 }, image: { largeur: 500, hauteur: 300 }, chaine: 10 };

function session(etapes: Etape[], ouverte: { facade: string; etape: IdEtape } | null = null, runs: Record<string, RunEnregistre> | null = null, plus: Partial<MesureFacade> = {}, validee: ReleveFacade | null = null) {
  const mesure = { cle: 'maison', cote: 0, releve: null, rangReleve: 0, coinsTrouves: true, confiance: 0.8, hauteurM: 6, couleur: null, etapes, ...plus } as MesureFacade;
  const s = {
    validation: { mesuresFaites: () => new Map([['maison#0', mesure]]), etapeEnCours: () => null, rejouerFacade: vi.fn(async () => 1), arreterMesure: vi.fn(), facadeValidee: () => validee, entrees: () => ({ objets: [] }) },
    capture: { lire: () => ({ batiments: { maison: { facades: { '0': { photos: [{ type: 'image/jpeg', base64: 'QQ==' }, { type: 'image/jpeg', base64: 'Qg==' }] } } } } }), corrigerRedressement: vi.fn() },
    etapeOuverte: () => ouverte,
    analyse: { runs: () => runs, prixEscalade: () => ({ modele: 'claude-sonnet-5-5', prix: { entree: 3, sortie: 15 } }) },
    ouvrirEtape: vi.fn(),
  };
  return s as unknown as SessionAuditParcelle & { ouvrirEtape: ReturnType<typeof vi.fn> };
}

function monter(s: SessionAuditParcelle) {
  const commandes = creerRegistre();
  const ouvrir = vi.fn(), escalader = vi.fn();
  commandes.declarer({ id: 'facade.escalader', libelle: 'Escalader la lecture de la façade', groupe: 'facade', executer: (source) => escalader(source?.closest<HTMLElement>('[data-facade]')?.dataset.facade) });
  const valider = vi.fn();
  commandes.declarer({ id: 'facade.valider', libelle: 'Valider la façade', groupe: 'facade', executer: (source) => valider(source?.closest<HTMLElement>('[data-facade]')?.dataset.facade) });
  commandes.declarer({ id: 'facade.etape', libelle: 'Ouvrir une étape de la façade', groupe: 'facade', executer: (source) => ouvrir(source?.dataset.etape, source?.closest<HTMLElement>('[data-facade]')?.dataset.facade) });
  act(() => racine.render(createElement(FacadeAudit, { session: s, commandes, cle: 'maison', cote: 0, nom: 'Façade sud de Maison', largeurPlanM: 10 })));
  return { ouvrir, escalader, valider };
}

const lignes = () => [...hote.querySelectorAll('.ligneEtapeAudit')].map((l) => l.textContent ?? '');
const ouvrables = () => [...hote.querySelectorAll('[data-commande="facade.etape"]')].map((b) => (b as HTMLElement).dataset.etape);

describe('une facade dans l audit discret', () => {
  it('montre la barre de la calibration, et rien des etapes cachees qui ont reussi : le mur et les ouvertures en une ligne', () => {
    monter(session(OK));
    expect(hote.querySelectorAll('.barreFacade .barreFacadeSegment')).toHaveLength(8);
    expect(lignes()).toEqual(['faite Mur posé : Coins du mur trouvés sur la photo.', 'faite Ouvertures : 3 ouvertures trouvées, aucune devinée.']);
    // Seuls les points de validation s'ouvrent : V1 (mur), V2 (forme, sur son diagnostic : lot F4), V3 (ouvertures), V4 (facade) ; ni la
    // prise, ni l'image, ni la texture.
    expect(ouvrables()).toEqual(['calage', 'diagnostic', 'ouvertures', 'validation']);
  });

  it('fait apparaitre une etape cachee des qu elle echoue, avec son geste de repli sur chaque photo', () => {
    const etapes = OK.map((e) => (e.id === 'assemblage' ? { ...e, etat: 'echec' as const, resume: 'Photos indépendantes : aucune fusion. Reprenez la façade avec des chevauchements entre les photos : un tiers de mur en commun.' } : e));
    const { ouvrir } = monter(session(etapes));
    expect(lignes()[0]).toMatch(/^en échec Assemblage : Photos indépendantes.* À la main : retirer une photo, ou en prendre une autre qui recoupe le mur\./);
    expect([...hote.querySelectorAll('[data-controle="auditParcelle.placerCoins"]')].map((b) => b.textContent)).toEqual(['Repères, photo 1', 'Repères, photo 2']);
    // Le segment « Image » s'ouvre maintenant, sur l'etape qui echoue ; le toucher passe par la commande, avec la facade de la barre.
    expect(ouvrables()).toContain('assemblage');
    act(() => (hote.querySelector('[data-etape="assemblage"]') as HTMLButtonElement).click());
    expect(ouvrir).toHaveBeenCalledWith('assemblage', 'maison#0');
  });

  it('ouvre les quatre reperes sur la photo choisie, et « Rejouer la façade » rejoue l orchestrateur', async () => {
    const etapes = OK.map((e) => (e.id === 'redressement' ? { ...e, etat: 'a-confirmer' as const, resume: '1 photo redressée sur 2 : Photo 2 : échec, verticales à 3°.' } : e));
    const s = session(etapes);
    monter(s);
    act(() => (hote.querySelectorAll('[data-controle="auditParcelle.placerCoins"]')[1] as HTMLButtonElement).click());
    expect(hote.querySelector('.reperesAudit')).not.toBeNull();
    await act(async () => { (hote.querySelector('[data-controle="auditParcelle.rejouerFacade"]') as HTMLButtonElement).click(); });
    expect(s.validation.rejouerFacade).toHaveBeenCalledWith('maison', 0);
  });

  it('une etape ouverte depuis la barre n y repete pas son resultat, mais garde son geste', () => {
    monter(session(OK, { facade: 'maison#0', etape: 'calage' }));
    expect(hote.querySelector('.barreFacadeLigne')?.textContent).toMatch(/^Mur : calage du mur, faite/);
    expect(lignes()[0]).toBe('À la main : tirer les bouts, l’égout et le sol.Placer 4 repères'.replace('Placer 4 repères', 'Repères, photo 1Repères, photo 2'));
  });

  it('dit la lecture de Claude et son cout, et l escalade, a la demande, par la commande, son cout annonce', () => {
    // Sans lecture de Claude : ni ligne, ni bouton.
    monter(session(OK));
    expect(hote.querySelector('.lectureClaude')).toBeNull();
    act(() => racine.unmount());
    racine = createRoot(hote);
    const { escalader } = monter(session(OK, null, { 'maison#0': RUN }));
    expect(hote.querySelector('.lectureClaude .detailPhoto')?.textContent).toBe('Lue par Claude, 2026-10-29, trois passes votées, claude-haiku-5-5, prompt v2, schéma v2, 0,0046 $.');
    const b = hote.querySelector('[data-commande="facade.escalader"]') as HTMLButtonElement;
    // Une passe du run (4 200 et 900 tokens) aux prix du modele de l'escalade.
    expect(b.textContent).toBe('Escalader vers claude-sonnet-5-5 (≈ 0,0261 $)');
    act(() => b.click());
    expect(escalader).toHaveBeenCalledWith('maison#0');
  });

  it('une lecture deja escaladee le dit, et son bouton est grise : une seule escalade', () => {
    const run = { ...RUN, escalade: { le: '2026-10-29T09:00:00.000Z', modele: 'claude-sonnet-5-5', prompt: 2, schema: 2, sortie: {}, cout: 0.0031, tokens: { entree: 4200, sortie: 900 } } };
    monter(session(OK, null, { 'maison#0': run }));
    expect(hote.querySelector('.lectureClaude .detailPhoto')?.textContent).toMatch(/0,0046 \$, escaladée \(claude-sonnet-5-5, 0,0031 \$\)\.$/);
    const b = hote.querySelector('[data-commande="facade.escalader"]') as HTMLButtonElement;
    expect([b.textContent, b.disabled]).toEqual(['Escaladée (claude-sonnet-5-5)', true]);
  });

  it('V4 : le bilan de la facade attend la personne, « Valider la façade » passe par la commande ; validee, l E9 est faite', () => {
    const bilan = { dimensions: { largeurM: 10, egoutM: 6 }, forme: { gabarit: [{ u: 0, v: 1 }, { u: 1, v: 1 }], source: 'plan' as const }, textureCalee: null, ouvertures: [] };
    const attend = OK.map((e) => (e.id === 'validation' ? { ...e, etat: 'a-confirmer' as const, resume: 'Mur de 10 × 6 m ; haut du plan ; sans texture ; 0 ouverture. Validez la façade pour l’écrire dans le projet (V4).' } : e));
    const { valider } = monter(session(attend, null, null, { facade: bilan }));
    expect(lignes().at(-1)).toMatch(/^à confirmer Validation : Mur de 10 × 6 m .* \(V4\)\. À la main : corriger n’importe quel sortant\.$/);
    const b = hote.querySelector('[data-commande="facade.valider"]') as HTMLButtonElement;
    expect([b.textContent, b.disabled]).toEqual(['Valider la façade', false]);
    act(() => b.click());
    expect(valider).toHaveBeenCalledWith('maison#0');
    // Validee : plus de bouton, et l'E9 de la barre est faite.
    act(() => racine.unmount());
    racine = createRoot(hote);
    const ecrite = { cote: 0, ouvertures: [{ type: 'fenetre', x: 1, y: 1, l: 1, h: 1, id: 'o1', verifieeLe: '2026-10-29' }] } as unknown as ReleveFacade;
    monter(session(attend, null, null, { facade: bilan }, ecrite));
    expect(hote.querySelector('[data-commande="facade.valider"]')).toBeNull();
    expect(hote.querySelector('.barreFacadeSegment:last-child')?.className).toMatch(/\bok\b/);
    expect(lignes().some((l) => l.includes('Validation'))).toBe(false);
  });
});
