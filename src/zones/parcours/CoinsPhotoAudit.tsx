// Z8, l'audit de la parcelle : placer a la main quatre reperes sur une photo quand le redressement automatique a echoue (ou pour
// le reprendre), et corriger l'echelle par la largeur reelle du mur. Les reperes sont n'importe quel rectangle du mur (une fenetre,
// une porte, le mur) : ils ne disent que les verticales et les horizontales. La photo se redresse entiere, sans coupe ; l'egout et
// le sol se cherchent ensuite, sur l'assemblage des photos (zones/releve/chaine.ts) ; « Ajuster l'égout et le sol » les reprend a la
// main sur la photo redressee entiere (zones/releve/AjusterMur.tsx). Rien n'est ecrit avant « Appliquer » ; la
// correction va dans la capture (elle prime sur le calcul et survit au rejeu), puis la facade est rejouee.

import { useCallback, useEffect, useState } from 'react';
import { Coins } from '../releve/Coins.js';
import { AjusterMur, type MurAjuste } from '../releve/AjusterMur.js';
import { pixelsDePhoto } from '../../render/couleurPhotoAudit.js';
import type { P2 } from '../../facade/homographie.js';
import type { Photo } from '../../ui/releve/camera.js';
import type { CorrectionRedressement } from '../../model/auditParcelle.js';
import type { PhotoCas } from '../../model/audit.js';

interface Props {
  photo: PhotoCas;
  rang: number;
  nom: string;
  /** Les reperes de depart : ceux deja poses, sinon les coins du mur que le calcul a retenus (un rectangle du mur, eux aussi). */
  depart: readonly P2[] | undefined;
  /** Les coins du mur sur la photo, trouves par la chaine ou deja ajustes a la main : le depart de « Ajuster l'égout et le sol ». */
  mur: readonly P2[] | undefined;
  /** La silhouette du haut du mur deja ajustee a la main, sur la photo. */
  silhouette?: readonly P2[] | undefined;
  /** La largeur du mur lue sur le plan, en metres. */
  largeurPlanM: number | null;
  echelleDepart: number | undefined;
  appliquer: (c: CorrectionRedressement) => void;
  retablir: () => void;
  fermer: () => void;
}

const NOMS_REPERES = ['Repère en haut, à gauche', 'Repère en haut, à droite', 'Repère en bas, à droite', 'Repère en bas, à gauche'];

/** Quatre reperes par defaut, dans les trois quarts centraux de la photo. */
const parDefaut = (l: number, h: number): P2[] => [{ x: l * 0.12, y: h * 0.12 }, { x: l * 0.88, y: h * 0.12 }, { x: l * 0.88, y: h * 0.88 }, { x: l * 0.12, y: h * 0.88 }];

export function CoinsPhotoAudit({ photo, rang, nom, depart, mur, silhouette, largeurPlanM, echelleDepart, appliquer, retablir, fermer }: Props) {
  const url = 'data:image/jpeg;base64,' + photo.base64;
  const [dims, setDims] = useState<{ l: number; h: number } | null>(null);
  const [coins, setCoins] = useState<P2[] | null>(null);
  const [largeur, setLargeur] = useState(echelleDepart ? String(echelleDepart).replace('.', ',') : '');
  // Le mur repris a la main sur la photo redressee : null tant que la personne n'y a pas touche (la chaine le cherche seule).
  const [ajuster, setAjuster] = useState(false);
  const [murAjuste, setMurAjuste] = useState<MurAjuste | null>(null);
  const charger = useCallback(async () => { const p = await pixelsDePhoto(photo.base64); return p ? { largeur: p.largeur, hauteur: p.hauteur, donnees: Uint8ClampedArray.from(p.data) } : null; }, [photo.base64]);
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
    <div className="coinsPhotoAudit" role="group" aria-label={'Placer quatre repères : ' + nom + ', photo ' + (rang + 1)}>
      <div className="detailPhoto">Placez quatre repères aux coins d’un rectangle du mur (une fenêtre, une porte, le mur entier) : deux en haut sur une même horizontale, deux en bas. Ils redressent la photo entière ; l’égout et le sol sont cherchés ensuite.</div>
      {lue && coins ? <Coins photo={lue} coins={coins} setCoins={(c) => setCoins(c)} sources={['doigt', 'doigt', 'doigt', 'doigt']} noms={NOMS_REPERES} etiquettes={false} libelle="Photo : placez quatre repères" /> : <div className="detailPhoto">Chargement de la photo…</div>}
      {coins && <button type="button" className="secondary small" aria-pressed={ajuster} data-controle="auditParcelle.ajusterMur" onClick={() => setAjuster((a) => !a)}>{ajuster ? 'Masquer l’égout et le sol' : 'Ajuster l’égout et le sol'}</button>}
      {coins && ajuster && <>
        <div className="detailPhoto">Sur la photo redressée, tirez la silhouette du haut du mur (un pignon, une rampe : ses sommets), le sol et les deux bouts s’ils sont mal placés.</div>
        <AjusterMur charger={charger} reperes={coins} mur={murAjuste?.coins ?? mur ?? null} silhouette={murAjuste?.silhouette ?? silhouette ?? null} changer={setMurAjuste} />
      </>}
      <label className="detailPhoto">
        {'Largeur réelle du mur (m), pour l’échelle' + (largeurPlanM ? ' — le plan donne ' + String(Math.round(largeurPlanM * 100) / 100).replace('.', ',') : '') + ' : '}
        <input type="text" inputMode="decimal" value={largeur} aria-invalid={faux} onChange={(e) => setLargeur(e.target.value)} data-controle="auditParcelle.echelleMur" />
      </label>
      {faux && <div className="erreurParcours" role="alert">Écrivez un nombre de mètres, par exemple 9,5.</div>}
      <div className="piedDialogue">
        <button type="button" className="secondary small" data-controle="auditParcelle.retablirCoins" onClick={() => { retablir(); fermer(); }}>Revenir à l’automatique</button>
        <button type="button" className="secondary small" data-controle="auditParcelle.annulerCoins" onClick={fermer}>Annuler</button>
        <button type="button" className="small" data-controle="auditParcelle.appliquerCoins" disabled={!coins || faux}
          onClick={() => { if (coins) { appliquer({ reperes: coins.map((c) => ({ x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10 })), ...(murAjuste ? { coins: murAjuste.coins, silhouette: murAjuste.silhouette } : {}), ...(echelle ? { echelleLargeurM: echelle } : {}) }); fermer(); } }}>Appliquer</button>
      </div>
    </div>
  );
}
