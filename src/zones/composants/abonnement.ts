// L'abonnement d'une zone a ce qu'elle montre (MD/roadmap-architecture.md, etape 6.5 ; MD/architecture.md, W3).
//
// Le magasin compte les rendus du plan (`version`) ; chaque zone s'y abonnait et se redessinait a chaque rendu, meme quand rien de
// ce qu'elle montre n'avait bouge. A 600 objets au telephone, ces rendus des zones coutaient plus que le dessin du plan. Une zone
// declare maintenant une cle : une chaine faite de ce qu'elle lit (la version des objets tenue par le controleur des objets, la
// selection, les bascules, l'etat de ses commandes). Elle ne se redessine que si sa cle change. La cle n'est recalculee qu'a un
// nouveau rendu du plan : les champs du magasin qu'une zone lit (classe, feuille, projet…) gardent leur propre `useStore`.
//
// Une zone qui peut se cacher (inspecteur, explorateur, palette, tiroir) garde sa regle : cachee, sa cle est gelee ; elle se
// redessine des qu'elle redevient visible (zones/composants/versionVisible.ts).
//
// Le garde-fou, comme celui du plan (render/pipeline.ts) : en developpement, chaque rendu du plan qui laisse une cle inchangee est
// verifie. La zone est redessinee a part (`flushSync`, dans sa propre tache, sans autre mise a jour avec elle) et son DOM compare a
// celui qu'elle gardait : un ecart veut dire que la cle oublie une donnee que la zone lit, et s'ecrit `[cle de version]` dans la
// console, ce que la fumee fait echouer. En developpement, la zone est donc toujours a jour ; dans le paquet livre, elle saute.

import { createContext, useContext, useEffect, useReducer, useRef, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import type { EtatMagasin, Magasin } from '../../app/magasin.js';
import type { EtatApp } from '../../core/state.js';
import type { RegistreCommandes } from '../../app/commandes.js';
import { cleDesAttributs, cleDesObjets, cleDesLus } from '../../ui/clePlan.js';
import { estTerrain } from '../../model/fonctions.js';
import { enLectureSeule } from '../../app/acces.js';
import { mesure } from '../../interaction/outilMesure.js';
import { cibleAlignement } from '../../interaction/outilAlignement.js';
import { saillieArmee } from '../../interaction/choixSaillie.js';
import { lectureRelief } from '../../core/lectureRelief.js';
import { soleilDuProjet } from '../../core/soleil.js';
import { especesChargees } from '../../model/especesArbre.js';
import { zoneVisible, type ZoneMasquable } from './versionVisible.js';

/**
 * La zone montee (zones/monter.tsx) : son conteneur, ou le garde-fou compare le DOM, et le magasin, pour qu'un composant au fond
 * d'une zone (un bouton de commande) s'abonne sans qu'on le lui passe.
 */
export const ZoneMontee = createContext<{ conteneur: HTMLElement; magasin: Magasin } | null>(null);

/** Le magasin de la zone, ou `null` hors d'une zone montee (un composant monte seul, dans un test). */
export function useMagasinZone(): Magasin | null {
  return useContext(ZoneMontee)?.magasin ?? null;
}

/**
 * La cle d'une zone cachee : constante, donc sans rendu tant qu'elle le reste, et sans verification (cachee, elle garde ce qu'elle
 * montrait). Une zone qui se cache autrement que par `zone` (la Vue 3D sur le plan) la rend elle-meme, et suit par un `useStore` ce
 * qui la montre : elle se redessine des qu'elle revient.
 */
export const CLE_GELEE = '\u0000gelee';
const GELEE = CLE_GELEE;

const verifier = (): boolean => import.meta.env.DEV && !(globalThis as { __sansVerifierCles?: boolean }).__sansVerifierCles;

// La part commune des cles : les attributs des objets (pas leur forme : un glisser ne la change pas, core/controleurObjets.ts), les
// mesures, et l'etat d'interface que le plan tient hors des objets. Calculee une fois par rendu du plan, quelle que soit la zone qui
// la demande.
let communeVersion = -1;
let communeEtat: EtatApp | null = null;
let commune = '';

// L'identite d'un objet remplace plutot que modifie (la bibliotheque des essences) : un numero, sans le serialiser.
const identites = new WeakMap<object, number>();
let prochaineIdentite = 0;
function identite(o: object): number {
  let n = identites.get(o);
  if (n === undefined) { n = ++prochaineIdentite; identites.set(o, n); }
  return n;
}

/**
 * Ce que toute zone qui lit le plan met dans sa cle : les attributs des objets (leur nom, leur fonction, leur affichage, pas leur
 * forme) et les cotes, l'etat d'interface du plan, et les etats des outils que les panneaux montrent (pointage d'une cote, cible
 * d'un alignement, saillie visee, lecture du relief, essences chargees), et le soleil du projet (core/soleil.ts), que l'inspecteur
 * montre et que la 3D regle aussi. Une zone qui montre la forme d'objets (une surface, une longueur, un chiffrage) y ajoute la
 * version de ceux qu'elle lit : `cleDesLus` d'un lecteur (core/lectures.ts), ou `cleDesObjets` pour tous (`cleEtatEtObjets`).
 */
export function cleEtat(s: EtatMagasin): string {
  if (s.version === communeVersion && s.etat === communeEtat) return commune;
  const e = s.etat;
  const p = e.parasol, h = e.highlight, soleil = soleilDuProjet.lire();
  commune = [
    e.objects ? cleDesAttributs(e.objects) : '', e.measures ? JSON.stringify(e.measures) : '',
    e.selectedKey, h?.type, h?.index, e.panelTab, e.terrasseSelectedKey, e.calquesVisibles, e.isolement, e.lectureSeule, enLectureSeule(),
    e.showNorth, e.positionGps, e.audit ? JSON.stringify(e.audit) : '', e.grilleVisible, e.voisinageVisible, e.schemaProjet, e.dirty,
    p?.ombreAffichee, p?.carteAffichee, soleil.dateStr, soleil.minutes,
    JSON.stringify([mesure.pointage, mesure.ref, mesure.startEnd, mesure.cibles, cibleAlignement(), saillieArmee()]), lectureRelief.enCours(),
    identite(especesChargees())
  ].join('|');
  communeVersion = s.version; communeEtat = e;
  return commune;
}

/** La cle commune et la version de tous les objets, leur forme comprise : pour une zone qui montre l'objet selectionne. */
export function cleEtatEtObjets(s: EtatMagasin): string {
  return cleEtat(s) + '|' + (s.etat.objects ? cleDesObjets(s.etat.objects) : '');
}

// Les objets que visent les cotes, une fois par rendu du plan : la liste et son lecteur (les cotes changent rarement).
// Une cote peut changer de cible sur place : la liste se relit, et le lecteur ne change que si elle change.
let visees: { cle: string; lit: (o: { key?: string; fonction?: string | null }) => boolean } | null = null;

/** La version des objets que les cotes visent, et des terrains (le relief de leur denivele) : ce que montre le tableau des cotes. */
export function cleDesCotes(s: EtatMagasin): string {
  const cles = new Set((s.etat.measures ?? []).flatMap((m) => [m.refObjKey, m.targetObjKey]));
  const cle = [...cles].join(',');
  if (visees?.cle !== cle) visees = { cle, lit: (o) => cles.has(o.key ?? '') || estTerrain(o) };
  return s.etat.objects ? visees.cle + '|' + cleDesLus(s.etat.objects, visees.lit) : '';
}

// L'etat de toutes les commandes du registre, une fois par rendu du plan : pour une zone qui en lie beaucoup sans les nommer (les
// boutons des champs de l'inspecteur).
const commandesVues = new WeakMap<RegistreCommandes, { version: number; cle: string }>();

/** L'etat de chaque commande du registre. */
export function cleCommandes(s: EtatMagasin, commandes: RegistreCommandes): string {
  const m = commandesVues.get(commandes);
  if (m && m.version === s.version) return m.cle;
  const cle = JSON.stringify(commandes.lister().map((c) => commandes.etat(c.id)));
  commandesVues.set(commandes, { version: s.version, cle });
  return cle;
}

const sansAbonnement = () => () => {};

// Les verifications en attente : une tache pour toutes celles d'un meme rendu.
const enAttente = new Set<() => void>();
function planifier(f: () => void): void {
  if (!enAttente.size) setTimeout(() => { const fs = [...enAttente]; enAttente.clear(); fs.forEach((g) => g()); }, 0);
  enAttente.add(f);
}

/**
 * La zone se redessine quand sa cle change, et a chaque changement des champs du magasin qu'elle lit par ailleurs. `lire` ne lit
 * que l'etat du plan et ce qui suit ses rendus (pas le magasin) ; elle est rappelee a chaque rendu du plan, et doit rester legere.
 * `zone` : une zone qui peut se cacher, gelee tant qu'elle l'est. `nom` : ce que le garde-fou dit d'elle.
 */
export function useCle(magasin: Magasin | null, nom: string, lire: (s: EtatMagasin) => string, zone?: ZoneMasquable): string {
  const lireRef = useRef(lire);
  lireRef.current = lire;
  // La cle n'est recalculee qu'a un nouveau rendu du plan, ou quand la zone se montre ou se cache.
  const memo = useRef<{ version: number; visible: boolean; cle: string } | null>(null);
  const instantane = (): string => {
    if (!magasin) return GELEE;
    const s = magasin.store.getState();
    const visible = !zone || zoneVisible(s, zone);
    const m = memo.current;
    if (m && m.version === s.version && m.visible === visible) return m.cle;
    const cle = visible ? lireRef.current(s) : GELEE;
    memo.current = { version: s.version, visible, cle };
    return cle;
  };
  // Sans magasin (une zone montee seule, dans un test), rien a suivre.
  const cle = useSyncExternalStore(magasin ? magasin.store.subscribe : sansAbonnement, instantane, instantane);

  // Le garde-fou, en developpement seulement.
  const conteneur = useContext(ZoneMontee)?.conteneur;
  const [, forcer] = useReducer((n: number) => n + 1, 0);
  const monte = useRef(true);
  useEffect(() => { monte.current = true; return () => { monte.current = false; }; }, []);
  useEffect(() => {
    if (!verifier() || !conteneur || !magasin) return;
    let vue = magasin.store.getState().version;
    let derniere = instantane();
    return magasin.store.subscribe((s) => {
      if (s.version === vue) return;
      vue = s.version;
      const c = instantane();
      if (c !== derniere || c === GELEE) { derniere = c; return; } // la cle a change (la zone se redessine) ou la zone est cachee
      planifier(() => {
        // Un rendu du plan venu entre-temps a pu changer la cle : la zone se redessine d'elle-meme, rien a verifier.
        if (!monte.current || instantane() !== c) return;
        // Les mises a jour deja en attente dans la meme racine (une voisine qui suit la scene 3D, la session du toit) passent
        // d'abord : seul ce que ce rendu force change est compare, pas ce qu'une autre zone allait de toute facon redessiner.
        flushSync(() => {});
        const html = conteneur.innerHTML;
        flushSync(forcer);
        const apres = conteneur.innerHTML;
        if (apres !== html) {
          // Le premier ecart, pour dire ce que la cle oublie.
          let i = 0;
          while (i < html.length && html[i] === apres[i]) i++;
          const extrait = (t: string) => t.slice(Math.max(0, i - 60), i + 60);
          console.error(`[cle de version] zone « ${nom} » : son affichage a change sans que sa cle change ; elle serait restee telle quelle dans le paquet livre (avant « ${extrait(html)} », apres « ${extrait(apres)} »)`);
        }
      });
    });
  }, [magasin, conteneur, nom, zone]);
  return cle;
}

/** Un composant lie a des commandes du registre : il se redessine quand l'etat de l'une d'elles change (effacee, grisee, motif). */
export function useCommandes(commandes: RegistreCommandes, ...ids: string[]): void {
  useCle(useMagasinZone(), 'commande ' + ids.join(', '), () => JSON.stringify(ids.map((id) => [commandes.effacee(id), commandes.etat(id)])));
}
