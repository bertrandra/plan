// Z5, l'inspecteur (spec-ihm-zones §4.5) : les proprietes de ce qui est selectionne.
//
// Etape 4 de la reconstruction : il remplace l'onglet Édition du panneau — le panneau d'attributs
// et le configurateur de terrasse. Il ne connait aucun champ par son nom : il recoit des
// descripteurs (ui/champs/) et les rend, un composant par type de champ, dans des sections
// repliables. Ecrire, c'est demander a l'inspecteur (app/inspecteur.ts), qui sait ce qui doit
// suivre. Les champs texte et nombre gardent leur focus d'un rendu a l'autre parce que React garde
// leurs noeuds : c'est ce qui, en DOM reconstruit, obligeait a des mises a jour ciblees partout.
//
// Tactile : commandes de 32 px au moins sur bureau. Sur telephone et tablette (spec-ihm-mobile §7.1),
// le meme descripteur prend une forme tactile : un nombre devient un pas a pas (− et + de 44 px, la
// valeur reste saisissable), une case un interrupteur, un choix court une commande segmentee. La
// presence d'un champ ne depend jamais de la classe ; sa forme, si (tests/unit/zones/inspecteur-champs).
// Sur telephone, l'inspecteur est la feuille Proprietes ; sur tablette, un panneau flottant.

import { createContext, useContext, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { champsVisibles } from '../ui/champs/types.js';
import type { Champ, ChampBouton, ChampNombre, ChampTexture, ContexteChamps, Section } from '../ui/champs/types.js';
import type { Magasin } from '../app/magasin.js';
import type { RegistreCommandes } from '../app/commandes.js';
import type { Inspecteur as ServiceInspecteur } from '../app/inspecteur.js';
import type { Tiroir } from '../app/tiroir.js';
import { EnteteFeuille } from './composants/Feuille.js';
import { Optimisation } from './resultats/Optimisation.js';
import { Icone } from './icones.js';
import { resumerChiffrage, euros } from '../ui/chiffrage.js';

/** Les commandes prennent leur forme tactile sur telephone et tablette. */
const Tactile = createContext(false);

export interface PropsInspecteur { magasin: Magasin; commandes: RegistreCommandes; inspecteur: ServiceInspecteur; tiroir?: Tiroir }

interface PropsChamp<T extends Champ = Champ> { champ: T; c: ContexteChamps; inspecteur: ServiceInspecteur; inline?: boolean }

const formater = (v: number, decimales: number | undefined) => Number.isFinite(v) ? (decimales === undefined ? String(v) : v.toFixed(decimales)) : '';

/** Ecrit les decimales a la francaise, pour l'affichage seulement (« 35.01 m² » → « 35,01 m² »). */
export const aLaFrancaise = (texte: string) => texte.replace(/(\d)\.(\d)/g, '$1,$2');
/** Lit une saisie a la francaise : la virgule vaut le point. */
const lireNombre = (texte: string) => parseFloat(texte.replace(',', '.'));
/** Le delai avant qu'un appui maintenu sur − ou + se repete, puis la cadence. */
const REPETITION_MS = 400, CADENCE_MS = 90;

/** Un nombre : brouillon local pendant la saisie, ecrit a la validation, relu si refuse. */
function Nombre({ champ, c, inspecteur }: PropsChamp<ChampNombre>) {
  const tactile = useContext(Tactile);
  const [brouillon, setBrouillon] = useState<string | null>(null);
  const minuteur = useRef<number | null>(null);
  const valeur = formater(champ.lire(c), champ.decimales);
  const actif = !champ.actif || champ.actif(c);
  const valider = () => {
    if (brouillon === null) return;
    const v = lireNombre(brouillon);
    setBrouillon(null);
    if (isNaN(v) || brouillon === valeur || brouillon === aLaFrancaise(valeur)) return;
    inspecteur.appliquer(champ, c, () => champ.ecrire(c, v));
  };
  const touches = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Entree quitte le champ, et c'est la sortie qui valide : valider ici puis a la sortie ecrivait
    // deux fois, avec deux instantanes d'annulation — un Ctrl+Z semblait alors ne rien faire.
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    if (e.key === 'Escape') { setBrouillon(null); e.preventDefault(); }
    if (tactile && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); pas(e.key === 'ArrowUp' ? 1 : -1, true); }
  };
  if (!tactile) {
    return (
      <span className="champNombre">
        <input type="number" value={brouillon ?? valeur} step={champ.pas} min={champ.min} max={champ.max} disabled={!actif} title={champ.aide}
          aria-label={champ.libelle} onChange={(e) => setBrouillon(e.target.value)} onBlur={valider} onKeyDown={touches} />
        {champ.unite && <span className="unite">{champ.unite}</span>}
      </span>
    );
  }

  /**
   * Un pas vers le haut ou le bas. Le premier pas d'un appui porte l'historique du champ ; les
   * repetitions d'un appui maintenu n'en ajoutent pas : un appui, un seul instantané d'annulation.
   */
  function pas(sens: 1 | -1, premier: boolean): void {
    const increment = champ.pas ?? (champ.decimales ? Math.pow(10, -champ.decimales) : 1);
    let v = champ.lire(c) + sens * increment;
    if (champ.min !== undefined) v = Math.max(champ.min, v);
    if (champ.max !== undefined) v = Math.min(champ.max, v);
    const d = champ.decimales ?? (String(increment).split('.')[1]?.length ?? 0);
    v = Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
    const descripteur = premier ? champ : { ...champ, historique: false };
    inspecteur.appliquer(descripteur, c, () => champ.ecrire(c, v));
  }
  const arreter = () => { if (minuteur.current !== null) { window.clearTimeout(minuteur.current); minuteur.current = null; } };
  const presser = (sens: 1 | -1) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    pas(sens, true);
    const repeter = () => { pas(sens, false); minuteur.current = window.setTimeout(repeter, CADENCE_MS); };
    minuteur.current = window.setTimeout(repeter, REPETITION_MS);
  };
  const bouton = (sens: 1 | -1) => (
    <button type="button" className="pasBouton" disabled={!actif} aria-label={(sens > 0 ? 'Augmenter ' : 'Diminuer ') + champ.libelle}
      onPointerDown={presser(sens)} onPointerUp={arreter} onPointerLeave={arreter} onPointerCancel={arreter}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pas(sens, true); } }}>
      <Icone nom={sens > 0 ? 'plus' : 'moins'} taille={18} />
    </button>
  );
  return (
    <span className="pas" role="group" aria-label={champ.libelle}>
      {bouton(-1)}
      <span className="pasValeur">
        <input type="text" inputMode="decimal" role="spinbutton" value={brouillon ?? aLaFrancaise(valeur)} disabled={!actif} title={champ.aide}
          aria-label={champ.libelle} aria-valuenow={champ.lire(c)} aria-valuemin={champ.min} aria-valuemax={champ.max}
          onChange={(e) => setBrouillon(e.target.value)} onBlur={valider} onKeyDown={touches} onFocus={(e) => e.currentTarget.select()} />
        {champ.unite && <span className="unite">{champ.unite}</span>}
      </span>
      {bouton(1)}
    </span>
  );
}

function Texture({ champ, c, inspecteur }: PropsChamp<ChampTexture>) {
  const tex = champ.lire(c);
  const actif = !champ.actif || champ.actif(c);
  const choisir = () => c.choisirTexture(champ.libelle, (choix, tous) => {
    inspecteur.appliquer(champ, c, () => { if (tous && champ.appliquerATous) champ.appliquerATous.ecrire(c, choix); else champ.ecrire(c, choix); });
  }, champ.appliquerATous && c.obj.fonction === 'chemin' ? { checkboxLabel: champ.appliquerATous.libelle } : undefined);
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
  const actif = !champ.actif || champ.actif(c);
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
function Commande({ champ, c, inspecteur }: PropsChamp) {
  const tactile = useContext(Tactile);
  const actif = !champ.actif || champ.actif(c);
  const ecrire = <V,>(fn: (v: V) => void | boolean) => (v: V) => { inspecteur.appliquer(champ, c, () => fn(v)); };
  switch (champ.type) {
    case 'texte':
      return <input type="text" value={champ.lire(c)} placeholder={champ.placeholder} disabled={!actif} title={champ.aide} aria-label={champ.libelle}
        onChange={(e) => ecrire<string>((v) => champ.ecrire(c, v))(e.target.value)} />;
    case 'nombre':
      return <Nombre champ={champ} c={c} inspecteur={inspecteur} />;
    case 'case':
      if (tactile) {
        return <label className="interrupteur">
          <input type="checkbox" role="switch" checked={champ.lire(c)} disabled={!actif} title={champ.aide} aria-label={champ.libelle}
            onChange={(e) => ecrire<boolean>((v) => champ.ecrire(c, v))(e.target.checked)} />
          <span className="piste" aria-hidden="true" />
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
      return <select value={champ.lire(c)} disabled={!actif} title={champ.aide} aria-label={champ.libelle} onChange={(e) => ecrire<string>((v) => champ.ecrire(c, v))(e.target.value)}>
        {options.map(o => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
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
      return <span className="lecture">{tactile ? aLaFrancaise(champ.valeur(c)) : champ.valeur(c)}</span>;
    case 'texture':
      return <Texture champ={champ} c={c} inspecteur={inspecteur} />;
    case 'bouton':
      return <Bouton champ={champ} c={c} inspecteur={inspecteur} />;
    case 'alerte':
      return <div className="hint alerte">{champ.texte(c)}</div>;
    case 'optimisation':
      return inspecteur.resultats ? <Optimisation obj={c.obj} resultats={inspecteur.resultats} /> : null;
    case 'ligne':
      return <span className="champsEnLigne">
        {champsVisibles({ id: champ.cle, titre: '', champs: champ.champs }, c).map(sous => <Commande key={sous.cle} champ={sous} c={c} inspecteur={inspecteur} inline />)}
      </span>;
  }
}

function LigneChamp({ champ, c, inspecteur }: PropsChamp) {
  const tactile = useContext(Tactile);
  // Au doigt, l'infobulle ne s'affiche pas : l'aide d'un champ grise s'ecrit sous lui (§8).
  const grise = !!champ.actif && !champ.actif(c);
  const brute = [champ.note ? champ.note(c) : '', tactile && grise && champ.aide ? champ.aide : ''].filter(Boolean).join(' — ');
  const note = tactile ? aLaFrancaise(brute) : brute;
  const pleineLargeur = champ.type === 'alerte' || champ.type === 'optimisation' || (champ.type === 'bouton' && !champ.libelle);
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

function SectionVue({ section, c, inspecteur }: { section: Section; c: ContexteChamps; inspecteur: ServiceInspecteur }) {
  const champs = champsVisibles(section, c);
  if (!champs.length) return null;
  // `open` n'est pose qu'au montage : React ne le reimpose pas a chaque rendu, le pli de
  // l'utilisateur survit donc aux rendus du plan tant que la section reste montee.
  return (
    <details className="inspecteurSection" open={!section.repliee} data-section={section.id} data-famille={familleDe(section.id)}>
      <summary>{section.titre}</summary>
      {section.explication && <p className="hint">{section.explication}</p>}
      <div className="champs">
        {champs.map(ch => <LigneChamp key={ch.cle} champ={ch} c={c} inspecteur={inspecteur} />)}
      </div>
    </details>
  );
}

/** Un clic sur le titre replie toutes les sections si l'une au moins est ouverte, et les deplie sinon. */
function basculerSections(e: React.SyntheticEvent<HTMLElement>): void {
  const sections = [...(e.currentTarget.closest('.inspecteurPanneau')?.querySelectorAll<HTMLDetailsElement>('details.inspecteurSection') ?? [])];
  const ouvrir = !sections.some(s => s.open);
  sections.forEach(s => { s.open = ouvrir; });
}

/** La poignee de repli, a droite de l'en-tete ; repliee, la zone ne montre qu'elle. */
function Pli({ ouvert, inspecteur }: { ouvert: boolean; inspecteur: ServiceInspecteur }) {
  return (
    <button type="button" data-controle="inspecteur.replier" className="inspecteurPli" title={ouvert ? 'Replier l\'inspecteur' : 'Déplier l\'inspecteur'} aria-expanded={ouvert}
      onClick={(e) => { e.stopPropagation(); inspecteur.basculerOuverture(); }}>
      {ouvert ? '›' : '‹'}
    </button>
  );
}

/** Le resume du chiffrage, en pied de l'inspecteur d'une terrasse : la boucle reglage → prix (§6.5). */
function BandeauChiffrage({ c, ouvrir }: { c: ContexteChamps; ouvrir: () => void }) {
  const r = resumerChiffrage(c.obj, c.objets);
  if (!r) return null;
  // La fourchette estimee, comme sous la table du BOM : la somme des prix reels ne couvre que les
  // lignes ou un prix existe, et la montrer seule ferait croire a un total.
  const prix = euros(r.bas) + ' – ' + euros(r.haut);
  return (
    <button type="button" className="bandeauChiffrage" data-controle="inspecteur.chiffrage" onClick={ouvrir}>
      <span className="bandeauChiffrageTextes">
        <span className="bandeauChiffrageTitre">Chiffrage recalculé</span>
        <span className="bandeauChiffrageValeurs">{r.appuis} {r.natureAppuis} · {Math.round(r.lamesMl)} ml de lames · {prix}</span>
      </span>
      <Icone nom="chevronDroite" taille={20} />
    </button>
  );
}

/**
 * Les trois familles de sections, en commande segmentee (maquette Inspecteur, 2.1.1) : l'objet, sa
 * geometrie, sa construction. Au doigt, une seule famille se montre a la fois. Les sections des
 * autres restent MONTEES (masquees par la feuille de style) : un champ ne disparait jamais selon la
 * classe, et un brouillon en cours survit au changement de famille.
 */
export type Famille = 'objet' | 'geometrie' | 'construction';
const FAMILLES: { id: Famille; libelle: string }[] = [
  { id: 'objet', libelle: 'Objet' },
  { id: 'geometrie', libelle: 'Géométrie' },
  { id: 'construction', libelle: 'Construction' }
];
const SECTIONS_GEOMETRIE = new Set(['cotes', 'coins', 'alignement']);
const SECTIONS_CONSTRUCTION = new Set(['fondation', 'structure', 'lames', 'finitions', 'optimisation', 'parametres']);
export function familleDe(idSection: string): Famille {
  if (SECTIONS_GEOMETRIE.has(idSection)) return 'geometrie';
  if (SECTIONS_CONSTRUCTION.has(idSection)) return 'construction';
  return 'objet';
}

function Familles({ presentes, active, choisir }: { presentes: Famille[]; active: Famille; choisir: (f: Famille) => void }) {
  if (presentes.length < 2) return null;
  return (
    <div className="famillesSections segmente" role="tablist" aria-label="Sections">
      {FAMILLES.filter(f => presentes.includes(f.id)).map(f => (
        <button key={f.id} type="button" role="tab" data-famille={f.id} data-controle={'inspecteur.famille.' + f.id} aria-selected={f.id === active} className={f.id === active ? 'actif' : ''}
          onClick={(e) => {
            choisir(f.id);
            // Une famille dont toutes les sections sont repliees (Geometrie) s'ouvrirait sur trois
            // titres : on deplie la premiere, le reste garde le pli de l'utilisateur.
            const sections = [...(e.currentTarget.closest('.inspecteurPanneau')?.querySelectorAll<HTMLDetailsElement>('details.inspecteurSection[data-famille="' + f.id + '"]') ?? [])];
            const premiere = sections[0];
            if (premiere && !sections.some(d => d.open)) premiere.open = true;
          }}>{f.libelle}</button>
      ))}
    </div>
  );
}

export function Inspecteur({ magasin, commandes, inspecteur, tiroir }: PropsInspecteur) {
  useStore(magasin.store, (s) => s.version);
  const ouvertStore = useStore(magasin.store, (s) => s.inspecteurOuvert);
  const classe = useStore(magasin.store, (s) => s.classe);
  const compact = classe === 'compact';
  const tactile = classe !== 'large';
  const [famille, choisirFamille] = useState<Famille>('objet');
  // Sur telephone, l'inspecteur est une feuille : il n'a pas de repli, la feuille se ferme.
  const ouvert = compact || ouvertStore;
  const obj = inspecteur.objet();
  const executer = (id: string) => () => { commandes.executer(id); };
  const ouvrirChiffrage = () => {
    if (!tiroir) return;
    tiroir.activer('bom');
    if (compact) magasin.definirFeuille('resultats');
    else tiroir.definirHauteur('mi');
  };
  if (!ouvert) {
    return (
      <aside className="inspecteurPanneau replie" aria-label="Inspecteur">
        <div className="inspecteurEntete"><Pli ouvert={false} inspecteur={inspecteur} /></div>
      </aside>
    );
  }
  if (!obj) {
    return (
      <Tactile.Provider value={tactile}>
        <aside className="inspecteurPanneau" aria-label="Inspecteur">
          {compact
            ? <EnteteFeuille magasin={magasin} titre="Propriétés" sousTitre="Aucune sélection" />
            : <div className="inspecteurEntete"><span className="inspecteurTitre">Aucune sélection</span><Pli ouvert inspecteur={inspecteur} /></div>}
          <div className={compact ? 'corpsFeuille' : undefined}>
            <p className="hint" style={{ padding: '0 10px' }}>{compact ? 'Touchez un objet sur le plan, ou choisissez-le dans Objets, pour l\'éditer.' : 'Clique un objet sur le plan ou dans l\'explorateur pour l\'éditer.'}</p>
            <div className="inspecteurPied">
              <button data-commande="projet.reinitialiser" type="button" className="secondary small" onClick={executer('projet.reinitialiser')}>Réinitialiser tout</button>
            </div>
          </div>
        </aside>
      </Tactile.Provider>
    );
  }
  const c = inspecteur.contexte(obj);
  const sections = inspecteur.sections(c);
  const pied = (
    <div className="inspecteurPied">
      <button data-commande="objet.positionInitiale" type="button" className="secondary small" disabled={!commandes.obtenir('objet.positionInitiale')?.actif?.()} onClick={executer('objet.positionInitiale')}>Réinitialiser la position</button>
      <button data-commande="projet.reinitialiser" type="button" className="secondary small" onClick={executer('projet.reinitialiser')}>Réinitialiser tout</button>
      <p className="hint">{tactile
        ? 'Glissez un point pour l\'ajuster, un côté pour déplacer ses deux extrémités, l\'intérieur d\'une forme pour la déplacer. Double toucher sur un côté = ajouter un point ; sur un coin = figer ou dégeler. Pincer = zoom. Trois doigts = déplacer la vue. Rien ne peut sortir de la parcelle (sauf la parcelle elle-même).'
        : 'Glisse un point pour l\'ajuster, un côté pour déplacer ses deux extrémités, l\'intérieur d\'une forme pour la déplacer en bloc (un clic simple sans glisser désélectionne). Double-clic sur un côté = ajouter un point. Double-clic sur un coin = figer/dégeler. Molette / pincement 2 doigts = zoom. Glissement 3 doigts = déplacer la vue. Rien ne peut sortir de la parcelle (sauf la parcelle elle-même).'}</p>
    </div>
  );
  const corps = sections.map(s => <SectionVue key={s.id} section={s} c={c} inspecteur={inspecteur} />);
  const presentes = FAMILLES.map(f => f.id).filter(f => sections.some(s => familleDe(s.id) === f && champsVisibles(s, c).length));
  // La famille choisie peut manquer a l'objet suivant (une terrasse, puis un arbre) : on revient a la premiere.
  const active = presentes.includes(famille) ? famille : (presentes[0] ?? 'objet');
  const filtre = tactile && presentes.length > 1 ? active : undefined;
  const chiffrage = tactile && tiroir ? <BandeauChiffrage c={c} ouvrir={ouvrirChiffrage} /> : null;

  // Un seul arbre pour les trois classes : tourner un telephone (compact → moyen) ne demonte aucun
  // champ, et un brouillon en cours survit (point 39 de la liste de fumee). Seuls l'entete et les
  // pastilles de saut changent.
  const entete = compact
    ? <EnteteFeuille magasin={magasin} titre={obj.name} sousTitre={aLaFrancaise(inspecteur.titre(c))}
        actions={<button type="button" className="boutonIcone" id="attrTitle" data-controle="inspecteur.replierSections" aria-label="Replier ou déplier toutes les sections" title="Replier ou déplier toutes les sections" onClick={basculerSections}><Icone nom="chevronBas" /></button>} />
    : <div className="inspecteurEntete">
        <span className="inspecteurTitre" id="attrTitle" data-controle="inspecteur.replierSections" role="button" tabIndex={0} title="Replier ou déplier toutes les sections"
          onClick={basculerSections} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); basculerSections(e); } }}>
          {tactile ? aLaFrancaise(inspecteur.titre(c)) : inspecteur.titre(c)}
        </span>
        <Pli ouvert inspecteur={inspecteur} />
      </div>;
  return (
    <Tactile.Provider value={tactile}>
      <aside className="inspecteurPanneau" aria-label={compact ? 'Propriétés' : 'Inspecteur'} data-famille-active={filtre}>
        {entete}
        {tactile ? <Familles presentes={presentes} active={active} choisir={choisirFamille} /> : null}
        <div className={compact ? 'corpsFeuille' : 'corpsInspecteur'}>{corps}{pied}</div>
        {chiffrage}
      </aside>
    </Tactile.Provider>
  );
}
