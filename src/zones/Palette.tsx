// Z2, la palette d'outils (spec-ihm-zones §4.2) : ce qu'on fait sur le canevas.
//
// Etape 2 de la reconstruction : elle remplace la rangee `#planActions` sous le plan. Chaque bouton
// est une commande du registre ; la palette ne sait ni creer ni supprimer, elle demande. Un bouton
// est grise quand sa commande dit ne pas etre active — plus rien a annuler, rien de selectionne —
// ce qui remplace les messages « Selectionne d'abord un objet » d'autrefois.
//
// Tactile : cibles de 44 px au moins, libelle sous le glyphe. Sur tablette, la palette est un rail
// pose sur le plan ; sur telephone, la feuille Outils (spec-ihm-mobile §6.2).

import { useState } from 'react';
import { useStore } from 'zustand';
import type { Magasin } from '../app/magasin.js';
import type { RegistreCommandes } from '../app/commandes.js';
import { Icone, type NomIcone } from './icones.js';
import { EnteteFeuille } from './composants/Feuille.js';
import { VignetteToit, VignetteVue } from './EcranChaine.js';
import { batimentsVises, reglesAllumees } from '../app/ecouteurs/toitCatalogue.js';
import { piecesDe, raisonIndisponible, type FamillePiece, type PieceCatalogue } from '../facade/regles/toits/gestes.js';
import { vueDeSaillie } from '../facade/regles/toits/saillies.js';

export interface PropsPalette { magasin: Magasin; commandes: RegistreCommandes }

interface Outil { id: string; icone: NomIcone; libelle: string }
interface Groupe { titre: string; outils: Outil[] }

const GROUPES: Groupe[] = [
  { titre: 'Historique', outils: [{ id: 'objet.annuler', icone: 'annuler', libelle: 'Annuler' }] },
  // Les ouvrages d'abord, dans l'ordre ou on les pense pour un jardin : c'est pour eux qu'on vient.
  // Les formes purement geometriques (sans fonction, a qualifier ensuite) ferment la creation.
  { titre: 'Créer', outils: [
    { id: 'objet.ajouter.terrasse', icone: 'terrasse', libelle: 'Terrasse' },
    { id: 'objet.ajouter.pergola', icone: 'pergola', libelle: 'Pergola' },
    { id: 'objet.ajouter.carport', icone: 'carport', libelle: 'Carport' },
    { id: 'objet.ajouter.piscine', icone: 'piscine', libelle: 'Piscine' },
    { id: 'objet.ajouter.piscineRonde', icone: 'piscineRonde', libelle: 'Piscine ronde' },
    { id: 'objet.ajouter.parasol', icone: 'parasol', libelle: 'Parasol' },
    { id: 'objet.ajouter.pointDeVue', icone: 'pointDeVue', libelle: 'Point de vue' }
  ] },
  { titre: 'Formes', outils: [
    { id: 'objet.ajouter.chemin', icone: 'chemin', libelle: 'Chemin' },
    { id: 'objet.ajouter.polygone', icone: 'polygone', libelle: 'Polygone' },
    { id: 'objet.ajouter.rectangle', icone: 'rectangle', libelle: 'Rectangle' },
    { id: 'objet.ajouter.cercle', icone: 'cercle', libelle: 'Cercle' }
  ] },
  { titre: 'Éditer', outils: [
    { id: 'objet.dupliquer', icone: 'dupliquer', libelle: 'Dupliquer' },
    { id: 'objet.reculer', icone: 'reculer', libelle: 'Reculer' },
    { id: 'objet.positionInitiale', icone: 'positionInitiale', libelle: 'Position initiale' },
    { id: 'objet.supprimer', icone: 'supprimer', libelle: 'Supprimer' }
  ] },
  { titre: 'Mesurer', outils: [
    { id: 'mesure.nouvelle', icone: 'cote', libelle: 'Coter' },
    { id: 'objet.aligner', icone: 'aligner', libelle: 'Aligner' }
  ] }
];

const ONGLETS_TOIT: { id: FamillePiece; libelle: string }[] = [
  { id: 'toit', libelle: 'Toit' }, { id: 'sur', libelle: 'Sur le toit' }, { id: 'facade', libelle: 'Façade' }
];

const vuesFacade = new Map<string, ReturnType<typeof vueDeSaillie>>();
/** L'image d'une piece : la vignette du catalogue, ou celle de l'element de facade (calculee une fois). */
function ImagePiece({ p }: { p: PieceCatalogue }) {
  if (p.exemple) return <VignetteToit forme={p.exemple} />;
  const nom = p.id.replace(/^[a-z]+:/, '');
  if (p.famille !== 'facade') return <Icone nom="polygone" />;
  if (!vuesFacade.has(nom)) vuesFacade.set(nom, vueDeSaillie(nom));
  return <VignetteVue vue={vuesFacade.get(nom) as ReturnType<typeof vueDeSaillie>} titre={p.libelle} />;
}

/**
 * Le groupe « Toit », montre quand un batiment ou la parcelle est selectionne : l'interrupteur des Regles
 * (la lecture automatique du toit), puis le catalogue en images. Un geste pose coupe les Regles du batiment.
 */
function GroupeToit({ magasin, commandes, compact }: PropsPalette & { compact: boolean }) {
  const [onglet, setOnglet] = useState<FamillePiece>('toit');
  const etatPlan = magasin.store.getState().etat;
  const vises = batimentsVises(etatPlan.objects, etatPlan.selectedKey);
  if (!vises.length) return null;
  const allumees = reglesAllumees(vises);
  const unique = vises.length === 1 ? (vises[0] ?? null) : null;
  const reg = commandes.etat('toit.regles');
  const pose = commandes.etat('toit.poser');
  const cadenas = !pose.utilisable && 'message' in pose ? pose.message : null;
  const pieces = piecesDe(onglet);
  return (
    <div className="paletteGroupe paletteToit" role="group" aria-label="Toit">
      {compact && <h3 className="paletteTitre">Toit</h3>}
      <button type="button" className="outil toitRegles" data-commande="toit.regles" aria-pressed={allumees}
        disabled={!reg.utilisable} title={allumees ? 'Règles allumées : le toit se lit tout seul. Cliquez pour le régler vous-même.' : 'Règles coupées : le toit reste comme vous le réglez. Cliquez pour reprendre la lecture automatique.'}
        onClick={(e) => commandes.executer('toit.regles', e.currentTarget)}>
        <span className="libelle">{'Règles ' + (allumees ? 'allumées' : 'coupées')}</span>
      </button>
      <div className="toitOnglets" role="tablist" aria-label="Catalogue du toit">
        {ONGLETS_TOIT.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={onglet === t.id} className="toitOnglet" onClick={() => setOnglet(t.id)}>{t.libelle}</button>
        ))}
      </div>
      <div className="paletteOutils toitCatalogue">
        {pieces.map((p) => {
          const refus = unique ? raisonIndisponible(unique, p.id) : 'Choisissez un seul bâtiment.';
          return (
            <button key={p.id} type="button" className="outil toitPiece" data-commande="toit.poser" data-piece={p.id}
              disabled={!!refus || !pose.utilisable} title={p.libelle + (refus ? ' — ' + refus : '')} aria-label={p.libelle}
              onClick={(e) => { if (compact) magasin.definirFeuille(null); commandes.executer('toit.poser', e.currentTarget); }}>
              <span className="glyphe"><ImagePiece p={p} /></span>
              <span className="libelle">{p.libelle}</span>
            </button>
          );
        })}
      </div>
      {compact && cadenas && <p className="paletteRefus">{cadenas}</p>}
    </div>
  );
}

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
              title={titre + (c?.description && !refus ? ' — ' + c.description : '')} aria-label={titre} disabled={!actif} data-commande={o.id}
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
      <GroupeToit magasin={magasin} commandes={commandes} compact={compact} />
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
