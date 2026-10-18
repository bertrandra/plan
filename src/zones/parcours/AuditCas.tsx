// Z8, la fiche d'un batiment marque en mode audit (MD/spec-audit.md §8.2) : la categorie, les
// problemes a cocher, une note, « Ce que je vois » (§8.1, facultatif, le composant de l'audit de la
// parcelle), jusqu'a huit photos (§5), chacune avec ce que l'on sait de sa prise et la couleur de la
// facade qu'elle montre (§6.2). Tout s'ecrit dans la promenade a chaque geste
// (app/audit/promenade.ts) : fermer ne perd rien, et il n'y a rien a valider.

import { useEffect, useReducer, useState, type MouseEvent } from 'react';
import { CATEGORIES_AUDIT, PHOTOS_PAR_CAS_MAX, PROBLEMES_AUDIT, problemesDe, type CasAudit, type CategorieAudit, type PhotoCas, type PrisePhoto } from '../../model/audit.js';
import { preparerPhoto } from '../../app/audit/photo.js';
import { TEXTES_SANS_MUR, TEXTES_TOUCHER, type CouleursPhotos, type EtatCouleurPhoto } from '../../app/audit/couleurFacade.js';
import type { Promenade } from '../../app/audit/promenade.js';
import { CeQueJeVois } from './CeQueJeVois.js';

interface Props { promenade: Promenade; cle: string; retirer: () => void; prise: () => PrisePhoto | null; couleurs?: CouleursPhotos; fermer: () => void }

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

/** « Façade sud : #C9B49A, lue sur la photo » : ce que la fiche dit de la couleur d'une photo. */
export function texteCouleurPhoto(e: EtatCouleurPhoto): string {
  if (e.etat === 'lecture') return 'Couleur de la façade : lecture…';
  if (e.etat === 'sansMur') return TEXTES_SANS_MUR[e.raison];
  if (e.etat === 'toucher') return 'Façade ' + e.orientation.toLowerCase() + ' : touchez la façade sur la photo.';
  const mur = e.orientation ? 'Façade ' + e.orientation.toLowerCase() : 'Façade';
  return mur + ' : ' + e.lecture.couleur + (e.lecture.source === 'automatique' ? ', lue sur la photo' : ', lue au toucher');
}

/** La couleur des photos change (une lecture finit) : la fiche se redessine. */
function useSuivreCouleurs(couleurs: CouleursPhotos | undefined): void {
  const [, maj] = useReducer((x: number) => x + 1, 0);
  useEffect(() => couleurs?.abonner(maj), [couleurs]);
}

/**
 * La photo a toucher, en entier (les vignettes sont recadrees) : le doigt y designe la facade. Le
 * point se rapporte a l'image affichee, dont les proportions sont celles de la photo.
 */
function ToucherFacade({ photo, rang, etat, toucher, plusTard }: { photo: PhotoCas; rang: number; etat: Extract<EtatCouleurPhoto, { etat: 'toucher' }>; toucher: (x: number, y: number) => void; plusTard: () => void }) {
  const surDoigt = (e: MouseEvent<HTMLButtonElement>) => {
    // Un clic au clavier n'a pas de point : il ne designe rien sur la photo.
    if (e.detail === 0) return;
    const img = e.currentTarget.querySelector('img');
    const r = img?.getBoundingClientRect();
    if (!r || !(r.width > 0) || !(r.height > 0)) return;
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) toucher(x, y);
  };
  return (
    <div className="toucherFacade" role="group" aria-label={'Couleur de la façade, photo ' + (rang + 1)}>
      <div className="libelleChamp">{'Touchez la façade ' + etat.orientation.toLowerCase() + ' sur la photo'}</div>
      <div className="detailPhoto" role={etat.raison === 'bord' ? 'alert' : undefined}>{TEXTES_TOUCHER[etat.raison]}</div>
      <button type="button" className="photoToucher" data-controle="audit.toucherFacade" onClick={surDoigt}
        aria-label={'Photo ' + (rang + 1) + ' : touchez un endroit du mur, loin des fenêtres et des ombres'}>
        <img src={'data:image/jpeg;base64,' + photo.base64} alt="" />
      </button>
      <button type="button" className="secondary small" data-controle="audit.toucherPlusTard" onClick={plusTard}>Plus tard</button>
    </div>
  );
}

export function AuditCas({ promenade, cle, retirer, prise, couleurs, fermer }: Props) {
  useSuivrePromenade(promenade);
  useSuivreCouleurs(couleurs);
  const [photoEnCours, setPhotoEnCours] = useState(false);
  const [erreurPhoto, setErreurPhoto] = useState('');
  // La photo dont on touche la facade : choisie au bouton, sinon la derniere qui le demande ; « Plus
  // tard » la range, son bouton « Toucher la façade » la rappelle.
  const [aToucher, setAToucher] = useState<PhotoCas | null>(null);
  const [plusTard, setPlusTard] = useState<readonly PhotoCas[]>([]);
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
    void preparerPhoto(fichier, ou).then((photo) => {
      promenade.completer(cle, { ajouterPhoto: photo });
      // La couleur de la facade se lit ensuite, sans faire attendre la fiche.
      void couleurs?.lire(cle, photo);
    })
      .catch(() => setErreurPhoto('Cette image n’a pas pu être lue. Réessayez avec une autre photo.'))
      .finally(() => setPhotoEnCours(false));
  };
  const etatCouleur = (ph: PhotoCas) => couleurs?.etat(cle, ph) ?? null;
  const demandeToucher = (ph: PhotoCas) => etatCouleur(ph)?.etat === 'toucher';
  const choisie = aToucher && constat.photos.includes(aToucher) && demandeToucher(aToucher) ? aToucher : null;
  const derniere = [...constat.photos].reverse().find((ph) => demandeToucher(ph) && !plusTard.includes(ph)) ?? null;
  const touchee = choisie ?? derniere;
  const etatTouchee = touchee ? etatCouleur(touchee) : null;
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
      {/* Le positif (spec §8.1), facultatif : il devient l'attendu testable du cas. */}
      <details className="sectionVu" open={!!c.vu}>
        <summary data-controle="audit.ceQueJeVois">Ce que je vois (facultatif)</summary>
        <CeQueJeVois vu={c.vu ?? {}} changer={(vu) => promenade.completer(cle, { vu })} />
      </details>
      <div className="libelleChamp">{'Photos' + (constat.photos.length ? ' (' + constat.photos.length + ' sur ' + PHOTOS_PAR_CAS_MAX + ')' : '')}</div>
      {constat.photos.length > 0 && <ul className="photosAudit" aria-label="Photos du bâtiment">
        {constat.photos.map((ph, i) => (
          <li key={i + ':' + ph.base64.length}>
            <img src={'data:image/jpeg;base64,' + ph.base64} alt={'Photo ' + (i + 1) + ' de ' + titreCas(c)} />
            {ph.prise && <div className="detailPhoto">{textePrise(ph.prise)}</div>}
            {ph.prise && texteOptique(ph.prise) && <div className="detailPhoto">{texteOptique(ph.prise)}</div>}
            {(() => {
              const e = etatCouleur(ph);
              if (!e) return null;
              return (
                <div className="detailPhoto couleurPhoto" aria-live="polite">
                  {e.etat === 'lue' && <span className="pastilleCouleur" aria-hidden="true" style={{ background: e.lecture.couleur }} />}
                  <span>{texteCouleurPhoto(e)}</span>
                </div>
              );
            })()}
            <div className="actionsPhoto">
              {demandeToucher(ph) && ph !== touchee && <button type="button" className="secondary small" data-controle="audit.toucherPhoto"
                aria-label={'Toucher la façade sur la photo ' + (i + 1)} onClick={() => { setAToucher(ph); setPlusTard(plusTard.filter((x) => x !== ph)); }}>Toucher la façade</button>}
              <button type="button" className="secondary small" data-controle="audit.retirerPhoto" aria-label={'Retirer la photo ' + (i + 1)}
                onClick={() => promenade.completer(cle, { retirerPhoto: i })}>Retirer</button>
            </div>
          </li>
        ))}
      </ul>}
      {couleurs && touchee && etatTouchee?.etat === 'toucher' && (
        <ToucherFacade photo={touchee} rang={constat.photos.indexOf(touchee)} etat={etatTouchee}
          toucher={(x, y) => { void couleurs.toucher(cle, touchee, x, y); }}
          plusTard={() => { setPlusTard([...plusTard, touchee]); setAToucher(null); }} />
      )}
      <div className="photoAudit">
        {constat.photos.length < PHOTOS_PAR_CAS_MAX
          ? <label className="boutonFichier">
            <input type="file" accept="image/*" capture="environment" data-controle="audit.photo" disabled={photoEnCours}
              onChange={(e) => { prendrePhoto(e.target.files?.[0]); e.target.value = ''; }} />
            <span>{photoEnCours ? 'Réduction de la photo…' : constat.photos.length ? 'Ajouter une photo' : 'Prendre une photo'}</span>
          </label>
          : <div className="detailPhoto">Huit photos au plus : retirez-en une pour en prendre une autre.</div>}
        {erreurPhoto && <div className="erreurParcours" role="alert">{erreurPhoto}</div>}
      </div>
      <div className="piedDialogue">
        <button type="button" className="secondary" data-controle="audit.retirerMarque" onClick={() => { retirer(); fermer(); }}>Retirer la marque</button>
        <button type="button" data-controle="audit.fermerCas" onClick={fermer}>Fermer</button>
      </div>
    </div>
  );
}
