// Les ecritures a surveiller (MD/spec-demos-admin.md, « Ecritures a surveiller ») : une branche de
// l'arbre des controleurs qui classe ce qui modifie le projet hors des deux garde-fous du registre.
//
//   - **sans annulation** : Ctrl+Z ne la defait pas. Un champ de l'inspecteur n'empile un instantane
//     que s'il le demande (`historique`) ; une saisie du tiroir passe par `resultats.saisir`, qui
//     l'empile ; une commande avec la permission d'ecrire empile elle-meme.
//   - **sans controle des droits** : rien ne la refuse en lecture seule. Le registre grise une
//     commande qui porte la permission d'ecrire ; un champ, une saisie du tiroir, ou une commande
//     sans permission qui ecrit quand meme ne sont pas refuses. La modification reste en memoire :
//     l'enregistrement, lui, est refuse.
//
// Classement seul : rien n'est execute, rien n'est change dans Plan. La branche dit ou porter le
// prochain chantier, et la decouverte suivante dira s'il a ete fait.

import type { Champ } from '../ui/champs/types.js';
import type { Commande } from './commandes.js';
import type { Noeud, SourceControleurs } from './controleurs.js';
import { CONTROLES } from './controlesInterface.js';

/** Les types de champ qui ecrivent : les autres montrent, ou declenchent. */
export const ECRIVENT = new Set<Champ['type']>(['texte', 'nombre', 'case', 'choix', 'couleur', 'date', 'curseur', 'texture']);

/** Un champ qui modifie le projet, et pas seulement l'affichage. */
export const ecritLeProjet = (ch: Champ): boolean => ECRIVENT.has(ch.type) && ch.sale !== false;

interface ChampEcrit { nom: string; annulable: boolean; sortes: Set<string> }

/** Les champs de l'inspecteur qui ecrivent dans le projet, une fois par cle, avec les sortes d'objet qui les montrent. */
function champsQuiEcrivent(s: SourceControleurs): Map<string, ChampEcrit> {
  const parCle = new Map<string, ChampEcrit>();
  const voir = (ch: Champ, sorte: string) => {
    if (ch.type === 'ligne') { ch.champs.forEach((c) => voir(c, sorte)); return; }
    if (!ecritLeProjet(ch)) return;
    const deja = parCle.get(ch.cle);
    if (deja) { deja.sortes.add(sorte); deja.annulable &&= !!ch.historique; return; }
    parCle.set(ch.cle, { nom: ch.libelle || ch.cle, annulable: !!ch.historique, sortes: new Set([sorte]) });
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
  const sansDroits: Noeud[] = [
    ...champs.map(([k, c]) => noeudChamp(k, c)),
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
