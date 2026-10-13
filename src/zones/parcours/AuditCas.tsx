// Z8, la fiche d'un batiment marque en mode audit (MD/spec-audit.md §8.2) : la categorie, les
// problemes a cocher, une note, jusqu'a six photos (§5), chacune avec ce que l'on sait de sa prise. Tout s'ecrit dans la promenade a chaque geste
// (app/audit/promenade.ts) : fermer ne perd rien, et il n'y a rien a valider.

import { useEffect, useReducer, useState } from 'react';
import { CATEGORIES_AUDIT, PHOTOS_PAR_CAS_MAX, PROBLEMES_AUDIT, problemesDe, type CasAudit, type CategorieAudit, type PrisePhoto } from '../../model/audit.js';
import { preparerPhoto } from '../../app/audit/photo.js';
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

/**
 * « Objectif 26 mm (69°), lu dans la photo · visée 4° vers le haut, penchée de 3° à droite » : ce que
 * la fiche dit de l'optique et de l'attitude. Vide pour une photo de version 1, qui ne les a pas.
 */
export function texteOptique(p: PrisePhoto): string {
  const morceaux: string[] = [];
  if (p.sourceFocale && p.focale35 && p.champDeg) {
    const objectif = 'Objectif ' + Math.round(p.focale35) + ' mm (' + Math.round(p.champDeg) + '°)';
    if (p.sourceFocale === 'exif') morceaux.push(objectif + ', lu dans la photo');
    else if (p.sourceFocale === 'appareil') morceaux.push(objectif + ', retenu pour ' + (p.modeleAppareil ?? 'ce téléphone'));
    else morceaux.push('Champ estimé à ' + Math.round(p.champDeg) + '° (focale inconnue)');
  }
  if (typeof p.inclinaisonDeg === 'number') {
    const i = p.inclinaisonDeg;
    let visee = Math.abs(i) <= 1 ? 'visée d’aplomb' : 'visée ' + Math.abs(i) + '° vers le ' + (i > 0 ? 'haut' : 'bas');
    if (typeof p.roulisDeg === 'number' && Math.abs(p.roulisDeg) >= 2) visee += ', penchée de ' + Math.abs(p.roulisDeg) + '° à ' + (p.roulisDeg > 0 ? 'droite' : 'gauche');
    morceaux.push(visee);
  }
  return morceaux.join(' · ');
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
    // La position, le cap et l'attitude au retour de l'appareil photo : la ou vous etes, vers ou vous visez.
    const ou = prise();
    setPhotoEnCours(true);
    setErreurPhoto('');
    void preparerPhoto(fichier, ou).then((photo) => promenade.completer(cle, { ajouterPhoto: photo }))
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
      <div className="libelleChamp">{'Photos' + (constat.photos.length ? ' (' + constat.photos.length + ' sur ' + PHOTOS_PAR_CAS_MAX + ')' : '')}</div>
      {constat.photos.length > 0 && <ul className="photosAudit" aria-label="Photos du bâtiment">
        {constat.photos.map((ph, i) => (
          <li key={i + ':' + ph.base64.length}>
            <img src={'data:image/jpeg;base64,' + ph.base64} alt={'Photo ' + (i + 1) + ' de ' + titreCas(c)} />
            {ph.prise && <div className="detailPhoto">{textePrise(ph.prise)}</div>}
            {ph.prise && texteOptique(ph.prise) && <div className="detailPhoto">{texteOptique(ph.prise)}</div>}
            <button type="button" className="secondary small" data-controle="audit.retirerPhoto" aria-label={'Retirer la photo ' + (i + 1)}
              onClick={() => promenade.completer(cle, { retirerPhoto: i })}>Retirer</button>
          </li>
        ))}
      </ul>}
      <div className="photoAudit">
        {constat.photos.length < PHOTOS_PAR_CAS_MAX
          ? <label className="boutonFichier">
            <input type="file" accept="image/*" capture="environment" data-controle="audit.photo" disabled={photoEnCours}
              onChange={(e) => { prendrePhoto(e.target.files?.[0]); e.target.value = ''; }} />
            <span>{photoEnCours ? 'Réduction de la photo…' : constat.photos.length ? 'Ajouter une photo' : 'Prendre une photo'}</span>
          </label>
          : <div className="detailPhoto">Six photos au plus : retirez-en une pour en prendre une autre.</div>}
        {erreurPhoto && <div className="erreurParcours" role="alert">{erreurPhoto}</div>}
      </div>
      <div className="piedDialogue">
        <button type="button" className="secondary" data-controle="audit.retirerMarque" onClick={() => { retirer(); fermer(); }}>Retirer la marque</button>
        <button type="button" data-controle="audit.fermerCas" onClick={fermer}>Fermer</button>
      </div>
    </div>
  );
}
