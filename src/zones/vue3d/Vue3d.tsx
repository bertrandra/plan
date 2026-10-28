// Z4 en Vue 3D : le panneau de la vue, ses reglages et les commandes de camera (spec-ihm-zones §4.4).
//
// La scene elle-meme reste du WebGL natif (three/scene.ts, ADR-16 point 3) : le composant fournit son
// hote, `#terrasse3dCanvasHost`, et l'enregistre dans `hotes3d` — three/ y pose son canvas sans le
// chercher par identifiant. Tout le reste — cases, soleil, points de vue, plein page, aide du mode de
// glisser — se lit dans l'etat de la 3D (`affichage3d`, `vue3d`, `soleilVue3d`) a chaque signal.
//
// Le panneau est toujours monte, cache hors de la Vue 3D : son hote doit survivre aux allers-retours,
// three/ le vide lui-meme en demontant sa scene.

import { libelleIsoler, objetAIsoler } from '../../app/isolement.js';
import { lazy, Suspense, useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { estTerrasse } from '../../model/fonctions.js';
import { useStore } from 'zustand';
import { abonner3d, affichage3d, version3d, vue3d, poserHote3d } from '../../three/etat3d.js';
import { QUALITES_3D, estQualite3d } from '../../three/qualite.js';
import { promenadeActive } from '../../three/presentation.js';
import { Icone } from '../icones.js';
import { Horloge } from './Horloge.js';
import { BoutonModifierToit } from './BoutonModifierToit.js';

// Le panneau du mode Toit et le catalogue des toits (three/gestesToits.ts) se chargent a l'ouverture de la Vue 3D (AD-10).
const ModeToit = lazy(() => import('./ModeToit.js').then((m) => ({ default: m.ModeToit })));
import { EnteteReglages, ListePointsDeVue, LigneDate, LigneIntensite, CaseAppoint, BarreHeure, type IdsSoleil, type ServiceVues3d } from './communs.js';
import type { DeuxVues } from '../../three/comparaison3d.js';
import type { EtatMagasin, Magasin } from '../../app/magasin.js';
import { sessionToit } from '../../app/toits/modeToit.js';
import type { RegistreCommandes } from '../../app/commandes.js';
import type { Inspecteur } from '../../app/inspecteur.js';
import { sectionVoisinage3d } from '../../ui/champs/voisinage3d.js';
import { ListeChamps, Tactile, useServiceLocal } from '../composants/Champs.js';
import { useCle, cleEtat, CLE_GELEE } from '../composants/abonnement.js';

export function useEtat3d(): number { return useSyncExternalStore(abonner3d, version3d); }

/** `inspecteur` : le service qui ecrit les champs du voisinage (sur la parcelle du projet), comme dans l'inspecteur. */
interface Props { magasin: Magasin; commandes: RegistreCommandes; vues: ServiceVues3d; inspecteur: Inspecteur }

const IDS_SOLEIL: IdsSoleil = {
  vue: 'vue3d', date: 'vue3dDate', semaine: 'vue3dSemaine', heure: 'vue3dHeure', heureTexte: 'vue3dHeureTexte',
  intensite: 'vue3dIntensite', intensiteTexte: 'vue3dIntensiteTexte', appoint: 'vue3dLumiereAppoint', info: 'vue3dSoleilInfo'
};

function Case({ id, controle, libelle, coche, titre, onChange }: { id: string; controle: string; libelle: string; coche: boolean; titre?: string; onChange: (v: boolean) => void }) {
  return (
    <label className="caseReglage" title={titre}>
      <input type="checkbox" id={id} data-controle={controle} checked={coche} onChange={(e) => onChange(e.target.checked)} /> {libelle}
    </label>
  );
}

/** Le groupe « Présentation » (R6) : heure dorée, promenade, capture HD, chacun une commande. */
function GroupePresentation({ commandes }: { commandes: RegistreCommandes }) {
  return (
    <fieldset className="groupe3d">
      <legend>Présentation</legend>
      {(['3d.heureDoree', '3d.promenade', '3d.captureHd'] as const).map((id) => {
        const e = commandes.etat(id);
        if (!e.utilisable && e.raison === 'capacite') return null;
        const libelle = id === '3d.promenade' && promenadeActive() ? 'Arrêter la promenade' : (commandes.obtenir(id)?.libelle ?? id);
        return (
          <button key={id} data-commande={id} type="button" className="objbtn small boutonVue3d"
            title={(!e.utilisable && 'message' in e ? e.message : null) ?? commandes.obtenir(id)?.description}
            disabled={!e.utilisable}
            onClick={(ev) => { commandes.executer(id, ev.currentTarget); }}>
            <Icone nom={id === '3d.heureDoree' ? 'soleil' : id === '3d.captureHd' ? 'image' : 'pointDeVue'} taille={18} /><span className="libelleVue3d">{libelle}</span>
          </button>
        );
      })}
    </fieldset>
  );
}

/**
 * Le groupe « Voisinage » : l'apparence des maisons, des fenetres, des clotures et des rues voisines en
 * 3D. Un reglage de la vue, pas une propriete d'un objet : ses champs (ui/champs/voisinage3d.ts) sont
 * ranges sur la parcelle du projet et ecrits par le service de l'inspecteur, sans Ctrl+Z ni « projet
 * modifie ». Sans parcelle du projet, pas de groupe.
 */
function GroupeVoisinage({ inspecteur, magasin }: { inspecteur: Inspecteur; magasin: Magasin }) {
  const tactile = useStore(magasin.store, (s) => s.classe) !== 'large';
  const service = useServiceLocal(inspecteur);
  const parcelle = inspecteur.parcelle();
  const c = parcelle ? inspecteur.contexte(parcelle) : null;
  const section = c ? sectionVoisinage3d(c) : null;
  if (!c || !section) return null;
  return (
    <Tactile.Provider value={tactile}>
      <fieldset className="groupe3d groupeChamps3d hoteChamps" data-section={section.id}>
        <legend>Voisinage</legend>
        <div className="champs"><ListeChamps champs={section.champs} c={c} inspecteur={service} /></div>
      </fieldset>
    </Tactile.Provider>
  );
}

/** Un bouton de camera sur le canevas : une commande, une icone, son etat actif le cas echeant. */
function Bouton3d({ commandes, id, domId, icone, libelle, titre, actif }: { commandes: RegistreCommandes; id: string; domId: string; icone: Parameters<typeof Icone>[0]['nom']; libelle: string; titre: string; actif?: boolean }) {
  return (
    <button id={domId} data-commande={id} type="button" className={'bouton3d' + (actif ? ' actif' : '')} title={titre} aria-label={libelle}
      aria-pressed={actif === undefined ? undefined : actif} onClick={(e) => { commandes.executer(id, e.currentTarget); }}>
      <Icone nom={icone} taille={20} />
    </button>
  );
}

/**
 * L'avant et l'apres d'un audit en deux vues (three/comparaison3d.ts) : le nom de chaque vue dans son
 * coin bas gauche (le haut gauche est a l'horloge), et le filet qui les separe. Ils ne captent aucun
 * geste : la scene se tourne au travers. Les positions sont celles que three/ a calculees.
 */
function EtiquettesDeuxVues({ vues }: { vues: DeuxVues }) {
  const { avant, apres, sens } = vues;
  const filet = sens === 'cote'
    ? { left: avant.x + avant.l, top: avant.y, width: Math.max(0, apres.x - avant.x - avant.l), height: avant.h }
    : { left: avant.x, top: avant.y + avant.h, width: avant.l, height: Math.max(0, apres.y - avant.y - avant.h) };
  return (
    <>
      <div className="filetDeuxVues" style={filet} aria-hidden="true" />
      <span className="etiquetteDeuxVues" data-vue="avant" style={{ left: avant.x + 8, top: avant.y + avant.h - 8 }}>Avant</span>
      <span className="etiquetteDeuxVues" data-vue="apres" style={{ left: apres.x + 8, top: apres.y + apres.h - 8 }}>Après</span>
    </>
  );
}

// Les commandes dont la vue montre l'etat elle-meme (les boutons de camera suivent chacun la leur, s'ils le font).
const COMMANDES_VUE3D = ['3d.enregistrerPointDeVue', 'audit.suivre', '3d.heureDoree', '3d.promenade', '3d.captureHd', 'terrasse.isoler', 'toit.modifier'];

/**
 * La cle de la Vue 3D (zones/composants/abonnement.ts). Montree, elle suit ce qu'elle lit du plan : les attributs des objets (la
 * selection, l'isolement, les reglages de la terrasse), l'audit, l'etat de ses commandes et le lieu ; pas la forme des objets ni
 * chaque rendu du plan (la scene 3D, elle, se refait par ses propres chemins). En session du toit, elle les suit tous, comme le
 * panneau du mode qu'elle porte (zones/vue3d/ModeToit.tsx) : l'indice, les poignees et le plan du toit se posent d'apres la
 * session et la camera, qu'aucune cle ne decrit. Cachee sur le plan, sa cle est gelee.
 */
export function cleVue3d(s: EtatMagasin, commandes: Pick<RegistreCommandes, 'etat'>, vues: Pick<ServiceVues3d, 'libelleLieu'>,
  enSession = !!sessionToit()): string {
  if (s.vue !== 'vue3d') return CLE_GELEE;
  return cleEtat(s) + JSON.stringify([COMMANDES_VUE3D.map((id) => commandes.etat(id)), promenadeActive(), vues.libelleLieu(), enSession ? s.version : null]);
}

function useCleVue3d(magasin: Magasin, commandes: RegistreCommandes, vues: ServiceVues3d): void {
  useCle(magasin, 'vue 3D', (s) => cleVue3d(s, commandes, vues));
}

export function Vue3d({ magasin, commandes, vues, inspecteur }: Props) {
  useEtat3d();
  useCleVue3d(magasin, commandes, vues);
  const visible = useStore(magasin.store, (s) => s.vue) === 'vue3d';
  const pleinePage = affichage3d.pleinePage3d;
  const r = vues.reglages;
  const etatPlan = magasin.store.getState().etat;
  // Le mode audit (app/audit/) : l'etat de la promenade et ses deux gestes, sous les reglages.
  const audit = etatPlan.audit;
  const libIsoler = libelleIsoler(etatPlan.isolement !== null ? etatPlan.objects.find(o => o.key === etatPlan.isolement) : objetAIsoler(etatPlan));
  // Les reglages de la terrasse (filaire, translucide, sol en coupe) ne se montrent que si c'est une
  // terrasse qui est selectionnee : sur un batiment ou la parcelle, ils ne disent rien.
  const selection = etatPlan.objects.find(o => o.key === etatPlan.selectedKey);
  const terrasse = !!selection && estTerrasse(selection);
  // Le tiroir des reglages, replie sur son titre par defaut (bureau) ; l'heure et la date, sous
  // l'horloge du canevas, qu'un clic ouvre et referme.
  const [tiroir, setTiroir] = useState(false);
  const [heure, setHeure] = useState(false);
  // Le plein page change la taille de l'hote : la scene suit, une fois la mise en page faite. Le
  // tiroir, lui, glisse par-dessus la scene sans la redimensionner.
  useLayoutEffect(() => { vues.redimensionner3d(); }, [pleinePage, vues]);
  useEffect(() => {
    if (!heure) return;
    const fermer = (e: KeyboardEvent) => { if (e.key === 'Escape') setHeure(false); };
    window.addEventListener('keydown', fermer);
    return () => window.removeEventListener('keydown', fermer);
  }, [heure]);

  return (
    <div id="vue3dPanel" className={'panelBox vue3dPanneau' + (pleinePage ? ' pleinePage' : '')} style={{ display: visible ? 'block' : 'none' }}>
      {/* Pas de titre « Vue 3D » : l'onglet de la barre le dit deja. Sur bureau, les reglages sont
          un tiroir replie sur une ligne ; ouvert, des groupes par theme, le detail dans les infobulles.
          Sur telephone et tablette, la meme zone est une feuille, toujours depliee. */}
      <div id="zoneReglages3d" className={'reglages3d' + (tiroir ? ' ouvert' : '')} role="group" aria-label="Réglages de la vue 3D">
        <button type="button" className="titreTiroir3d" data-controle="vue3d.tiroir" aria-expanded={tiroir} aria-controls="corpsReglages3d" onClick={() => setTiroir(!tiroir)}>
          <Icone nom={tiroir ? 'chevronHaut' : 'chevronBas'} taille={16} />
          <span>Réglages de la vue 3D</span>
        </button>
        <EnteteReglages vue="vue3d" titre="Réglages de la vue 3D" idLieu="vue3dLieu" lieu={vues.libelleLieu()} magasin={magasin} />
        <div className="corpsFeuille" id="corpsReglages3d">
          <div className="groupes3d">
            {terrasse && <fieldset className="groupe3d">
              <legend>Terrasse</legend>
              <Case id="terrasse3dFilaire" controle="vue3d.filaire" libelle="Filaire" coche={r.filaire()} onChange={r.basculerFilaire}
                titre="Lames en filaire : voir la structure dessous" />
              <Case id="terrasse3dTranslucide" controle="vue3d.platelageTranslucide" libelle="Translucide" coche={vue3d.platelageTranslucide} onChange={r.basculerPlatelageTranslucide}
                titre="Les lames deviennent translucides : la structure bois, les plots et leur dalle ou leur concassé se voient dessous" />
              <Case id="terrasse3dSolCoupe" controle="vue3d.solEnCoupe" libelle="Sol en coupe" coche={vue3d.solEnCoupe} onChange={r.basculerSolEnCoupe}
                titre="Perce le sol sous la terrasse : hérisson, dalle, massifs ou fûts de vis apparaissent à leur profondeur" />
            </fieldset>}
            <fieldset className="groupe3d">
              <legend>Scène</legend>
              <Case id="terrasse3dAllObjects" controle="vue3d.tousLesObjets" libelle="Tous les objets" coche={vue3d.tousLesObjets} onChange={r.basculerTousLesObjets}
                titre="Afficher tous les objets du plan, pas seulement la terrasse et ce qui lui est lié" />
              <Case id="terrasse3dObjectsOpaque" controle="vue3d.objetsOpaques" libelle="Opaques" coche={vue3d.objetsOpaques} onChange={r.basculerOpaques}
                titre="Objets opaques (sinon l'opacité qu'ils ont sur le plan)" />
              <Case id="terrasse3dTextures" controle="vue3d.textures" libelle="Textures" coche={vue3d.textures} onChange={r.basculerTextures}
                titre="Décochez pour ignorer les textures et revenir à la couleur unie du plan, sans avoir à les retirer de chaque objet" />
              {vue3d.textures && <Case id="terrasse3dSansOmbres" controle="vue3d.facadesSansOmbres" libelle="Façades sans ombres" coche={vue3d.facadesSansOmbres} onChange={r.basculerFacadesSansOmbres}
                titre="Estompe les ombres de la photo sur les façades relevées (débord du toit, balcon, arbre) : la Vue 3D pose les siennes. Sans effet sur la photo enregistrée ni sur l'export" />}
              <Case id="terrasse3dShadows" controle="vue3d.ombres" libelle="Ombres" coche={vue3d.ombres} onChange={r.basculerOmbres}
                titre="Ombre portée : chaque objet projette une ombre sur ce qu'il survole (plus lent à calculer)" />
              <Case id="terrasse3dEchelle" controle="vue3d.objetsEchelle" libelle="Objets d'échelle" coche={vue3d.objetsEchelle} onChange={r.basculerObjetsEchelle}
                titre="Une voiture côté rue et une silhouette dans la parcelle : la taille des choses d'un coup d'œil (jamais exportées)" />
              <Case id="terrasse3dVent" controle="vue3d.vent" libelle="Vent" coche={vue3d.vent} onChange={r.basculerVent}
                titre="Les arbres bougent au vent (balancement des branches, frémissement des feuilles) ; sans effet sur l'export ni sur les ombres" />
              <label className="etiquetteReglage" title={QUALITES_3D.find((x) => x.id === vue3d.qualite)?.aide}>Qualité
                <select id="terrasse3dQualite" data-controle="vue3d.qualite" value={vue3d.qualite} onChange={(e) => { if (estQualite3d(e.target.value)) r.choisirQualite(e.target.value); }}>
                  {QUALITES_3D.map((x) => <option key={x.id} value={x.id} title={x.aide}>{x.libelle}</option>)}
                </select>
              </label>
            </fieldset>
            <fieldset className="groupe3d groupeSoleil3d">
              <legend>Soleil</legend>
              <LigneIntensite ids={IDS_SOLEIL} soleil={vues.soleil3d}><CaseAppoint ids={IDS_SOLEIL} soleil={vues.soleil3d} /></LigneIntensite>
            </fieldset>
            <GroupeVoisinage inspecteur={inspecteur} magasin={magasin} /><GroupePresentation commandes={commandes} />
            <fieldset className="groupe3d">
              <legend>Points de vue</legend>
              <button data-commande="3d.enregistrerPointDeVue" id="terrasse3dSaveViewBtn" type="button" className="objbtn small boutonVue3d"
                title="Enregistrer la vue comme point de vue : crée un objet Point de vue (mode Plan) à la position et l'angle actuels de la caméra"
                aria-label="Enregistrer la vue comme point de vue"
                disabled={!commandes.etat('3d.enregistrerPointDeVue').utilisable}
                onClick={(e) => { commandes.executer('3d.enregistrerPointDeVue', e.currentTarget); }}>
                <Icone nom="camera" taille={18} /><span className="libelleVue3d">Enregistrer</span>
              </button>
              <ListePointsDeVue vue="vue3d" id="terrasse3dViewSelect" magasin={magasin} aller={vues.allerAuPointDeVue} />
            </fieldset>
          </div>
          <div className="hint hint3d" id="terrasse3dHint" title={affichage3d.indication3d}>{affichage3d.indication3d}</div>
        </div>
      </div>
      {/* Hors du cadre de la scene : les reglages restent accessibles pendant le chargement de la
          bibliotheque 3D, et meme si elle ne se charge pas. */}
      <button id="reglages3dBtn" data-controle="vue3d.reglages" type="button" className="bouton3d boutonReglages boutonReglagesFlottant" aria-label="Réglages de la vue 3D"
        onClick={() => magasin.definirFeuille(magasin.store.getState().feuille === 'reglages3d' ? null : 'reglages3d')}>
        <Icone nom="reglages" taille={20} />
      </button>
      {audit && <div className="barreAudit" role="group" aria-label="Promenade d’audit">
        {/* La facade devant vous (spec-audit §6.1), surlignee dans la scene : son nom passe avant l'etat. */}
        <span className="etatAudit" role="status">
          {audit.facade && <strong className="facadeAudit">{audit.facade}</strong>}
          <span>{audit.statut}</span>
        </span>
        <button type="button" className="secondary" data-commande="audit.suivre" aria-pressed={audit.suivre}
          disabled={!commandes.etat('audit.suivre').utilisable}
          title="Recadre derrière vous, dans l’axe de votre cap (boussole, sinon sens de la marche), 70 m devant ; tourner la vue au doigt le lâche"
          onClick={(e) => { commandes.executer('audit.suivre', e.currentTarget); }}>
          <Icone nom="personne" taille={18} /> Me suivre
        </button>
        <button type="button" data-commande="audit.cas" title="Les bâtiments notés, puis le partage du fichier de la promenade"
          onClick={(e) => { commandes.executer('audit.cas', e.currentTarget); }}>{'Cas notés (' + audit.cas + ')'}</button>
      </div>}
      <div id="terrasse3dLoading" className="hint" style={{ display: affichage3d.vue3d === 'chargement' ? undefined : 'none' }}>Chargement de la bibliotheque 3D…</div>
      <div id="terrasse3dWrap" style={{ display: affichage3d.vue3d === 'pret' ? 'block' : 'none', marginTop: 6 }}>
        <div id="terrasse3dCanvasHost" className="hote3d" ref={(el) => { poserHote3d('vue3d', el); }}
          style={pleinePage ? { height: 'calc(100dvh - 60px)' } : undefined}>
          {affichage3d.comparaison && <EtiquettesDeuxVues vues={affichage3d.comparaison} />}
          {affichage3d.vue3d === 'pret' && <Suspense fallback={null}><ModeToit magasin={magasin} commandes={commandes} /></Suspense>}<Horloge minutes={vues.soleil3d.etat.minutes} formatHeure={vues.formatHeure} ouvert={heure} basculer={() => setHeure(!heure)} />
          {/* Monte meme ferme : la liste de fumee et les ecouteurs retrouvent les curseurs par leur identifiant. */}
          <div id="reglageHeure3d" className="reglageHeure3d" role="group" aria-label="Heure et date du soleil" hidden={!heure}>
            <BarreHeure ids={IDS_SOLEIL} id="barreSoleil3d" soleil={vues.soleil3d} formatHeure={vues.formatHeure} info={affichage3d.soleilInfo} />
            <LigneDate ids={IDS_SOLEIL} soleil={vues.soleil3d} />
          </div>
          <div id="terrasse3dZoomControls" className="commandes3d">
            <Bouton3d commandes={commandes} id="3d.pleinePage" domId="terrasse3dFullPageBtn" icone="pleinEcran" libelle={pleinePage ? 'Format normal' : 'Plein écran'}
              titre={pleinePage ? 'Format normal (Échap)' : 'Plein écran'} actif={pleinePage} />
            <div className="separateur3d"></div>
            <Bouton3d commandes={commandes} id="3d.zoomAvant" domId="terrasse3dZoomIn" icone="plus" libelle="Zoom avant" titre="Zoom avant" />
            <Bouton3d commandes={commandes} id="3d.zoomArriere" domId="terrasse3dZoomOut" icone="moins" libelle="Zoom arrière" titre="Zoom arriere" />
            <div className="separateur3d"></div>
            <Bouton3d commandes={commandes} id="3d.modeOrbite" domId="terrasse3dModeOrbit" icone="orbite" libelle="Glisser pour tourner" titre="Tourner (glisser fait pivoter la vue) — mode par defaut" actif={affichage3d.mode === 'orbit'} />
            <Bouton3d commandes={commandes} id="3d.modeDeplacement" domId="terrasse3dModePan" icone="deplacer" libelle="Glisser pour déplacer" titre="Deplacer (glisser translate la vue, un seul doigt suffit)" actif={affichage3d.mode === 'pan'} />
            <Bouton3d commandes={commandes} id="3d.modeZoom" domId="terrasse3dModeZoom" icone="loupe" libelle="Glisser pour zoomer" titre="Zoom (glisser vers le haut rapproche, vers le bas eloigne)" actif={affichage3d.mode === 'zoom'} />
            <div className="separateur3d"></div>
            <Bouton3d commandes={commandes} id="3d.enregistrerPng" domId="terrasse3dSavePng" icone="image" libelle="Enregistrer la vue en PNG" titre="Enregistrer la vue actuelle en PNG" />
            <div className="separateur3d"></div>
            <Bouton3d commandes={commandes} id="3d.hauteurDesYeux" domId="terrasse3dEyeLevel" icone="personne" libelle="Hauteur des yeux" titre="Hauteur d'yeux (1,60 m au-dessus du platelage) - ne change que l'altitude de la camera, pas sa position au sol" />
            <BoutonModifierToit commandes={commandes} />
            {commandes.etat('terrasse.isoler').utilisable && (
              <Bouton3d commandes={commandes} id="terrasse.isoler" domId="terrasse3dIsoler" icone="isoler" libelle={libIsoler}
                titre={libIsoler + ' : lui seul, avec ce qui lui est lié, cadré — rebasculer rend la vue d\'avant'}
                actif={magasin.store.getState().etat.isolement !== null} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
