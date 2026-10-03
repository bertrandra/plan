// La barre de l'ecran de la palette : l'etat de la palette, quatre commandes (Enregistrer…,
// Modeles, Fichier, Revenir), l'alerte de contraste qui mene aux paires en defaut, et les messages
// du dernier geste — dont le recapitulatif avant enregistrement et la confirmation d'un modele.
//
// Les confirmations vivent dans la barre elle-meme : la boite de dialogue commune de Plan se pose
// sur le `body`, que cet ecran masque. Au doigt, la barre se pose au bas de l'ecran (app.css).

import { useEffect, useRef, type RefObject } from 'react';
import type { NomJeton } from '../../styles/jetons.js';
import { MODELES_PALETTE, type ModelePalette } from '../../styles/modeles.js';
import { NOMS_THEMES, date, fr, type Theme } from './commun.js';
import type { EditionPalette } from './edition.js';

const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');

/**
 * Les menus de la barre se ferment comme ceux de Plan : un clic ailleurs, ou Echap (le focus revient
 * a leur titre) ; en ouvrir un ferme les autres.
 */
function useFermetureMenus(racine: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const ouverts = () => [...(racine.current?.querySelectorAll<HTMLDetailsElement>('details.menu[open]') ?? [])];
    const clic = (e: PointerEvent) => { ouverts().forEach(d => { if (!d.contains(e.target as Node)) d.open = false; }); };
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      ouverts().forEach(d => { d.open = false; d.querySelector('summary')?.focus(); });
    };
    const bascule = (e: Event) => {
      const d = e.target as HTMLDetailsElement;
      if (d.open) ouverts().forEach(autre => { if (autre !== d) autre.open = false; });
    };
    const r = racine.current;
    document.addEventListener('pointerdown', clic, true);
    document.addEventListener('keydown', touche);
    r?.addEventListener('toggle', bascule, true);
    return () => { document.removeEventListener('pointerdown', clic, true); document.removeEventListener('keydown', touche); r?.removeEventListener('toggle', bascule, true); };
  }, [racine]);
}

/** Ferme le menu qui contient l'element clique, puis fait le geste. */
const puis = (geste: () => void) => (e: React.MouseEvent<HTMLElement>) => {
  const d = e.currentTarget.closest('details'); if (d) d.open = false;
  geste();
};

/** Les couleurs montrees dans l'apercu d'un modele : un papier, l'encre, l'accent, les etats, le ciel. */
const APERCU: NomJeton[] = ['paper', 'ink', 'accent', 'accent-light', 'ok', 'danger', 'fond-3d'];

/**
 * Le menu des modeles : chaque modele avec son nom, une ligne de description et l'apercu de ses
 * couleurs dans les deux themes. Choisir ferme le menu et charge le modele a l'ecran.
 */
export function MenuModeles({ choisir }: { choisir: (m: ModelePalette) => void }) {
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <details className="menu palMenuModeles" ref={menu}>
      <summary>Modèles</summary>
      <ul role="menu" aria-label="Modèles de palette">
        {MODELES_PALETTE.map(m => (
          <li key={m.id} role="menuitem">
            <button type="button" data-modele={m.id} onClick={() => { if (menu.current) menu.current.open = false; choisir(m); }}>
              <span className="palModeleTextes">
                <span className="palModeleNom">{m.nom}</span>
                <span className="palModeleDescription">{m.description}</span>
              </span>
              <span className="palModeleApercu" aria-hidden="true">
                {(['clair', 'sombre'] as Theme[]).map(t => (
                  <span key={t} className="palModeleBande">
                    {APERCU.map(n => <span key={n} style={{ background: m.couleurs[t][n] }} />)}
                  </span>
                ))}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Fichier : importer un JSON de palette, exporter celle de l'ecran. */
function MenuFichier({ importer, exporter }: { importer: (f: File) => void; exporter: () => void }) {
  const choixFichier = useRef<HTMLInputElement>(null);
  return (
    <details className="menu palMenu">
      <summary>Fichier</summary>
      <ul role="menu" aria-label="Fichier de palette">
        <li role="menuitem"><button type="button" onClick={puis(() => choixFichier.current?.click())}>Importer un JSON…</button></li>
        <li role="menuitem"><button type="button" onClick={puis(exporter)}>Exporter le JSON</button></li>
      </ul>
      <input ref={choixFichier} type="file" accept=".json,application/json" hidden aria-label="Fichier de palette à importer"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importer(f); }} />
    </details>
  );
}

/** Revenir : a la palette du serveur (annuler les reglages), ou aux couleurs d'origine. */
function MenuRevenir({ annuler, origine, modifiee, ecarts }: { annuler: () => void; origine: () => void; modifiee: boolean; ecarts: number }) {
  return (
    <details className="menu palMenu">
      <summary>Revenir</summary>
      <ul role="menu" aria-label="Revenir">
        <li role="menuitem"><button type="button" onClick={puis(annuler)} disabled={!modifiee}>Annuler les modifications</button></li>
        <li role="menuitem"><button type="button" onClick={puis(origine)} disabled={ecarts === 0}>Couleurs d’origine</button></li>
      </ul>
    </details>
  );
}

/** Le recapitulatif avant d'enregistrer : chaque couleur qui part sur le serveur, avant et apres. */
function Recapitulatif({ e }: { e: EditionPalette }) {
  const pastille = (c: string) => <span className="palPastilleCouleur" style={{ background: c }} />;
  return (
    <div className="palMessage palRecapitulatif" role="alertdialog" aria-label="Enregistrer la palette sur le serveur">
      <p className="palRecapitulatifTitre">Enregistrer sur le serveur ? {pluriel(e.aEnvoyer.length, 'couleur')} {e.aEnvoyer.length > 1 ? 'changent' : 'change'} pour toutes les pages de Plan.</p>
      <ul className="palDifferences">
        {e.aEnvoyer.map(d => (
          <li key={d.theme + d.nom}>
            <code>--{d.nom}</code><span className="palDifferenceTheme">{NOMS_THEMES[d.theme]}</span>
            {pastille(d.avant)}<code>{d.avant}</code><span aria-label="devient">→</span>{pastille(d.apres)}<code>{d.apres}</code>
          </li>
        ))}
      </ul>
      {e.defauts.length > 0 && <p className="palAlerteContraste">{pluriel(e.defauts.length, 'contraste')} {e.defauts.length > 1 ? 'restent insuffisants' : 'reste insuffisant'} : le texte concerné sera moins lisible dans Plan.</p>}
      <span className="palConfirmationBoutons">
        <button type="button" className="small" onClick={e.confirmerEnregistrement} disabled={e.enCours}>{e.enCours ? 'Enregistrement…' : 'Enregistrer sur le serveur'}</button>
        <button type="button" className="secondary small" onClick={e.fermerRecapitulatif}>Revoir</button>
      </span>
    </div>
  );
}

/** La barre : etat, commandes, et le message ou la question du moment. */
export function BarrePalette({ e, allerAuxContrastes }: { e: EditionPalette; allerAuxContrastes: () => void }) {
  const racine = useRef<HTMLDivElement>(null);
  useFermetureMenus(racine);
  const n = e.defauts.length;
  return (
    <div className="palBarre" role="region" aria-label="Enregistrer la palette" ref={racine}>
      <p className="palEtatPalette" aria-live="polite">
        {e.surServeur ? 'Palette du serveur' + (e.modifieLe ? ', enregistrée le ' + date(e.modifieLe) : '') : 'Aucune palette sur le serveur : couleurs d’origine.'}
        {' · '}{e.ecarts ? pluriel(e.ecarts, 'couleur') + ' ' + (e.ecarts > 1 ? 'différentes' : 'différente') + ' de l’origine' : 'identique à l’origine'}
        {e.modifiee && <strong className="palNonEnregistre"> · modifications non enregistrées</strong>}
      </p>
      <div className="palBarreActions">
        {n > 0 && (
          <button type="button" className="palPastilleContraste" onClick={allerAuxContrastes} title="Voir les paires de contraste en défaut">
            {pluriel(n, 'contraste')} {n > 1 ? 'insuffisants' : 'insuffisant'}
          </button>
        )}
        <MenuModeles choisir={e.choisirModele} />
        <MenuFichier importer={e.importer} exporter={e.exporter} />
        <MenuRevenir annuler={e.annuler} origine={e.origine} modifiee={e.modifiee} ecarts={e.ecarts} />
        {e.peutEnregistrer && <button type="button" onClick={e.ouvrirRecapitulatif} disabled={!e.modifiee || e.enCours || e.recapitulatif}>Enregistrer…</button>}
      </div>
      {e.recapitulatif && <Recapitulatif e={e} />}
      {e.message && <p className={e.message.erreur ? 'palMessage palMessage--erreur' : 'palMessage'} role={e.message.erreur ? 'alert' : 'status'}>{e.message.texte}</p>}
      {e.aConfirmer && (
        <div className="palMessage palConfirmation" role="alertdialog" aria-label="Charger un modèle">
          <span>Charger le modèle « {e.aConfirmer.nom} » ? Les réglages non enregistrés seront remplacés.</span>
          <span className="palConfirmationBoutons">
            <button type="button" className="small" onClick={() => { if (e.aConfirmer) e.chargerModele(e.aConfirmer); }}>Charger le modèle</button>
            <button type="button" className="secondary small" onClick={e.garderReglages}>Garder mes réglages</button>
          </span>
        </div>
      )}
    </div>
  );
}

/** Une paire en defaut, telle que l'alerte la nomme. */
export const nomDefaut = (d: { theme: Theme; texte: NomJeton; fond: NomJeton; ratio: number; min: number }) =>
  '--' + d.texte + ' sur --' + d.fond + ' (' + NOMS_THEMES[d.theme].toLowerCase() + ') : ' + fr(d.ratio) + ', minimum ' + fr(d.min);
