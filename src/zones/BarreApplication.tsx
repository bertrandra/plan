// Z1, la barre d'application (spec-ihm-zones §4.1) : le projet, l'affichage, les vues, le titre.
//
// Etape 1 de la reconstruction : cette zone remplace `#projectBar`, `#modeBar` et le `<h1>`
// d'index.html. Etape 2 : elle gagne le menu Affichage. Etape 3 : le bouton Terrasse disparait, la
// terrasse etant un contexte du plan et non une vue (spec-ihm-zones §7, decision 4). Elle ne sait rien faire par elle-meme —
// chaque bouton execute une commande du registre, le `<select>` demande au projet de s'ouvrir — et
// elle lit tout dans le magasin. Les identifiants `projectSelect`, `saveProjectBtn`,
// `modePlanBtn`… restent les memes que dans l'ancien balisage : la checklist de fumee et les
// scripts de deploiement les cherchent.

import { useStore } from 'zustand';
import { ortho } from '../render/ortho.js';
import type { Magasin } from '../app/magasin.js';
import type { RegistreCommandes } from '../app/commandes.js';
import type { Projet } from '../app/projet.js';
import type { Vue } from '../app/modes.js';

export interface PropsBarreApplication {
  magasin: Magasin;
  commandes: RegistreCommandes;
  projet: Projet;
}

const VUES: [Vue, string, string, string][] = [
  ['plan', 'modePlanBtn', 'Plan', ''],
  ['vue3d', 'mode3dBtn', 'Vue 3D', 'Vue 3D du plan et de la terrasse courante'],
  ['visionneuse', 'glbViewerBtn', 'Visionneuse GLB', 'Relit le dernier fichier GLB exporte (onglet Export), pour verifier le fichier reel avant de le partager']
];
const COMMANDE_DE_VUE: Record<Vue, string> = { plan: 'vue.plan', vue3d: 'vue.3d', visionneuse: 'vue.visionneuse' };

/** Le menu Affichage : quatre bascules, chacune une commande, cochee d'apres l'etat du plan. */
function MenuAffichage({ magasin, commandes }: { magasin: Magasin; commandes: RegistreCommandes }) {
  useStore(magasin.store, (s) => s.version);
  const etat = magasin.store.getState().etat;
  const aDuVoisinage = etat.objects.some((o) => o.voisinage);
  const bascules: [string, string, boolean, boolean][] = [
    ['affichage.nord', 'Flèche Nord', etat.showNorth, true],
    ['affichage.grille', 'Grille', etat.grilleVisible, true],
    ['affichage.voisinage', 'Voisinage', etat.voisinageVisible, aDuVoisinage],
    ['affichage.orthophoto', 'Fond orthophoto', ortho.actif, true]
  ];
  return (
    <details className="menu" id="menuAffichage">
      <summary>Affichage</summary>
      <ul role="menu">
        {bascules.filter(([, , , visible]) => visible).map(([id, libelle, coche]) => (
          <li key={id} role="menuitemcheckbox" aria-checked={coche}>
            <button type="button" data-commande={id} onClick={(e) => { commandes.executer(id); e.currentTarget.closest('details')?.removeAttribute('open'); }}>
              <span className="coche" aria-hidden="true">{coche ? '✓' : ''}</span>{libelle}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function BarreApplication({ magasin, commandes, projet }: PropsBarreApplication) {
  const p = useStore(magasin.store, (s) => s.projet);
  const vue = useStore(magasin.store, (s) => s.vue);
  const lieu = useStore(magasin.store, (s) => s.lieu);
  const executer = (id: string) => (e: React.MouseEvent<HTMLButtonElement>) => { commandes.executer(id, e.currentTarget); };
  const commande = (id: string) => commandes.obtenir(id);
  const enregistrement = p.statut === 'enregistrement';

  return (
    <>
      <div id="projectBar" className={p.apiDisponible ? '' : 'localMode'}>
        {p.apiDisponible && (
          <select id="projectSelect" title="Choisir un projet" value={p.courant ? p.courant.id : ''} onChange={(e) => projet.ouvrir(e.target.value)}>
            {p.liste.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        {p.apiDisponible && <button type="button" className="secondary small" onClick={executer('projet.nouveau')}>+ Nouveau projet</button>}
        <button type="button" className="secondary small" title={commande('projet.depuisAdresse')?.description} onClick={executer('projet.depuisAdresse')}>+ Depuis une adresse</button>
        <button type="button" className="secondary small" title={commande('projet.actualiserIgn')?.description} onClick={executer('projet.actualiserIgn')}>↻ Actualiser IGN</button>
        {p.apiDisponible && (
          <button type="button" id="saveProjectBtn" className="small" disabled={enregistrement} onClick={executer('projet.enregistrer')}>
            {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        )}
        {p.apiDisponible && (
          <button type="button" className="secondary small" title={commande('projet.supprimer')?.description} disabled={p.liste.length <= 1} onClick={executer('projet.supprimer')}>Supprimer</button>
        )}
        <MenuAffichage magasin={magasin} commandes={commandes} />
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
