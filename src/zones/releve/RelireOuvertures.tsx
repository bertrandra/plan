// Le point V3 de l'enchainement d'une facade (decision du proprietaire, 3 novembre 2026) : les ouvertures que la detection a trouvees,
// sur l'elevation, a regarder avant V4 (garder, corriger, ajouter, retirer). Le meme editeur que celui d'un mur releve (EditionFacade),
// dans l'audit (zones/parcours/FacadeAudit.tsx) et dans l'etape E9 ouverte de la calibration (zones/FriseEtapesCalibration.tsx) :
// « Garder ces ouvertures » rend celles que la personne a gardees, que l'ecran ecrit comme sa relecture (model/auditParcelle.ts).

import type { OuvertureFacade, PartieBasse, ReleveFacade } from '../../model/types.js';
import { useOuvertures } from './ouvertures.js';
import { EditionFacade, type Verification } from './EditionFacade.js';

/** Les parties basses du mur se corrigent dans l'editeur du releve : ici, seules les ouvertures se relisent. */
const AUCUNE_PARTIE_BASSE: PartieBasse[] = [];

/** Ce que l'editeur montre du releve que la chaine a fait : l'elevation, ses dimensions, son calage, ses ouvertures. */
type ReleveARelire = Pick<ReleveFacade, 'texture' | 'largeur' | 'hauteur' | 'ouvertures'> & Partial<Pick<ReleveFacade, 'hauteurTexture' | 'calage'>>;

export function RelireOuvertures({ releve, depart, aujourdhui, garder, annuler }: {
  releve: ReleveARelire;
  /** Les ouvertures de depart : celles deja relues, sinon celles de la detection. */
  depart?: readonly OuvertureFacade[] | undefined;
  aujourdhui: string;
  garder: (ouvertures: OuvertureFacade[]) => void;
  annuler: () => void;
}) {
  const ouv = useOuvertures(depart ?? releve.ouvertures);
  const v: Verification = {
    texture: releve.texture, hauteurTexture: releve.hauteurTexture ?? releve.hauteur, largeur: releve.largeur, hauteurMur: releve.hauteur, calage: releve.calage ?? null,
    ouvertures: ouv.ouvertures, setOuvertures: ouv.setOuvertures, choisie: ouv.choisie, setChoisie: ouv.setChoisie,
    devinees: ouv.devinees, garder: ouv.garder, ecarter: ouv.ecarter, partiesBasses: AUCUNE_PARTIE_BASSE, setPartiesBasses: () => {}, aujourdhui,
  };
  return (
    <div className="relireOuvertures" role="group" aria-label="Relire les ouvertures (V3)">
      <p className="detailPhoto">Les ouvertures trouvées sur la photo : gardez-les, corrigez-les, ajoutez celles qui manquent, retirez celles qui n’en sont pas. Vous les retrouverez à la validation de la façade (V4).</p>
      <EditionFacade v={v} onAnnuler={annuler} onValider={() => garder(ouv.ouvertures)} pied="relecture" />
    </div>
  );
}
