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

import { contexteCourant, sessionCourante, enAdmin } from '../app/acces.js';
import { BACKPROD_API_URL } from '../plateforme/config.js';
import { useEffect } from 'react';
import { useStore } from 'zustand';
import { ortho } from '../render/ortho.js';
import { showConfirm, showToast, showErrBanner } from '../shell/dialogs.js';
import type { Magasin, OptionsCommandes } from '../app/magasin.js';
import type { RegistreCommandes } from '../app/commandes.js';
import type { Projet } from '../app/projet.js';
import type { Tiroir } from '../app/tiroir.js';
import type { Vue } from '../app/modes.js';
import { Icone } from './icones.js';
import { EnteteFeuille } from './composants/Feuille.js';
import { texteStatutCourt } from './statut.js';
import { APP_VERSION, versionLongue } from '../model/version.js';

export interface PropsBarreApplication {
  magasin: Magasin;
  commandes: RegistreCommandes;
  projet: Projet;
  tiroir: Tiroir;
}

const VUES: [Vue, string, string, string][] = [
  ['plan', 'modePlanBtn', 'Plan', ''],
  ['vue3d', 'mode3dBtn', 'Vue 3D', 'Vue 3D du plan et de la terrasse courante'],
  ['visionneuse', 'glbViewerBtn', 'Visionneuse GLB', 'Relit le dernier fichier GLB exporte (menu Exporter), pour verifier le fichier reel avant de le partager']
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

/** Une entree de menu qui execute une commande, grisee si la commande ne l'est pas. */
function Entree({ commandes, id, libelle, idDom, apres, raccourci }: { commandes: RegistreCommandes; id: string; libelle: string; idDom?: string; apres?: () => void; raccourci?: string }) {
  const c = commandes.obtenir(id);
  const etat = commandes.etat(id);
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

/** L'echelle du PDF : un brouillon libre pendant la frappe, l'option ne retient qu'un entier positif. */
function EchellePdf({ magasin }: { magasin: Magasin }) {
  const echelle = useStore(magasin.store, (s) => s.options.echellePdf);
  return (
    <input type="number" id="pdfScaleInput" data-controle="export.option.echellePdf" defaultValue={echelle} min={1} step={1}
      onChange={(e) => { const v = parseInt(e.target.value, 10); if (v > 0) magasin.definirOption('echellePdf', v); }} />
  );
}

function MenuFichier({ magasin, commandes }: PropsMenu) {
  const p = useStore(magasin.store, (s) => s.projet);
  return (
    <details className="menu" id="menuFichier">
      <summary>Fichier</summary>
      <ul role="menu">
        {p.apiDisponible && <Entree commandes={commandes} id="projet.nouveau" libelle="Nouveau projet" />}
        {p.apiDisponible && <Entree commandes={commandes} id="projet.enregistrer" libelle="Enregistrer" raccourci="Ctrl+S" />}
        {p.apiDisponible && <Entree commandes={commandes} id="projet.supprimer" libelle="Supprimer le projet…" />}
        {p.apiDisponible && p.schemaEnRetard && <Entree commandes={commandes} id="projet.mettreAJourModele" libelle="Mettre à jour le modèle…" />}
        {p.apiDisponible && <li className="separateur" role="separator" />}
        <Entree commandes={commandes} id="projet.depuisAdresse" libelle="Nouveau plan depuis une adresse…" />
        <Entree commandes={commandes} id="projet.actualiserIgn" libelle="Actualiser depuis l'IGN…" />
        <li className="separateur" role="separator" />
        <Entree commandes={commandes} id="fichier.importerSvg" libelle="Importer un SVG…" idDom="importSvgBtn" />
        <Case magasin={magasin} option="remplacerImportSvg" idDom="chkReplaceOnImport" controle="fichier.option.remplacerImportSvg" libelle="Supprimer les objets existants avant d'importer" />
        <Entree commandes={commandes} id="fichier.importerJson" libelle="Importer un projet (JSON)…" idDom="importJsonBtn" />
        <Case magasin={magasin} option="remplacerImportJson" idDom="chkJsonRemplace" controle="fichier.option.remplacerImportJson" libelle="Remplacer le plan actuel" titre="Décoché : les objets du fichier s'ajoutent au plan" />
        <li className="separateur" role="separator" />
        <Entree commandes={commandes} id="fichier.exporterJson" libelle="Exporter le projet (JSON)" idDom="exportJsonBtn" />
        <Case magasin={magasin} option="exportSansParcelle" idDom="chkExportSansParcelle" controle="fichier.option.exportSansParcelle" libelle="Exporter sans la parcelle" titre="Retire la parcelle, les parcelles voisines, les mesures qui s'y appuient et la clôture : pour transmettre un aménagement sans divulguer la localisation" />
      </ul>
    </details>
  );
}

function MenuExporter({ magasin, commandes, tiroir }: PropsMenu & { tiroir: Tiroir }) {
  return (
    <details className="menu" id="menuExporter">
      <summary>Exporter</summary>
      <ul role="menu">
        <Entree commandes={commandes} id="export.resume" libelle="Résumé à copier" apres={() => tiroir.activer('resume')} />
        <li className="separateur" role="separator" />
        <Entree commandes={commandes} id="export.svg" libelle="SVG" idDom="exportSvgBtn" />
        <Entree commandes={commandes} id="export.png" libelle="PNG" idDom="exportPngBtn" />
        <Entree commandes={commandes} id="export.dxf" libelle="DXF" idDom="exportDxfBtn" />
        <li className="menuReglage">
          <label title="L'échelle fixe la taille de la page : à 1/200, 1 m réel = 5 mm sur papier">Échelle du PDF 1/<EchellePdf magasin={magasin} /></label>
        </li>
        <Entree commandes={commandes} id="export.pdf" libelle="PDF du plan" idDom="exportPdfBtn" />
        <li className="separateur" role="separator" />
        <Entree commandes={commandes} id="export.dossier" libelle="Dossier PDF des terrasses" idDom="dossierPdfBtn" />
        <Entree commandes={commandes} id="export.declaration" libelle="Déclaration préalable (cerfa)" idDom="declarationBtn" />
        <Case magasin={magasin} option="dossierEquipements" idDom="chkDossierEquipements" controle="export.option.dossierEquipements" libelle="Inclure l'emprise des équipements" titre="Spa, mobilier, parasol… : tout objet dont le centre tombe sur la terrasse" />
        <li className="menuAide">Les terrasses du dossier se cochent dans l'explorateur.</li>
        <Entree commandes={commandes} id="export.dossierPiscine" libelle="Dossier mairie de la piscine (PDF)" idDom="dossierPiscineBtn" />
        <li className="separateur" role="separator" />
        <Entree commandes={commandes} id="export.glb" libelle="GLB (scène 3D)" idDom="exportGlbBtn" />
      </ul>
    </details>
  );
}

/** Le menu Affichage : les bascules, chacune une commande cochee d'apres l'etat, et le fond orthophoto. */
function MenuAffichage({ magasin, commandes }: PropsMenu) {
  useStore(magasin.store, (s) => s.version);
  // Une preference du navigateur, hors de l'etat du plan : elle ne fait pas avancer `version`.
  const sectionsRepliees = useStore(magasin.store, (s) => s.sectionsRepliees);
  const etat = magasin.store.getState().etat;
  const aDuVoisinage = etat.objects.some((o) => o.voisinage);
  // Une bascule dont l'organisation n'a pas la capacite s'efface, comme toute entree de menu : le
  // fond orthophoto restait visible sans l'abonnement (spec-ihm-mobile, D8).
  const bascules: [string, string, boolean, boolean][] = ([
    ['affichage.nord', 'Flèche Nord', etat.showNorth, true],
    ['affichage.grille', 'Grille', etat.grilleVisible, true],
    ['affichage.voisinage', 'Voisinage', etat.voisinageVisible, aDuVoisinage],
    ['affichage.orthophoto', 'Fond orthophoto (IGN)', ortho.actif, true],
    ['affichage.sectionsRepliees', 'Sections de l\'inspecteur repliées', sectionsRepliees, true]
  ] as [string, string, boolean, boolean][]).map(([id, l, c, v]) => [id, l, c, v && !commandes.effacee(id)]);
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
    <details className="menu" id="menuAffichage">
      <summary>Affichage</summary>
      <ul role="menu">
        {bascules.filter(([, , , visible]) => visible).map(([id, libelle, coche]) => (
          <li key={id} role="menuitemcheckbox" aria-checked={coche}>
            <button type="button" data-commande={id} onClick={(e) => { commandes.executer(id); fermer(e); }}>
              <span className="coche" aria-hidden="true">{coche ? '✓' : ''}</span>{libelle}
            </button>
          </li>
        ))}
        {curseur('affichage.orthoOpacite', 'orthoOpacite', 'orthoOpaciteTexte', 'Photo', Math.round(ortho.opacite * 100), 20, 'Opacité de la photo aérienne elle-même')}
        {curseur('affichage.orthoParcelleOpacite', 'orthoParcelleOpacite', 'orthoParcelleOpaciteTexte', 'Remplissage parcelle', Math.round(ortho.parcelleOpacite * 100), 0, 'Remplissage du terrain par-dessus la photo : à 100 % la parcelle masque exactement ce qu\'on veut voir')}
        <Entree commandes={commandes} id="affichage.orthoParcelleDefaut" libelle="Remplissage conseillé (15 %)" idDom="orthoParcelleDefaut" />
        <li className="menuAide">Le remplissage ne s'applique que fond affiché : le contour et les cotes restent, seul le fond de couleur s'efface. Les tuiles ne sont pas enregistrées, ces réglages le sont.</li>
      </ul>
    </details>
  );
}

function MenuAide({ magasin, tiroir }: { magasin: Magasin; tiroir: Tiroir }) {
  useStore(magasin.store, (s) => s.version);
  const methode = tiroir.onglets().some(o => o.id === 'methode');
  return (
    <details className="menu" id="menuAide">
      <summary>Aide</summary>
      <ul role="menu">
        <li role="menuitem">
          <button type="button" data-controle="aide.methode" disabled={!methode} title={methode ? undefined : 'Sélectionne une terrasse : la méthode décrit son calcul'} onClick={(e) => { tiroir.activer('methode'); fermer(e); }}>
            <span className="coche" aria-hidden="true" />Méthode de calcul
          </button>
        </li>
        <li role="menuitem">
          <button type="button" data-controle="aide.version" onClick={(e) => { showToast(versionLongue()); fermer(e); }}><span className="coche" aria-hidden="true" />Version</button>
        </li>
      </ul>
    </details>
  );
}

/**
 * Le menu Admin : les deux ecrans secondaires de l'admin, l'arbre des controleurs et la palette de
 * l'interface. Il n'existe qu'en admin des demos (`enAdmin`) : hors admin, ces ecrans demandent le
 * mot de passe, et un menu qui y mene n'aurait rien a offrir. Chaque ecran a son bouton de retour.
 */
export function MenuAdmin() {
  if (!enAdmin()) return null;
  const aller = (adresse: string) => (e: React.MouseEvent<HTMLElement>) => { fermer(e); location.assign(adresse); };
  return (
    <details className="menu" id="menuAdmin">
      <summary>Admin</summary>
      <ul role="menu">
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
      </ul>
    </details>
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
function Compte({ magasin }: { magasin: Magasin }) {
  if (enAdmin()) return <SortieAdmin magasin={magasin} />;
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
      void s.fermer().finally(() => { location.reload(); });
    };
    if (magasin.store.getState().etat.dirty) {
      showConfirm('Ce plan porte des modifications non enregistrees. Se deconnecter maintenant les perd. Continuer ?', partir);
      return;
    }
    partir();
  };
  const qui = c.user.display_name || c.user.email || 'Compte';
  const ou = c.tenant.name || c.tenant.slug || '';
  const projets = BACKPROD_API_URL.replace(/\/+$/, '') + (c.tenant.slug ? '/' + c.tenant.slug : '') + '/projects';
  return (
    <div id="compteBar">
      <a className="compteLien" href={projets} target="_blank" rel="noopener"
        title={'Les projets de ' + (ou || 'votre organisation') + ' sur la plateforme, comme ' + qui}>
        Mes projets<span aria-hidden="true"> ↗</span>
      </a>
      <button type="button" className="compteLien compteSortie" onClick={sortir}
        title={'Fermer la session de ' + qui + '. La deconnexion vaut pour la plateforme entiere, pas seulement pour Plan.'}>
        Se déconnecter
      </button>
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
 * (app/porteAdmin.ts). Meme place que « Se deconnecter » de la plateforme, et meme precaution :
 * un plan non enregistre se demande avant de partir.
 */
function SortieAdmin({ magasin }: { magasin: Magasin }) {
  const sortir = () => {
    const partir = () => {
      void import('../app/porteAdmin.js').then(({ quitterAdmin }) => quitterAdmin()).then((refus) => { if (refus) showErrBanner(refus); });
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

export function BarreApplication({ magasin, commandes, projet, tiroir }: PropsBarreApplication) {
  useFermetureDesMenus();
  const p = useStore(magasin.store, (s) => s.projet);
  const vue = useStore(magasin.store, (s) => s.vue);
  const lieu = useStore(magasin.store, (s) => s.lieu);
  const classe = useStore(magasin.store, (s) => s.classe);
  const feuille = useStore(magasin.store, (s) => s.feuille);
  const peutAnnuler = useStore(magasin.store, (s) => s.peutAnnuler);
  useStore(magasin.store, (s) => s.version);
  const executer = (id: string) => (e: React.MouseEvent<HTMLButtonElement>) => { commandes.executer(id, e.currentTarget); };
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
      {p.apiDisponible && (
        <select id="projectSelect" data-controle="projet.choisir" title="Choisir un projet" aria-label="Choisir un projet" value={p.courant ? p.courant.id : ''} onChange={(e) => projet.ouvrir(e.target.value)}>
          {p.liste.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}
      {p.apiDisponible && p.quota && <CompteurProjets quota={p.quota} />}
      {p.apiDisponible && (
        <button data-commande="projet.enregistrer" type="button" id="saveProjectBtn" className="small" disabled={enregistrement || !etatEnregistrer.utilisable}
          title={!etatEnregistrer.utilisable && 'message' in etatEnregistrer ? etatEnregistrer.message : undefined} onClick={executer('projet.enregistrer')}>
          {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      )}
      <MenuFichier magasin={magasin} commandes={commandes} />
      <MenuExporter magasin={magasin} commandes={commandes} tiroir={tiroir} />
      <MenuAffichage magasin={magasin} commandes={commandes} />
      <MenuAide magasin={magasin} tiroir={tiroir} />
      <MenuAdmin />
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
            <button type="button" className="boutonIcone" data-commande="objet.annuler" aria-label="Annuler (Ctrl+Z)" disabled={!peutAnnuler}
              onClick={() => { commandes.executer('objet.annuler'); }}>
              <Icone nom="annuler" />
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
            <Compte magasin={magasin} />
            {lectureSeule && <p className="hint">Votre compte n'a pas le droit d'écrire sur cette organisation : un administrateur peut vous le donner.</p>}
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
      <Compte magasin={magasin} />
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
