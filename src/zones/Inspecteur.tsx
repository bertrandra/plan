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

import { useLayoutEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { champsVisibles } from '../ui/champs/types.js';
import type { ContexteChamps, Section } from '../ui/champs/types.js';
import type { Magasin } from '../app/magasin.js';
import { useCle, cleEtatEtObjets, cleCommandes } from './composants/abonnement.js';
import type { RegistreCommandes } from '../app/commandes.js';
import type { Inspecteur as ServiceInspecteur } from '../app/inspecteur.js';
import type { Tiroir } from '../app/tiroir.js';
import { EnteteFeuille } from './composants/Feuille.js';
import { ListeChamps, Tactile, aLaFrancaise } from './composants/Champs.js';
import { Icone } from './icones.js';
import { resumerChiffrage, euros } from '../ui/chiffrage.js';

export interface PropsInspecteur { magasin: Magasin; commandes: RegistreCommandes; inspecteur: ServiceInspecteur; tiroir?: Tiroir }

function SectionVue({ section, c, inspecteur, ouverte }: { section: Section; c: ContexteChamps; inspecteur: ServiceInspecteur; ouverte: boolean }) {
  const champs = champsVisibles(section, c);
  if (!champs.length) return null;
  // Le pli n'est pose qu'au montage, par la reference : React ne le reimpose pas a chaque rendu, le
  // pli de l'utilisateur survit donc aux rendus du plan et au passage d'un objet a l'autre tant que la
  // section reste montee. Une seule section est ouverte a la fois : ouvrir l'une replie les autres, et
  // une section montee pour l'objet suivant ne s'ouvre pas a cote de celle que l'utilisateur a laissee.
  return (
    <details className="inspecteurSection" data-section={section.id} data-famille={familleDe(section.id)}
      data-repliee={section.repliee ? '' : undefined}
      ref={(d) => { if (d && d.dataset.monte === undefined) { d.dataset.monte = ''; d.open = ouverte && !sectionsDu(d).some(x => x !== d && x.open); } }}
      onToggle={(e) => { if (e.target === e.currentTarget && e.currentTarget.open) replierLesAutres(e.currentTarget); }}>
      <summary>{section.titre}</summary>
      {section.explication && <p className="hint">{section.explication}</p>}
      <div className="champs">
        <ListeChamps champs={champs} c={c} inspecteur={inspecteur} />
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

/** La section ouverte par defaut : la premiere qui n'est pas repliee d'office (Prix, Parametres...). */
function premiereOuverte(sections: Section[], c: ContexteChamps): string | null {
  return sections.find(s => !s.repliee && champsVisibles(s, c).length)?.id ?? null;
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
  // La fourchette estimee, comme sous la table du BOM : la somme des prix reels ne couvre que les
  // lignes ou un prix existe, et la montrer seule ferait croire a un total.
  const prix = euros(r.bas) + ' – ' + euros(r.haut);
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
 * Les trois familles de sections, en commande segmentee (maquette Inspecteur, 2.1.1) : l'objet, sa
 * geometrie, sa construction. Au doigt, une seule famille se montre a la fois. Les sections des
 * autres restent MONTEES (masquees par la feuille de style) : un champ ne disparait jamais selon la
 * classe, et un brouillon en cours survit au changement de famille.
 */
export type Famille = 'objet' | 'geometrie' | 'construction';
const FAMILLES: { id: Famille; libelle: string }[] = [
  { id: 'objet', libelle: 'Objet' },
  { id: 'geometrie', libelle: 'Géométrie' },
  { id: 'construction', libelle: 'Construction' }
];
const SECTIONS_GEOMETRIE = new Set(['cotes', 'coins']);
// « Façades et toit » decrit la construction d'un batiment, comme les sections d'une terrasse. Le
// metrage, les prix et l'optimisation d'un ouvrage sont des resultats : ils sont au tiroir (Z6).
const SECTIONS_CONSTRUCTION = new Set(['implantation', 'fondation', 'appuis', 'structure', 'lames', 'finitions', 'parametres', 'releve', 'pergola',
  'piscine', 'profondeursPiscine', 'abordsPiscine', 'equipementsPiscine', 'securitePiscine', 'noteCalcul', 'cloture', 'portails']);

export function familleDe(idSection: string): Famille {
  if (SECTIONS_GEOMETRIE.has(idSection)) return 'geometrie';
  if (SECTIONS_CONSTRUCTION.has(idSection)) return 'construction';
  return 'objet';
}

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
  // Passer a un objet qui n'a pas la section laissee ouverte (une terrasse, puis un batiment) : sa
  // premiere section s'ouvre, plutot qu'une colonne de titres tous replies.
  const cle = inspecteur.objet()?.key ?? null;
  const clePrecedente = useRef(cle);
  useLayoutEffect(() => {
    if (clePrecedente.current === cle) return;
    clePrecedente.current = cle;
    const sections = [...(panneau.current?.querySelectorAll<HTMLDetailsElement>('details.inspecteurSection') ?? [])];
    if (sections.some(d => d.open)) return;
    const premiere = sections.find(d => d.dataset.repliee === undefined);
    if (premiere) premiere.open = true;
  }, [cle]);
  // Sur telephone, l'inspecteur est une feuille : il n'a pas de repli, la feuille se ferme.
  const ouvert = compact || ouvertStore;
  const obj = inspecteur.objet();
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
            <p className="hint" style={{ padding: '0 10px' }}>{compact ? 'Touchez un objet sur le plan, ou choisissez-le dans Objets, pour l\'éditer.' : 'Clique un objet sur le plan ou dans l\'explorateur pour l\'éditer.'}</p>
            <div className="inspecteurPied">
              <BoutonPied commandes={commandes} id="projet.reinitialiser" libelle="Réinitialiser tout" />
              <RefusPied commandes={commandes} ids={['projet.reinitialiser']} tactile={tactile} />
            </div>
          </div>
        </aside>
      </Tactile.Provider>
    );
  }
  const c = inspecteur.contexte(obj);
  const sections = inspecteur.sections(c);
  const pied = (
    <div className="inspecteurPied">
      <BoutonPied commandes={commandes} id="objet.positionInitiale" libelle="Réinitialiser la position" />
      <BoutonPied commandes={commandes} id="projet.reinitialiser" libelle="Réinitialiser tout" />
      <RefusPied commandes={commandes} ids={['objet.positionInitiale', 'projet.reinitialiser']} tactile={tactile} />
      <p className="hint">{tactile
        ? 'Glissez un point pour l\'ajuster, un côté pour déplacer ses deux extrémités, l\'intérieur d\'une forme pour la déplacer. Double toucher sur un côté = ajouter un point ; sur un coin = figer ou dégeler. Pincer = zoom. Trois doigts = déplacer la vue. Rien ne peut sortir de la parcelle (sauf la parcelle elle-même).'
        : 'Glisse un point pour l\'ajuster, un côté pour déplacer ses deux extrémités, l\'intérieur d\'une forme pour la déplacer en bloc (un clic simple sans glisser désélectionne). Double-clic sur un côté = ajouter un point. Double-clic sur un coin = figer/dégeler. Molette / pincement 2 doigts = zoom. Glissement 3 doigts = déplacer la vue. Rien ne peut sortir de la parcelle (sauf la parcelle elle-même).'}</p>
    </div>
  );
  const ouverteParDefaut = premiereOuverte(sections, c);
  const corps = sections.map(s => <SectionVue key={s.id} section={s} c={c} inspecteur={inspecteur} ouverte={s.id === ouverteParDefaut} />);
  const presentes = FAMILLES.map(f => f.id).filter(f => sections.some(s => familleDe(s.id) === f && champsVisibles(s, c).length));
  // La famille choisie peut manquer a l'objet suivant (une terrasse, puis un arbre) : on revient a la premiere.
  const active = presentes.includes(famille) ? famille : (presentes[0] ?? 'objet');
  const filtre = tactile && presentes.length > 1 ? active : undefined;
  const chiffrage = tactile && tiroir ? <BandeauChiffrage c={c} ouvrir={ouvrirChiffrage} /> : null;

  // Un seul arbre pour les trois classes : tourner un telephone (compact → moyen) ne demonte aucun
  // champ, et un brouillon en cours survit (point 39 de la liste de fumee). Seuls l'entete et les
  // pastilles de saut changent.
  const entete = compact
    ? <EnteteFeuille magasin={magasin} titre={obj.name} sousTitre={aLaFrancaise(inspecteur.titre(c))}
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
      <aside ref={panneau} className="inspecteurPanneau" aria-label={compact ? 'Propriétés' : 'Inspecteur'} data-famille-active={filtre}>
        {entete}
        {tactile ? <Familles presentes={presentes} active={active} choisir={choisirFamille} /> : null}
        <div className={compact ? 'corpsFeuille' : 'corpsInspecteur'}>{corps}{pied}</div>
        {chiffrage}
      </aside>
    </Tactile.Provider>
  );
}
