// Admin › Calibrer la detection, lot C2 : choisir, element par element, la source que retient le moteur (Calcul, Claude, Manuel), et
// forcer Claude pour une etape ou pour toutes (decisions du proprietaire du 7 novembre 2026). Seulement dans la calibration pour
// l'instant (decision du proprietaire : « pas encore » dans l'audit). Les boutons sont des liaisons vers les commandes du registre de
// l'ecran (`facade.choisirSource`, `facade.forcerClaude`) : le choix est un geste du cas, entree de `derouler`, que Ctrl+Z defait.
// Manuel part de la valeur du calcul ou de celle de Claude, et se corrige champ par champ ; l'ecran ne calcule rien.

import { useState } from 'react';
import { etapeFacade, type ElementAction, type IdEtape, type ValeurElement } from '../model/etapeFacade.js';
import type { RegistreCommandes } from '../app/commandes.js';
import { LIBELLES_SOURCE, valeurEnClair } from './composants/ActionsEtape.js';

export const COMMANDE_CHOISIR_SOURCE = 'facade.choisirSource';
export const COMMANDE_FORCER_CLAUDE = 'facade.forcerClaude';

type Commandes = Pick<RegistreCommandes, 'etat' | 'executer' | 'effacee'>;

/** Les mots fermes de quelques champs : un choix dans une liste plutot qu'un texte libre. */
const LISTES: Readonly<Record<string, readonly string[]>> = {
  type: ['fenetre', 'porte-fenetre', 'porte', 'garage'],
  silhouette: ['triangle', 'trapeze', 'rampe', 'ligne-droite', 'marches', 'plusieurs-sommets', 'indetermine'],
  bout: ['pignon', 'croupe', 'demi-croupe', 'brisis', 'sans-objet', 'indetermine'],
  element: ['cheminee', 'lucarne'],
};

/** Le libelle d'un champ manuel. */
const CHAMPS: Readonly<Record<string, string>> = {
  type: 'Type', x: 'À gauche (m)', y: 'Du sol (m)', l: 'Largeur (m)', h: 'Hauteur (m)', u: 'Le long du mur (u)', v: 'Hauteur (v, en égouts)', u0: 'Début (u)', u1: 'Fin (u)',
  v0: 'Bas (v)', v1: 'Haut (v)', x0: 'Bout gauche (px)', x1: 'Bout droit (px)', y0: 'Égout (px)', y1: 'Sol (px)', silhouette: 'Haut', bout: 'Bout', element: 'Élément', principale: 'Parement', quoi: 'Quoi',
};

/** Une valeur ou l'on peut partir : seulement ses champs en clair (nombres, mots). */
const depart = (v: ValeurElement | null | undefined): ValeurElement | null => (v ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'number' || typeof x === 'string')) : null);

/** Un bouton lie a une commande de l'ecran : efface si la commande l'est, grise avec sa raison sinon. */
function BoutonDeCommande({ commandes, id, donnees, presse, desactive, raison, avant, children }: { commandes: Commandes; id: string; donnees: Record<string, string>; presse?: boolean; desactive?: boolean; raison?: string; avant?: () => void; children: string }) {
  if (commandes.effacee(id)) return null;
  const e = commandes.etat(id);
  const titre = raison ?? ('message' in e ? e.message : undefined);
  return <button type="button" className={presse ? 'small' : 'secondary small'} data-commande={id} {...Object.fromEntries(Object.entries(donnees).map(([k, v]) => ['data-' + k, v]))}
    {...(presse !== undefined ? { 'aria-pressed': presse } : {})} disabled={!!desactive || !e.utilisable} title={titre}
    onClick={(ev) => { avant?.(); commandes.executer(id, ev.currentTarget); }}>{children}</button>;
}

/** Les champs d'une valeur manuelle, en partant d'une valeur ; « Appliquer ma valeur » passe par la commande. */
function ChampsManuels({ cle, valeur, changer, commandes, occupe, poser }: { cle: string; valeur: ValeurElement; changer: (v: ValeurElement) => void; commandes: Commandes; occupe: boolean; poser: (cle: string, v: ValeurElement) => void }) {
  return <div className="choixManuel" role="group" aria-label="Votre valeur">
    {Object.entries(valeur).map(([k, v]) => <label key={k} className="calChamp">{CHAMPS[k] ?? k}
      {LISTES[k] ? <select value={String(v)} onChange={(e) => changer({ ...valeur, [k]: e.target.value })}>{LISTES[k]?.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        : typeof v === 'number' ? <input type="number" step="0.01" value={v} onChange={(e) => { const n = parseFloat(e.target.value); if (Number.isFinite(n)) changer({ ...valeur, [k]: n }); }} />
          : <input type="text" value={String(v ?? '')} onChange={(e) => changer({ ...valeur, [k]: e.target.value })} />}
    </label>)}
    <BoutonDeCommande commandes={commandes} id={COMMANDE_CHOISIR_SOURCE} donnees={{ cle, source: 'manuel' }} desactive={occupe} avant={() => poser(cle, valeur)}>Appliquer ma valeur</BoutonDeCommande>
  </div>;
}

interface PropsChoix {
  x: ElementAction;
  commandes: Commandes;
  occupe: boolean;
  /** La valeur manuelle que la commande va poser (l'editeur la lit au moment du geste). */
  poser: (cle: string, v: ValeurElement) => void;
}

/**
 * Les trois boutons d'un element lu par Claude : Calcul, Claude, Manuel ; le bouton enfonce est la source qui vaut (le choix, le forcage
 * ou le moteur). Claude se grise quand il ne l'a pas lu ; Manuel ouvre ses champs, partis du calcul ou de Claude.
 */
export function ChoixElement({ x, commandes, occupe, poser }: PropsChoix) {
  const [manuel, setManuel] = useState<ValeurElement | null>(null);
  if (!x.cle || !x.famille) return null;
  const cle = x.cle, calcul = depart(x.valeurs?.calcul), claude = depart(x.valeurs?.claude), deja = depart(x.valeurs?.manuel);
  const sans = !x.consommePar?.length;
  return <div className="choixSource" role="group" aria-label={'La source de cet élément (' + x.type + ')'}>
    {(['calcul', 'claude'] as const).map((s) => <BoutonDeCommande key={s} commandes={commandes} id={COMMANDE_CHOISIR_SOURCE} donnees={{ cle, source: s }} presse={x.sourceLue === s} desactive={occupe || s === 'claude' && !claude}
      {...(s === 'claude' && !claude ? { raison: 'Claude n’a pas lu cet élément : le calcul est gardé.' } : {})}>{LIBELLES_SOURCE[s]}</BoutonDeCommande>)}
    <button type="button" className={x.sourceLue === 'manuel' ? 'small' : 'secondary small'} aria-pressed={x.sourceLue === 'manuel' || !!manuel} aria-expanded={!!manuel} disabled={occupe}
      onClick={() => setManuel((m) => (m ? null : deja ?? calcul ?? claude ?? {}))}>{LIBELLES_SOURCE.manuel}</button>
    {x.choisie && <BoutonDeCommande commandes={commandes} id={COMMANDE_CHOISIR_SOURCE} donnees={{ cle, source: 'moteur' }} desactive={occupe}>Revenir au moteur</BoutonDeCommande>}
    {sans && <span className="calNote">Aucune étape ne consomme cet élément : votre choix est rangé, il ne change aucun calcul.</span>}
    {manuel && <>
      <span className="choixDepart">
        {calcul && <button type="button" className="secondary small" onClick={() => setManuel({ ...calcul })}>Partir du calcul</button>}
        {claude && <button type="button" className="secondary small" onClick={() => setManuel({ ...claude })}>Partir de Claude</button>}
      </span>
      {Object.keys(manuel).length
        ? <ChampsManuels cle={cle} valeur={manuel} changer={setManuel} commandes={commandes} occupe={occupe} poser={poser} />
        : <span className="calNote">Ni le calcul ni Claude ne donnent de valeur à corriger ici.</span>}
    </>}
  </div>;
}

/** « Claude pour toute l'étape » : un forcage pose ou retire, pour l'etape ouverte ; un choix par element l'emporte. */
export function ForcerLEtape({ id, force, commandes, occupe }: { id: IdEtape; force: boolean; commandes: Commandes; occupe: boolean }) {
  return <div className="calLigne choixForcage">
    <BoutonDeCommande commandes={commandes} id={COMMANDE_FORCER_CLAUDE} donnees={{ etape: id }} presse={force} desactive={occupe}>{'Claude pour toute l’' + etapeFacade(id).numero}</BoutonDeCommande>
    <span className="calNote">Un choix par élément l’emporte ; un élément que Claude n’a pas lu garde le calcul, et le dit.</span>
  </div>;
}

/** « Forcer Claude partout » (a l'E8) : Claude pour toutes les etapes qui consomment une lecture de Claude. */
export function ForcerPartout({ force, commandes, occupe }: { force: boolean; commandes: Commandes; occupe: boolean }) {
  return <div className="calLigne choixForcage">
    <BoutonDeCommande commandes={commandes} id={COMMANDE_FORCER_CLAUDE} donnees={{ toutes: 'oui' }} presse={force} desactive={occupe}>Forcer Claude partout</BoutonDeCommande>
    <span className="calNote">Pour toutes les étapes qui lisent Claude, sauf la pose du mur (É7, un choix à faire là) ; un choix par élément l’emporte.</span>
  </div>;
}

/** Les ouvertures ajoutees a la main a l'E12 (`ajout:k`), et le geste d'en ajouter une ; « Retirer » rend le moteur. */
export function AjoutsOuvertures({ ajouts, commandes, occupe, poser }: { ajouts: readonly { cle: string; valeur: ValeurElement | undefined }[]; commandes: Commandes; occupe: boolean; poser: (cle: string, v: ValeurElement) => void }) {
  const [nouvelle, setNouvelle] = useState<ValeurElement | null>(null);
  const suivante = 'ajout:' + (Math.max(-1, ...ajouts.map((a) => Number(a.cle.slice(6)) || 0)) + 1);
  return <section className="choixAjouts" aria-label="Les ouvertures ajoutées à la main">
    <h4 className="calTitre3">Ajouter une ouverture (Manuel)</h4>
    {ajouts.length > 0 && <ul className="calListe">{ajouts.map((a) => <li key={a.cle}>{a.valeur ? Object.entries(a.valeur).map(([k, v]) => (CHAMPS[k] ?? k) + ' ' + valeurEnClair(v)).join(' · ') : a.cle}{' '}
      <BoutonDeCommande commandes={commandes} id={COMMANDE_CHOISIR_SOURCE} donnees={{ cle: a.cle, source: 'moteur' }} desactive={occupe}>Retirer</BoutonDeCommande></li>)}</ul>}
    {nouvelle
      ? <ChampsManuels cle={suivante} valeur={nouvelle} changer={setNouvelle} commandes={commandes} occupe={occupe} poser={(c, v) => { poser(c, v); setNouvelle(null); }} />
      : <button type="button" className="secondary small" disabled={occupe} onClick={() => setNouvelle({ type: 'fenetre', x: 1, y: 1, l: 1, h: 1.2 })}>Ajouter une ouverture</button>}
  </section>;
}
