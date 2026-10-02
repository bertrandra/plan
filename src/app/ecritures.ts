// Les ecritures a surveiller (MD/spec-demos-admin.md, « Ecritures a surveiller ») : une branche de
// l'arbre des controleurs qui classe ce qui modifie le projet hors des deux garde-fous du registre.
//
//   - **sans annulation** : Ctrl+Z ne la defait pas. Un champ de l'inspecteur qui ecrit le projet
//     empile un instantane, sauf `historique: false` (`champAnnulable`) ; une saisie du tiroir passe par `resultats.saisir`, qui
//     l'empile ; une commande avec la permission d'ecrire empile elle-meme.
//   - **sans controle des droits** : rien ne la refuse en lecture seule. Le registre grise une
//     commande qui porte la permission d'ecrire ; l'inspecteur grise et refuse un champ qui ecrit le
//     projet, `resultats.saisir` refuse une saisie du tiroir. Restent un controle du catalogue qui
//     declare `droits: 'aucun'`, ou une commande sans permission qui ecrit quand meme.
//
// La branche ne fait que classer : rien n'est execute. `champAnnulable` et `champActif` sont les
// regles que l'inspecteur applique, ecrites ici pour que le classement et Plan ne divergent pas.

import type { Champ, ContexteChamps } from '../ui/champs/types.js';
import type { Commande } from './commandes.js';
import type { Noeud, SourceControleurs } from './controleurs.js';
import { CONTROLES } from './controlesInterface.js';

/** Les types de champ qui ecrivent : les autres montrent, ou declenchent. */
export const ECRIVENT = new Set<Champ['type']>(['texte', 'nombre', 'case', 'choix', 'couleur', 'date', 'curseur', 'texture']);

/** Un champ qui modifie le projet, et pas seulement l'affichage ; un bouton qui l'ecrit lui-meme. */
export const ecritLeProjet = (ch: Champ): boolean =>
  ch.type === 'bouton' ? ch.agit === 'projet' : ECRIVENT.has(ch.type) && ch.sale !== false;

/**
 * Un champ s'annule quand il ecrit dans le projet : l'inspecteur empile un instantane avant (et
 * regroupe les ecritures rapprochees d'un meme champ, app/inspecteur.ts). `historique: false` l'en
 * retire ; `historique: true` le demande aussi pour un champ qui n'ecrit pas le projet.
 */
export const champAnnulable = (ch: Champ): boolean => ch.historique === true || (ch.historique !== false && ecritLeProjet(ch));

/**
 * Un champ utilisable : actif selon son contexte, refuse en lecture seule s'il ecrit le projet, et,
 * pour un bouton qui declenche une commande, grise quand le registre ne la permet pas.
 */
export function champActif(ch: Champ, c: ContexteChamps): boolean {
  if (ch.actif && !ch.actif(c)) return false;
  if (c.etat.lectureSeule && ecritLeProjet(ch)) return false;
  if (ch.type === 'bouton' && typeof ch.agit === 'object' && c.commandeUtilisable) return c.commandeUtilisable(ch.agit.commande);
  return true;
}

interface ChampEcrit { nom: string; annulable: boolean; sortes: Set<string> }

/** Les champs de l'inspecteur qui ecrivent dans le projet, une fois par cle, avec les sortes d'objet qui les montrent. */
function champsQuiEcrivent(s: SourceControleurs): Map<string, ChampEcrit> {
  const parCle = new Map<string, ChampEcrit>();
  const voir = (ch: Champ, sorte: string) => {
    if (ch.type === 'ligne') { ch.champs.forEach((c) => voir(c, sorte)); return; }
    if (!ecritLeProjet(ch)) return;
    const deja = parCle.get(ch.cle);
    if (deja) { deja.sortes.add(sorte); deja.annulable &&= champAnnulable(ch); return; }
    parCle.set(ch.cle, { nom: ch.libelle || ch.cle, annulable: champAnnulable(ch), sortes: new Set([sorte]) });
  };
  for (const f of s.inspecteur) for (const sec of f.sections) for (const ch of sec.champs) voir(ch, f.cle);
  return parCle;
}

const noeudChamp = (cle: string, c: ChampEcrit): Noeud => ({
  cle: 'champ:' + cle, nom: c.nom, genre: 'champ',
  details: { origine: 'champ de l’inspecteur', sortes: String(c.sortes.size) }
});
const noeudControle = (cle: string): Noeud => ({
  cle: 'controle:' + cle, nom: CONTROLES[cle]?.libelle ?? cle, genre: 'controle',
  details: { origine: 'contrôle d’interface' + (CONTROLES[cle]?.ouvertPar ? ', ouvert par ' + CONTROLES[cle]?.ouvertPar : '') }
});
const noeudCommande = (c: Commande): Noeud => ({
  cle: 'commande:' + c.id, nom: c.libelle, genre: 'commande', details: { origine: 'commande sans la permission d’écrire' }
});

export function brancheEcritures(s: SourceControleurs): Noeud {
  const champs = [...champsQuiEcrivent(s)].sort(([a], [b]) => a.localeCompare(b));
  const controles = Object.entries(CONTROLES).filter(([, c]) => c.ecrit).sort(([a], [b]) => a.localeCompare(b));
  // Une commande qui porte la permission d'ecrire est grisee en lecture seule et empile son instantane.
  const commandes = s.commandes.filter((c) => c.ecrit === 'projet' && !c.permission).sort((a, b) => a.id.localeCompare(b.id));

  const sansAnnulation: Noeud[] = [
    ...champs.filter(([, c]) => !c.annulable).map(([k, c]) => noeudChamp(k, c)),
    ...controles.filter(([, c]) => !c.ecrit?.annulable).map(([k]) => noeudControle(k)),
    ...commandes.map(noeudCommande)
  ];
  // Les champs n'y sont plus : l'inspecteur refuse toute ecriture du projet en lecture seule.
  const sansDroits: Noeud[] = [
    ...controles.filter(([, c]) => c.ecrit?.droits === 'aucun').map(([k]) => noeudControle(k)),
    ...commandes.map(noeudCommande)
  ];
  return {
    cle: 'ecritures', nom: 'Écritures à surveiller', genre: 'branche',
    details: { portee: 'classement seul : ce qui modifie le projet hors des garde-fous du registre' },
    enfants: [
      {
        cle: 'sansAnnulation', nom: 'Modifient le projet sans pouvoir être annulées', genre: 'branche',
        details: { nombre: String(sansAnnulation.length), consequence: 'Annuler (Ctrl+Z) ne les défait pas' },
        enfants: sansAnnulation
      },
      {
        cle: 'sansDroits', nom: 'Modifient le projet sans contrôle des droits', genre: 'branche',
        details: {
          nombre: String(sansDroits.length),
          consequence: 'modifiables en lecture seule ; la modification reste en mémoire, l’enregistrement est refusé'
        },
        enfants: sansDroits
      }
    ]
  };
}
