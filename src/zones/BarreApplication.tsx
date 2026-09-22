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

import { useStore } from 'zustand';
import { ortho } from '../render/ortho.js';
import { versionLongue } from '../model/version.js';
import { showToast } from '../shell/dialogs.js';
import type { Magasin } from '../app/magasin.js';
import type { RegistreCommandes } from '../app/commandes.js';
import type { Projet } from '../app/projet.js';
import type { Tiroir } from '../app/tiroir.js';
import type { Vue } from '../app/modes.js';

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

/** Referme le menu qui contient l'element : une entree choisie, le menu s'en va. */
function fermer(e: React.SyntheticEvent<HTMLElement>): void {
  e.currentTarget.closest('details')?.removeAttribute('open');
}

interface PropsMenu { magasin: Magasin; commandes: RegistreCommandes }

/** Une entree de menu qui execute une commande, grisee si la commande ne l'est pas. */
function Entree({ commandes, id, libelle, idDom, apres, raccourci }: { commandes: RegistreCommandes; id: string; libelle: string; idDom?: string; apres?: () => void; raccourci?: string }) {
  const c = commandes.obtenir(id);
  const actif = !!c && (!c.actif || c.actif());
  return (
    <li role="menuitem">
      <button type="button" id={idDom} data-commande={id} disabled={!actif} title={c?.description}
        onClick={(e) => { commandes.executer(id, e.currentTarget); if (apres) apres(); fermer(e); }}>
        <span className="coche" aria-hidden="true" />{libelle}
        {raccourci && <kbd>{raccourci}</kbd>}
      </button>
    </li>
  );
}

/** Une case a cocher de reglage, non controlee : la commande qui s'en sert la lit par son identifiant. */
function Case({ idDom, libelle, defaut, titre }: { idDom: string; libelle: string; defaut: boolean; titre?: string }) {
  return (
    <li className="menuCase" role="menuitemcheckbox">
      <label title={titre}><input type="checkbox" id={idDom} defaultChecked={defaut} />{libelle}</label>
    </li>
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
        {p.apiDisponible && <li className="separateur" role="separator" />}
        <Entree commandes={commandes} id="projet.depuisAdresse" libelle="Nouveau plan depuis une adresse…" />
        <Entree commandes={commandes} id="projet.actualiserIgn" libelle="Actualiser depuis l'IGN…" />
        <li className="separateur" role="separator" />
        <Entree commandes={commandes} id="fichier.importerSvg" libelle="Importer un SVG…" idDom="importSvgBtn" />
        <Case idDom="chkReplaceOnImport" libelle="Supprimer les objets existants avant d'importer" defaut={false} />
        <Entree commandes={commandes} id="fichier.importerJson" libelle="Importer un projet (JSON)…" idDom="importJsonBtn" />
        <Case idDom="chkJsonRemplace" libelle="Remplacer le plan actuel" defaut={true} titre="Décoché : les objets du fichier s'ajoutent au plan" />
        <li className="separateur" role="separator" />
        <Entree commandes={commandes} id="fichier.exporterJson" libelle="Exporter le projet (JSON)" idDom="exportJsonBtn" />
        <Case idDom="chkExportSansParcelle" libelle="Exporter sans la parcelle" defaut={false} titre="Retire la parcelle, les parcelles voisines, les mesures qui s'y appuient et la clôture : pour transmettre un aménagement sans divulguer la localisation" />
      </ul>
    </details>
  );
}

function MenuExporter({ commandes, tiroir }: PropsMenu & { tiroir: Tiroir }) {
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
          <label title="L'échelle fixe la taille de la page : à 1/200, 1 m réel = 5 mm sur papier">Échelle du PDF 1/<input type="number" id="pdfScaleInput" defaultValue={200} min={1} step={1} /></label>
        </li>
        <Entree commandes={commandes} id="export.pdf" libelle="PDF du plan" idDom="exportPdfBtn" />
        <li className="separateur" role="separator" />
        <Entree commandes={commandes} id="export.dossier" libelle="Dossier PDF des terrasses" idDom="dossierPdfBtn" />
        <Case idDom="chkDossierEquipements" libelle="Inclure l'emprise des équipements" defaut={true} titre="Spa, mobilier, parasol… : tout objet dont le centre tombe sur la terrasse" />
        <li className="menuAide">Les terrasses du dossier se cochent dans l'explorateur.</li>
        <li className="separateur" role="separator" />
        <Entree commandes={commandes} id="export.glb" libelle="GLB (scène 3D)" idDom="exportGlbBtn" />
      </ul>
    </details>
  );
}

/** Le menu Affichage : les bascules, chacune une commande cochee d'apres l'etat, et le fond orthophoto. */
function MenuAffichage({ magasin, commandes }: PropsMenu) {
  useStore(magasin.store, (s) => s.version);
  const etat = magasin.store.getState().etat;
  const aDuVoisinage = etat.objects.some((o) => o.voisinage);
  const bascules: [string, string, boolean, boolean][] = [
    ['affichage.nord', 'Flèche Nord', etat.showNorth, true],
    ['affichage.grille', 'Grille', etat.grilleVisible, true],
    ['affichage.voisinage', 'Voisinage', etat.voisinageVisible, aDuVoisinage],
    ['affichage.orthophoto', 'Fond orthophoto (IGN)', ortho.actif, true]
  ];
  const curseur = (id: string, idDom: string, idTexte: string, libelle: string, valeur: number, min: number, titre: string) => (
    <li className="menuReglage" title={titre}>
      <label>{libelle}
        <input type="range" id={idDom} min={min} max={100} step={5} defaultValue={valeur} onInput={(e) => commandes.executer(id, e.currentTarget)} />
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
          <button type="button" disabled={!methode} title={methode ? undefined : 'Sélectionne une terrasse : la méthode décrit son calcul'} onClick={(e) => { tiroir.activer('methode'); fermer(e); }}>
            <span className="coche" aria-hidden="true" />Méthode de calcul
          </button>
        </li>
        <li role="menuitem">
          <button type="button" onClick={(e) => { showToast(versionLongue()); fermer(e); }}><span className="coche" aria-hidden="true" />Version</button>
        </li>
      </ul>
    </details>
  );
}

export function BarreApplication({ magasin, commandes, projet, tiroir }: PropsBarreApplication) {
  const p = useStore(magasin.store, (s) => s.projet);
  const vue = useStore(magasin.store, (s) => s.vue);
  const lieu = useStore(magasin.store, (s) => s.lieu);
  const executer = (id: string) => (e: React.MouseEvent<HTMLButtonElement>) => { commandes.executer(id, e.currentTarget); };
  const enregistrement = p.statut === 'enregistrement';

  return (
    <>
      <div id="projectBar" className={p.apiDisponible ? '' : 'localMode'}>
        {p.apiDisponible && (
          <select id="projectSelect" title="Choisir un projet" value={p.courant ? p.courant.id : ''} onChange={(e) => projet.ouvrir(e.target.value)}>
            {p.liste.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        {p.apiDisponible && (
          <button type="button" id="saveProjectBtn" className="small" disabled={enregistrement} onClick={executer('projet.enregistrer')}>
            {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        )}
        <MenuFichier magasin={magasin} commandes={commandes} />
        <MenuExporter magasin={magasin} commandes={commandes} tiroir={tiroir} />
        <MenuAffichage magasin={magasin} commandes={commandes} />
        <MenuAide magasin={magasin} tiroir={tiroir} />
      </div>
      <div id="modeBar">
        {VUES.map(([cle, id, libelle, titre]) => (
          <button key={cle} type="button" id={id} className={'objbtn' + (vue === cle ? ' active' : '')} title={titre || undefined} onClick={executer(COMMANDE_DE_VUE[cle])}>{libelle}</button>
        ))}
      </div>
      <h1>
        Plan interactif — {p.courant ? p.courant.name : 'Parcelle AE 101'}
        <span id="titreLieu" title={lieu ? 'Position de la parcelle : elle cale la course du soleil, le fond orthophoto et l\'interrogation du PLU.' : undefined}>{lieu}</span>
      </h1>
    </>
  );
}
