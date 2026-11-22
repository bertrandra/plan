// Les champs de l'inspecteur, rendus d'apres leurs descripteurs (ui/champs/) : un composant par type.
//
// L'inspecteur (Z5) les range en sections ; le tiroir des resultats (Z6) en montre les prix d'un
// ouvrage, un dialogue (Z8) ceux de la declaration prealable, les reglages de la Vue 3D ceux du
// voisinage. Les memes descripteurs, le meme rendu, la meme ecriture (le service de l'inspecteur) :
// un champ ne se reecrit pas selon l'endroit ou il se montre.
//
// Tactile : commandes de 32 px au moins sur bureau. Sur telephone et tablette (spec-ihm-mobile §7.1),
// le meme descripteur prend une forme tactile : un nombre devient un pas a pas (− et + de 44 px, la
// valeur reste saisissable), une case un interrupteur, un choix court une commande segmentee.

import { createContext, useContext, useEffect, useId, useReducer, useRef, useState } from 'react';
import { champActif } from '../../app/administration/ecritures.js';
import { champsVisibles, champVisible, groupesDeChamps } from '../../ui/champs/types.js';
import { aLaBorne, horsBornes, messageRefus, phraseBornes, valeurApresPas } from '../../ui/champs/bornes.js';
import type { Champ, ChampBouton, ChampNombre, ChampTexture, ContexteChamps } from '../../ui/champs/types.js';
import type { Inspecteur as ServiceInspecteur } from '../../app/inspecteur.js';
import { CarteToit } from './CarteToit.js';
import { Icone } from '../icones.js';
import { estOuvrage, CHEMIN } from '../../model/ouvrages/index.js';

/** Les commandes prennent leur forme tactile sur telephone et tablette. */
export const Tactile = createContext(false);

/**
 * Ce que les champs demandent pour ecrire : le service de l'inspecteur (app/inspecteur.ts), qui porte
 * l'historique, la lecture seule et les effets. Le tiroir, un dialogue ou les reglages 3D le passent
 * tel quel : un champ ecrit de la meme facon ou qu'il se montre.
 */
export type ServiceChamps = Pick<ServiceInspecteur, 'appliquer' | 'executer'>;

interface PropsChamp<T extends Champ = Champ> { champ: T; c: ContexteChamps; inspecteur: ServiceChamps; inline?: boolean }

const formater = (v: number, decimales: number | undefined) => Number.isFinite(v) ? (decimales === undefined ? String(v) : v.toFixed(decimales)) : '';

/** Ecrit les decimales a la francaise, pour l'affichage seulement (« 35.01 m² » → « 35,01 m² »). */
export const aLaFrancaise = (texte: string) => texte.replace(/(\d)\.(\d)/g, '$1,$2');
/** Lit une saisie a la francaise : la virgule vaut le point. */
const lireNombre = (texte: string) => parseFloat(texte.replace(',', '.'));
/** Au-dela, le libelle d'une option ne tient plus a cote de celui du champ. */
const OPTION_LONGUE = 26;
/** Le delai avant qu'un appui maintenu sur − ou + se repete, puis la cadence. */
const REPETITION_MS = 400, CADENCE_MS = 90;

/** Un nombre : brouillon local pendant la saisie, ecrit a la validation ; refuse, il revient a ce qu'il lit et dit pourquoi. */
function Nombre({ champ, c, inspecteur }: PropsChamp<ChampNombre>) {
  const tactile = useContext(Tactile);
  const [brouillon, setBrouillon] = useState<string | null>(null);
  // Le refus appartient a l'objet sur lequel il a ete prononce : le composant sert au suivant, le message non.
  const [refus, setRefus] = useState<{ objet: string; texte: string } | null>(null);
  const minuteur = useRef<number | null>(null);
  const idRefus = useId();
  const lu = champ.lire(c);
  const valeur = formater(lu, champ.decimales);
  const actif = champActif(champ, c);
  const message = refus && refus.objet === c.obj.key ? refus.texte : null;
  const refuser = (v: number) => setRefus({ objet: c.obj.key, texte: messageRefus(champ, v) });
  /**
   * Ecrit `v`, ou dit pourquoi non (audit de l'inspecteur, lot A3). Une saisie hors des bornes declarees n'est pas ecrite ; une
   * valeur que le champ refuse (`ecrire` rend `false`) laisse sa raison sous lui. Le refus se lit dans l'ecriture elle-meme : la
   * lecture seule ou une retouche en attente d'accord rendent aussi `false`, sans que la valeur soit en cause.
   */
  const ecrire = (v: number, descripteur: ChampNombre = champ): void => {
    if (horsBornes(champ, v)) { refuser(v); return; }
    setRefus(null);
    inspecteur.appliquer(descripteur, c, () => { const r = champ.ecrire(c, v); if (r === false) refuser(v); return r; });
  };
  const valider = () => {
    if (brouillon === null) return;
    const v = lireNombre(brouillon);
    setBrouillon(null);
    if (isNaN(v) || brouillon === valeur || brouillon === aLaFrancaise(valeur)) return;
    ecrire(v);
  };
  const saisir = (texte: string) => { setBrouillon(texte); if (message) setRefus(null); };
  const arreter = () => { if (minuteur.current !== null) { window.clearTimeout(minuteur.current); minuteur.current = null; } };
  // Un appui maintenu ne survit pas au champ : sans cela, le minuteur ecrirait encore apres son depart.
  useEffect(() => arreter, []);
  /**
   * Un pas vers le haut ou le bas, jusqu'a la borne. Le premier pas d'un appui porte l'historique du champ ; les
   * repetitions d'un appui maintenu n'en ajoutent pas : un appui, un seul instantané d'annulation.
   */
  function pas(sens: 1 | -1, premier: boolean): void {
    const v = valeurApresPas(champ, champ.lire(c), sens);
    // A la borne, le bouton se grise et ne recoit plus la fin de l'appui : la repetition s'arrete ici.
    if (v === null) { arreter(); return; }
    setBrouillon(null);
    ecrire(v, premier ? champ : { ...champ, historique: false });
  }
  const touches = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Entree quitte le champ, et c'est la sortie qui valide : valider ici puis a la sortie ecrivait
    // deux fois, avec deux instantanes d'annulation — un Ctrl+Z semblait alors ne rien faire.
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    if (e.key === 'Escape') { setBrouillon(null); setRefus(null); e.preventDefault(); }
    if (tactile && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); pas(e.key === 'ArrowUp' ? 1 : -1, true); }
  };
  const sousLeChamp = message && <span className="refusChamp" id={idRefus} role="status">{tactile ? aLaFrancaise(message) : message}</span>;
  const decrit = message ? { 'aria-invalid': true, 'aria-describedby': idRefus } : {};
  if (!tactile) {
    return (
      <>
        <span className="champNombre">
          <input type="number" value={brouillon ?? valeur} step={champ.pas} min={champ.min} max={champ.max} disabled={!actif} title={champ.aide}
            aria-label={champ.libelle} {...decrit} onChange={(e) => saisir(e.target.value)} onBlur={valider} onKeyDown={touches} />
          {champ.unite && <span className="unite">{champ.unite}</span>}
        </span>
        {sousLeChamp}
      </>
    );
  }

  const presser = (sens: 1 | -1) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    pas(sens, true);
    const repeter = () => { pas(sens, false); if (minuteur.current !== null) minuteur.current = window.setTimeout(repeter, CADENCE_MS); };
    minuteur.current = window.setTimeout(repeter, REPETITION_MS);
  };
  const bouton = (sens: 1 | -1) => {
    // A la borne, le bouton se grise et le dit : le pas s'arretait deja, sans rien montrer.
    const borne = aLaBorne(champ, lu, sens);
    return (
      <button type="button" className="pasBouton" disabled={!actif || borne} aria-label={(sens > 0 ? 'Augmenter ' : 'Diminuer ') + champ.libelle}
        title={borne ? phraseBornes(champ) : undefined}
        onPointerDown={presser(sens)} onPointerUp={arreter} onPointerLeave={arreter} onPointerCancel={arreter}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pas(sens, true); } }}>
        <Icone nom={sens > 0 ? 'plus' : 'moins'} taille={18} />
      </button>
    );
  };
  return (
    <>
      <span className="pas" role="group" aria-label={champ.libelle}>
        {bouton(-1)}
        {/* Un libelle : toucher la case ou l'unite pose le curseur dans le chiffre (lot A4). */}
        <label className="pasValeur">
          <input type="text" inputMode="decimal" role="spinbutton" value={brouillon ?? aLaFrancaise(valeur)} disabled={!actif} title={champ.aide}
            aria-label={champ.libelle} aria-valuenow={lu} aria-valuemin={champ.min} aria-valuemax={champ.max} {...decrit}
            onChange={(e) => saisir(e.target.value)} onBlur={valider} onKeyDown={touches} onFocus={(e) => e.currentTarget.select()} />
          {champ.unite && <span className="unite">{champ.unite}</span>}
        </label>
        {bouton(1)}
      </span>
      {sousLeChamp}
    </>
  );
}

function Texture({ champ, c, inspecteur }: PropsChamp<ChampTexture>) {
  const tex = champ.lire(c);
  const actif = champActif(champ, c);
  const choisir = () => c.choisirTexture(champ.libelle, (choix, tous) => {
    inspecteur.appliquer(champ, c, () => { if (tous && champ.appliquerATous) champ.appliquerATous.ecrire(c, choix); else champ.ecrire(c, choix); });
  }, champ.appliquerATous && estOuvrage(c.obj, CHEMIN) ? { checkboxLabel: champ.appliquerATous.libelle } : undefined);
  return (
    <span className="champTexture">
      {tex && <img src={tex.vignette || ''} alt="" className="vignette" />}
      <span className="nomTexture">{tex ? tex.nom : 'Aucune (couleur unie)'}</span>
      <button type="button" className="secondary small" disabled={!actif} onClick={choisir}>{tex ? 'Changer…' : 'Choisir…'}</button>
      {tex && <button type="button" className="secondary small" disabled={!actif} title="Retirer cette texture" onClick={() => inspecteur.appliquer(champ, c, () => champ.ecrire(c, null))}>×</button>}
    </span>
  );
}

function Bouton({ champ, c, inspecteur }: PropsChamp<ChampBouton>) {
  const actif = champActif(champ, c);
  return (
    <span className="champBouton">
      <button type="button" className="secondary small" disabled={!actif} title={champ.aide} onClick={() => inspecteur.executer(champ, c)}>
        {champ.texte ? champ.texte(c) : champ.libelle}
      </button>
      {champ.explication && <span className="explication">{champ.explication}</span>}
    </span>
  );
}



/** La commande d'un champ, selon son type. */
function Commande({ champ, c, inspecteur, inline }: PropsChamp) {
  const tactile = useContext(Tactile);
  const actif = champActif(champ, c);
  const ecrire = <V,>(fn: (v: V) => void | boolean) => (v: V) => { inspecteur.appliquer(champ, c, () => fn(v)); };
  switch (champ.type) {
    case 'texte':
      return <input type="text" value={champ.lire(c)} placeholder={champ.placeholder} disabled={!actif} title={champ.aide} aria-label={champ.libelle}
        onChange={(e) => ecrire<string>((v) => champ.ecrire(c, v))(e.target.value)} />;
    case 'nombre':
      return <Nombre champ={champ} c={c} inspecteur={inspecteur} />;
    case 'case':
      if (tactile) {
        return <label className={inline ? 'interrupteur avecTexte' : 'interrupteur'}>
          <input type="checkbox" role="switch" checked={champ.lire(c)} disabled={!actif} title={champ.aide} aria-label={champ.libelle}
            onChange={(e) => ecrire<boolean>((v) => champ.ecrire(c, v))(e.target.checked)} />
          <span className="piste" aria-hidden="true" />
          {/* Dans une ligne (un coin), aucun libelle ne precede la case : elle dit elle-meme ce qu'elle regle (lot A5). */}
          {inline && <span className="texteCase">{champ.libelle}</span>}
        </label>;
      }
      if (inline) {
        return <label className="caseEnLigne" title={champ.aide}>
          <input type="checkbox" checked={champ.lire(c)} disabled={!actif} aria-label={champ.libelle}
            onChange={(e) => ecrire<boolean>((v) => champ.ecrire(c, v))(e.target.checked)} />
          <span className="texteCase">{champ.libelle}</span>
        </label>;
      }
      return <input type="checkbox" checked={champ.lire(c)} disabled={!actif} title={champ.aide} aria-label={champ.libelle}
        onChange={(e) => ecrire<boolean>((v) => champ.ecrire(c, v))(e.target.checked)} />;
    case 'choix': {
      const options = champ.options(c);
      // Trois options courtes au plus : une commande segmentee se lit et se touche d'un coup.
      if (tactile && options.length <= 3 && options.every(o => o.libelle.length <= 22)) {
        const courant = champ.lire(c);
        return <span className="segmente" role="radiogroup" aria-label={champ.libelle}>
          {options.map(o => (
            <button key={o.valeur} type="button" role="radio" aria-checked={o.valeur === courant} disabled={!actif}
              className={o.valeur === courant ? 'actif' : ''} onClick={() => { if (o.valeur !== courant) ecrire<string>((v) => champ.ecrire(c, v))(o.valeur); }}>
              {o.libelle}
            </button>
          ))}
        </span>;
      }
      // Des options longues (une lame du commerce) : la liste passe sous son libelle, sur toute la largeur, pour se lire en entier.
      return <select className={options.some(o => o.libelle.length > OPTION_LONGUE) ? 'long' : undefined} value={champ.lire(c)} disabled={!actif} title={champ.aide} aria-label={champ.libelle} onChange={(e) => ecrire<string>((v) => champ.ecrire(c, v))(e.target.value)}>
        {optionsParGroupe(options).map((g) => g.titre === null
          ? g.options.map(o => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)
          : <optgroup key={g.titre} label={g.titre}>{g.options.map(o => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}</optgroup>)}
      </select>;
    }
    case 'couleur':
      return <input type="color" value={champ.lire(c)} disabled={!actif} title={champ.aide} aria-label={champ.libelle} onChange={(e) => ecrire<string>((v) => champ.ecrire(c, v))(e.target.value)} />;
    case 'date':
      return <input type="date" value={champ.lire(c)} disabled={!actif} title={champ.aide} aria-label={champ.libelle} onChange={(e) => ecrire<string>((v) => champ.ecrire(c, v))(e.target.value)} />;
    case 'curseur':
      return <span className="champCurseur">
        <input type="range" min={champ.min} max={champ.max} step={champ.pas} value={champ.lire(c)} disabled={!actif} aria-label={champ.libelle}
          onChange={(e) => ecrire<number>((v) => champ.ecrire(c, v))(parseInt(e.target.value, 10))} />
        <span className="valeurCurseur">{champ.format(champ.lire(c))}</span>
      </span>;
    case 'lecture':
      // Les decimales a la francaise dans toutes les classes (lot 4) : la valeur reste celle du calcul, seul l'affichage change.
      return <span className="lecture">{aLaFrancaise(champ.valeur(c))}</span>;
    case 'texture':
      return <Texture champ={champ} c={c} inspecteur={inspecteur} />;
    case 'bouton':
      return <Bouton champ={champ} c={c} inspecteur={inspecteur} />;
    case 'alerte':
      return <div className="hint alerte">{champ.texte(c)}</div>;
    case 'carte': {
      const carte = champ.carte(c);
      return carte ? <CarteToit carte={carte} /> : null;
    }
    case 'ligne':
      return <span className="champsEnLigne">
        {champsVisibles({ id: champ.cle, titre: '', champs: champ.champs }, c).map(sous => <Commande key={sous.cle} champ={sous} c={c} inspecteur={inspecteur} inline />)}
      </span>;
  }
}

export function LigneChamp({ champ, c, inspecteur }: PropsChamp) {
  const tactile = useContext(Tactile);
  // Au doigt, l'infobulle ne s'affiche pas : l'aide d'un champ grise s'ecrit sous lui (§8).
  const grise = !!champ.actif && !champ.actif(c);
  const brute = [champ.note ? champ.note(c) : '', tactile && grise && champ.aide ? champ.aide : ''].filter(Boolean).join(' — ');
  const note = tactile ? aLaFrancaise(brute) : brute;
  const pleineLargeur = champ.type === 'alerte' || champ.type === 'carte' || (champ.type === 'bouton' && !champ.libelle);
  const classes = ['champ', 'champ-' + champ.type, champ.surbrillance && champ.surbrillance(c) ? 'highlightRow' : ''].filter(Boolean).join(' ');
  if (pleineLargeur) return <div className={classes + ' pleineLargeur'} data-cle={champ.cle}><Commande champ={champ} c={c} inspecteur={inspecteur} /></div>;
  return (
    <div className={classes} data-cle={champ.cle}>
      <label className="libelle" title={champ.aide}>{champ.libelle}</label>
      <div className="commande">
        <Commande champ={champ} c={c} inspecteur={inspecteur} />
        {note && <div className="note">{note}</div>}
      </div>
    </div>
  );
}

/** Les options d'une liste deroulante rangees sous leurs titres (`groupe`) : des options voisines du meme groupe vont ensemble. */
function optionsParGroupe<T extends { groupe?: string }>(options: readonly T[]): { titre: string | null; options: T[] }[] {
  const out: { titre: string | null; options: T[] }[] = [];
  for (const o of options) {
    const titre = o.groupe ?? null;
    const dernier = out[out.length - 1];
    if (dernier && dernier.titre === titre) dernier.options.push(o);
    else out.push({ titre, options: [o] });
  }
  return out;
}

/**
 * Les champs d'une liste, ceux qui se montrent : les ouverts a la suite, ceux d'un meme pli dans un
 * `<details>` ferme a l'ouverture. Le pli n'est pose qu'au montage : celui que l'utilisateur ouvre le
 * reste d'un rendu a l'autre.
 */
export function ListeChamps({ champs, c, inspecteur }: { champs: readonly Champ[]; c: ContexteChamps; inspecteur: ServiceChamps }) {
  const visibles = champs.filter(ch => champVisible(ch, c));
  return <>{groupesDeChamps(visibles).map((g, k) => g.repli === null
    ? g.champs.map(ch => <LigneChamp key={ch.cle} champ={ch} c={c} inspecteur={inspecteur} />)
    : (
      <details key={'pli-' + k + '-' + g.repli} className="plichamps" data-pli={g.repli}>
        <summary>{g.repli}</summary>
        <div className="champs">{g.champs.map(ch => <LigneChamp key={ch.cle} champ={ch} c={c} inspecteur={inspecteur} />)}</div>
      </details>
    ))}</>;
}

/**
 * Le service de l'inspecteur pour une zone qui ne suit pas chaque rendu du plan (un dialogue, les
 * reglages 3D) : apres chaque ecriture ou chaque bouton, la zone se redessine elle-meme, sans attendre
 * un signal que l'effet du champ n'envoie pas toujours (un reglage 3D ne redessine que la scene).
 */
export function useServiceLocal(inspecteur: ServiceChamps): ServiceChamps {
  const [, redessiner] = useReducer((n: number) => n + 1, 0);
  return {
    appliquer: (champ, c, ecrire) => { const ok = inspecteur.appliquer(champ, c, ecrire); redessiner(); return ok; },
    executer: (champ, c) => { inspecteur.executer(champ, c); redessiner(); }
  };
}
