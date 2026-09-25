// Z2, la palette d'outils (spec-ihm-zones §4.2) : ce qu'on fait sur le canevas.
//
// Etape 2 de la reconstruction : elle remplace la rangee `#planActions` sous le plan. Chaque bouton
// est une commande du registre ; la palette ne sait ni creer ni supprimer, elle demande. Un bouton
// est grise quand sa commande dit ne pas etre active — plus rien a annuler, rien de selectionne —
// ce qui remplace les messages « Selectionne d'abord un objet » d'autrefois.
//
// Tactile : cibles de 44 px au moins, libelle sous le glyphe. Sur tablette, la palette est un rail
// pose sur le plan ; sur telephone, la feuille Outils (spec-ihm-mobile §6.2).

import { useStore } from 'zustand';
import type { Magasin } from '../app/magasin.js';
import type { RegistreCommandes } from '../app/commandes.js';
import { Icone, type NomIcone } from './icones.js';
import { EnteteFeuille } from './composants/Feuille.js';

export interface PropsPalette { magasin: Magasin; commandes: RegistreCommandes }

interface Outil { id: string; icone: NomIcone; libelle: string }
interface Groupe { titre: string; outils: Outil[] }

const GROUPES: Groupe[] = [
  { titre: 'Historique', outils: [{ id: 'objet.annuler', icone: 'annuler', libelle: 'Annuler' }] },
  { titre: 'Créer', outils: [
    { id: 'objet.ajouter.polygone', icone: 'polygone', libelle: 'Polygone' },
    { id: 'objet.ajouter.rectangle', icone: 'rectangle', libelle: 'Rectangle' },
    { id: 'objet.ajouter.chemin', icone: 'chemin', libelle: 'Chemin' },
    { id: 'objet.ajouter.cercle', icone: 'cercle', libelle: 'Cercle' },
    { id: 'objet.ajouter.parasol', icone: 'parasol', libelle: 'Parasol' },
    { id: 'objet.ajouter.pointDeVue', icone: 'pointDeVue', libelle: 'Point de vue' }
  ] },
  { titre: 'Éditer', outils: [
    { id: 'objet.dupliquer', icone: 'dupliquer', libelle: 'Dupliquer' },
    { id: 'objet.supprimer', icone: 'supprimer', libelle: 'Supprimer' },
    { id: 'objet.reculer', icone: 'reculer', libelle: 'Reculer' },
    { id: 'objet.positionInitiale', icone: 'positionInitiale', libelle: 'Position initiale' }
  ] },
  { titre: 'Outils', outils: [
    { id: 'mesure.nouvelle', icone: 'cote', libelle: 'Cote' },
    { id: 'objet.aligner', icone: 'aligner', libelle: 'Aligner' }
  ] }
];

export function Palette({ magasin, commandes }: PropsPalette) {
  // La version du plan et l'etat de la pile d'annulation : ce sont les deux choses qui changent ce
  // qu'un outil peut faire. Les lire ici suffit a redessiner la palette quand elles bougent.
  useStore(magasin.store, (s) => s.version);
  const peutAnnuler = useStore(magasin.store, (s) => s.peutAnnuler);
  const classe = useStore(magasin.store, (s) => s.classe);
  const compact = classe === 'compact';
  const etatPlan = magasin.store.getState().etat;
  const selection = etatPlan.objects.find(o => o.key === etatPlan.selectedKey);

  // Sur telephone, la palette est la feuille Outils (spec-ihm-mobile §6.2) : Annuler est dans la
  // barre haute, les groupes ont un titre, les outils sont des tuiles, et la raison d'un refus est
  // ecrite sous le groupe — une infobulle ne s'affiche pas au doigt (§8).
  const groupes = compact ? GROUPES.filter(g => g.titre !== 'Historique') : GROUPES;
  const contenu = (
    <nav aria-label="Outils du plan" className={compact ? 'paletteTuiles' : undefined}>
      {groupes.map((g) => {
        const refusDuGroupe = new Set<string>();
        const boutons = g.outils.map((o) => {
          const c = commandes.obtenir(o.id);
          const etat = commandes.etat(o.id);
          // Une capacite non achetee efface l'outil : un outil de travail n'est pas une publicite.
          if (!etat.utilisable && etat.raison === 'capacite') return null;
          // L'annulation ne connait sa pile que par le magasin : l'historique la lui signale.
          const actif = o.id === 'objet.annuler' ? peutAnnuler : etat.utilisable;
          const refus = !etat.utilisable && 'message' in etat ? etat.message : null;
          if (refus) refusDuGroupe.add(o.libelle + ' : ' + refus);
          const titre = (c ? c.libelle : o.libelle) + (c && c.raccourci ? ' (' + c.raccourci + ')' : '')
            + (refus ? ' — ' + refus : '');
          return (
            <button key={o.id} type="button" className={'outil' + (o.id === 'objet.supprimer' ? ' outilDanger' : '')} id={o.id === 'objet.annuler' ? 'undoBtn' : undefined}
              title={titre} aria-label={titre} disabled={!actif} data-commande={o.id}
              onClick={(e) => {
                // Sur telephone, un outil choisi referme la feuille : on regarde ensuite le plan.
                if (compact) magasin.definirFeuille(null);
                commandes.executer(o.id, e.currentTarget);
              }}>
              <span className="glyphe"><Icone nom={o.icone} /></span>
              <span className="libelle">{o.libelle}</span>
              {refus && compact && <span className="cadenas"><Icone nom="cadenas" taille={14} /></span>}
            </button>
          );
        });
        const titre = compact && g.titre === 'Éditer' && selection ? 'Éditer · ' + selection.name : g.titre;
        return (
          <div key={g.titre} className={'paletteGroupe groupe-' + g.outils.length} role="group" aria-label={titre}>
            {compact && <h3 className="paletteTitre">{titre}</h3>}
            <div className="paletteOutils">{boutons}</div>
            {compact && [...refusDuGroupe].map(r => <p key={r} className="paletteRefus">{r}</p>)}
          </div>
        );
      })}
    </nav>
  );
  if (!compact) return contenu;
  return (
    <>
      <EnteteFeuille magasin={magasin} titre="Outils" sousTitre={selection ? 'Sélection : ' + selection.name : 'Aucune sélection'} />
      <div className="corpsFeuille">{contenu}</div>
    </>
  );
}
