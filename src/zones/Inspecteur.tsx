// Z5, l'inspecteur (spec-ihm-zones §4.5) : les proprietes de ce qui est selectionne.
//
// Etape 4 de la reconstruction : il remplace l'onglet Édition du panneau — le panneau d'attributs
// et le configurateur de terrasse. Il ne connait aucun champ par son nom : il recoit des
// descripteurs (ui/champs/) et les rend, un composant par type de champ, dans des sections
// repliables. Ecrire, c'est demander a l'inspecteur (app/inspecteur.ts), qui sait ce qui doit
// suivre. Les champs texte et nombre gardent leur focus d'un rendu a l'autre parce que React garde
// leurs noeuds : c'est ce qui, en DOM reconstruit, obligeait a des mises a jour ciblees partout.
//
// Tactile : commandes de 32 px au moins, colonne qui se replie sous 1 024 px en passant sous le plan.

import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { champsVisibles } from '../ui/champs/types.js';
import type { Champ, ChampBouton, ChampNombre, ChampTexture, ContexteChamps, Section } from '../ui/champs/types.js';
import type { Magasin } from '../app/magasin.js';
import type { RegistreCommandes } from '../app/commandes.js';
import type { Inspecteur as ServiceInspecteur } from '../app/inspecteur.js';

export interface PropsInspecteur { magasin: Magasin; commandes: RegistreCommandes; inspecteur: ServiceInspecteur }

interface PropsChamp<T extends Champ = Champ> { champ: T; c: ContexteChamps; inspecteur: ServiceInspecteur; inline?: boolean }

const formater = (v: number, decimales: number | undefined) => Number.isFinite(v) ? (decimales === undefined ? String(v) : v.toFixed(decimales)) : '';

/** Un nombre : brouillon local pendant la saisie, ecrit a la validation, relu si refuse. */
function Nombre({ champ, c, inspecteur }: PropsChamp<ChampNombre>) {
  const [brouillon, setBrouillon] = useState<string | null>(null);
  const valeur = formater(champ.lire(c), champ.decimales);
  const actif = !champ.actif || champ.actif(c);
  const valider = () => {
    if (brouillon === null) return;
    const v = parseFloat(brouillon);
    setBrouillon(null);
    if (isNaN(v) || brouillon === valeur) return;
    inspecteur.appliquer(champ, c, () => champ.ecrire(c, v));
  };
  return (
    <span className="champNombre">
      <input type="number" value={brouillon ?? valeur} step={champ.pas} min={champ.min} max={champ.max} disabled={!actif} title={champ.aide}
        aria-label={champ.libelle} onChange={(e) => setBrouillon(e.target.value)} onBlur={valider}
        onKeyDown={(e) => { if (e.key === 'Enter') { valider(); (e.target as HTMLInputElement).blur(); } if (e.key === 'Escape') setBrouillon(null); }} />
      {champ.unite && <span className="unite">{champ.unite}</span>}
    </span>
  );
}

function Texture({ champ, c, inspecteur }: PropsChamp<ChampTexture>) {
  const tex = champ.lire(c);
  const actif = !champ.actif || champ.actif(c);
  const choisir = () => c.choisirTexture(champ.libelle, (choix, tous) => {
    inspecteur.appliquer(champ, c, () => { if (tous && champ.appliquerATous) champ.appliquerATous.ecrire(c, choix); else champ.ecrire(c, choix); });
  }, champ.appliquerATous && c.obj.fonction === 'chemin' ? { checkboxLabel: champ.appliquerATous.libelle } : undefined);
  return (
    <span className="champTexture">
      {tex && <img src={tex.vignette || ''} alt="" className="vignette" />}
      <span className="nomTexture">{tex ? tex.nom : 'Aucune (couleur unie)'}</span>
      <button type="button" className="secondary small" disabled={!actif} onClick={choisir}>{tex ? 'Changer…' : 'Choisir…'}</button>
      {tex && <button type="button" className="secondary small" disabled={!actif} title="Retirer cette texture" onClick={() => inspecteur.appliquer(champ, c, () => champ.ecrire(c, null))}>×</button>}
    </span>
  );
}

function Bouton({ champ, c, inspecteur }: PropsChamp<ChampBouton>) {
  const actif = !champ.actif || champ.actif(c);
  return (
    <span className="champBouton">
      <button type="button" className="secondary small" disabled={!actif} title={champ.aide} onClick={() => inspecteur.executer(champ, c)}>
        {champ.texte ? champ.texte(c) : champ.libelle}
      </button>
      {champ.explication && <span className="explication">{champ.explication}</span>}
    </span>
  );
}

/** Un conteneur rempli hors React : le tableau d'optimisation, dessine par le module des panneaux. */
function Hote({ champ, c }: PropsChamp<Extract<Champ, { type: 'hote' }>>) {
  useEffect(() => { champ.remplir(c); });
  return <div id={champ.idDom} className="champHote" />;
}

/** La commande d'un champ, selon son type. */
function Commande({ champ, c, inspecteur }: PropsChamp) {
  const actif = !champ.actif || champ.actif(c);
  const ecrire = <V,>(fn: (v: V) => void | boolean) => (v: V) => { inspecteur.appliquer(champ, c, () => fn(v)); };
  switch (champ.type) {
    case 'texte':
      return <input type="text" value={champ.lire(c)} placeholder={champ.placeholder} disabled={!actif} title={champ.aide} aria-label={champ.libelle}
        onChange={(e) => ecrire<string>((v) => champ.ecrire(c, v))(e.target.value)} />;
    case 'nombre':
      return <Nombre champ={champ} c={c} inspecteur={inspecteur} />;
    case 'case':
      return <input type="checkbox" checked={champ.lire(c)} disabled={!actif} title={champ.aide} aria-label={champ.libelle}
        onChange={(e) => ecrire<boolean>((v) => champ.ecrire(c, v))(e.target.checked)} />;
    case 'choix':
      return <select value={champ.lire(c)} disabled={!actif} title={champ.aide} aria-label={champ.libelle} onChange={(e) => ecrire<string>((v) => champ.ecrire(c, v))(e.target.value)}>
        {champ.options(c).map(o => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
      </select>;
    case 'couleur':
      return <input type="color" value={champ.lire(c)} disabled={!actif} title={champ.aide} aria-label={champ.libelle} onChange={(e) => ecrire<string>((v) => champ.ecrire(c, v))(e.target.value)} />;
    case 'date':
      return <input type="date" value={champ.lire(c)} disabled={!actif} title={champ.aide} aria-label={champ.libelle} onChange={(e) => ecrire<string>((v) => champ.ecrire(c, v))(e.target.value)} />;
    case 'curseur':
      return <span className="champCurseur">
        <input type="range" min={champ.min} max={champ.max} step={champ.pas} value={champ.lire(c)} disabled={!actif} aria-label={champ.libelle}
          onChange={(e) => ecrire<number>((v) => champ.ecrire(c, v))(parseInt(e.target.value, 10))} />
        <span className="valeurCurseur">{champ.format(champ.lire(c))}</span>
      </span>;
    case 'lecture':
      return <span className="lecture">{champ.valeur(c)}</span>;
    case 'texture':
      return <Texture champ={champ} c={c} inspecteur={inspecteur} />;
    case 'bouton':
      return <Bouton champ={champ} c={c} inspecteur={inspecteur} />;
    case 'alerte':
      return <div className="hint alerte">{champ.texte(c)}</div>;
    case 'hote':
      return <Hote champ={champ} c={c} inspecteur={inspecteur} />;
    case 'ligne':
      return <span className="champsEnLigne">
        {champsVisibles({ id: champ.cle, titre: '', champs: champ.champs }, c).map(sous => <Commande key={sous.cle} champ={sous} c={c} inspecteur={inspecteur} inline />)}
      </span>;
  }
}

function LigneChamp({ champ, c, inspecteur }: PropsChamp) {
  const note = champ.note ? champ.note(c) : '';
  const pleineLargeur = champ.type === 'alerte' || champ.type === 'hote' || (champ.type === 'bouton' && !champ.libelle);
  const classes = ['champ', 'champ-' + champ.type, champ.surbrillance && champ.surbrillance(c) ? 'highlightRow' : ''].filter(Boolean).join(' ');
  if (pleineLargeur) return <div className={classes + ' pleineLargeur'}><Commande champ={champ} c={c} inspecteur={inspecteur} /></div>;
  return (
    <div className={classes}>
      <label className="libelle" title={champ.aide}>{champ.libelle}</label>
      <div className="commande">
        <Commande champ={champ} c={c} inspecteur={inspecteur} />
        {note && <div className="note">{note}</div>}
      </div>
    </div>
  );
}

function SectionVue({ section, c, inspecteur }: { section: Section; c: ContexteChamps; inspecteur: ServiceInspecteur }) {
  const champs = champsVisibles(section, c);
  if (!champs.length) return null;
  // `open` n'est pose qu'au montage : React ne le reimpose pas a chaque rendu, le pli de
  // l'utilisateur survit donc aux rendus du plan tant que la section reste montee.
  return (
    <details className="inspecteurSection" open={!section.repliee} data-section={section.id}>
      <summary>{section.titre}</summary>
      {section.explication && <p className="hint">{section.explication}</p>}
      <div className="champs">
        {champs.map(ch => <LigneChamp key={ch.cle} champ={ch} c={c} inspecteur={inspecteur} />)}
      </div>
    </details>
  );
}

export function Inspecteur({ magasin, commandes, inspecteur }: PropsInspecteur) {
  useStore(magasin.store, (s) => s.version);
  const obj = inspecteur.objet();
  const executer = (id: string) => () => { commandes.executer(id); };
  if (!obj) {
    return (
      <aside id="zoneInspecteur" aria-label="Inspecteur">
        <div className="inspecteurEntete"><span>Aucune sélection</span></div>
        <p className="hint" style={{ padding: '0 10px' }}>Clique un objet sur le plan ou dans l'explorateur pour l'éditer.</p>
        <div className="inspecteurPied">
          <button type="button" className="secondary small" onClick={executer('projet.reinitialiser')}>Réinitialiser tout</button>
        </div>
      </aside>
    );
  }
  const c = inspecteur.contexte(obj);
  return (
    <aside id="zoneInspecteur" aria-label="Inspecteur">
      <div className="inspecteurEntete" id="attrTitle">{inspecteur.titre(c)}</div>
      {inspecteur.sections(c).map(s => <SectionVue key={s.id} section={s} c={c} inspecteur={inspecteur} />)}
      <div className="inspecteurPied">
        <button type="button" className="secondary small" disabled={!commandes.obtenir('objet.positionInitiale')?.actif?.()} onClick={executer('objet.positionInitiale')}>Réinitialiser la position</button>
        <button type="button" className="secondary small" onClick={executer('projet.reinitialiser')}>Réinitialiser tout</button>
        <p className="hint">Glisse un point pour l'ajuster, un côté pour déplacer ses deux extrémités, l'intérieur d'une forme pour la déplacer en bloc (un clic simple sans glisser désélectionne). Double-clic sur un côté = ajouter un point. Double-clic sur un coin = figer/dégeler. Molette / pincement 2 doigts = zoom. Glissement 3 doigts = déplacer la vue. Rien ne peut sortir de la parcelle (sauf la parcelle elle-même).</p>
      </div>
    </aside>
  );
}
