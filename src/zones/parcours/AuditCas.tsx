// Z8, la fiche d'un batiment marque en mode audit (MD/spec-audit.md §4.5) : la categorie, les
// problemes a cocher, une note, une photo. Tout s'ecrit dans la promenade a chaque geste
// (app/audit/promenade.ts) : fermer ne perd rien, et il n'y a rien a valider.

import { useEffect, useReducer, useState } from 'react';
import { CATEGORIES_AUDIT, PROBLEMES_AUDIT, problemesDe, type CasAudit, type CategorieAudit, type PrisePhoto } from '../../model/audit.js';
import { reduirePhoto } from '../../app/audit/photo.js';
import type { Promenade } from '../../app/audit/promenade.js';

interface Props { promenade: Promenade; cle: string; retirer: () => void; prise: () => PrisePhoto | null; fermer: () => void }

/** Ce qui designe le batiment pour la personne : l'adresse si elle est arrivee, sinon la parcelle. */
export function titreCas(c: CasAudit): string {
  return c.identite.adresse ?? (c.identite.idu ? 'Parcelle ' + c.identite.idu : 'Bâtiment ' + (c.identite.cleBdtopo ?? c.cle));
}

/** La promenade change (une adresse arrive, un autre geste) : la fiche se redessine. */
export function useSuivrePromenade(promenade: Promenade): void {
  const [, maj] = useReducer((x: number) => x + 1, 0);
  useEffect(() => promenade.abonner(maj), [promenade]);
}

const POINTS_CARDINAUX = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];

/** « Prise à ± 5 m, vers 245° (OSO), boussole » : ce que la fiche dit de la prise de vue. */
export function textePrise(p: PrisePhoto): string {
  const ou = p.precisionM !== null ? 'Prise à ± ' + Math.round(p.precisionM) + ' m' : 'Prise ici';
  if (p.azimutDeg === null) return ou + ', sans direction (pas de boussole)';
  const nom = POINTS_CARDINAUX[Math.round(p.azimutDeg / 22.5) % 16];
  return ou + ', vers ' + p.azimutDeg + '° (' + nom + ')' + (p.sourceAzimut === 'deplacement' ? ', sens de la marche' : ', boussole');
}

export function AuditCas({ promenade, cle, retirer, prise, fermer }: Props) {
  useSuivrePromenade(promenade);
  const [photoEnCours, setPhotoEnCours] = useState(false);
  const [erreurPhoto, setErreurPhoto] = useState('');
  const c = promenade.cas(cle);
  if (!c) {
    return (
      <div className="dialogueImperatif dialogueAudit" role="dialog" aria-modal="true" aria-label="Fiche du bâtiment">
        <div className="titreParcours">Fiche du bâtiment</div>
        <p>Ce bâtiment n’est plus marqué.</p>
        <div className="piedDialogue"><button type="button" data-controle="audit.fermerCas" onClick={fermer}>Fermer</button></div>
      </div>
    );
  }
  const { constat } = c;
  const choisirCategorie = (categorie: CategorieAudit) => {
    // Les problemes cochés d'une autre categorie ne se verraient plus : ils partent avec elle.
    const gardes = constat.problemes.filter((p) => PROBLEMES_AUDIT.find((x) => x.code === p)?.categorie === categorie);
    promenade.completer(cle, { categorie, problemes: gardes });
  };
  const basculerProbleme = (code: string) => {
    const avec = constat.problemes.includes(code);
    promenade.completer(cle, { problemes: avec ? constat.problemes.filter((p) => p !== code) : [...constat.problemes, code] });
  };
  const prendrePhoto = (fichier: File | undefined) => {
    if (!fichier) return;
    // La position et le cap au retour de l'appareil photo : la ou vous etes, vers ou vous visez.
    const ou = prise();
    setPhotoEnCours(true);
    setErreurPhoto('');
    void reduirePhoto(fichier).then((photo) => promenade.completer(cle, { photo: ou ? { ...photo, prise: ou } : photo }))
      .catch(() => setErreurPhoto('Cette image n’a pas pu être lue. Réessayez avec une autre photo.'))
      .finally(() => setPhotoEnCours(false));
  };
  return (
    <div className="dialogueImperatif dialogueAudit" role="dialog" aria-modal="true" aria-label="Fiche du bâtiment">
      <div className="titreParcours">{titreCas(c)}</div>
      <div className="sousTitreParcours">{'Marqué à ' + new Date(constat.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        + (c.entrees.grille ? ' · mesure LiDAR gardée' : ' · mesure LiDAR en lecture…')}</div>
      <div className="libelleChamp">Ce qui ne va pas</div>
      <div className="segmente" role="group" aria-label="Catégorie">
        {CATEGORIES_AUDIT.map((k) => (
          <button key={k.code} type="button" data-controle="audit.categorie" className={constat.categorie === k.code ? 'actif' : ''}
            aria-pressed={constat.categorie === k.code} onClick={() => choisirCategorie(k.code)}>{k.libelle}</button>
        ))}
      </div>
      <div className="puces" role="group" aria-label="Problèmes constatés">
        {problemesDe(constat.categorie).map((p) => (
          <button key={p.code} type="button" data-controle="audit.probleme" aria-pressed={constat.problemes.includes(p.code)}
            onClick={() => basculerProbleme(p.code)}>{p.libelle}</button>
        ))}
      </div>
      <label className="libelleChamp" htmlFor="auditNote">Note</label>
      <textarea id="auditNote" className="noteAudit" data-controle="audit.note" value={constat.note}
        placeholder="Ce que vous voyez : « faîtage parallèle à la rue », « deux maisons accolées »…"
        onChange={(e) => promenade.completer(cle, { note: e.target.value })} />
      <div className="libelleChamp">Photo</div>
      <div className="photoAudit">
        <label className="boutonFichier">
          <input type="file" accept="image/*" capture="environment" data-controle="audit.photo" disabled={photoEnCours}
            onChange={(e) => { prendrePhoto(e.target.files?.[0]); e.target.value = ''; }} />
          <span>{photoEnCours ? 'Réduction de la photo…' : constat.photo ? 'Remplacer la photo' : 'Prendre une photo'}</span>
        </label>
        {constat.photo && <button type="button" className="secondary" data-controle="audit.retirerPhoto" onClick={() => promenade.completer(cle, { photo: null })}>Retirer la photo</button>}
        {erreurPhoto && <div className="erreurParcours" role="alert">{erreurPhoto}</div>}
        {constat.photo && <img src={'data:image/jpeg;base64,' + constat.photo.base64} alt={'Photo de ' + titreCas(c)} />}
        {constat.photo?.prise && <div className="detailPhoto">{textePrise(constat.photo.prise)}</div>}
      </div>
      <div className="piedDialogue">
        <button type="button" className="secondary" data-controle="audit.retirerMarque" onClick={() => { retirer(); fermer(); }}>Retirer la marque</button>
        <button type="button" data-controle="audit.fermerCas" onClick={fermer}>Fermer</button>
      </div>
    </div>
  );
}
