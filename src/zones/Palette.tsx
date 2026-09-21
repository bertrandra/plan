// Z2, la palette d'outils (spec-ihm-zones §4.2) : ce qu'on fait sur le canevas.
//
// Etape 2 de la reconstruction : elle remplace la rangee `#planActions` sous le plan. Chaque bouton
// est une commande du registre ; la palette ne sait ni creer ni supprimer, elle demande. Un bouton
// est grise quand sa commande dit ne pas etre active — plus rien a annuler, rien de selectionne —
// ce qui remplace les messages « Selectionne d'abord un objet » d'autrefois.
//
// Tactile : cibles de 44 px au moins, libelle sous le glyphe, et la palette s'escamote sous 1 024 px
// (feuille de style, `#zonePalette`).

import { useStore } from 'zustand';
import type { Magasin } from '../app/magasin.js';
import type { RegistreCommandes } from '../app/commandes.js';

export interface PropsPalette { magasin: Magasin; commandes: RegistreCommandes }

interface Outil { id: string; glyphe: string; libelle: string }
interface Groupe { titre: string; outils: Outil[] }

const GROUPES: Groupe[] = [
  { titre: 'Historique', outils: [{ id: 'objet.annuler', glyphe: '↶', libelle: 'Annuler' }] },
  { titre: 'Créer', outils: [
    { id: 'objet.ajouter.polygone', glyphe: '⬠', libelle: 'Polygone' },
    { id: 'objet.ajouter.rectangle', glyphe: '▭', libelle: 'Rectangle' },
    { id: 'objet.ajouter.chemin', glyphe: '⟋', libelle: 'Chemin' },
    { id: 'objet.ajouter.cercle', glyphe: '○', libelle: 'Cercle' },
    { id: 'objet.ajouter.parasol', glyphe: '☂', libelle: 'Parasol' },
    { id: 'objet.ajouter.pointDeVue', glyphe: '👁', libelle: 'Point de vue' }
  ] },
  { titre: 'Éditer', outils: [
    { id: 'objet.dupliquer', glyphe: '⧉', libelle: 'Dupliquer' },
    { id: 'objet.supprimer', glyphe: '✕', libelle: 'Supprimer' },
    { id: 'objet.reculer', glyphe: '⤓', libelle: 'Reculer' },
    { id: 'objet.positionInitiale', glyphe: '↺', libelle: 'Position initiale' }
  ] },
  { titre: 'Outils', outils: [
    { id: 'mesure.nouvelle', glyphe: '📐', libelle: 'Cote' },
    { id: 'objet.aligner', glyphe: '⟲', libelle: 'Aligner' }
  ] }
];

export function Palette({ magasin, commandes }: PropsPalette) {
  // La version du plan et l'etat de la pile d'annulation : ce sont les deux choses qui changent ce
  // qu'un outil peut faire. Les lire ici suffit a redessiner la palette quand elles bougent.
  useStore(magasin.store, (s) => s.version);
  const peutAnnuler = useStore(magasin.store, (s) => s.peutAnnuler);
  return (
    <nav aria-label="Outils du plan">
      {GROUPES.map((g) => (
        <div key={g.titre} className="paletteGroupe" role="group" aria-label={g.titre}>
          {g.outils.map((o) => {
            const c = commandes.obtenir(o.id);
            // L'annulation ne connait sa pile que par le magasin : l'historique la lui signale.
            const actif = o.id === 'objet.annuler' ? peutAnnuler : !!c && (!c.actif || c.actif());
            const titre = (c ? c.libelle : o.libelle) + (c && c.raccourci ? ' (' + c.raccourci + ')' : '');
            return (
              <button key={o.id} type="button" className="outil" id={o.id === 'objet.annuler' ? 'undoBtn' : undefined}
                title={titre} aria-label={titre} disabled={!actif} data-commande={o.id}
                onClick={(e) => { commandes.executer(o.id, e.currentTarget); }}>
                <span className="glyphe" aria-hidden="true">{o.glyphe}</span>
                <span className="libelle">{o.libelle}</span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
