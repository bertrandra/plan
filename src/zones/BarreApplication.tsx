// Z1, la barre d'application (spec-ihm-zones §4.1) : le projet, les menus, les vues, le titre.
//
// Etape 1 de la reconstruction : cette zone remplace `#projectBar`, `#modeBar` et le `<h1>`
// d'index.html. Etape 2 : elle gagne le menu Affichage. Etape 3 : le bouton Terrasse disparait, la
// terrasse etant un contexte du plan et non une vue (decision 4). Apres l'etape 6 : les menus
// Fichier, Exporter et Aide, qui vident le tiroir de ses onglets de reglages. Elle ne sait rien
// faire par elle-meme — chaque entree execute une commande du registre, le `<select>` demande au
// projet de s'ouvrir — et elle lit tout dans le magasin.
//
// Les reglages qui accompagnent une commande (echelle du PDF, cases des imports, opacites du
// fond) sont des champs non controles qui gardent leur identifiant d'autrefois : c'est par lui
// que la commande les lit au moment d'agir, et que `render/ortho.ts` les remet en accord.

import { partirSansQuestion } from '../shell/depart.js';
import { contexteCourant, sessionCourante, enAdmin, estAdministrateur, partageCourant, enEssai, ligneAdminCapacitesForcees } from '../app/acces.js';
import { dateLongue } from '../app/partage.js';
import { reglesLocalesDemandees } from '../app/ecouteurs/faitsLocaux.js';
import { BACKPROD_API_URL, vitrinePlateforme } from '../plateforme/config.js';
import { createContext, Fragment, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { ortho, NOMS_FOND, type CoucheOrtho } from '../render/ortho.js';
import { reliefDe, affichageRelief } from '../model/relief.js';
import { parcelleDuProjet } from '../model/fonctions.js';
import { voisinage3dDe } from '../model/voisinage3d.js';
import { ruesTracees } from '../model/rues.js';
import { partTrottoirs, couleursRues } from '../model/trottoirs.js';
import { sectionRues } from '../ui/champs/rues.js';
import { ListeChamps, Tactile, useServiceLocal } from './composants/Champs.js';
import type { Inspecteur } from '../app/inspecteur.js';
import { showConfirm, showToast, showErrBanner } from '../shell/dialogs.js';
import type { Magasin, OptionsCommandes } from '../app/magasin.js';
import type { RegistreCommandes } from '../app/commandes.js';
import type { Projet } from '../app/projet.js';
import type { Tiroir } from '../app/tiroir.js';
import type { Vue } from '../app/modes.js';
import type { EtatApp } from '../core/state.js';
import { lectureToits } from '../core/lectureToits.js';
import { LECTURE_MURS_EN_FOND } from '../app/toits/mursFond.js';
import { Icone } from './icones.js';
import { EnteteFeuille } from './composants/Feuille.js';
import { texteStatutCourt } from './statut.js';
import { useCle, useMagasinZone } from './composants/abonnement.js';
import { APP_VERSION, versionLongue } from '../model/version.js';
import { sessionToit } from '../app/toits/modeToit.js';
import { controleMontre } from '../app/modeExpert.js';
import { raccourcisAffiches } from '../app/clavier.js';

export interface PropsBarreApplication {
  magasin: Magasin;
  commandes: RegistreCommandes;
  /** Le projet ; la barre ne l'ouvre plus elle-meme (« Mes projets » le fait, lot 3), mais le garde pour ses menus a venir. */
  projet: Projet;
  tiroir: Tiroir;
  /** Le service qui ecrit les reglages des rues dessinees (ui/champs/rues.ts) sur la parcelle du projet, comme dans l'inspecteur. */
  inspecteur?: Inspecteur;
}

const VUES: [Vue, string, string, string][] = [
  ['plan', 'modePlanBtn', 'Plan', ''],
  ['vue3d', 'mode3dBtn', 'Vue 3D', 'Vue 3D du plan et de la terrasse courante'],
  ['visionneuse', 'glbViewerBtn', 'Visionneuse GLB', 'Relit le dernier fichier GLB exporte (menu Exporter), pour vérifier le fichier réel avant de le partager']
];
const COMMANDE_DE_VUE: Record<Vue, string> = { plan: 'vue.plan', vue3d: 'vue.3d', visionneuse: 'vue.visionneuse' };

/**
 * Referme le menu qui contient l'element : une entree choisie, le menu s'en va. Sur telephone, les
 * menus vivent dans la feuille Projet, qui se ferme aussi (l'evenement est ecoute par la barre).
 */
function fermer(e: React.SyntheticEvent<HTMLElement>): void {
  e.currentTarget.closest('details')?.removeAttribute('open');
  document.dispatchEvent(new CustomEvent('plan:entreeChoisie'));
}

interface PropsMenu { magasin: Magasin; commandes: RegistreCommandes }

// Un menu ferme ne se voit pas : ses entrees ne relisent pas l'etat de leur commande a chaque rendu du plan (celui des doublons
// cherche dans tout le plan), elles gardent le dernier lu et le relisent a l'ouverture. Le clic, lui, reverifie toujours
// (`commandes.executer`). Hors d'un menu, une entree relit a chaque rendu.
const MenuOuvert = createContext(true);

function Deroulant({ id, titre, children, pastille, onOuvrir }: { id: string; titre: string; children: ReactNode; pastille?: string | null; onOuvrir?: () => void }) {
  const [ouvert, poserOuvert] = useState(false);
  return (
    <details className="menu" id={id} onToggle={(e) => { poserOuvert(e.currentTarget.open); if (e.currentTarget.open) onOuvrir?.(); }}>
      {/* Une pastille, quand le menu a quelque chose a dire (l'avertissement de l'admin) : le mot est dans l'etiquette. */}
      <summary>{titre}{pastille && <span className="pastilleMenu" role="img" aria-label={pastille} />}</summary>
      <MenuOuvert.Provider value={ouvert}>{children}</MenuOuvert.Provider>
    </details>
  );
}

function useEtatCommande(commandes: RegistreCommandes, id: string): ReturnType<RegistreCommandes['etat']> {
  const ouvert = useContext(MenuOuvert);
  const lu = useRef<ReturnType<RegistreCommandes['etat']> | null>(null);
  // L'entree ne se redessine que si l'etat de sa commande change ; menu ferme, elle ne le relit pas. Sauf une commande encore
  // inconnue : declaree apres le premier rendu des zones (l'assistant), elle se relit jusqu'a ce qu'elle existe, sinon l'entree
  // garderait, menu ferme, un etat qui n'est pas le sien (une entree grisee la ou la commande disparait).
  const relire = ouvert || !lu.current || (!lu.current.utilisable && lu.current.raison === 'inconnue');
  useCle(useMagasinZone(), 'commande ' + id, () => (relire ? JSON.stringify(commandes.etat(id)) : 'ferme'));
  if (relire || !lu.current) lu.current = commandes.etat(id);
  return lu.current;
}

/** Une entree de menu qui execute une commande, grisee si la commande ne l'est pas. */
function Entree({ commandes, id, libelle, idDom, apres, raccourci }: { commandes: RegistreCommandes; id: string; libelle: string; idDom?: string; apres?: () => void; raccourci?: string }) {
  const c = commandes.obtenir(id);
  const etat = useEtatCommande(commandes, id);
  // Effacee plutot que grisee quand l'organisation n'a pas achete la fonction (spec §4.2).
  if (!etat.utilisable && etat.raison === 'capacite') return null;
  // Un quota atteint laisse l'entree cliquable : le clic dit la limite (app/limiteProjets.ts).
  const quota = !etat.utilisable && etat.raison === 'quota';
  const actif = etat.utilisable || quota;
  const refus = !etat.utilisable && 'message' in etat ? etat.message : null;
  return (
    <li role="menuitem">
      <button type="button" id={idDom} data-commande={id} disabled={!actif} data-limite={quota || undefined} title={refus || c?.description}
        onClick={(e) => { commandes.executer(id, e.currentTarget); if (apres) apres(); fermer(e); }}>
        <span className="coche" aria-hidden="true" />{libelle}
        {raccourci && <kbd>{raccourci}</kbd>}
      </button>
    </li>
  );
}

/**
 * Au doigt, l'infobulle n'existe pas : la raison d'un refus s'ecrit sous l'entree (une permission
 * manquante, ou ce qu'il faut faire d'abord). Rien sur bureau, ou l'infobulle la porte.
 */
function RefusAuDoigt({ commandes, id, tactile }: { commandes: RegistreCommandes; id: string; tactile: boolean }) {
  const etat = useEtatCommande(commandes, id);
  if (!tactile || etat.utilisable || etat.raison === 'capacite' || !('message' in etat)) return null;
  return <li className="refusMenu" role="note">{etat.message}</li>;
}

/** Une case a cocher de reglage, non controlee : la commande qui s'en sert la lit par son identifiant. */
/** Une case d'option dans un menu : elle regle la commande qui suit (app/controlesInterface.ts). */
/** Une option d'une commande du menu : le magasin la tient (`options`), la commande la lit la. */
type OptionCase = { [K in keyof OptionsCommandes]: OptionsCommandes[K] extends boolean ? K : never }[keyof OptionsCommandes];
function Case({ magasin, option, idDom, controle, libelle, titre }: { magasin: Magasin; option: OptionCase; idDom: string; controle: string; libelle: string; titre?: string }) {
  const coche = useStore(magasin.store, (s) => s.options[option]);
  return (
    <li className="menuCase" role="menuitemcheckbox" aria-checked={coche}>
      <label title={titre}><input type="checkbox" id={idDom} data-controle={controle} checked={coche} onChange={(e) => magasin.definirOption(option, e.target.checked)} />{libelle}</label>
    </li>
  );
}

/**
 * La case d'une option qui suit la commande qu'elle regle : effacee avec elle (une capacite manquante, le mode expert eteint), parce
 * qu'une option sans sa commande ne regle rien.
 */
function CaseDeCommande({ commandes, id, ...p }: Parameters<typeof Case>[0] & { commandes: RegistreCommandes; id: string }) {
  const etat = useEtatCommande(commandes, id);
  if (!etat.utilisable && etat.raison === 'capacite') return null;
  return <Case {...p} />;
}

/** L'echelle du PDF : un brouillon libre pendant la frappe, l'option ne retient qu'un entier positif. */
function EchellePdf({ magasin }: { magasin: Magasin }) {
  const echelle = useStore(magasin.store, (s) => s.options.echellePdf);
  return (
    <input type="number" id="pdfScaleInput" data-controle="export.option.echellePdf" defaultValue={echelle} min={1} step={1}
      onChange={(e) => { const v = parseInt(e.target.value, 10); if (v > 0) magasin.definirOption('echellePdf', v); }} />
  );
}

function MenuFichier({ magasin, commandes }: PropsMenu) {
  // La lecture des toits et des murs en tache de fond : le menu suit son etat sans attendre un rendu du plan.
  const toitsFond = useSyncExternalStore(lectureToits.abonner, lectureToits.progression);
  const p = useStore(magasin.store, (s) => s.projet);
  const tactile = useStore(magasin.store, (s) => s.classe) !== 'large';
  return (
    <Deroulant id="menuFichier" titre="Fichier">
      <ul role="menu">
        {/* Ramene a l'essentiel pour la personne ordinaire (lot 3 de la simplification) : le projet, la creation depuis une adresse,
            l'actualisation et l'audit. Ce qui repare ou affine un plan venu de l'IGN, et les formats techniques, viennent apres :
            le registre les efface tant que le mode expert est eteint (MODE_EXPERT, app/exposition.ts), avec leurs filets. */}
        {p.apiDisponible && commandes.obtenir('projet.mesProjets') && <Entree commandes={commandes} id="projet.mesProjets" libelle="Mes projets…" />}
        <Entree commandes={commandes} id="projet.depuisAdresse" libelle="Nouveau projet depuis une adresse…" />
        
        {p.apiDisponible && <Entree commandes={commandes} id="projet.enregistrer" libelle="Enregistrer" raccourci="Ctrl+S" />}
        {/* Une copie du plan sous un autre nom, ou le premier enregistrement d'un plan dessine sans adresse : un seul geste cree un
            projet, « Nouveau projet depuis une adresse… » (lot 3 de la simplification). */}
        {p.apiDisponible && <Entree commandes={commandes} id="projet.nouveau" libelle="Enregistrer sous…" />}
        {/* Une preference de l'appareil (app/enregistrementAuto.ts) : ni Ctrl+Z, ni « projet modifie », permise en lecture seule. */}
        {p.apiDisponible && <Case magasin={magasin} option="enregistrementAuto" idDom="chkEnregistrementAuto" controle="fichier.option.enregistrementAuto" libelle="Enregistrement automatique" titre="Enregistre le projet quelques secondes après chaque modification" />}
        {p.apiDisponible && commandes.obtenir('projet.partager') && <Entree commandes={commandes} id="projet.partager" libelle="Partager par un lien…" />}
        {p.apiDisponible && <RefusAuDoigt commandes={commandes} id="projet.partager" tactile={tactile} />}
        {p.apiDisponible && <Entree commandes={commandes} id="projet.supprimer" libelle="Supprimer le projet…" />}
        {p.apiDisponible && p.schemaEnRetard && <Entree commandes={commandes} id="projet.mettreAJourModele" libelle="Mettre à jour le modèle…" />}
        <li className="separateur" role="separator" />
        <Entree commandes={commandes} id="projet.actualiser" libelle="Actualiser le projet…" />
        {/* L'audit de la parcelle (MD/spec-audit.md §11) : la visite sur place, telephone en main. */}
        <Entree commandes={commandes} id="audit.parcelle" libelle="Auditer la parcelle…" />
        <RefusAuDoigt commandes={commandes} id="audit.parcelle" tactile={tactile} />
        <li className="separateur" role="separator" />
        {/* Mode expert : reparer ou affiner un plan venu de l'IGN, reprendre un audit fait ailleurs (l'administrateur pour un client, §15). */}
        <Entree commandes={commandes} id="projet.actualiserIgn" libelle="Actualiser depuis l'IGN…" />
        <Entree commandes={commandes} id="projet.toitsFond" libelle={(toitsFond?.etat === 'enCours' ? 'Suspendre' : 'Reprendre') + (LECTURE_MURS_EN_FOND ? ' la lecture des toits et des murs' : ' la lecture des toits')} />
        <Entree commandes={commandes} id="projet.supprimerVoisinage" libelle="Supprimer le voisinage…" />
        <Entree commandes={commandes} id="projet.doublons" libelle="Fusionner les doublons…" />
        <Entree commandes={commandes} id="audit.importerParcelle" libelle="Importer un audit de parcelle…" />
        <li className="separateur" role="separator" />
        <Entree commandes={commandes} id="fichier.importerSvg" libelle="Importer un SVG…" idDom="importSvgBtn" />
        <CaseDeCommande magasin={magasin} option="remplacerImportSvg" idDom="chkReplaceOnImport" controle="fichier.option.remplacerImportSvg" libelle="Supprimer les objets existants avant d'importer" commandes={commandes} id="fichier.importerSvg" />
        <Entree commandes={commandes} id="fichier.importerJson" libelle="Importer un projet (JSON)…" idDom="importJsonBtn" />
        <CaseDeCommande magasin={magasin} option="remplacerImportJson" idDom="chkJsonRemplace" controle="fichier.option.remplacerImportJson" libelle="Remplacer le plan actuel" titre="Décoché : les objets du fichier s'ajoutent au plan" commandes={commandes} id="fichier.importerJson" />
        <li className="separateur" role="separator" />
        <Entree commandes={commandes} id="fichier.exporterJson" libelle="Exporter le projet (JSON)" idDom="exportJsonBtn" />
        <CaseDeCommande magasin={magasin} option="exportSansParcelle" idDom="chkExportSansParcelle" controle="fichier.option.exportSansParcelle" libelle="Exporter sans la parcelle" titre="Retire la parcelle, les parcelles voisines, les mesures qui s'y appuient et la clôture : pour transmettre un aménagement sans divulguer la localisation" commandes={commandes} id="fichier.exporterJson" />
      </ul>
    </Deroulant>
  );
}

function MenuExporter({ magasin, commandes, tiroir }: PropsMenu & { tiroir: Tiroir }) {
  return (
    <Deroulant id="menuExporter" titre="Exporter">
      <ul role="menu">
        {/* Par usage, titres en petites capitales (audit UX de la 5.45.0, polissages) ; les reglages des exports (echelle du PDF,
            emprise des equipements) regroupes a part, en fin de menu, plutot qu'entre deux entrees. */}
        <li className="menuTitre" role="presentation">Pour le client</li>
        {/* Le devis d'abord : le document que le client recoit pour decider (dialogue : l'emetteur, le client, le numero). */}
        <Entree commandes={commandes} id="export.ouvrirDevis" libelle="Devis (PDF)…" idDom="devisBtn" />
        <Entree commandes={commandes} id="export.listeAchatPdf" libelle="Liste d’achat (PDF)" />
        <Entree commandes={commandes} id="export.listeAchatCsv" libelle="Liste d’achat (CSV)" />
        <Entree commandes={commandes} id="export.resume" libelle="Résumé à copier" apres={() => tiroir.activer('resume')} />
        <li className="menuTitre" role="presentation">Le plan</li>
        <Entree commandes={commandes} id="export.png" libelle="Image PNG du plan" idDom="exportPngBtn" />
        <Entree commandes={commandes} id="export.pdf" libelle="PDF du plan" idDom="exportPdfBtn" />
        <Entree commandes={commandes} id="export.svg" libelle="SVG" idDom="exportSvgBtn" />
        <Entree commandes={commandes} id="export.dxf" libelle="DXF" idDom="exportDxfBtn" />
        {/* Le projet pose sur une photo du jardin : l'entree mene au photomontage de la Vue 3D, ou son image s'enregistre. */}
        <Entree commandes={commandes} id="export.photomontage" libelle="Photomontage sur une photo…" />
        <li className="menuTitre" role="presentation">Dossiers</li>
        <Entree commandes={commandes} id="export.dossier" libelle="Dossier PDF des terrasses" idDom="dossierPdfBtn" />
        {/* Le dialogue de la declaration : qui declare, l'adresse, puis le cerfa 13703 et ses pieces. */}
        <Entree commandes={commandes} id="export.ouvrirDeclaration" libelle="Déclaration préalable…" idDom="declarationBtn" />
        <Entree commandes={commandes} id="export.dossierPiscine" libelle="Dossier mairie de la piscine (PDF)" idDom="dossierPiscineBtn" />
        <Entree commandes={commandes} id="export.glb" libelle="GLB (scène 3D)" idDom="exportGlbBtn" />
        <li className="separateur" role="separator" />
        <li className="menuTitre" role="presentation">Réglages des exports</li>
        <li className="menuReglage">
          <label title="L'échelle fixe la taille de la page : à 1/200, 1 m réel = 5 mm sur papier">Échelle du PDF du plan 1/<EchellePdf magasin={magasin} /></label>
        </li>
        <Case magasin={magasin} option="dossierEquipements" idDom="chkDossierEquipements" controle="export.option.dossierEquipements" libelle="Dossier : inclure l'emprise des équipements" titre="Spa, mobilier, parasol… : tout objet dont le centre tombe sur la terrasse" />
        <li className="menuAide">Les terrasses du dossier se cochent dans l'explorateur.</li>
      </ul>
    </Deroulant>
  );
}

/** Les bascules du menu Affichage : identifiant, libelle, cochee, visible. */
function basculesAffichage(etat: EtatApp, commandes: RegistreCommandes): [string, string, boolean, boolean][] {
  const aDuVoisinage = etat.objects.some((o) => o.voisinage);
  const relief = reliefDe(etat.objects);
  const parcelle = parcelleDuProjet(etat.objects);
  // Une bascule dont l'organisation n'a pas la capacite s'efface, comme toute entree de menu : le
  // fond orthophoto restait visible sans l'abonnement (spec-ihm-mobile, D8).
  return ([
    ['affichage.nord', 'Flèche Nord', etat.showNorth, true],
    ['affichage.grille', 'Grille', etat.grilleVisible, true],
    ['affichage.voisinage', 'Voisinage', etat.voisinageVisible, aDuVoisinage],
    // Le sol en relief (3D) et les courbes de niveau (plan), chacun sa bascule ; une fois le relief lu.
    ['affichage.relief', 'Relief', !!relief && affichageRelief(relief).sol3d, !!relief],
    ['affichage.courbes', 'Courbes de niveau', !!relief && affichageRelief(relief).courbes, !!relief],
    // Les rues dessinees a la largeur de leur chaussee (plan et Vue 3D), puis leur nom.
    ['affichage.chaussees', 'Rues', ruesTracees(parcelle), !!parcelle],
    ['affichage.rues', 'Noms des rues', !!parcelle && voisinage3dDe(parcelle).rues.afficher, !!parcelle],
    ['affichage.orthophoto', 'Fond IGN', ortho.actif, true],
    // La position GPS de l'appareil, suivie dans la Vue 3D : decochee par defaut, jamais enregistree.
    ['affichage.positionGps', 'Ma position (3D)', etat.positionGps, true]
  ] as [string, string, boolean, boolean][]).map(([id, l, c, v]) => [id, l, c, v && !commandes.effacee(id)]);
}

/**
 * Le choix du fond : photo aerienne ou Plan IGN, un seul a la fois (deux commandes, une coche). Efface avec la capacite du fond,
 * comme la bascule qu'il complete.
 */
export function ChoixFond({ commandes }: { commandes: RegistreCommandes }) {
  const choix: [string, CoucheOrtho][] = [['affichage.fondPhoto', 'photo'], ['affichage.fondPlan', 'plan']];
  if (choix.some(([id]) => commandes.effacee(id))) return null;
  return (
    <>
      <li className="menuTitre" role="presentation">Fond</li>
      {choix.map(([id, couche]) => {
        const choisi = ortho.actif && ortho.couche === couche;
        return (
          <li key={id} role="menuitemradio" aria-checked={choisi}>
            <button type="button" data-commande={id} disabled={!commandes.etat(id).utilisable} title={commandes.obtenir(id)?.description}
              onClick={(e) => { commandes.executer(id); fermer(e); }}>
              <span className="coche" aria-hidden="true">{choisi ? '✓' : ''}</span>{NOMS_FOND[couche]}
            </button>
          </li>
        );
      })}
    </>
  );
}

/**
 * Les reglages des rues dessinees, sous « Rues » cochee (ui/champs/rues.ts) : la part des trottoirs et les couleurs. Les memes
 * descripteurs et le meme service que l'inspecteur ; au doigt, leurs formes tactiles (curseur et commande segmentee de 44 px).
 */
function ReglagesRues({ inspecteur, magasin }: { inspecteur: Inspecteur; magasin: Magasin }) {
  const tactile = useStore(magasin.store, (s) => s.classe) !== 'large';
  const service = useServiceLocal(inspecteur);
  const parcelle = inspecteur.parcelle();
  const c = parcelle ? inspecteur.contexte(parcelle) : null;
  const section = c ? sectionRues(c) : null;
  if (!c || !section || !ruesTracees(parcelle)) return null;
  return (
    <li className="menuChamps hoteChamps" role="presentation" data-section={section.id}>
      <Tactile.Provider value={tactile}>
        <div className="champs" role="group" aria-label="Réglages des rues"><ListeChamps champs={section.champs} c={c} inspecteur={service} /></div>
      </Tactile.Provider>
    </li>
  );
}

/** Le menu Affichage : les bascules, chacune une commande cochee d'apres l'etat, et le fond orthophoto. */
function MenuAffichage({ magasin, commandes, inspecteur }: PropsMenu & { inspecteur?: Inspecteur | undefined }) {
  useCle(magasin, 'menu Affichage', (s) => {
    const p = parcelleDuProjet(s.etat.objects);
    return JSON.stringify([basculesAffichage(s.etat, commandes), ortho.opacite, ortho.parcelleOpacite, ortho.couche, partTrottoirs(p), couleursRues(p), s.etat.lectureSeule]);
  });
  const bascules = basculesAffichage(magasin.store.getState().etat, commandes);
  const curseur = (id: string, idDom: string, idTexte: string, libelle: string, valeur: number, min: number, titre: string) => (
    <li className="menuReglage" title={titre}>
      <label>{libelle}
        <input type="range" id={idDom} data-commande={id} min={min} max={100} step={5} value={valeur}
          onChange={(e) => { commandes.executer(id, e.currentTarget); magasin.notifier(); }} />
        <span id={idTexte} className="valeur">{valeur} %</span>
      </label>
    </li>
  );
  return (
    <Deroulant id="menuAffichage" titre="Affichage">
      <ul role="menu">
        {bascules.filter(([, , , visible]) => visible).map(([id, libelle, coche]) => (
          <Fragment key={id}>
            <li role="menuitemcheckbox" aria-checked={coche}>
              <button type="button" data-commande={id} onClick={(e) => { commandes.executer(id); fermer(e); }}>
                <span className="coche" aria-hidden="true">{coche ? '✓' : ''}</span>{libelle}
              </button>
            </li>
            {/* Sous « Rues » cochee, ses reglages : la part des trottoirs et les couleurs. */}
            {id === 'affichage.chaussees' && coche && inspecteur && <ReglagesRues inspecteur={inspecteur} magasin={magasin} />}
          </Fragment>
        ))}
        <ChoixFond commandes={commandes} />
        {curseur('affichage.orthoOpacite', 'orthoOpacite', 'orthoOpaciteTexte', 'Fond', Math.round(ortho.opacite * 100), 20, 'Opacité du fond lui-même (photo aérienne ou Plan IGN)')}
        {curseur('affichage.orthoParcelleOpacite', 'orthoParcelleOpacite', 'orthoParcelleOpaciteTexte', 'Remplissage parcelle', Math.round(ortho.parcelleOpacite * 100), 0, 'Remplissage du terrain par-dessus le fond : à 100 % la parcelle masque exactement ce qu\'on veut voir')}
        <Entree commandes={commandes} id="affichage.orthoParcelleDefaut" libelle="Remplissage conseillé (15 %)" idDom="orthoParcelleDefaut" />
        <Entree commandes={commandes} id="affichage.orthoRecharger" libelle="Recharger le fond IGN" />
        <li className="menuAide">Le fond est la photo aérienne ou le Plan IGN, où les rues sont dessinées et nommées ; en Vue 3D, il se drape sur le relief. Le remplissage ne s'applique que fond affiché : le contour et les cotes restent, seul le fond de couleur s'efface. Les tuiles ne sont pas enregistrées, ces réglages le sont.</li>
        <li className="separateur" role="separator" />
        {/* Les mesures des cotes sur le plan (app/mesuresSurLePlan.ts), eteintes par defaut : une preference de l'appareil, comme le mode expert. */}
        <Case magasin={magasin} option="mesuresSurLePlan" idDom="chkMesuresSurLePlan" controle="affichage.option.mesures" libelle="Mesures des cotes sur le plan"
          titre="Dessine sur le plan les mesures des cotes (→ 2,50 m · Δ +0,20 m). Une préférence de cet appareil ; poser une cote l’allume." />
        {/* Une preference de l'appareil (app/modeExpert.ts) : ni Ctrl+Z, ni « projet modifie », permise en lecture seule. */}
        <Case magasin={magasin} option="modeExpert" idDom="chkModeExpert" controle="affichage.option.modeExpert" libelle="Mode expert"
          titre="Montre les formats techniques (DXF, GLB, JSON…), les constantes de calcul et les réglages fins de la 3D. Une préférence de cet appareil." />
      </ul>
    </Deroulant>
  );
}

function MenuAide({ magasin, commandes, tiroir }: { magasin: Magasin; commandes: RegistreCommandes; tiroir: Tiroir }) {
  useCle(magasin, 'menu Aide', (s) => String([tiroir.onglets().some(o => o.id === 'methode'), controleMontre(s, 'aide.methode')]));
  const methode = tiroir.onglets().some(o => o.id === 'methode');
  // La methode de calcul est un onglet du mode expert (app/tiroir.ts) : son entree le suit (app/controlesInterface.ts).
  const montrerMethode = controleMontre(magasin.store.getState(), 'aide.methode');
  // Les raccourcis, tires de la seule table qui les ecoute (app/clavier.ts) et des libelles du registre ; au telephone, pas de clavier.
  const raccourcis = magasin.store.getState().classe === 'compact' ? [] : raccourcisAffiches(commandes);
  return (
    <Deroulant id="menuAide" titre="Aide">
      <ul role="menu">
        {montrerMethode && <li role="menuitem">
          <button type="button" data-controle="aide.methode" disabled={!methode} title={methode ? undefined : 'Sélectionnez une terrasse : la méthode décrit son calcul'} onClick={(e) => { tiroir.activer('methode'); fermer(e); }}>
            <span className="coche" aria-hidden="true" />Méthode de calcul
          </button>
        </li>}
        <li role="menuitem">
          <button type="button" data-controle="aide.version" onClick={(e) => { showToast(versionLongue()); fermer(e); }}><span className="coche" aria-hidden="true" />Version</button>
        </li>
        {/* L'assistant en langue naturelle (lot L6) : il ouvre son dialogue (Z8). */}
        <Entree commandes={commandes} id="assistant.demander" libelle="Demander à l’assistant…" />
        {raccourcis.length > 0 && <li className="separateur" role="separator" />}
        {raccourcis.length > 0 && (
          <li className="menuRaccourcis" data-controle="aide.raccourcis" role="none">
            <span className="titreRaccourcis">Raccourcis clavier</span>
            <dl>
              {raccourcis.map((r) => (
                <div key={r.commande} data-commande-raccourci={r.commande}>
                  <dt>{r.libelle}</dt>
                  <dd>{r.touches.map((t, i) => <span key={t}>{i > 0 && ' ou '}<kbd>{t}</kbd></span>)}</dd>
                </div>
              ))}
            </dl>
          </li>
        )}
      </ul>
    </Deroulant>
  );
}

/** La pastille de l'avertissement de l'admin ne se montre qu'une fois par session : jusqu'a la premiere ouverture du menu. */
const CLE_AVERTISSEMENT_VU = 'planInteractif.avertissementAdminVu';

/**
 * Le menu Admin : les ecrans secondaires de l'admin des demos (l'arbre des controleurs, la palette
 * de l'interface, la consommation de Claude, la conformite) et le mode audit (MD/spec-audit.md). Les ecrans
 * n'existent qu'en admin des demos (`enAdmin`) : hors admin, ils demandent le mot de passe. Le mode
 * audit est ouvert aussi a l'administrateur de la plateforme (`estAdministrateur`). Chaque ecran a
 * son bouton de retour. La consommation et la conformite passent par le registre (`admin.consommation`,
 * `admin.conformite`), comme le catalogue des audits de parcelle recus (`admin.auditsParcelle`), qui
 * s'ouvre en Z8 sur le projet en cours (il y rouvre un audit). Avec
 * `?regles=local`, l'administrateur y essaie des faits de toits (`admin.faitsLocaux`). La sauvegarde
 * (`admin.sauvegarde`) telecharge tout le dossier des donnees du serveur en une archive zip.
 */
export function MenuAdmin({ commandes }: { commandes: RegistreCommandes }) {
  const demos = enAdmin();
  // L'avertissement de l'admin (une capacite ouverte d'office que la plateforme n'attribue pas) : une ligne en tete du menu, et une
  // pastille sur son titre jusqu'a la premiere ouverture de la session (audit UX de la 5.45.0, constat 1 : ce n'est plus un toast).
  const avertissement = ligneAdminCapacitesForcees();
  const [vu, poserVu] = useState(() => { try { return sessionStorage.getItem(CLE_AVERTISSEMENT_VU) === '1'; } catch { return false; } });
  if (!demos && !estAdministrateur()) return null;
  const aller = (adresse: string) => (e: React.MouseEvent<HTMLElement>) => { fermer(e); location.assign(adresse); };
  const marquerVu = () => { if (vu) return; poserVu(true); try { sessionStorage.setItem(CLE_AVERTISSEMENT_VU, '1'); } catch { /* sans stockage : la pastille revient */ } };
  return (
    <Deroulant id="menuAdmin" titre="Admin" pastille={avertissement && !vu ? 'Un avertissement à lire' : null} onOuvrir={marquerVu}>
      <ul role="menu">
        {avertissement && <li role="none" className="menuNote avertissementAdmin">{avertissement}</li>}
        <li role="menuitem">
          <button type="button" data-controle="admin.audit" onClick={aller(demos ? '?admin&mode=audit' : '?mode=audit')}>
            <span className="coche" aria-hidden="true" />Mode audit (promenade)
          </button>
        </li>
        {demos && <>
        <li role="menuitem">
          <button type="button" data-controle="admin.controleurs" onClick={aller('?admin&ecran=controleurs')}>
            <span className="coche" aria-hidden="true" />Contrôleurs de l’écran
          </button>
        </li>
        <li role="menuitem">
          <button type="button" data-controle="admin.palette" onClick={aller('?palette')}>
            <span className="coche" aria-hidden="true" />Palette de l’interface
          </button>
        </li>
        <li role="menuitem">
          <button type="button" data-controle="admin.arbres" onClick={aller('?admin&ecran=arbres')}>
            <span className="coche" aria-hidden="true" />Arbres (bibliothèque)
          </button>
        </li>
        <li role="menuitem">
          <button type="button" data-controle="admin.calibration" onClick={aller('?admin&ecran=calibration')}>
            <span className="coche" aria-hidden="true" />Calibrer la détection
          </button>
        </li>
        <li role="menuitem">
          <button type="button" data-controle="admin.chaine" onClick={aller('?admin&ecran=chaine')}>
            <span className="coche" aria-hidden="true" />De l’IGN à ma maison
          </button>
        </li>
        <li role="menuitem">
          <button type="button" data-controle="admin.principes" onClick={aller('?admin&ecran=principes')}>
            <span className="coche" aria-hidden="true" />Les principes de Plan
          </button>
        </li>
        <Entree commandes={commandes} id="admin.consommation" libelle="Consommation de Claude" />
        <Entree commandes={commandes} id="admin.conformite" libelle="Conformité" />
        <Entree commandes={commandes} id="admin.regles" libelle="Règles" />
        <Entree commandes={commandes} id="admin.auditsParcelle" libelle="Audits" />
        <Entree commandes={commandes} id="admin.sauvegarde" libelle="Télécharger une sauvegarde des données" />
        </>}
        {reglesLocalesDemandees() && <Entree commandes={commandes} id="admin.faitsLocaux" libelle="Essayer des faits de toits…" />}
      </ul>
    </Deroulant>
  );
}

/**
 * Un menu ouvert se referme quand on clique ailleurs ou par Echap, et en ouvrir un ferme les autres.
 * Tous les menus deroulants de la page : ceux de la barre, et le menu Etiquettes de l'explorateur,
 * qui ne se fermait ni par Echap ni par un clic ailleurs (spec-ihm-mobile, D11).
 */
function useFermetureDesMenus(): void {
  useEffect(() => {
    const ouverts = () => [...document.querySelectorAll<HTMLDetailsElement>('details.menu[open]')];
    const surPointeur = (e: PointerEvent) => { ouverts().forEach(d => { if (!d.contains(e.target as Node)) d.removeAttribute('open'); }); };
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const o = ouverts();
      // Echap ferme d'abord le menu ouvert ; la feuille qui le porte ne se ferme qu'au suivant.
      if (o.length) { e.preventDefault(); o.forEach(d => d.removeAttribute('open')); }
    };
    const surBascule = (e: Event) => { const d = e.target as HTMLDetailsElement; if (d.open) ouverts().forEach(a => { if (a !== d) a.removeAttribute('open'); }); };
    document.addEventListener('pointerdown', surPointeur);
    document.addEventListener('keydown', surTouche);
    document.addEventListener('toggle', surBascule, true);
    return () => { document.removeEventListener('pointerdown', surPointeur); document.removeEventListener('keydown', surTouche); document.removeEventListener('toggle', surBascule, true); };
  }, []);
}

/**
 * Le lien vers la plateforme : qui est connecte, et ou sont ses projets.
 *
 * Le §5.5 de la specification pose la regle : Plan renvoie a la coquille de la plateforme pour
 * tout ce qui lui appartient — l'abonnement, les factures, les membres, le profil — par des liens
 * ordinaires, et ne reimplemente aucun de ces ecrans. C'est le premier de ces liens.
 *
 * L'adresse est `<plateforme>/<slug>/projects` : chaque organisation vit a sa racine, sauf celle
 * de l'exploitant qui occupe la racine nue — mais sa forme avec slug resout aussi, parce que le
 * premier segment est lu comme un slug des lors qu'il n'est pas un segment reserve de la
 * coquille, et que le serveur deduit le locataire de l'adhesion de toute facon.
 *
 * Rien ne s'affiche hors plateforme : sous vitest, ou avant que la porte soit franchie, il n'y a
 * personne a nommer.
 */
function Compte({ magasin, commandes }: { magasin: Magasin; commandes: RegistreCommandes }) {
  if (enAdmin()) return <SortieAdmin magasin={magasin} />;
  if (partageCourant()) return <BandeauPartage />;
  if (enEssai()) return <BandeauEssai />;
  const c = contexteCourant()?.courant();
  if (!c) return null;

  /**
   * Se deconnecter ferme la session de la PLATEFORME, pas celle de Plan : il n'y a pas de
   * « se deconnecter de Plan seulement » (spec §3.3). On le dit dans l'infobulle plutot que de
   * le laisser decouvrir.
   *
   * Le plan non enregistre passe avant : la session fermee, la porte se repose par-dessus et le
   * travail est derriere, mais personne ne devrait avoir a le deviner. On demande d'abord.
   */
  const sortir = () => {
    const s = sessionCourante();
    if (!s) return;
    const partir = () => {
      // Deja confirme s'il perdait des modifications : le navigateur ne repose pas la question (shell/depart.ts).
      void s.fermer().finally(() => { partirSansQuestion(); location.reload(); });
    };
    if (magasin.store.getState().etat.dirty) {
      showConfirm('Ce plan porte des modifications non enregistrées. Se déconnecter maintenant les perd. Continuer ?', partir);
      return;
    }
    partir();
  };
  const qui = c.user.display_name || c.user.email || 'Compte';
  const ou = c.tenant.name || c.tenant.slug || '';
  // « Mes projets » ouvre la liste dans Plan (app/mesProjets.ts, lot 2) ; la plateforme est a un lien depuis elle.
  return (
    <div id="compteBar">
      {commandes.obtenir('projet.mesProjets') && (
        <button type="button" className="compteLien" data-commande="projet.mesProjets" disabled={!commandes.etat('projet.mesProjets').utilisable}
          title={'Les projets de ' + (ou || 'votre organisation') + ', comme ' + qui + ' : ouvrir l’un d’eux, ou partir d’une adresse'}
          onClick={(e) => { commandes.executer('projet.mesProjets', e.currentTarget); }}>
          Mes projets
        </button>
      )}
      <button type="button" className="compteLien compteSortie" onClick={sortir}
        title={'Fermer la session de ' + qui + '. La déconnexion vaut pour la plateforme entière, pas seulement pour Plan.'}>
        Se déconnecter
      </button>
    </div>
  );
}

/**
 * Un projet lu par un lien de partage (lot 6, app/projetPartage.ts) : qui l'a partage, qu'il ne se modifie pas, jusqu'a quand, et la
 * version montree. A la place du compte, qu'il n'y a pas. « Découvrir Plan » mene a la vitrine de la plateforme (sa racine, ou un
 * inconnu trouve les offres et l'inscription), la seule page d'accueil du produit que Plan connaisse.
 */
function BandeauPartage() {
  const p = partageCourant();
  if (!p) return null;
  const vitrine = BACKPROD_API_URL ? vitrinePlateforme() : null;
  return (
    <div id="compteBar" className="bandeauPartage" role="note" aria-label="Projet partagé">
      <span className="bandeauPartageTexte">
        {p.partagePar ? 'Projet partagé par ' + p.partagePar : 'Projet partagé'} · en lecture seule · jusqu’au {dateLongue(p.jusquau)}
        <span className="bandeauPartageVersion" title={'Version enregistrée le ' + dateLongue(p.enregistreLe)}> · version du {dateLongue(p.enregistreLe)}</span>
      </span>
      {vitrine && <a className="compteLien" data-controle="partage.decouvrir" href={vitrine} target="_blank" rel="noopener noreferrer">Découvrir Plan<span aria-hidden="true"> ↗</span></a>}
    </div>
  );
}

/**
 * La demonstration sans compte (lot 6, app/acces.ts `entrerEnEssai`) : rien ne s'enregistre, et le dire avant qu'on ait travaille pour
 * rien. « Créer un compte » mene a la vitrine de la plateforme (offres et inscription) ; « Quitter » ramene a la porte, en rechargeant
 * la page : l'essai ne laisse rien derriere lui.
 */
function BandeauEssai() {
  return (
    <div id="compteBar" className="bandeauPartage bandeauEssai" role="note" aria-label="Démonstration">
      <span className="bandeauPartageTexte">Démonstration · rien n’est enregistré · Créez un compte pour enregistrer</span>
      {BACKPROD_API_URL && <a className="compteLien" data-controle="essai.creerCompte" href={vitrinePlateforme()}>Créer un compte</a>}
      <button type="button" className="compteLien compteSortie" data-controle="essai.quitter" onClick={() => { partirSansQuestion(); location.reload(); }}>Quitter la démonstration</button>
    </div>
  );
}

/**
 * Combien de projets l'organisation tient, sur combien que son abonnement autorise : « 1/3 ».
 * La limite se voit avant d'etre rencontree, pas seulement au refus. A la limite, le mot le dit
 * aussi — la bordure seule ne porterait pas l'information.
 */
function CompteurProjets({ quota }: { quota: { utilise: number; limite: number | null; illimite: boolean } }) {
  const { utilise, limite } = quota;
  const plein = limite !== null && utilise >= limite;
  const nProjets = utilise + ' projet' + (utilise > 1 ? 's' : '');
  const titre = limite !== null
    ? nProjets + ' sur ' + limite + ' autorisé' + (limite > 1 ? 's' : '') + ' par l’abonnement de votre organisation'
      + (plein ? ' : limite atteinte. Supprimez un projet ou changez d’offre sur la plateforme pour en créer un nouveau.' : '.')
    : quota.illimite ? nProjets + ' ; l’abonnement de votre organisation n’en limite pas le nombre.'
      : nProjets + ' dans votre organisation.';
  // Illimite : « 4/∞ » ; aucun quota de projets sur l'offre : le nombre seul.
  const nombre = utilise + (limite !== null ? '/' + limite : quota.illimite ? '/∞' : '');
  return (
    <span id="compteurProjets" className={'compteurProjets' + (plein ? ' plein' : '')} title={titre} aria-label={titre}>
      Projets <span className="nombre">{nombre}</span>
      {plein && <span className="motLimite"> · limite atteinte</span>}
    </span>
  );
}

/**
 * L'admin des demos n'a pas de plateforme : pas de compte a nommer, mais une session a fermer
 * (app/administration/porteAdmin.ts). Meme place que « Se deconnecter » de la plateforme, et meme precaution :
 * un plan non enregistre se demande avant de partir.
 */
function SortieAdmin({ magasin }: { magasin: Magasin }) {
  const sortir = () => {
    const partir = () => {
      void import('../app/administration/porteAdmin.js').then(({ quitterAdmin }) => quitterAdmin()).then((refus) => { if (refus) showErrBanner(refus); });
    };
    if (magasin.store.getState().etat.dirty) {
      showConfirm('Cette démo porte des modifications non enregistrées. Se déconnecter maintenant les perd. Continuer ?', partir);
      return;
    }
    partir();
  };
  return (
    <div id="compteBar">
      <span className="compteLien compteAdmin">Admin des démos</span>
      <button type="button" id="sortieAdminBtn" data-controle="admin.seDeconnecter" className="compteLien compteSortie" onClick={sortir}
        title="Fermer la session admin. Le mot de passe sera redemandé.">
        Se déconnecter
      </button>
    </div>
  );
}

export function BarreApplication({ magasin, commandes, tiroir, inspecteur }: PropsBarreApplication) {
  useFermetureDesMenus();
  const p = useStore(magasin.store, (s) => s.projet);
  const vue = useStore(magasin.store, (s) => s.vue);
  const lieu = useStore(magasin.store, (s) => s.lieu);
  const classe = useStore(magasin.store, (s) => s.classe);
  const feuille = useStore(magasin.store, (s) => s.feuille);
  const peutAnnuler = useStore(magasin.store, (s) => s.peutAnnuler);
  const peutRetablir = useStore(magasin.store, (s) => s.peutRetablir);
  // Ce que la barre lit du plan : l'etat de « Enregistrer », la lecture seule, les vues et Annuler offerts ou non, et qui est
  // connecte (le compte et le menu Admin). Les entrees des menus suivent chacune leur commande.
  useCle(magasin, 'barre d\'application', (s) => {
    const c = contexteCourant()?.courant();
    return JSON.stringify([commandes.etat('projet.enregistrer'), s.etat.lectureSeule, Object.values(COMMANDE_DE_VUE).map((id) => commandes.effacee(id)),
      commandes.effacee('objet.annuler'), commandes.etat('objet.annuler'), commandes.etat('objet.retablir'), !!sessionToit(), enAdmin(), estAdministrateur(), c ? [c.user.display_name, c.user.email, c.tenant.name, c.tenant.slug] : null]);
  });
  const executer = (id: string) => (e: React.MouseEvent<HTMLButtonElement>) => { commandes.executer(id, e.currentTarget); };
  // Pendant une session du mode Toit, Annuler est celui de la session (app/ecouteurs/objets.ts).
  const enSessionToit = !!sessionToit();
  const enregistrement = p.statut === 'enregistrement';
  // Comme toute commande : grise en lecture seule (le droit d'ecrire manque) ou sans projet ouvert,
  // au lieu d'un clic refuse sans un mot.
  const etatEnregistrer = commandes.etat('projet.enregistrer');
  const compact = classe === 'compact';
  // Telephone et tablette partagent la barre haute ; la feuille Projet devient sur tablette un
  // panneau deroulant sous le bouton ☰ (spec-ihm-mobile §6.1).
  const tactile = classe !== 'large';

  // Sur telephone, une entree de menu choisie ferme aussi la feuille Projet qui porte les menus.
  useEffect(() => {
    if (!tactile) return;
    const surChoix = () => { if (magasin.store.getState().feuille === 'projet') magasin.definirFeuille(null); };
    document.addEventListener('plan:entreeChoisie', surChoix);
    return () => document.removeEventListener('plan:entreeChoisie', surChoix);
  }, [tactile, magasin]);

  const nom = p.courant ? p.courant.name : 'Nouveau plan';
  const lectureSeule = magasin.store.getState().etat.lectureSeule;

  /** Ouvre la feuille Projet sur un menu donne, deplie. */
  const ouvrirProjet = (menu?: string) => {
    magasin.definirFeuille('projet');
    if (menu) requestAnimationFrame(() => document.getElementById(menu)?.setAttribute('open', ''));
  };

  const vues = (
    <div id="modeBar" role="group" aria-label="Vue">
      {/* Une vue que l'offre ne comprend pas (`plan.3d`) n'a pas de bouton. */}
      {VUES.filter(([cle]) => !commandes.effacee(COMMANDE_DE_VUE[cle])).map(([cle, id, libelle, titre]) => (
        <button data-commande={COMMANDE_DE_VUE[cle]} key={cle} type="button" id={id} className={'objbtn' + (vue === cle ? ' active' : '')} aria-pressed={vue === cle}
          title={titre || undefined} onClick={executer(COMMANDE_DE_VUE[cle])}>
          {compact && cle === 'vue3d' ? '3D' : compact && cle === 'visionneuse' ? 'Visionneuse' : libelle}
        </button>
      ))}
    </div>
  );

  const menus = (
    <>
      {/* Plus de liste deroulante des projets : « Mes projets » les ouvre (lot 2), un geste n'existe qu'a un endroit. */}
      {p.apiDisponible && p.quota && <CompteurProjets quota={p.quota} />}
      {p.apiDisponible && (
        // Tout est enregistre : le bouton passe en secondaire, rien n'appelle a le toucher (audit UX de la 5.45.0, polissages).
        <button data-commande="projet.enregistrer" type="button" id="saveProjectBtn" className={'small' + (p.statut === 'a-jour' ? ' secondary' : '')} disabled={enregistrement || !etatEnregistrer.utilisable}
          title={!etatEnregistrer.utilisable && 'message' in etatEnregistrer ? etatEnregistrer.message : undefined} onClick={executer('projet.enregistrer')}>
          {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      )}
      <MenuFichier magasin={magasin} commandes={commandes} />
      <MenuExporter magasin={magasin} commandes={commandes} tiroir={tiroir} />
      <MenuAffichage magasin={magasin} commandes={commandes} inspecteur={inspecteur} />
      <MenuAide magasin={magasin} commandes={commandes} tiroir={tiroir} />
      <MenuAdmin commandes={commandes} />
    </>
  );

  if (tactile) {
    return (
      <>
        {/* La barre haute du telephone (spec-ihm-mobile §6.1) : le projet, son statut, Annuler, Exporter. */}
        <div className="barreCompacte">
          <button type="button" className="boutonIcone" data-controle="barre.projetEtMenus" aria-label="Projet et menus" aria-expanded={feuille === 'projet'} onClick={() => feuille === 'projet' ? magasin.definirFeuille(null) : ouvrirProjet()}>
            <Icone nom="menu" />
          </button>
          <div className="barreTitre">
            <span className="nomProjet">{nom}</span>
            <span className={'statutProjet statut-' + p.statut}>
              <span className="pointStatut" aria-hidden="true" />{texteStatutCourt(p)}
              {lectureSeule && <span className="etatLectureSeule">Lecture seule</span>}
            </span>
          </div>
          {!commandes.effacee('objet.annuler') && (
            <button type="button" className="boutonIcone" data-commande="objet.annuler" aria-label={enSessionToit ? 'Annuler le dernier geste sur la toiture (Ctrl+Z)' : 'Annuler (Ctrl+Z)'}
              disabled={!(commandes.etat('objet.annuler').utilisable && (peutAnnuler || enSessionToit))}
              onClick={() => { commandes.executer('objet.annuler'); }}>
              <Icone nom="annuler" />
            </button>
          )}
          {/* Retablir se grise par sa commande : elle lit la pile du projet, ou celle d'une session du mode Toit. */}
          {!commandes.effacee('objet.retablir') && (
            <button type="button" className="boutonIcone" data-commande="objet.retablir" aria-label={enSessionToit ? 'Rétablir le dernier geste sur la toiture (Ctrl+Y)' : 'Rétablir (Ctrl+Y)'}
              disabled={!(commandes.etat('objet.retablir').utilisable && (peutRetablir || enSessionToit))}
              onClick={() => { commandes.executer('objet.retablir'); }}>
              <Icone nom="retablir" />
            </button>
          )}
          {!compact && vues}
          <button type="button" className="boutonIcone" data-controle="barre.exporter" aria-label="Exporter" onClick={() => ouvrirProjet('menuExporter')}>
            <Icone nom="exporter" />
          </button>
        </div>
        {compact && vues}
        {/* La feuille Projet : les memes menus, les memes cases, dans le meme ordre (§6.1). */}
        <div id="projectBar" className={'feuilleProjet' + (p.apiDisponible ? '' : ' localMode')} role="dialog" aria-modal={feuille === 'projet'} aria-label="Projet">
          <EnteteFeuille magasin={magasin} titre={nom} sousTitre={lieu || undefined} />
          <div className="corpsFeuille">
            {menus}
            <Compte magasin={magasin} commandes={commandes} />
            {lectureSeule && !partageCourant() && <p className="hint">Votre compte n'a pas le droit d'écrire sur cette organisation : un administrateur peut vous le donner.</p>}
            <p className="versionFeuille" title={versionLongue()}>Plan interactif v{APP_VERSION}</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div id="projectBar" className={p.apiDisponible ? '' : 'localMode'}>
        {menus}
      </div>
      <Compte magasin={magasin} commandes={commandes} />
      {vues}
      <h1>
        {/* Sans projet ouvert, le titre ne doit pas en nommer un. Le repli etait « Parcelle AE 101 »,
            le nom du jeu de demonstration : il ne trompait personne tant que Plan ouvrait toujours
            un projet, et il s'est mis a mentir le jour ou l'atelier a pu s'ouvrir sur un plan vide
            — « partir d'une adresse », 25 septembre 2026. */}
        Plan interactif{p.courant ? ' — ' + p.courant.name : ' — nouveau plan'}
        <span id="titreLieu" title={lieu ? 'Position de la parcelle : elle cale la course du soleil, le fond orthophoto et l\'interrogation du PLU.' : undefined}>{lieu}</span>
      </h1>
    </>
  );
}
