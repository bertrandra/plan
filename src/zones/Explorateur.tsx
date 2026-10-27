// Z3, l'explorateur (spec-ihm-zones §4.3) : ce qu'il y a dans le plan.
//
// Etape 3 de la reconstruction : il remplace le selecteur d'objets au-dessus du plan, la table
// d'affichage de l'onglet Affichage, la barre de choix de la terrasse et les cases des couches du
// mode Terrasse. Trois sections — les objets par categorie, le voisinage, et, pour une terrasse
// selectionnee seulement, les terrasses — et une
// regle : selectionner ici, c'est selectionner sur le canevas ; masquer ici, c'est masquer partout.
// La zone ne fait rien elle-meme : elle lit le magasin et demande a l'explorateur (app/).
//
// Tactile : lignes de 40 px, cases de 20 px ; sous 1 024 px la colonne s'escamote (feuille de style).
//
// Le repli est une classe du conteneur (#zoneExplorateur, index.html), posee par le service : c'est
// lui qui a une largeur dans la rangee de l'atelier, pas le panneau que React y rend.

import { memo, useRef, useState, type MutableRefObject } from 'react';
import { useStore } from 'zustand';
import { LIBELLE_FONCTION } from '../model/defaults.js';
import { shoelace } from '../geometry/basic.js';
import { sommetsDe } from '../model/formes.js';
import { hauteurFinieMm } from '../engine/hauteurs.js';
import { ensureConstruction } from '../engine/construction.js';
import { estPlots } from '../engine/constantes.js';
import { TERRASSE_LAYER_DEFS, terrasseLayerVisible } from '../render/terrasseCouches.js';
import { clesDossier, dossierSelection } from '../app/dossier.js';
import { estTerrasse, terrasseSelectionnee } from '../core/contexteTerrasse.js';
import type { Magasin } from '../app/magasin.js';
import { useVersionVisible } from './composants/versionVisible.js';
import type { RegistreCommandes } from '../app/commandes.js';
import type { ChampVisibilite, Explorateur as ServiceExplorateur } from '../app/explorateur.js';
import type { ObjetPlan } from '../model/types.js';
import type { EtatApp } from '../core/state.js';
import { Icone } from './icones.js';
import { EnteteFeuille } from './composants/Feuille.js';
import { surfaceNetteTerrasse } from '../engine/structure.js';

export interface PropsExplorateur { magasin: Magasin; commandes: RegistreCommandes; explorateur: ServiceExplorateur }

/** Les cinq etiquettes qu'un objet peut porter sur le plan. */
const ETIQUETTES: [Exclude<ChampVisibilite, 'hidden'>, string, string][] = [
  ['showName', 'Nom', 'Le nom de l\'objet'],
  ['showSegNames', 'Côtés', 'Le nom de chaque côté'],
  ['showVertNames', 'Coins', 'Le nom de chaque coin'],
  ['showDims', 'Cotes', 'La longueur de chaque côté'],
  ['showAngles', 'Angles', 'L\'angle de chaque coin']
];

const famille = (o: ObjetPlan) => o.fonction || 'autre';
const libelleFamille = (cle: string) => LIBELLE_FONCTION[cle] || cle;

function fermerMenu(e: React.SyntheticEvent<HTMLElement>): void {
  e.currentTarget.closest('details')?.removeAttribute('open');
}

/** Les objets, par categorie, avec leur visibilite. */
function Objets({ etat, explorateur, commandes, apresSelection }: { etat: EtatApp; explorateur: ServiceExplorateur; commandes: RegistreCommandes; apresSelection: () => void }) {
  // Masquer un objet ou changer ses etiquettes est une preference d'affichage, permise en lecture
  // seule (app/explorateur.ts) ; les commandes restent la seule voie (app/ecouteurs/cibles.ts).
  const ecrire = commandes.etat('objet.visibilite').utilisable;
  // Les lignes ne se refont que si ce qu'elles montrent change (LigneObjet) : les services qu'elles appellent passent par une
  // reference, que chaque rendu remet a jour sans que la ligne le voie.
  const rappels = useRef<Rappels>({ explorateur, commandes, apresSelection });
  rappels.current = { explorateur, commandes, apresSelection };
  // Le voisinage masque n'est pas liste : proposer un objet qu'on ne voit pas n'aurait pas de
  // sens, et les compteurs decriraient un plan qui n'est pas celui affiche. Un objet masque
  // individuellement reste, lui, dans la liste : c'est ici qu'on le demasque.
  const listables = etat.objects.filter(o => !(o.voisinage && !etat.voisinageVisible));
  const familles: string[] = [];
  listables.forEach(o => { if (!familles.includes(famille(o))) familles.push(famille(o)); });

  // Le filtre d'ouverture est le terrain : c'est la parcelle qu'on regarde en arrivant, et un plan
  // importe du cadastre compte facilement 60 objets. Le filtre suit ensuite la selection : un objet
  // choisi sur le canevas hors de la categorie affichee y amene la liste.
  const [filtre, setFiltre] = useState('terrain');
  const derniereSelection = useRef(etat.selectedKey);
  const selection = listables.find(o => o.key === etat.selectedKey);
  let filtreEffectif = familles.includes(filtre) ? filtre : 'tout';
  if (derniereSelection.current !== etat.selectedKey) {
    derniereSelection.current = etat.selectedKey;
    if (selection && filtreEffectif !== 'tout' && famille(selection) !== filtreEffectif) {
      filtreEffectif = famille(selection);
      setFiltre(filtreEffectif);
    }
  }
  const visibles = filtreEffectif === 'tout' ? listables : listables.filter(o => famille(o) === filtreEffectif);
  const tousMasques = listables.length > 0 && listables.every(o => o.hidden);

  return (
    <section className="explorateurSection" aria-label="Objets">
      <h3>Objets <span className="explorateurCompte">{listables.length}</span></h3>
      {familles.length > 1 && (
        <div className="explorateurFamilles" role="tablist">
          <button type="button" role="tab" data-controle="explorateur.filtreFamille" className={'fambtn' + (filtreEffectif === 'tout' ? ' active' : '')} aria-selected={filtreEffectif === 'tout'} onClick={() => setFiltre('tout')}>
            Tout<span className="fambtnN" data-compte>{listables.length}</span>
          </button>
          {familles.map(f => (
            <button key={f} type="button" role="tab" data-controle="explorateur.filtreFamille" className={'fambtn' + (filtreEffectif === f ? ' active' : '')} aria-selected={filtreEffectif === f} onClick={() => setFiltre(f)}>
              {libelleFamille(f)}<span className="fambtnN" data-compte>{listables.filter(o => famille(o) === f).length}</span>
            </button>
          ))}
        </div>
      )}
      <div className="explorateurTous">
        <button type="button" className="oeil" data-commande="objet.masquerTous" disabled={!ecrire} aria-pressed={!tousMasques} aria-label={tousMasques ? 'Afficher tous les objets' : 'Masquer tous les objets'} title={tousMasques ? 'Afficher tous les objets' : 'Masquer tous les objets'} onClick={() => commandes.executer('objet.masquerTous')}>
          <Icone nom={tousMasques ? 'oeilBarre' : 'oeil'} taille={18} />
        </button>
        <details className="menu">
          <summary title="Les étiquettes de tous les objets">Étiquettes</summary>
          <ul role="menu">
            {ETIQUETTES.map(([champ, libelle, titre]) => {
              const tous = listables.length > 0 && listables.every(o => o[champ]);
              return (
                <li key={champ} role="menuitemcheckbox" aria-checked={tous}>
                  <button type="button" data-commande="objet.etiquettesTous" data-nom={'Étiquettes de tous les objets : ' + libelle} disabled={!ecrire} title={titre} onClick={(e) => { commandes.executer('objet.etiquettesTous', e.currentTarget, { valeur: champ }); fermerMenu(e); }}>
                    <span className="coche" aria-hidden="true">{tous ? '✓' : ''}</span>{libelle}
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      </div>
      <ul className="explorateurListe">
        {visibles.map(o => {
          const actif = o.key === etat.selectedKey;
          return (
            <LigneObjet key={o.key} cle={o.key} nom={o.name} titre={o.name + ' — ' + libelleFamille(famille(o))} actif={actif} masque={!!o.hidden} ecrire={ecrire}
              etiquettes={actif ? ETIQUETTES.map(([champ]) => (o[champ] ? '1' : '0')).join('') : ''} rappels={rappels} />
          );
        })}
      </ul>
    </section>
  );
}

interface Rappels { explorateur: ServiceExplorateur; commandes: RegistreCommandes; apresSelection: () => void }

/**
 * Une ligne de la liste des objets. Le plan est modifie sur place, si bien que chaque rendu refaisait toutes les lignes, des
 * centaines sur un plan importe (feuille de route, etape 2.2) : la ligne ne recoit que ce qu'elle montre, en valeurs simples, et
 * React ne la refait que si l'une d'elles change. `etiquettes` : les cases de la ligne selectionnee, un chiffre par etiquette.
 */
const LigneObjet = memo(function LigneObjet({ cle, nom, titre, actif, masque, ecrire, etiquettes, rappels }: {
  cle: string; nom: string; titre: string; actif: boolean; masque: boolean; ecrire: boolean; etiquettes: string; rappels: MutableRefObject<Rappels>;
}) {
  return (
    <li data-instance={nom} className={(actif ? 'active' : '') + (masque ? ' masque' : '')}>
      <div className="explorateurLigne">
        <button type="button" className="explorateurNom" data-controle="explorateur.selectionnerObjet" data-nom="Sélectionner l’objet" data-key={cle} aria-current={actif ? 'true' : undefined} title={titre} onClick={() => { rappels.current.explorateur.selectionner(actif ? null : cle); if (!actif) rappels.current.apresSelection(); }}>
          {nom}
        </button>
        <button type="button" className="oeil" data-commande="objet.visibilite" data-nom="Masquer / afficher l’objet" disabled={!ecrire} aria-pressed={!masque} aria-label={(masque ? 'Afficher ' : 'Masquer ') + nom} title={masque ? 'Afficher sur le plan et en 3D' : 'Masquer sur le plan et en 3D (reste modifiable ici)'} onClick={() => rappels.current.commandes.executer('objet.visibilite', undefined, { objet: cle })}>
          <Icone nom={masque ? 'oeilBarre' : 'oeil'} taille={18} />
        </button>
      </div>
      {actif && (
        <div className="explorateurEtiquettes">
          {ETIQUETTES.map(([champ, libelle, titreCase], i) => (
            <label key={champ} title={titreCase}>
              <input type="checkbox" data-commande="objet.etiquette" disabled={!ecrire} checked={etiquettes[i] === '1'} onChange={() => rappels.current.commandes.executer('objet.etiquette', undefined, { objet: cle, valeur: champ })} />
              {libelle}
            </label>
          ))}
        </div>
      )}
    </li>
  );
});

/** Les terrasses : laquelle est selectionnee, ses couches sur le plan, celles du dossier. */
function Terrasses({ etat, explorateur, apresSelection }: { etat: EtatApp; explorateur: ServiceExplorateur; apresSelection: () => void }) {
  const terrasses = etat.objects.filter(estTerrasse);
  // La terrasse selectionnee, et non la courante : ses couches et sa mise en avant ne se montrent
  // que tant qu'on l'a sous la main, comme les onglets du tiroir.
  const courante = terrasses.find(t => t.key === etat.selectedKey);
  // La selection du dossier se repare a la lecture : rien de coche veut dire toutes.
  clesDossier(etat.objects);
  const construction = courante ? ensureConstruction(courante) : null;
  return (
    <section className="explorateurSection" aria-label="Terrasses">
      <h3>Terrasses <span className="explorateurCompte">{terrasses.length}</span></h3>
      {terrasses.length === 0 && (
        <p className="explorateurVide">Aucune terrasse : règle « Fonction » sur « terrasse » dans l'onglet Objet de l'élément concerné.</p>
      )}
      <ul className="explorateurListe">
        {terrasses.map(t => {
          const estCourante = t.key === etat.selectedKey;
          const hMm = hauteurFinieMm(t);
          return (
            <li key={t.key} data-instance={t.name} className={estCourante ? 'active' : ''}>
              <div className="explorateurLigne">
                <button type="button" className="explorateurNom" data-controle="explorateur.choisirTerrasse" data-nom="Choisir la terrasse" data-terrasse={t.key} aria-current={estCourante ? 'true' : undefined} title={estCourante ? 'Terrasse sélectionnée : l\'inspecteur et le tiroir la décrivent' : 'Sélectionner cette terrasse'} onClick={() => { explorateur.selectionner(t.key); apresSelection(); }}>
                  <span>{t.name}</span>
                  <small>{(t.type === 'polygon' ? surfaceNetteTerrasse(t.pts, etat.objects) : shoelace(sommetsDe(t))).toFixed(2).replace('.', ',')} m² · h. finie {(hMm / 10).toFixed(1).replace(/\.0$/, '').replace('.', ',')} cm</small>
                </button>
                <label className="explorateurDossier" title="Retenir cette terrasse pour le dossier PDF (onglet Export)">
                  <input type="checkbox" data-controle="explorateur.dossierTerrasse" checked={dossierSelection.has(t.key)} onChange={() => explorateur.basculerDossier(t.key)} />
                  Dossier
                </label>
              </div>
            </li>
          );
        })}
      </ul>
      {courante && construction && (
        <div className="explorateurCalques">
          <label className="explorateurCalquesMaitre" title="Dessine la structure de la terrasse sélectionnée par-dessus le plan">
            <input type="checkbox" data-controle="explorateur.structureSurPlan" checked={etat.calquesVisibles} onChange={() => explorateur.basculerCalques()} />
            Structure sur le plan
          </label>
          {etat.calquesVisibles && TERRASSE_LAYER_DEFS.map(([cle, libelle, couleur]) => {
            // Deux libelles dependent du mode d'appui : « Vis » devient « Plots », et les solives
            // n'existent pas dans une pose simple sur plots — une case qui ne dessinerait jamais rien
            // laisserait croire a un bug.
            if (cle === 'solives' && estPlots(construction) && !construction.plotAvecSolives) return null;
            const nom = cle === 'vis' ? (estPlots(construction) ? 'Plots' : 'Vis') : libelle;
            return (
              <label key={cle}>
                <input type="checkbox" data-controle="explorateur.calque" checked={!!terrasseLayerVisible[cle]} onChange={() => explorateur.basculerCalque(cle)} />
                <span className="explorateurCouleur" style={{ background: couleur }} aria-hidden="true" />
                {nom}
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function Explorateur({ magasin, commandes, explorateur }: PropsExplorateur) {
  useVersionVisible(magasin, 'explorateur');
  const ouvertStore = useStore(magasin.store, (s) => s.explorateurOuvert);
  const classe = useStore(magasin.store, (s) => s.classe);
  const compact = classe === 'compact';
  // Sur telephone, l'explorateur est la feuille Objets : il n'a pas de repli, la feuille se ferme.
  const ouvert = compact || ouvertStore;
  const etat = magasin.store.getState().etat;
  const nVoisinage = etat.objects.filter(o => o.voisinage).length;
  // Sur telephone, choisir un objet dans la liste referme la feuille : on le voit alors sur le plan,
  // avec la feuille de selection (spec-ihm-mobile §6.3).
  // Sur telephone et tablette, on cadre ensuite la vue sur l'objet choisi (maquette, 2.1.1) : un
  // plan entier sur 390 px rend l'objet trop petit pour etre edite, et ses etiquettes s'empilent. Le
  // cadrage attend que la feuille de selection soit posee, pour cadrer au-dessus d'elle. Toucher un
  // objet sur le plan, lui, ne bouge pas la vue : le geste qui suit pourrait etre un glisser.
  const apresSelection = () => {
    if (compact) magasin.definirFeuille(null);
    if (classe !== 'large') requestAnimationFrame(() => requestAnimationFrame(() => { commandes.executer('vue.ajuster'); }));
  };

  const sections = (
    <>
      <Objets etat={etat} explorateur={explorateur} commandes={commandes} apresSelection={apresSelection} />
      {nVoisinage > 0 && (
        <section className="explorateurSection" aria-label="Voisinage">
          <div className="explorateurLigne">
            <span className="explorateurNom" title={'Les ' + nVoisinage + ' objets importés avec les parcelles adjacentes (bâti, végétation, arbres estimés)'}>
              Voisinage <span className="explorateurCompte">{nVoisinage}</span>
            </span>
            <button data-commande="affichage.voisinage" type="button" className="oeil" aria-pressed={etat.voisinageVisible} aria-label={etat.voisinageVisible ? 'Masquer le voisinage' : 'Afficher le voisinage'} title={etat.voisinageVisible ? 'Masquer le voisinage (rien n\'est supprimé)' : 'Afficher le voisinage'} onClick={() => commandes.executer('affichage.voisinage')}>
              <Icone nom={etat.voisinageVisible ? 'oeil' : 'oeilBarre'} taille={18} />
            </button>
          </div>
        </section>
      )}
      {/* La section Terrasses n'existe que pour une terrasse selectionnee : le reste du temps, la
          categorie Terrasse des objets suffit a en choisir une. */}
      {terrasseSelectionnee(etat) && <Terrasses etat={etat} explorateur={explorateur} apresSelection={apresSelection} />}
    </>
  );

  if (compact) {
    return (
      <aside className="explorateurPanneau" aria-label="Objets du plan">
        <EnteteFeuille magasin={magasin} titre="Objets" sousTitre={etat.objects.length + ' objets dans le plan'} />
        <div className="corpsFeuille">{sections}</div>
      </aside>
    );
  }

  return (
    <aside className="explorateurPanneau" aria-label="Explorateur">
      <div className="explorateurEntete">
        {ouvert && <span>Explorateur</span>}
        <button type="button" data-controle="explorateur.replier" className="explorateurPli" title={ouvert ? 'Replier l\'explorateur' : 'Déplier l\'explorateur'} aria-label={ouvert ? 'Replier l\'explorateur' : 'Déplier l\'explorateur'} aria-expanded={ouvert} onClick={() => explorateur.basculerOuverture()}>
          {ouvert ? '‹' : '›'}
        </button>
      </div>
      {ouvert && sections}
    </aside>
  );
}
