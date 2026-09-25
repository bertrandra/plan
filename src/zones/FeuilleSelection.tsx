// La feuille de selection (MD/spec-ihm-mobile.md §6.4) : ce qu'on a sous le doigt, en apercu.
//
// Sur telephone, l'inspecteur n'est pas a l'ecran ; sans ce resume, selectionner un objet ne
// montrerait rien d'autre qu'un contour. La feuille dit son nom et sa fonction, trois chiffres —
// ceux que l'inspecteur lit deja (surface, hauteur finie ou longueur ou rayon) et, pour une
// terrasse, l'estimation du chiffrage — et ouvre les feuilles existantes : Proprietes, Chiffrage.
// Elle expose aussi Dupliquer et Supprimer, les deux gestes qu'on fait le plus sur une selection.
// Elle n'ajoute aucune commande ; Deselectionner est ce que fait l'explorateur.
//
// Telephone : en bas de l'ecran, au-dessus de la barre de navigation, tant qu'aucune feuille n'est
// ouverte. Tablette : une carte en bas a gauche du plan.

import { useStore } from 'zustand';
import { shoelace } from '../geometry/basic.js';
import { LIBELLE_FONCTION } from '../model/defaults.js';
import { hauteurFinieMm } from '../engine/hauteurs.js';
import { resumerChiffrage, euros } from '../ui/chiffrage.js';
import { Icone } from './icones.js';
import type { Magasin } from '../app/magasin.js';
import type { RegistreCommandes } from '../app/commandes.js';
import type { Explorateur } from '../app/explorateur.js';
import type { Tiroir } from '../app/tiroir.js';
import type { ObjetPlan } from '../model/types.js';

export interface PropsFeuilleSelection { magasin: Magasin; commandes: RegistreCommandes; explorateur: Explorateur; tiroir: Tiroir }

const nombre = (v: number, d = 2) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Les trois chiffres d'un objet, selon sa forme. */
function chiffres(o: ObjetPlan, objets: ObjetPlan[]): [string, string][] {
  const liste: [string, string][] = [];
  if (o.type === 'circle') {
    liste.push(['Rayon', nombre(o.r) + ' m']);
    liste.push(['Surface', nombre(Math.PI * o.r * o.r) + ' m²']);
  } else if (o.type === 'path') {
    let L = 0;
    for (let i = 1; i < o.pts.length; i++) L += Math.hypot(o.pts[i]!.x - o.pts[i - 1]!.x, o.pts[i]!.y - o.pts[i - 1]!.y);
    liste.push(['Longueur', nombre(L) + ' m']);
    if (o.width) liste.push(['Largeur', nombre(o.width) + ' m']);
  } else {
    liste.push(['Surface', nombre(shoelace(o.pts)) + ' m²']);
  }
  if (o.fonction === 'terrasse' && o.type === 'polygon') {
    liste.push(['Hauteur finie', nombre(hauteurFinieMm(o) / 10, 1).replace(/,0$/, '') + ' cm']);
    const r = resumerChiffrage(o, objets);
    if (r) liste.push(['Estimation', euros(r.bas) + ' – ' + euros(r.haut)]);
  }
  return liste.slice(0, 3);
}

export function FeuilleSelection({ magasin, commandes, explorateur, tiroir }: PropsFeuilleSelection) {
  useStore(magasin.store, (s) => s.version);
  const classe = useStore(magasin.store, (s) => s.classe);
  const vue = useStore(magasin.store, (s) => s.vue);
  const feuille = useStore(magasin.store, (s) => s.feuille);
  const etat = magasin.store.getState().etat;
  const o = etat.objects.find(x => x.key === etat.selectedKey);
  if (classe === 'large' || vue !== 'plan' || !o || feuille) return null;
  const terrasse = o.fonction === 'terrasse' && o.type === 'polygon';
  const ouvrirResultats = () => {
    if (terrasse) tiroir.activer('bom');
    if (classe === 'compact') magasin.definirFeuille('resultats');
    else tiroir.definirHauteur('mi');
  };
  const ouvrirProprietes = () => {
    if (classe === 'compact') magasin.definirFeuille('proprietes');
    else if (!magasin.store.getState().inspecteurOuvert) document.querySelector<HTMLButtonElement>('.inspecteurPli')?.click();
  };
  const bouton = (id: string, icone: 'dupliquer' | 'supprimer', libelle: string) => {
    if (commandes.effacee(id)) return null;
    const e = commandes.etat(id);
    return (
      <button type="button" className={'boutonIcone' + (icone === 'supprimer' ? ' boutonDanger' : '')} data-commande={id} aria-label={libelle}
        disabled={!e.utilisable} title={!e.utilisable && 'message' in e ? e.message : libelle}
        onClick={() => commandes.executer(id)}>
        <Icone nom={icone} taille={20} />
      </button>
    );
  };
  return (
    <section className="feuilleSelection" aria-label="Sélection">
      <div className="selectionEntete">
        <div className="selectionTitres">
          <h2 className="selectionNom">{o.name}</h2>
          <span className="selectionFonction">{LIBELLE_FONCTION[o.fonction || 'autre'] || o.fonction || 'Objet'}{o.locked ? ' · verrouillé' : ''}</span>
        </div>
        {bouton('objet.dupliquer', 'dupliquer', 'Dupliquer')}
        {bouton('objet.supprimer', 'supprimer', 'Supprimer')}
        <button type="button" className="boutonIcone" aria-label="Désélectionner" title="Désélectionner" onClick={() => explorateur.selectionner(null)}>
          <Icone nom="fermer" taille={20} />
        </button>
      </div>
      <dl className="selectionChiffres">
        {chiffres(o, etat.objects).map(([l, v]) => (
          <div key={l} className="chiffreCle"><dt>{l}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      <div className="selectionActions">
        <button type="button" className="secondary" onClick={ouvrirProprietes}>Propriétés</button>
        <button type="button" onClick={ouvrirResultats}>{terrasse ? 'Chiffrage' : 'Résultats'}</button>
      </div>
    </section>
  );
}
