// Le panneau du photomontage (demande du proprietaire, 20 novembre 2026) : choisir une photo du jardin, lire ce qu'elle dit de sa
// prise de vue, ajuster la camera a la main, enregistrer l'image. Charge quand on entre dans le mode (zones/vue3d/Vue3d.tsx).
//
// La scene prend le rapport de la photo (l'hote recoit `--rapport-photo`, app.css) et le panneau se range dessous : rien ne couvre
// l'image qu'on cale. Sur l'image, un doigt ou la souris tourne et incline le regard (la camera tourne sur elle-meme, comme un
// photographe), deux doigts ou la molette zooment ; les boutons, de 44 px, et le clavier font le reste.
//
// Le champ de la photo est ici, et nulle part ailleurs hors de l'audit : une photo du jardin, pas d'une facade (demande du
// proprietaire ; tests/unit/architecture/captureAudit.test.ts). Sans `capture` : au telephone, le navigateur propose lui-meme
// l'appareil photo ou la phototheque.

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from 'zustand';
import { abonner3d, hotes3d, version3d } from '../../three/etat3d.js';
import { photomontage, reglerPhotomontage, type FormatPhotomontage } from '../../app/photomontage/etat.js';
import { sessionPhotomontage } from '../../app/photomontage/session.js';
import { focale35DepuisChamp, gesteDeLaTouche, gesteDuGlisser, hauteurHorizon, phrasesDuCalage, rapportDeRendu, PAS_POSE } from '../../core/photomontage.js';
import { Icone } from '../icones.js';
import type { Magasin } from '../../app/magasin.js';
import type { RegistreCommandes } from '../../app/commandes.js';
import type { PosePhoto, Taille } from '../../core/photomontage.js';

interface Props { magasin: Magasin; commandes: RegistreCommandes; redimensionner: () => void }

const virgule = (v: number, decimales: number) => v.toFixed(decimales).replace('.', ',');

/** Un bouton d'ajustement : une liaison vers la commande, son geste en `data-geste` (app/ecouteurs/photomontage.ts). */
function BoutonGeste({ commandes, geste, icone, libelle, raccourci }: { commandes: RegistreCommandes; geste: string; icone: Parameters<typeof Icone>[0]['nom']; libelle: string; raccourci: string }) {
  return (
    <button type="button" className="boutonPm" data-commande="3d.photomontageAjuster" data-geste={geste} aria-label={libelle} title={libelle + ' (' + raccourci + ')'}
      disabled={!commandes.etat('3d.photomontageAjuster').utilisable}
      onClick={(e) => { commandes.executer('3d.photomontageAjuster', e.currentTarget); }}>
      <Icone nom={icone} taille={20} />
    </button>
  );
}

/** Le champ de la photo, cache : le bouton « Choisir une photo » l'ouvre. */
function ChampPhoto({ libelle, principal }: { libelle: string; principal?: boolean }) {
  const champ = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={champ} type="file" accept="image/*" hidden id="photomontageFichier"
        onChange={(e) => {
          const f = e.target.files?.[0];
          // Le meme fichier rechoisi doit se relire.
          e.target.value = '';
          if (f) void sessionPhotomontage()?.choisirPhoto(f);
        }} />
      <button type="button" className={'boutonTextePm' + (principal ? '' : ' secondary')} data-controle="photomontage.photo" disabled={photomontage.lecture}
        onClick={() => champ.current?.click()}>
        <Icone nom="image" taille={18} />{photomontage.lecture ? 'Lecture de la photo…' : libelle}
      </button>
    </>
  );
}

/**
 * Les gestes sur l'image, pris avant ceux de l'orbite (phase de capture) : un pointeur tourne et incline le regard, deux pincent le
 * champ, la molette zoome, le clavier fait tout le reste (core/photomontage.ts, `gesteDeLaTouche`).
 */
function useGestesSurLImage(hote: HTMLElement | null, calee: boolean): void {
  useEffect(() => {
    if (!hote || !calee) return;
    const s = sessionPhotomontage();
    if (!s) return;
    const doigts = new Map<number, { x: number; y: number }>();
    const surImage = (e: Event) => e.target instanceof HTMLCanvasElement;
    const ecart = () => { const [a, b] = [...doigts.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
    const bas = (e: PointerEvent) => {
      if (!surImage(e)) return;
      e.stopPropagation();
      doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      (e.target as Element).setPointerCapture?.(e.pointerId);
    };
    const bouge = (e: PointerEvent) => {
      const d = doigts.get(e.pointerId), p = photomontage.pose;
      if (!d || !p) return;
      e.stopPropagation();
      const avant = ecart();
      doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (doigts.size === 1) s.ajuster(gesteDuGlisser(e.clientX - d.x, e.clientY - d.y, hote.clientHeight, p.champDeg));
      else if (avant > 0 && ecart() > 0) s.ajuster({ champFois: avant / ecart() });
    };
    const haut = (e: PointerEvent) => { if (doigts.delete(e.pointerId)) e.stopPropagation(); };
    const molette = (e: WheelEvent) => {
      if (!surImage(e) || !e.deltaY) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      s.ajuster({ champFois: e.deltaY > 0 ? PAS_POSE.champFois : 1 / PAS_POSE.champFois });
    };
    const clavier = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"], dialog, [role="menu"], details[open]')) return;
      const g = gesteDeLaTouche(e.key, e.shiftKey);
      if (!g) return;
      // Les fleches ne font pas tourner l'orbite de la Vue 3D (app/ecouteurs/vue3d.ts) : la camera est celle de la photo.
      e.preventDefault();
      e.stopImmediatePropagation();
      s.ajuster(g);
    };
    hote.addEventListener('pointerdown', bas, true);
    hote.addEventListener('pointermove', bouge, true);
    hote.addEventListener('pointerup', haut, true);
    hote.addEventListener('pointercancel', haut, true);
    hote.addEventListener('wheel', molette, { capture: true, passive: false });
    window.addEventListener('keydown', clavier, true);
    return () => {
      hote.removeEventListener('pointerdown', bas, true);
      hote.removeEventListener('pointermove', bouge, true);
      hote.removeEventListener('pointerup', haut, true);
      hote.removeEventListener('pointercancel', haut, true);
      hote.removeEventListener('wheel', molette, { capture: true });
      window.removeEventListener('keydown', clavier, true);
    };
  }, [hote, calee]);

}

/** Les reglages du point de vue, en groupes : le regard, la position, la hauteur, le zoom, et de quoi comparer a la photo. */
function Reglages({ commandes, pose, photo }: { commandes: RegistreCommandes; pose: PosePhoto; photo: Taille }) {
  return (
    <div className="groupesPm">
      <fieldset className="groupePm">
        <legend>Regard</legend>
        <BoutonGeste commandes={commandes} geste={'tournerDeg:' + -PAS_POSE.tournerDeg} icone="chevronGauche" libelle="Tourner le regard à gauche" raccourci="flèche gauche" />
        <BoutonGeste commandes={commandes} geste={'tournerDeg:' + PAS_POSE.tournerDeg} icone="chevronDroite" libelle="Tourner le regard à droite" raccourci="flèche droite" />
        <BoutonGeste commandes={commandes} geste={'inclinerDeg:' + PAS_POSE.inclinerDeg} icone="chevronHaut" libelle="Lever le regard" raccourci="flèche haut" />
        <BoutonGeste commandes={commandes} geste={'inclinerDeg:' + -PAS_POSE.inclinerDeg} icone="chevronBas" libelle="Baisser le regard" raccourci="flèche bas" />
      </fieldset>
      <fieldset className="groupePm">
        <legend>Point de vue</legend>
        <BoutonGeste commandes={commandes} geste={'avancerM:' + PAS_POSE.deplacerM} icone="chevronHaut" libelle="Avancer de 50 cm" raccourci="Maj + flèche haut" />
        <BoutonGeste commandes={commandes} geste={'avancerM:' + -PAS_POSE.deplacerM} icone="chevronBas" libelle="Reculer de 50 cm" raccourci="Maj + flèche bas" />
        <BoutonGeste commandes={commandes} geste={'decalerM:' + -PAS_POSE.deplacerM} icone="chevronGauche" libelle="Se décaler de 50 cm à gauche" raccourci="Maj + flèche gauche" />
        <BoutonGeste commandes={commandes} geste={'decalerM:' + PAS_POSE.deplacerM} icone="chevronDroite" libelle="Se décaler de 50 cm à droite" raccourci="Maj + flèche droite" />
      </fieldset>
      <fieldset className="groupePm">
        <legend>Hauteur</legend>
        <BoutonGeste commandes={commandes} geste={'monterM:' + -PAS_POSE.monterM} icone="moins" libelle="Descendre de 10 cm" raccourci="Page suivante" />
        <output className="valeurPm" data-valeur="hauteur">{virgule(pose.hauteurM, 2)} m</output>
        <BoutonGeste commandes={commandes} geste={'monterM:' + PAS_POSE.monterM} icone="plus" libelle="Monter de 10 cm" raccourci="Page précédente" />
      </fieldset>
      <fieldset className="groupePm">
        <legend>Zoom (focale)</legend>
        <BoutonGeste commandes={commandes} geste={'champFois:' + PAS_POSE.champFois} icone="moins" libelle="Élargir le champ" raccourci="touche −" />
        <output className="valeurPm" data-valeur="focale">{Math.round(focale35DepuisChamp(pose.champDeg, photo))} mm</output>
        <BoutonGeste commandes={commandes} geste={'champFois:' + 1 / PAS_POSE.champFois} icone="plus" libelle="Resserrer le champ" raccourci="touche +" />
      </fieldset>
      <fieldset className="groupePm groupeLargePm">
        <legend>Comparer</legend>
        <label className="curseurPm">Opacité du projet
          <input type="range" min={0} max={100} step={5} value={Math.round(photomontage.opacite * 100)} data-controle="photomontage.opacite"
            aria-valuetext={Math.round(photomontage.opacite * 100) + ' %'}
            onChange={(e) => sessionPhotomontage()?.reglerAffichage({ opacite: Number(e.target.value) / 100 })} />
          <output>{Math.round(photomontage.opacite * 100)} %</output>
        </label>
        <label className="casePm" title="Les bâtiments de votre parcelle cachent ce que le projet a derrière eux sans se dessiner. Cochez pour les voir en transparence, avec la ligne d’horizon : deux repères pour caler">
          <input type="checkbox" checked={photomontage.maison} data-controle="photomontage.maison"
            onChange={(e) => sessionPhotomontage()?.reglerAffichage({ maison: e.target.checked })} /> Montrer la maison en transparence
        </label>
        {photomontage.maison && <label className="casePm" title="Sans ce choix, la maison en transparence n’est jamais dans l’image enregistrée">
          <input type="checkbox" checked={photomontage.maisonDansImage} data-controle="photomontage.maisonDansImage"
            onChange={(e) => reglerPhotomontage({ maisonDansImage: e.target.checked })} /> La garder dans l’image enregistrée
        </label>}
      </fieldset>
    </div>
  );
}

const CONFIDENTIALITE = 'La photo reste sur cet appareil : elle n’est envoyée ni au serveur ni à Claude.';

export function Photomontage({ magasin, commandes, redimensionner }: Props) {
  useSyncExternalStore(abonner3d, version3d);
  const tactile = useStore(magasin.store, (s) => s.classe) !== 'large';
  const hote = hotes3d.vue3d;
  const { photo, pose, calage } = photomontage;
  const rapport = photo ? rapportDeRendu(photo) : null;

  // La zone de rendu prend le rapport de la photo, et le rendu suit la taille de son hote, a l'entree, a chaque photo et a la sortie.
  useEffect(() => {
    document.documentElement.toggleAttribute('data-photomontage', true);
    return () => { document.documentElement.removeAttribute('data-photomontage'); };
  }, []);
  useEffect(() => {
    if (!hote) return;
    if (rapport) hote.style.setProperty('--rapport-photo', String(rapport)); else hote.style.removeProperty('--rapport-photo');
    redimensionner();
    if (typeof ResizeObserver === 'undefined') return () => { hote.style.removeProperty('--rapport-photo'); };
    const r = new ResizeObserver(() => redimensionner());
    r.observe(hote);
    return () => { r.disconnect(); hote.style.removeProperty('--rapport-photo'); };
  }, [hote, rapport, redimensionner]);

  useGestesSurLImage(hote, !!pose);

  const quitter = (
    <button type="button" className="boutonTextePm secondary" data-commande="3d.photomontage" onClick={(e) => { commandes.executer('3d.photomontage', e.currentTarget); }}>
      <Icone nom="fermer" taille={18} />Quitter le photomontage
    </button>
  );

  // Sans photo : la Vue 3D reste telle quelle, une carte posee dessus propose d'en choisir une.
  if (!photo || !pose || !calage) {
    return (
      <>
        {hote && createPortal(
          <div className="invitePhotomontage" role="group" aria-label="Photomontage">
            <h3>Photomontage</h3>
            <p>Choisissez une photo de votre jardin : votre projet s’y posera, vu de l’endroit où elle a été prise.</p>
            <div className="actionsPm"><ChampPhoto libelle={tactile ? 'Choisir ou prendre une photo' : 'Choisir une photo'} principal />{quitter}</div>
            <p className="notePm">{CONFIDENTIALITE}</p>
          </div>, hote)}
      </>
    );
  }

  const phrases = phrasesDuCalage(calage);
  const horizon = hauteurHorizon(pose);
  const enregistrer = commandes.etat('export.photomontage');
  return (
    <>
      {/* L'horizon de la camera, avec la maison en transparence : deux reperes pour caler, jamais dans l'image enregistree. */}
      {hote && photomontage.maison && horizon > 0 && horizon < 1 && createPortal(
        <div className="horizonPhotomontage" style={{ top: horizon * 100 + '%' }} aria-hidden="true"><span>Horizon</span></div>, hote)}
      <div className="panneauPhotomontage" role="region" aria-label="Photomontage">
        <ul className="calagePm" role="status">
          <li data-lu={calage.position === 'gps' ? 'oui' : 'non'}>{phrases.position}</li>
          <li data-lu={calage.cap === 'exif' ? 'oui' : 'non'}>{phrases.cap}</li>
          <li data-lu={calage.focale35 !== null ? 'oui' : 'non'}>{phrases.focale}</li>
        </ul>
        <Reglages commandes={commandes} pose={pose} photo={photo} />
        <p className="notePm">Glissez sur l’image pour tourner le regard ; pincez ou tournez la molette pour zoomer. L’heure, en haut de l’image, règle les ombres.
          {' '}Le calage lu dans la photo est un point de départ : ajustez jusqu’à ce que le projet tombe juste.</p>
        <div className="actionsPm">
          <label className="formatPm">Format
            <select value={photomontage.format} data-controle="photomontage.format" onChange={(e) => reglerPhotomontage({ format: e.target.value as FormatPhotomontage })}>
              <option value="jpeg">JPEG</option>
              <option value="png">PNG</option>
            </select>
          </label>
          <button type="button" className="boutonTextePm" data-commande="export.photomontage" disabled={!enregistrer.utilisable}
            title={'Enregistre la photo avec le projet, en ' + photo.l + ' × ' + photo.h + ' px'}
            onClick={(e) => { commandes.executer('export.photomontage', e.currentTarget); }}>
            <Icone nom="exporter" taille={18} />Enregistrer l’image
          </button>
          <button type="button" className="boutonTextePm secondary" data-commande="3d.photomontageRecaler" disabled={!commandes.etat('3d.photomontageRecaler').utilisable}
            onClick={(e) => { commandes.executer('3d.photomontageRecaler', e.currentTarget); }}>
            <Icone nom="recadrer" taille={18} />Revenir au calage de la photo
          </button>
          <ChampPhoto libelle="Changer de photo" />
          {quitter}
        </div>
        <p className="notePm">{CONFIDENTIALITE}</p>
      </div>
    </>
  );
}
