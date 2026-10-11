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
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { estTerrasse } from '../../model/fonctions.js';
import { useStore } from 'zustand';
import { abonner3d, affichage3d, hotes3d, version3d, vue3d } from '../../three/etat3d.js';
import { Icone } from '../icones.js';
import { Horloge } from './Horloge.js';
import { EnteteReglages, ListePointsDeVue, LigneDate, LigneIntensite, CaseAppoint, BarreHeure, type IdsSoleil, type ServiceVues3d } from './communs.js';
import type { Magasin } from '../../app/magasin.js';
import type { RegistreCommandes } from '../../app/commandes.js';

export function useEtat3d(): number { return useSyncExternalStore(abonner3d, version3d); }

interface Props { magasin: Magasin; commandes: RegistreCommandes; vues: ServiceVues3d }

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

/** Un bouton de camera sur le canevas : une commande, une icone, son etat actif le cas echeant. */
function Bouton3d({ commandes, id, domId, icone, libelle, titre, actif }: { commandes: RegistreCommandes; id: string; domId: string; icone: Parameters<typeof Icone>[0]['nom']; libelle: string; titre: string; actif?: boolean }) {
  return (
    <button id={domId} data-commande={id} type="button" className={'bouton3d' + (actif ? ' actif' : '')} title={titre} aria-label={libelle}
      aria-pressed={actif === undefined ? undefined : actif} onClick={(e) => { commandes.executer(id, e.currentTarget); }}>
      <Icone nom={icone} taille={20} />
    </button>
  );
}

export function Vue3d({ magasin, commandes, vues }: Props) {
  useEtat3d();
  useStore(magasin.store, (s) => s.version);
  const visible = useStore(magasin.store, (s) => s.vue) === 'vue3d';
  const pleinePage = affichage3d.pleinePage3d;
  const r = vues.reglages;
  const etatPlan = magasin.store.getState().etat;
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
              <Case id="terrasse3dShadows" controle="vue3d.ombres" libelle="Ombres" coche={vue3d.ombres} onChange={r.basculerOmbres}
                titre="Ombre portée : chaque objet projette une ombre sur ce qu'il survole (plus lent à calculer)" />
            </fieldset>
            <fieldset className="groupe3d groupeSoleil3d">
              <legend>Soleil</legend>
              <LigneIntensite ids={IDS_SOLEIL} soleil={vues.soleil3d}><CaseAppoint ids={IDS_SOLEIL} soleil={vues.soleil3d} /></LigneIntensite>
            </fieldset>
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
      <div id="terrasse3dLoading" className="hint" style={{ display: affichage3d.vue3d === 'chargement' ? undefined : 'none' }}>Chargement de la bibliotheque 3D…</div>
      <div id="terrasse3dWrap" style={{ display: affichage3d.vue3d === 'pret' ? 'block' : 'none', marginTop: 6 }}>
        <div id="terrasse3dCanvasHost" className="hote3d" ref={(el) => { hotes3d.vue3d = el; }}
          style={pleinePage ? { height: 'calc(100vh - 210px)' } : undefined}>
          <Horloge minutes={vues.soleil3d.etat.minutes} formatHeure={vues.formatHeure} ouvert={heure} basculer={() => setHeure(!heure)} />
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
