// Z5, l'inspecteur (spec-ihm-zones §4.5) : les proprietes de ce qui est selectionne.
//
// Etape 4 de la reconstruction : il remplace l'onglet Édition du panneau — le panneau d'attributs
// et le configurateur de terrasse. Il ne connait aucun champ par son nom : il recoit des
// descripteurs (ui/champs/) et les rend, un composant par type de champ, dans des sections
// repliables. Ecrire, c'est demander a l'inspecteur (app/inspecteur.ts), qui sait ce qui doit
// suivre. Les champs texte et nombre gardent leur focus d'un rendu a l'autre parce que React garde
// leurs noeuds : c'est ce qui, en DOM reconstruit, obligeait a des mises a jour ciblees partout.
//
// Les champs eux-memes (un composant par type, leur forme tactile, les plis) sont dans
// composants/Champs.tsx, que le tiroir, les dialogues et les reglages 3D rendent aussi. La presence
// d'un champ ne depend jamais de la classe ; sa forme, si (tests/unit/zones/inspecteur-champs).
// Sur telephone, l'inspecteur est la feuille Proprietes ; sur tablette, un panneau flottant.

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { champsVisibles, reglagesAvancesMasques, sectionDArrivee } from '../ui/champs/types.js';
import { familleDeSection, type Famille } from '../ui/champs/sections.js';
import { chercherReglages, RESULTATS_MAX, type ReglageTrouve } from '../ui/champs/recherche.js';
import type { ContexteChamps, Section } from '../ui/champs/types.js';
import type { Magasin } from '../app/magasin.js';
import { useCle, cleEtatEtObjets, cleCommandes } from './composants/abonnement.js';
import type { RegistreCommandes } from '../app/commandes.js';
import type { Inspecteur as ServiceInspecteur } from '../app/inspecteur.js';
import { prendreSectionDemandee } from '../app/inspecteur.js';
import type { Tiroir } from '../app/tiroir.js';
import { EnteteFeuille } from './composants/Feuille.js';
import { ListeChamps, Tactile, aLaFrancaise } from './composants/Champs.js';
import { Icone } from './icones.js';
import { resumerChiffrage, euros } from '../ui/chiffrage.js';

export interface PropsInspecteur { magasin: Magasin; commandes: RegistreCommandes; inspecteur: ServiceInspecteur; tiroir?: Tiroir }

/**
 * Le rappel des reglages que le mode simple cache (audit de l'inspecteur, decision B1) : leur nombre, et de quoi les montrer. Le
 * bouton allume le mode expert, la meme preference de l'appareil que la case du menu Affichage (ni Ctrl+Z, ni « projet modifie »,
 * permise en lecture seule) : une fois allume, plus rien n'est cache et la ligne disparait ; il s'eteint au menu Affichage.
 */
function ReglagesAvances({ nombre, quoi, montrer }: { nombre: number; quoi?: string; montrer: () => void }) {
  if (nombre <= 0) return null;
  return (
    <p className="reglagesAvances" data-controle="inspecteur.reglagesAvances">
      <span>{(quoi ? quoi + ' : ' : '') + nombre + (nombre > 1 ? ' réglages avancés' : ' réglage avancé')}</span>
      <button type="button" className="secondary small" title="Montrer les réglages avancés : allume le mode expert, qui s’éteint au menu Affichage" onClick={montrer}>Mode expert</button>
    </p>
  );
}

function SectionVue({ section, c, inspecteur, ouverte, montrerAvances }: { section: Section; c: ContexteChamps; inspecteur: ServiceInspecteur; ouverte: boolean; montrerAvances: () => void }) {
  const champs = champsVisibles(section, c);
  if (!champs.length) return null;
  // Le pli n'est pose qu'au montage, par la reference : React ne le reimpose pas a chaque rendu, le
  // pli de l'utilisateur survit donc aux rendus du plan et au passage d'un objet a l'autre tant que la
  // section reste montee. Une seule section est ouverte a la fois : ouvrir l'une replie les autres, et
  // une section montee pour l'objet suivant ne s'ouvre pas a cote de celle que l'utilisateur a laissee.
  return (
    <details className="inspecteurSection" data-section={section.id} data-famille={familleDeSection(section.id)}
      data-repliee={section.repliee ? '' : undefined}
      ref={(d) => { if (d && d.dataset.monte === undefined) { d.dataset.monte = ''; d.open = ouverte && !sectionsDu(d).some(x => x !== d && x.open); } }}
      onToggle={(e) => { if (e.target === e.currentTarget && e.currentTarget.open) replierLesAutres(e.currentTarget); }}>
      <summary>{section.titre}</summary>
      {section.explication && <p className="hint">{section.explication}</p>}
      <div className="champs">
        <ListeChamps champs={champs} c={c} inspecteur={inspecteur} />
        <ReglagesAvances nombre={reglagesAvancesMasques(section, c)} montrer={montrerAvances} />
      </div>
    </details>
  );
}

const sectionsDu = (el: Element | null | undefined): HTMLDetailsElement[] =>
  [...(el?.closest('.inspecteurPanneau')?.querySelectorAll<HTMLDetailsElement>('details.inspecteurSection') ?? [])];

/**
 * Une section ouverte replie les autres : l'inspecteur montre une etape a la fois, sans les
 * longues listes de champs empilees qu'il fallait faire defiler pour trouver la suivante.
 */
function replierLesAutres(ouverte: HTMLDetailsElement): void {
  sectionsDu(ouverte).forEach(d => { if (d !== ouverte && d.open) d.open = false; });
}

/** Un clic sur le titre replie la section ouverte, ou ouvre la premiere quand toutes sont repliees. */
function basculerSections(e: React.SyntheticEvent<HTMLElement>): void {
  const sections = sectionsDu(e.currentTarget);
  if (sections.some(s => s.open)) { sections.forEach(s => { s.open = false; }); return; }
  const premiere = sections.find(s => s.dataset.repliee === undefined) ?? sections[0];
  if (premiere) premiere.open = true;
}

/** La poignee de repli, a droite de l'en-tete ; repliee, la zone ne montre qu'elle. */
function Pli({ ouvert, inspecteur }: { ouvert: boolean; inspecteur: ServiceInspecteur }) {
  return (
    <button type="button" data-controle="inspecteur.replier" className="inspecteurPli" title={ouvert ? 'Replier l\'inspecteur' : 'Déplier l\'inspecteur'} aria-expanded={ouvert}
      onClick={(e) => { e.stopPropagation(); inspecteur.basculerOuverture(); }}>
      {ouvert ? '›' : '‹'}
    </button>
  );
}

/**
 * Un bouton du pied de l'inspecteur : il lit l'etat de sa commande, comme la palette et les menus.
 * Grise et explique un refus de droit (lecture seule) au lieu d'un clic refuse sans un mot ;
 * efface quand l'organisation n'a pas la fonction.
 */
function BoutonPied({ commandes, id, libelle }: { commandes: RegistreCommandes; id: string; libelle: string }) {
  const etat = commandes.etat(id);
  if (!etat.utilisable && etat.raison === 'capacite') return null;
  const refus = !etat.utilisable && 'message' in etat ? etat.message : undefined;
  return (
    <button data-commande={id} type="button" className="secondary small" disabled={!etat.utilisable} title={refus}
      onClick={(e) => { commandes.executer(id, e.currentTarget); }}>{libelle}</button>
  );
}

/** Au doigt, l'infobulle n'existe pas : la raison d'un refus s'ecrit sous les boutons (§8). */
function RefusPied({ commandes, ids, tactile }: { commandes: RegistreCommandes; ids: string[]; tactile: boolean }) {
  if (!tactile) return null;
  const messages = [...new Set(ids.map(id => commandes.etat(id)).flatMap(e => !e.utilisable && e.raison !== 'capacite' && 'message' in e ? [e.message] : []))];
  return messages.length ? <p className="hint refusPied">{messages.join(' ')}</p> : null;
}

/** Le resume du chiffrage, en pied de l'inspecteur d'une terrasse : la boucle reglage → prix (§6.5). */
function BandeauChiffrage({ c, ouvrir }: { c: ContexteChamps; ouvrir: () => void }) {
  const r = resumerChiffrage(c.obj, c.objets);
  if (!r) return null;
  // Le total retenu, comme au pied de la table du BOM (audit UX de la 5.45.0, constat 5).
  const prix = euros(r.retenu) + ' HT';
  return (
    <button type="button" className="bandeauChiffrage" data-controle="inspecteur.chiffrage" onClick={ouvrir}>
      <span className="bandeauChiffrageTextes">
        <span className="bandeauChiffrageTitre">Chiffrage recalculé</span>
        <span className="bandeauChiffrageValeurs">{r.appuis} {r.natureAppuis} · {Math.round(r.lamesMl)} ml de lames · {prix}</span>
      </span>
      <Icone nom="chevronDroite" taille={20} />
    </button>
  );
}

/**
 * Les trois familles de sections, en commande segmentee (maquette Inspecteur, 2.1.1). Au doigt, une seule famille se montre a la
 * fois. Les sections des autres restent MONTEES (masquees par la feuille de style) : un champ ne disparait jamais selon la classe,
 * et un brouillon en cours survit au changement de famille.
 *
 * Une regle unique dit ou va une section (`familleDeSection`, ui/champs/sections.ts ; audit de l'inspecteur, decision B3) : ce qui
 * est propre a l'ouvrage est toujours sous « Réglages », le premier onglet, celui sur lequel on arrive quand l'objet a une section
 * a lui. « Relief » et « Fenêtres (3D) », rangees sous Objet, et la cloture et les portails d'une parcelle l'ont rejoint : sous
 * « Construction », rien n'annoncait la cloture d'un terrain (d'ou son passage sous Objet a la 5.38) ; « Réglages » le dit, et
 * l'outil « Clôture, portail » comme l'arrivee sur une parcelle cloturee y menent.
 */
const FAMILLES: { id: Famille; libelle: string }[] = [
  { id: 'reglages', libelle: 'Réglages' },
  { id: 'objet', libelle: 'Objet' },
  { id: 'geometrie', libelle: 'Géométrie' }
];

function Familles({ presentes, active, choisir }: { presentes: Famille[]; active: Famille; choisir: (f: Famille) => void }) {
  if (presentes.length < 2) return null;
  return (
    <div className="famillesSections segmente" role="tablist" aria-label="Sections">
      {FAMILLES.filter(f => presentes.includes(f.id)).map(f => (
        <button key={f.id} type="button" role="tab" data-famille={f.id} data-controle={'inspecteur.famille.' + f.id} aria-selected={f.id === active} className={f.id === active ? 'actif' : ''}
          onClick={(e) => {
            choisir(f.id);
            // Une famille dont toutes les sections sont repliees (Geometrie) s'ouvrirait sur trois
            // titres : on deplie la premiere, le reste garde le pli de l'utilisateur.
            const sections = [...(e.currentTarget.closest('.inspecteurPanneau')?.querySelectorAll<HTMLDetailsElement>('details.inspecteurSection[data-famille="' + f.id + '"]') ?? [])];
            const premiere = sections[0];
            if (premiere && !sections.some(d => d.open)) premiere.open = true;
          }}>{f.libelle}</button>
      ))}
    </div>
  );
}

/**
 * « Chercher un réglage » (audit de l'inspecteur, decision B6) : un champ en tete du panneau, qui trouve un reglage de l'objet par son
 * libelle ou son aide, sans accents ni majuscules, et dit sa section. Un reglage que le mode simple cache se trouve aussi, marque
 * « avancé » : y aller allume le mode expert, comme le bouton du pied d'une section. Choisir un resultat ouvre sa section (et son
 * onglet, au doigt), deplie son pli, fait defiler jusqu'a lui et le met en evidence ; la recherche s'efface. Un reglage d'interface :
 * ni Ctrl+Z, ni « projet modifié ».
 */
function Recherche({ sections, c, aller }: { sections: Section[]; c: ContexteChamps; aller: (r: ReglageTrouve) => void }) {
  // La recherche appartient a l'objet sur lequel elle a ete tapee : passer a un autre objet la vide.
  const [saisie, saisir] = useState<{ objet: string; texte: string }>({ objet: c.obj.key, texte: '' });
  const texte = saisie.objet === c.obj.key ? saisie.texte : '';
  const idListe = useId();
  const liste = useRef<HTMLUListElement>(null);
  const tous = texte ? chercherReglages(sections, c, texte) : [];
  const montres = tous.slice(0, RESULTATS_MAX);
  const choisir = (r: ReglageTrouve) => { saisir({ objet: c.obj.key, texte: '' }); aller(r); };
  const etat = !texte.trim() ? '' : texte.trim().length < 2 ? 'Tapez au moins deux lettres.'
    : !tous.length ? 'Aucun réglage de cet objet ne porte ce nom.'
    : tous.length > montres.length ? montres.length + ' réglages sur ' + tous.length + ' : précisez la recherche.'
    : tous.length + (tous.length > 1 ? ' réglages' : ' réglage');
  return (
    <div className="rechercheReglage" role="search">
      <input type="search" data-controle="inspecteur.recherche" placeholder="Chercher un réglage" aria-label="Chercher un réglage" aria-controls={montres.length ? idListe : undefined}
        autoComplete="off" spellCheck={false} value={texte}
        onChange={(e) => saisir({ objet: c.obj.key, texte: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && texte) { e.preventDefault(); e.stopPropagation(); saisir({ objet: c.obj.key, texte: '' }); }
          if (e.key === 'Enter' && montres[0]) { e.preventDefault(); choisir(montres[0]); }
          if (e.key === 'ArrowDown' && montres.length) { e.preventDefault(); liste.current?.querySelector('button')?.focus(); }
        }} />
      {etat && <p className="hint etatRecherche" role="status">{etat}</p>}
      {montres.length > 0 && (
        <ul className="resultatsRecherche" id={idListe} ref={liste} aria-label="Réglages trouvés"
          onKeyDown={(e) => {
            const boutons = [...(liste.current?.querySelectorAll('button') ?? [])];
            const i = boutons.indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === 'ArrowDown' && i >= 0) { e.preventDefault(); boutons[Math.min(boutons.length - 1, i + 1)]?.focus(); }
            if (e.key === 'ArrowUp' && i >= 0) { e.preventDefault(); if (i === 0) (liste.current?.parentElement?.querySelector('input') as HTMLInputElement | null)?.focus(); else boutons[i - 1]?.focus(); }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); saisir({ objet: c.obj.key, texte: '' }); }
          }}>
          {montres.map((r) => (
            <li key={r.section + '/' + r.cle}>
              <button type="button" data-controle="inspecteur.resultatRecherche" data-section={r.section} data-cle-cible={r.cle} onClick={() => choisir(r)}
                title={r.avance ? 'Réglage avancé : y aller allume le mode expert, qui s’éteint au menu Affichage' : undefined}>
                <span className="libelleTrouve">{r.libelle}</span>
                <span className="ouTrouve">{r.titreSection}{r.avance ? ' · avancé' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Aller au reglage choisi dans la recherche (decision B6) : sa section s'ouvre seule, son onglet devient celui qu'on montre, son pli
 * se deplie ; puis, une fois l'onglet montre, le panneau defile jusqu'a lui, le met en evidence, et au bureau lui donne le focus
 * (au doigt, le focus ouvrirait le clavier sur un champ qu'on voulait seulement voir). Un reglage avance attend un rendu ou deux
 * que le mode expert le monte.
 */
function useAllerAuReglage(panneau: React.RefObject<HTMLElement | null>, tactile: boolean, magasin: Magasin, choisirFamille: (f: Famille) => void): (r: ReglageTrouve) => void {
  /** Le reglage choisi, que le prochain rendu ouvre. */
  const cible = useRef<{ section: string; cle: string; essais: number } | null>(null);
  const [, relire] = useState(0);
  useLayoutEffect(() => {
    const voulue = cible.current;
    if (!voulue || !panneau.current) return;
    const details = panneau.current.querySelector<HTMLDetailsElement>('details.inspecteurSection[data-section="' + voulue.section + '"]');
    const ligne = details?.querySelector<HTMLElement>('[data-cle="' + voulue.cle + '"]');
    if (!details || !ligne) { if (++voulue.essais > 3) cible.current = null; return; }
    cible.current = null;
    sectionsDu(details).forEach(d => { d.open = d === details; });
    const pli = ligne.closest<HTMLDetailsElement>('details.plichamps');
    if (pli) pli.open = true;
    choisirFamille(familleDeSection(voulue.section));
    requestAnimationFrame(() => {
      ligne.scrollIntoView?.({ block: 'center' });
      ligne.classList.add('champTrouve');
      window.setTimeout(() => ligne.classList.remove('champTrouve'), 2400);
      if (!tactile) ligne.querySelector<HTMLElement>('input:not([type=range]):not([type=hidden]), select, textarea, button:not(.aideBouton):not(.pasBouton)')?.focus({ preventScroll: true });
    });
  });
  return (r) => {
    cible.current = { section: r.section, cle: r.cle, essais: 0 };
    if (r.avance) magasin.definirOption('modeExpert', true);
    relire(n => n + 1);
  };
}

/**
 * Au telephone, la feuille s'ouvre a mi-hauteur (decision B8) ; un champ qui appelle le clavier la fait monter en plein ecran, sans
 * quoi le clavier couvrirait le champ et la moitie de feuille qui reste. Les − et +, le curseur, les choix et les cases ne
 * l'appellent pas : avec eux, la feuille reste a mi-hauteur et le plan suit au-dessus.
 */
function monterPourLeClavierDe(magasin: Magasin, cible: EventTarget): void {
  if (magasin.store.getState().hauteurFeuille === 'plein') return;
  const clavier = cible instanceof HTMLTextAreaElement || (cible instanceof HTMLInputElement && ['text', 'search', 'number', 'email', 'tel', 'url', ''].includes(cible.type));
  if (clavier) magasin.definirHauteurFeuille('plein');
}

export function Inspecteur({ magasin, commandes, inspecteur, tiroir }: PropsInspecteur) {
  // Le plan (les champs lisent l'objet choisi et ceux qui l'entourent), l'etat des outils, et les commandes que ses boutons lient ;
  // gele tant que l'inspecteur est cache. Ses ecritures touchent leur objet (app/inspecteur.ts).
  useCle(magasin, 'inspecteur', (s) => cleEtatEtObjets(s) + cleCommandes(s, commandes), 'inspecteur');
  const ouvertStore = useStore(magasin.store, (s) => s.inspecteurOuvert);
  const classe = useStore(magasin.store, (s) => s.classe);
  const compact = classe === 'compact';
  const tactile = classe !== 'large';
  const [famille, choisirFamille] = useState<Famille>('objet');
  const panneau = useRef<HTMLElement>(null);
  // Sur telephone, l'inspecteur est une feuille : il n'a pas de repli, la feuille se ferme.
  const ouvert = compact || ouvertStore;
  const obj = inspecteur.objet();
  const c = ouvert && obj ? inspecteur.contexte(obj) : null;
  const sections = c ? inspecteur.sections(c) : [];
  // A la selection, la section propre a l'objet s'ouvre (les lames d'une terrasse, le parasol, les facades d'un batiment), plus
  // seulement « Objet » ; au doigt, on arrive sur l'onglet qui la porte (audit de l'inspecteur, lot A6 : 15 % des reglages se
  // voyaient sans rien deplier). La section que la personne a ouverte elle-meme reste ouverte d'un objet a l'autre tant que le
  // suivant la porte : on la reconnait a ce qu'elle n'est pas celle que l'inspecteur avait ouverte pour l'objet d'avant.
  const arrivee = c ? sectionDArrivee(sections, c) : null;
  const cle = c && obj ? obj.key : null;
  const vu = useRef<{ cle: string | null | undefined; arrivee: string | null }>({ cle: undefined, arrivee: null });
  useLayoutEffect(() => {
    const avant = vu.current;
    vu.current = { cle, arrivee };
    if (avant.cle === cle) return;
    const montees = [...(panneau.current?.querySelectorAll<HTMLDetailsElement>('details.inspecteurSection') ?? [])];
    const laissee = montees.find(d => d.open);
    const cible = laissee && laissee.dataset.section !== avant.arrivee ? laissee
      : montees.find(d => d.dataset.section === arrivee) ?? montees.find(d => d.dataset.repliee === undefined);
    if (!cible) return;
    montees.forEach(d => { if (d !== cible && d.open) d.open = false; });
    if (!cible.open) cible.open = true;
    choisirFamille(familleDeSection(cible.dataset.section ?? ''));
  });
  // Une commande a demande une section (« Clôture et portails ») : elle s'ouvre, les autres se replient, et au doigt sa famille
  // devient celle qu'on montre. Prise seulement quand la section est montee : repliee ou sans objet, la demande attend.
  // Declaree apres l'arrivee sur l'objet : a la selection de la parcelle, c'est la section demandee qui l'emporte.
  useLayoutEffect(() => {
    const montees = [...(panneau.current?.querySelectorAll<HTMLDetailsElement>('details.inspecteurSection') ?? [])];
    if (!montees.length) return;
    const id = prendreSectionDemandee();
    const voulue = id ? montees.find(d => d.dataset.section === id) : undefined;
    if (!voulue) return;
    montees.forEach(d => { d.open = d === voulue; });
    choisirFamille(familleDeSection(id ?? ''));
    voulue.scrollIntoView?.({ block: 'nearest' });
  });
  const allerAuReglage = useAllerAuReglage(panneau, tactile, magasin, choisirFamille);
  const monterPourLeClavier = (e: React.FocusEvent<HTMLElement>) => { if (compact) monterPourLeClavierDe(magasin, e.target); };
  const ouvrirChiffrage = () => {
    if (!tiroir) return;
    tiroir.activer('bom');
    if (compact) magasin.definirFeuille('resultats');
    else tiroir.definirHauteur('mi');
  };
  if (!ouvert) {
    return (
      <aside className="inspecteurPanneau replie" aria-label="Inspecteur">
        <div className="inspecteurEntete"><Pli ouvert={false} inspecteur={inspecteur} /></div>
      </aside>
    );
  }
  if (!obj) {
    return (
      <Tactile.Provider value={tactile}>
        <aside className="inspecteurPanneau" aria-label="Inspecteur">
          {compact
            ? <EnteteFeuille magasin={magasin} titre="Propriétés" sousTitre="Aucune sélection" />
            : <div className="inspecteurEntete"><span className="inspecteurTitre">Aucune sélection</span><Pli ouvert inspecteur={inspecteur} /></div>}
          <div className={compact ? 'corpsFeuille' : undefined}>
            <p className="hint" style={{ padding: '0 10px' }}>{compact ? 'Touchez un objet sur le plan, ou choisissez-le dans Objets, pour l\'éditer.' : 'Cliquez un objet sur le plan ou dans l\'explorateur pour l\'éditer.'}</p>
            <div className="inspecteurPied">
              <BoutonPied commandes={commandes} id="projet.reinitialiser" libelle="Réinitialiser tout" />
              <RefusPied commandes={commandes} ids={['projet.reinitialiser']} tactile={tactile} />
            </div>
          </div>
        </aside>
      </Tactile.Provider>
    );
  }
  if (!c) return null;
  const montrerAvances = () => magasin.definirOption('modeExpert', true);
  const corps = sections.map(s => <SectionVue key={s.id} section={s} c={c} inspecteur={inspecteur} ouverte={s.id === arrivee} montrerAvances={montrerAvances} />);
  // Une section entiere du mode expert (« Paramètres de calcul » d'une terrasse) n'a pas de pied ou le dire : le pied du panneau le dit.
  const sectionsAvancees = sections.filter(s => s.expert && reglagesAvancesMasques(s, c) > 0);
  const pied = (
    <div className="inspecteurPied">
      {/* « Réinitialiser la position » est un outil de la palette (rail, feuille Outils) : un geste n'existe qu'a un endroit. */}
      <BoutonPied commandes={commandes} id="projet.reinitialiser" libelle="Réinitialiser tout" />
      <RefusPied commandes={commandes} ids={['projet.reinitialiser']} tactile={tactile} />
      {sectionsAvancees.map(s => <ReglagesAvances key={s.id} quoi={s.titre} nombre={reglagesAvancesMasques(s, c)} montrer={montrerAvances} />)}
      {/* Le rappel des gestes du plan, replie : plus de 400 caracteres sous chaque objet, qu'on ne lit qu'une fois (lot A5). */}
      <details className="plichamps gestesPlan" data-pli="gestes">
        <summary>Gestes sur le plan</summary>
        <p className="hint">{tactile
        ? 'Touchez un objet pour le choisir, puis faites-le glisser. Glissez ailleurs pour vous déplacer. Sur l\'objet choisi, glissez un point pour l\'ajuster, un côté pour déplacer ses deux extrémités. Double toucher sur un côté = ajouter un point ; sur un coin = figer ou dégeler. Pincer = zoom ; deux ou trois doigts = déplacer la vue. Rien ne peut sortir de la parcelle (sauf la parcelle elle-même).'
        : 'Cliquez un objet pour le choisir, puis faites-le glisser. Glissez ailleurs pour vous déplacer (ou avec le bouton du milieu, ou la barre d\'espace tenue). Sur l\'objet choisi, glissez un point pour l\'ajuster, un côté pour déplacer ses deux extrémités ; un clic simple sans glisser le désélectionne. Double-clic sur un côté = ajouter un point. Double-clic sur un coin = figer/dégeler. Molette / pincement 2 doigts = zoom. Rien ne peut sortir de la parcelle (sauf la parcelle elle-même).'}</p>
      </details>
    </div>
  );
  const presentes = FAMILLES.map(f => f.id).filter(f => sections.some(s => familleDeSection(s.id) === f && champsVisibles(s, c).length));
  // La famille choisie peut manquer a l'objet suivant (une terrasse, puis un arbre) : on revient a la premiere.
  const active = presentes.includes(famille) ? famille : (presentes[0] ?? 'objet');
  const filtre = tactile && presentes.length > 1 ? active : undefined;
  const chiffrage = tactile && tiroir ? <BandeauChiffrage c={c} ouvrir={ouvrirChiffrage} /> : null;

  // Un seul arbre pour les trois classes : tourner un telephone (compact → moyen) ne demonte aucun
  // champ, et un brouillon en cours survit (point 39 de la liste de fumee). Seuls l'entete et les
  // pastilles de saut changent.
  const entete = compact
    ? <EnteteFeuille magasin={magasin} titre={obj.name} sousTitre={aLaFrancaise(inspecteur.sousTitre ? inspecteur.sousTitre(c) : inspecteur.titre(c))}
        actions={<button type="button" className="boutonIcone" id="attrTitle" data-controle="inspecteur.replierSections" aria-label="Replier la section ouverte, ou ouvrir la première" title="Replier la section ouverte, ou ouvrir la première" onClick={basculerSections}><Icone nom="chevronBas" /></button>} />
    : <div className="inspecteurEntete">
        <span className="inspecteurTitre" id="attrTitle" data-controle="inspecteur.replierSections" role="button" tabIndex={0} title="Replier la section ouverte, ou ouvrir la première"
          onClick={basculerSections} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); basculerSections(e); } }}>
          {tactile ? aLaFrancaise(inspecteur.titre(c)) : inspecteur.titre(c)}
        </span>
        <Pli ouvert inspecteur={inspecteur} />
      </div>;
  return (
    <Tactile.Provider value={tactile}>
      <aside ref={panneau} className="inspecteurPanneau" aria-label={compact ? 'Propriétés' : 'Inspecteur'} data-famille-active={filtre} onFocus={monterPourLeClavier}>
        {entete}
        {tactile ? <Familles presentes={presentes} active={active} choisir={choisirFamille} /> : null}
        <div className={compact ? 'corpsFeuille' : 'corpsInspecteur'}><Recherche sections={sections} c={c} aller={allerAuReglage} />{corps}{pied}</div>
        {chiffrage}
      </aside>
    </Tactile.Provider>
  );
}
