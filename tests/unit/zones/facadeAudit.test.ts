// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FacadeAudit } from '../../../src/zones/parcours/FacadeAudit.js';
import { creerRegistre } from '../../../src/app/commandes.js';
import type { SessionAuditParcelle } from '../../../src/app/audit/parcelle/controleur.js';
import type { MesureFacade } from '../../../src/app/audit/parcelle/mesures.js';
import type { IdEtape, EtatAffiche } from '../../../src/model/etapeFacade.js';

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
  { id: 'diagnostic', etat: 'saute', resume: 'Le diagnostic de forme vient avec le lot F4.' },
  { id: 'texture', etat: 'ok', resume: 'Texture de 10 × 8 m.' },
  { id: 'ouvertures', etat: 'ok', resume: '3 ouvertures trouvées, aucune devinée.' },
  { id: 'toit', etat: 'saute', resume: 'Le toit par le moteur vient avec le lot F4.' },
  { id: 'validation', etat: 'saute', resume: 'La validation de la façade vient avec le lot F5.' },
];

function session(etapes: Etape[], ouverte: { facade: string; etape: IdEtape } | null = null) {
  const mesure = { cle: 'maison', cote: 0, releve: null, rangReleve: 0, coinsTrouves: true, confiance: 0.8, hauteurM: 6, couleur: null, etapes } as MesureFacade;
  const s = {
    validation: { mesuresFaites: () => new Map([['maison#0', mesure]]), etapeEnCours: () => null, rejouerFacade: vi.fn(async () => 1), arreterMesure: vi.fn() },
    capture: { lire: () => ({ batiments: { maison: { facades: { '0': { photos: [{ type: 'image/jpeg', base64: 'QQ==' }, { type: 'image/jpeg', base64: 'Qg==' }] } } } } }), corrigerRedressement: vi.fn() },
    etapeOuverte: () => ouverte,
    ouvrirEtape: vi.fn(),
  };
  return s as unknown as SessionAuditParcelle & { ouvrirEtape: ReturnType<typeof vi.fn> };
}

function monter(s: SessionAuditParcelle) {
  const commandes = creerRegistre();
  const ouvrir = vi.fn();
  commandes.declarer({ id: 'facade.etape', libelle: 'Ouvrir une étape de la façade', groupe: 'facade', executer: (source) => ouvrir(source?.dataset.etape, source?.closest<HTMLElement>('[data-facade]')?.dataset.facade) });
  act(() => racine.render(createElement(FacadeAudit, { session: s, commandes, cle: 'maison', cote: 0, nom: 'Façade sud de Maison', largeurPlanM: 10 })));
  return { ouvrir };
}

const lignes = () => [...hote.querySelectorAll('.ligneEtapeAudit')].map((l) => l.textContent ?? '');
const ouvrables = () => [...hote.querySelectorAll('[data-commande="facade.etape"]')].map((b) => (b as HTMLElement).dataset.etape);

describe('une facade dans l audit discret', () => {
  it('montre la barre de la calibration, et rien des etapes cachees qui ont reussi : le mur et les ouvertures en une ligne', () => {
    monter(session(OK));
    expect(hote.querySelectorAll('.barreFacade .barreFacadeSegment')).toHaveLength(8);
    expect(lignes()).toEqual(['faite Mur posé : Coins du mur trouvés sur la photo.', 'faite Ouvertures : 3 ouvertures trouvées, aucune devinée.']);
    // Seuls les points de validation s'ouvrent : V1 (mur), V2 (forme), V3 (ouvertures), V4 (facade) ; ni la prise, ni l'image, ni la texture.
    expect(ouvrables()).toEqual(['calage', 'silhouette', 'ouvertures', 'validation']);
  });

  it('fait apparaitre une etape cachee des qu elle echoue, avec son geste de repli sur chaque photo', () => {
    const etapes = OK.map((e) => (e.id === 'assemblage' ? { ...e, etat: 'echec' as const, resume: 'Photos indépendantes : aucune fusion. Reprenez la façade avec des chevauchements entre les photos : un tiers de mur en commun.' } : e));
    const { ouvrir } = monter(session(etapes));
    expect(lignes()[0]).toMatch(/^en échec Assemblage : Photos indépendantes.* À la main : retirer une photo, ou en prendre une autre qui recoupe le mur\./);
    expect([...hote.querySelectorAll('[data-controle="auditParcelle.placerCoins"]')].map((b) => b.textContent)).toEqual(['Repères, photo 1', 'Repères, photo 2']);
    // Le segment « Image » s'ouvre maintenant ; le toucher passe par la commande, avec la facade de la barre.
    expect(ouvrables()).toContain('redressement');
    act(() => (hote.querySelector('[data-etape="redressement"]') as HTMLButtonElement).click());
    expect(ouvrir).toHaveBeenCalledWith('redressement', 'maison#0');
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
});
