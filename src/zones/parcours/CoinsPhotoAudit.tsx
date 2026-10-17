// Z8, l'audit de la parcelle : placer a la main les quatre coins du mur sur une photo quand le redressement automatique
// a echoue (ou pour le reprendre), et corriger l'echelle par la largeur reelle du mur. Rien n'est ecrit avant « Appliquer » ;
// la correction va dans la capture (elle prime sur le calcul et survit au rejeu), puis la facade est rejouee.

import { useEffect, useState } from 'react';
import { Coins } from '../releve/Coins.js';
import type { P2 } from '../../facade/homographie.js';
import type { Photo } from '../../ui/releve/camera.js';
import type { CorrectionRedressement } from '../../model/auditParcelle.js';
import type { PhotoCas } from '../../model/audit.js';

interface Props {
  photo: PhotoCas;
  rang: number;
  nom: string;
  /** Les coins de depart : ceux du calcul, ou ceux deja corriges. */
  depart: readonly P2[] | undefined;
  /** La largeur du mur lue sur le plan, en metres. */
  largeurPlanM: number | null;
  echelleDepart: number | undefined;
  appliquer: (c: CorrectionRedressement) => void;
  retablir: () => void;
  fermer: () => void;
}

/** Quatre coins par defaut, dans les trois quarts centraux de la photo. */
const parDefaut = (l: number, h: number): P2[] => [{ x: l * 0.12, y: h * 0.12 }, { x: l * 0.88, y: h * 0.12 }, { x: l * 0.88, y: h * 0.88 }, { x: l * 0.12, y: h * 0.88 }];

export function CoinsPhotoAudit({ photo, rang, nom, depart, largeurPlanM, echelleDepart, appliquer, retablir, fermer }: Props) {
  const url = 'data:image/jpeg;base64,' + photo.base64;
  const [dims, setDims] = useState<{ l: number; h: number } | null>(null);
  const [coins, setCoins] = useState<P2[] | null>(null);
  const [largeur, setLargeur] = useState(echelleDepart ? String(echelleDepart).replace('.', ',') : '');
  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      setDims({ l: img.naturalWidth, h: img.naturalHeight });
      setCoins((c) => c ?? (depart && depart.length === 4 ? depart.map((p) => ({ ...p })) : parDefaut(img.naturalWidth, img.naturalHeight)));
    };
    img.src = url;
  }, [url, depart]);
  const largeurM = Number(largeur.replace(',', '.'));
  const echelle = largeur.trim() && Number.isFinite(largeurM) && largeurM > 0 ? largeurM : undefined;
  const faux = largeur.trim() !== '' && echelle === undefined;
  const lue: Photo | null = dims ? { image: { largeur: dims.l, hauteur: dims.h, donnees: new Uint8ClampedArray(0) }, url, champ: null, focalePx: null } : null;
  return (
    <div className="coinsPhotoAudit" role="group" aria-label={'Placer les quatre coins : ' + nom + ', photo ' + (rang + 1)}>
      <div className="detailPhoto">Placez les quatre coins du mur : égout à gauche, égout à droite, pied à droite, pied à gauche.</div>
      {lue && coins ? <Coins photo={lue} coins={coins} setCoins={(c) => setCoins(c)} sources={['doigt', 'doigt', 'doigt', 'doigt']} /> : <div className="detailPhoto">Chargement de la photo…</div>}
      <label className="detailPhoto">
        {'Largeur réelle du mur (m), pour l’échelle' + (largeurPlanM ? ' — le plan donne ' + String(Math.round(largeurPlanM * 100) / 100).replace('.', ',') : '') + ' : '}
        <input type="text" inputMode="decimal" value={largeur} aria-invalid={faux} onChange={(e) => setLargeur(e.target.value)} data-controle="auditParcelle.echelleMur" />
      </label>
      {faux && <div className="erreurParcours" role="alert">Écrivez un nombre de mètres, par exemple 9,5.</div>}
      <div className="piedDialogue">
        <button type="button" className="secondary small" data-controle="auditParcelle.retablirCoins" onClick={() => { retablir(); fermer(); }}>Revenir à l’automatique</button>
        <button type="button" className="secondary small" data-controle="auditParcelle.annulerCoins" onClick={fermer}>Annuler</button>
        <button type="button" className="small" data-controle="auditParcelle.appliquerCoins" disabled={!coins || faux}
          onClick={() => { if (coins) { appliquer({ coins: coins.map((c) => ({ x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10 })), ...(echelle ? { echelleLargeurM: echelle } : {}) }); fermer(); } }}>Appliquer</button>
      </div>
    </div>
  );
}
