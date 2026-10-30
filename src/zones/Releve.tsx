// Z8, l'editeur d'une facade relevee (MD/spec-facade-calage-audit.md §6, lot F6 ; spec-releve-facade §10).
//
// Les photos d'une facade se prennent, se redressent et s'assemblent dans l'audit de la parcelle ; le releve n'a plus de capture. Il
// reste l'editeur du mur deja releve, ouvert par « Modifier » sur sa ligne de l'inspecteur (la commande `facade.modifier`) :
// l'elevation et ses ouvertures, que le doigt corrige (nature, cotes, ajout dans la grille, retrait, verification), et la partie basse
// d'un mur en L. « Valider la façade » ecrit l'edition par le service (app/releve/releve.ts), en un seul pas d'historique ; « Annuler »
// et Echap ferment sans rien ecrire.

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Icone } from './icones.js';
import { enPoints } from '../model/formes.js';
import { facadesDuContour } from '../geometry/cotesVusDeDehors.js';
import type { ServiceReleve } from '../app/releve/releve.js';
import type { ObjetPolygone, PartieBasse, ReleveFacade } from '../model/types.js';
import { fr } from './releve/commun.js';
import { useOuvertures } from './releve/ouvertures.js';
import { EditionFacade, type Verification } from './releve/EditionFacade.js';

/** Echap ferme l'editeur, sans rien ecrire. */
function useEchapFerme(releve: ServiceReleve) {
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') releve.fermer();
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [releve]);
}

function Editeur({ releve, bat, r }: { releve: ServiceReleve; bat: ObjetPolygone; r: ReleveFacade }) {
  const ouv = useOuvertures(r.ouvertures);
  const [partieBasse, setPartieBasse] = useState<PartieBasse | null>(r.partieBasse ?? null);
  useEchapFerme(releve);
  const orientation = useMemo(() => facadesDuContour(enPoints(bat).pts, r.hauteur).find((f) => f.cote === r.cote)?.orientation ?? '', [bat, r.hauteur, r.cote]);
  const titre = `Façade ${orientation.toLowerCase()} · ${fr(r.largeur)} × ${fr(r.hauteur)} m`;
  const v: Verification = {
    texture: r.texture, hauteurTexture: r.hauteurTexture ?? r.hauteur, largeur: r.largeur, hauteurMur: r.hauteur, calage: r.calage ?? null,
    ouvertures: ouv.ouvertures, setOuvertures: ouv.setOuvertures, choisie: ouv.choisie, setChoisie: ouv.setChoisie,
    devinees: ouv.devinees, garder: ouv.garder, ecarter: ouv.ecarter, partieBasse, setPartieBasse, aujourdhui: releve.aujourdhui(),
  };
  return (
    <div className="releve" role="dialog" aria-modal="true" aria-label={titre}>
      <div className="releveEntete">
        <div className="releveTitre">
          <span className="releveEtape">Modifier la façade</span>
          <span>{titre}</span>
        </div>
        <button data-controle="releve.fermer" type="button" className="releveFermer" aria-label="Fermer l’éditeur de la façade" title="Fermer (Échap)" onClick={() => releve.fermer()}>
          <Icone nom="fermer" taille={22} />
        </button>
      </div>
      <EditionFacade v={v} onAnnuler={() => releve.fermer()} onValider={() => releve.valider({ ouvertures: ouv.ouvertures, partieBasse })} />
    </div>
  );
}

export function Releve({ releve }: { releve: ServiceReleve }) {
  const ouvert = useSyncExternalStore(releve.abonner, releve.courant, releve.courant);
  if (!ouvert) return null;
  const bat = releve.batiment();
  const r = releve.releve();
  if (!bat || !r) return null;
  return <Editeur key={ouvert.objKey + ':' + ouvert.cote} releve={releve} bat={bat} r={r} />;
}
