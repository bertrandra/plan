// Les actions d'une etape de la facade, telles que l'orchestrateur les rend (facade/releve/enchainement.ts, `EtapeCalculee.actions`) :
// chacune avec son type (Code, Claude, Manuel, Mesure), son etat, et l'avant et l'apres de ce qu'elle a fait (une image deja faite,
// des valeurs en clair). Le meme composant pour la calibration (tout) et l'audit (ce que l'etape montre, decision du proprietaire du
// 7 novembre 2026) : il ne calcule rien, il lit et dessine.
//
// Les elements lus par Claude portent la couleur de leur famille (FAMILLES_CLAUDE, jetons `--claude-*`), la meme a l'E8 et dans
// l'etape qui les montre, toujours nommee a cote : la couleur ne porte rien seule.

import { etapeFacade, LIBELLES_ETAT, FAMILLES_CLAUDE, type ActionEtape, type CleImageEtape, type ElementAction, type FamilleClaude, type TypeAction, type ValeurElement } from '../../model/etapeFacade.js';
import type { ReactNode } from 'react';

/** Le type d'une action en un mot, sur son badge. */
export const LIBELLES_TYPE_ACTION: Readonly<Record<TypeAction, string>> = { code: 'Code', claude: 'Claude', manuel: 'Manuel', mesure: 'Mesure' };

/** Le statut d'un element, tel que le moteur l'a decide, en mots. */
export const LIBELLES_STATUT: Readonly<Record<ElementAction['statut'], string>> = {
  retrouvee: 'retrouvée par la détection', 'devinee-confirmee': 'confirme une devinée', proposee: 'proposée, décochée', ecartee: 'écartée (hors du mur)',
  confirmee: 'confirmée par une boîte', absente: 'absente de la lecture', devinee: 'devinée par la structure',
  accord: 'd’accord', divergent: 'diverge', 'non-situe': 'non située', hauteur: 'autre hauteur (le LiDAR est gardé)', 'en-plus': 'en plus du plan', manquante: 'attendue, non vue',
  retenu: 'retenu par le diagnostic', ecarte: 'écarté par le moteur', lu: 'lu',
};

/** D'ou vient la valeur retenue : le calcul, Claude, la personne. */
export const LIBELLES_SOURCE = { calcul: 'Calcul', claude: 'Claude', manuel: 'Manuel' } as const;

/** Les valeurs les plus courantes, en mots ; une cle inconnue se montre telle quelle. */
const MOTS_VALEURS: Readonly<Record<string, string>> = {
  largeurM: 'largeur (m)', hauteurM: 'hauteur (m)', pointsDuGabarit: 'points du gabarit', rapport: 'rapport', pointes: 'pointes', photos: 'photos', illisibles: 'illisibles',
  exif: 'EXIF', fuites: 'points de fuite', appareil: 'appareil', suppose: 'supposé', parReperes: 'par repères', trouves: 'trouvés', predits: 'prédits', main: 'à la main', reperes: 'repères',
  redressees: 'redressées', fusion: 'fusion', assemblees: 'assemblées', coinsTrouves: 'coins trouvés', score: 'score', angleGauche: 'angle gauche', angleDroit: 'angle droit', egout: 'égout',
  ecartEgout: 'écart à l’égout', ecart: 'écart', vues: 'vues', boites: 'boîtes', retrouvees: 'retrouvées', seules: 'seules', points: 'points', masquee: 'part masquée', propositions: 'propositions',
  pxParM: 'px par m', trouvees: 'trouvées', devinees: 'devinées', devineesConfirmees: 'devinées confirmées', proposees: 'proposées', ecartees: 'écartées', versLesVoisins: 'vers les voisins',
  gardees: 'gardées', le: 'le', ouvertures: 'ouvertures', confiance: 'confiance', u: 'u', v: 'v', u0: 'u début', u1: 'u fin', v0: 'v bas', v1: 'v haut', x: 'x (m)', y: 'y (m)', l: 'l (m)', h: 'h (m)',
  x0: 'x0', x1: 'x1', y0: 'y0', y1: 'y1', type: 'type', bout: 'bout', silhouette: 'haut', element: 'élément', principale: 'parement', quoi: 'quoi', vue: 'vue', attendue: 'attendue',
  photo: 'photo', focale35: 'focale (mm éq.)', champDeg: 'champ (°)', sourceFocale: 'source', largeurPx: 'largeur (px)', hauteurPx: 'hauteur (px)', volets: 'volets', allege: 'allège', forme: 'forme',
};

/** Une valeur en clair : les nombres a la francaise, vrai et faux en mots. */
export function valeurEnClair(v: string | number | boolean | null): string {
  if (v === null) return '—';
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000).replace('.', ',');
  return v;
}

/** Des valeurs en une ligne : « largeur (m) 9,5 · hauteur (m) 5,6 ». */
export function valeursEnClair(v: ValeurElement | null | undefined): string {
  if (!v) return '—';
  const l = Object.entries(v).map(([k, x]) => (MOTS_VALEURS[k] ?? k) + ' ' + valeurEnClair(x));
  return l.length ? l.join(' · ') : '—';
}

/** Les numeros des etapes, « É10, É14 ». */
const numeros = (ids: readonly string[]) => ids.map((id) => etapeFacade(id as Parameters<typeof etapeFacade>[0]).numero).join(', ');

/** Une image d'une etape (une reference de `ImagesEtapes`) changee en adresse par l'ecran ; null : l'ecran ne la montre pas (l'audit). */
export type ImageDeLAction = (cle: CleImageEtape) => { url: string; libelle: string } | null;

/** La pastille d'une famille : sa couleur et son nom (jamais la couleur seule). */
export function PastilleFamille({ famille }: { famille: FamilleClaude }) {
  return <span className={'pastilleFamille famille-' + famille}><span className="pastilleCouleur" aria-hidden="true" />{FAMILLES_CLAUDE[famille].libelle}</span>;
}

/** Ce qu'un element dit, en une ligne : son type, son statut, ce qu'il confirme, qui le consomme, la source qui vaut. */
function LigneElement({ x, rang, extra }: { x: ElementAction; rang: number; extra?: ((x: ElementAction, rang: number) => ReactNode) | undefined }) {
  const vers = x.vers !== null && x.vers !== undefined ? (x.genre === 'element' ? ' → proposition ' + (x.vers + 1) : ' → ouverture ' + (x.vers + 1)) : '';
  const lue = x.sourceLue ? LIBELLES_SOURCE[x.sourceLue] : null;
  return (
    <li className={'elementAction' + (x.famille ? ' deClaude famille-' + x.famille : ' duCalcul')} data-cle={x.cle} data-statut={x.statut}>
      <span className="elementTete">
        {x.famille ? <PastilleFamille famille={x.famille} /> : <span className="pastilleFamille calcul">Calcul</span>}
        <strong>{x.type}</strong> <span className="elementStatut">{LIBELLES_STATUT[x.statut]}{vers}</span>
      </span>
      {x.rect && <span className="calNote">x {valeurEnClair(x.rect.x)} m, y {valeurEnClair(x.rect.y)} m, {valeurEnClair(x.rect.l)} × {valeurEnClair(x.rect.h)} m</span>}
      {x.details && Object.keys(x.details).length > 0 && <span className="calNote">{valeursEnClair(x.details)}</span>}
      {x.famille && <span className="calNote">
        {x.consommePar?.length ? 'Consommé par ' + numeros(x.consommePar) : 'Aucune étape ne le consomme encore (une lecture)'}
        {x.valeurs ? ' · calcul : ' + valeursEnClair(x.valeurs.calcul) + ' · Claude : ' + valeursEnClair(x.valeurs.claude) : ''}
        {lue ? ' · source retenue : ' + lue + (x.choisie ? ' (votre choix)' : x.forcee ? ' (Claude forcé)' : ' (le moteur)') : ''}
        {x.sansClaude ? ' · Claude ne l’a pas lu : le calcul est gardé' : ''}
      </span>}
      {extra?.(x, rang)}
    </li>
  );
}

/** Les elements d'une action, un par un. */
export function ElementsAction({ elements, extra }: { elements: readonly ElementAction[]; extra?: ((x: ElementAction, rang: number) => ReactNode) | undefined }) {
  if (!elements.length) return null;
  return <ul className="elementsAction" aria-label="Éléments, un par un">{elements.map((x, k) => <LigneElement key={(x.cle ?? 'c') + ':' + k} x={x} rang={k} extra={extra} />)}</ul>;
}

/** L'avant ou l'apres d'une action : l'image (quand l'ecran la montre) et les valeurs. */
function Trace({ titre, t, image }: { titre: string; t: ActionEtape['avant']; image: ImageDeLAction | undefined }) {
  if (!t) return null;
  const im = t.image && image ? image(t.image) : null;
  const valeurs = t.valeurs && Object.keys(t.valeurs).length ? valeursEnClair(t.valeurs) : null;
  if (!im && !valeurs) return null;
  return (
    <div className="traceAction">
      <p className="traceValeurs"><span className="traceTitre">{titre}</span>{valeurs ? ' ' + valeurs : ''}</p>
      {im && <img src={im.url} alt={im.libelle} loading="lazy" />}
    </div>
  );
}

interface Props {
  actions: readonly ActionEtape[];
  /** Les images d'une etape, en adresses (la calibration) ; absent : les valeurs seules (l'audit). */
  image?: ImageDeLAction;
  /** Ce que l'ecran ajoute sous un element (les choix de la personne, lot C2) ; absent : en lecture. */
  extra?: (x: ElementAction, rang: number, a: ActionEtape) => ReactNode;
  /** Ce que l'ecran ajoute sous une action (son geste) ; absent : rien. */
  geste?: (a: ActionEtape) => ReactNode;
  /** Le titre de la liste, pour le lecteur d'ecran. */
  libelle: string;
}

/** Les actions d'une etape, chacune avec son badge, son etat, son avant et son apres, et ses elements. */
export function ActionsEtape({ actions, image, extra, geste, libelle }: Props) {
  if (!actions.length) return null;
  return (
    <ol className="actionsEtape" aria-label={libelle}>
      {actions.map((a, k) => (
        <li key={a.id + ':' + a.type + ':' + k} className={'actionEtape ' + a.type + ' ' + a.etat} data-action={a.id} data-type={a.type}>
          <div className="actionTete">
            <span className={'badgeAction ' + a.type}>{LIBELLES_TYPE_ACTION[a.type]}</span>
            <span className="actionLibelle">{a.libelle}</span>
            <span className={'calFriseEtat ' + a.etat}>{LIBELLES_ETAT[a.etat]}</span>
          </div>
          {a.texte && <p className="calNote">{a.texte}</p>}
          {a.claude && <p className="calNote">{a.claude.rejouee ? 'Réponse enregistrée, rejouée sans réseau ni coût' : 'Aucune réponse de Claude rejouée (mode déterministe)'}{a.claude.image ? (a.claude.image === 'assemblage' ? ' ; image lue : l’assemblage' : ' ; image lue : celle du run de l’audit') : ''}.</p>}
          {a.manuel && <p className="calNote">Votre geste : {a.manuel.geste}{a.manuel.fait === true ? ' — fait.' : a.manuel.fait === false ? ' — à faire.' : '.'}</p>}
          {(a.avant || a.apres) && <div className="avantApres">
            <Trace titre="Avant" t={a.avant} image={image} />
            <Trace titre="Après" t={a.apres} image={image} />
          </div>}
          {a.elements && <ElementsAction elements={a.elements} extra={extra ? (x, r) => extra(x, r, a) : undefined} />}
          {geste?.(a)}
        </li>
      ))}
    </ol>
  );
}
