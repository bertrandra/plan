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
import { useLayoutEffect, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { abonner3d, affichage3d, hotes3d, version3d, vue3d } from '../../three/etat3d.js';
import { BoutonCommande } from '../composants/BoutonCommande.js';
import { Icone } from '../icones.js';
import { Horloge } from './Horloge.js';
import { EnteteReglages, ListePointsDeVue, ReglagesSoleil as Soleil, BarreHeure, type IdsSoleil, type ServiceVues3d } from './communs.js';
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
  // Le plein page change la taille de l'hote : la scene suit, une fois la mise en page faite.
  useLayoutEffect(() => { vues.redimensionner3d(); }, [pleinePage, vues]);

  return (
    <div id="vue3dPanel" className={'panelBox vue3dPanneau' + (pleinePage ? ' pleinePage' : '')} style={{ display: visible ? 'block' : 'none' }}>
      <div className="sectionTitle titre3d titreAvecAction">
        <span>Vue 3D</span>
        <BoutonCommande commandes={commandes} id="3d.pleinePage" domId="terrasse3dFullPageBtn" className="secondary small">
          {pleinePage ? 'Format normal' : 'Plein écran'}
        </BoutonCommande>
      </div>
      <div id="zoneReglages3d" className="reglages3d" role="group" aria-label="Réglages de la vue 3D">
        <EnteteReglages vue="vue3d" titre="Réglages de la vue 3D" idLieu="vue3dLieu" lieu={vues.libelleLieu()} magasin={magasin} />
        <div className="corpsFeuille">
          <div className="controls">
            <Case id="terrasse3dFilaire" controle="vue3d.filaire" libelle="Lames en filaire — voir la structure dessous" coche={r.filaire()} onChange={r.basculerFilaire} />
            <Case id="terrasse3dAllObjects" controle="vue3d.tousLesObjets" libelle="Afficher tous les objets du plan" coche={vue3d.tousLesObjets} onChange={r.basculerTousLesObjets} />
            <Case id="terrasse3dSolCoupe" controle="vue3d.solEnCoupe" libelle="Sol en coupe — voir l'assise et les fondations" coche={vue3d.solEnCoupe} onChange={r.basculerSolEnCoupe}
              titre="Perce le sol sous la terrasse : hérisson, dalle, massifs ou fûts de vis apparaissent à leur profondeur" />
            <Case id="terrasse3dObjectsOpaque" controle="vue3d.objetsOpaques" libelle="Objets opaques (sinon opacite du plan)" coche={vue3d.objetsOpaques} onChange={r.basculerOpaques} />
            <Case id="terrasse3dTextures" controle="vue3d.textures" libelle="Texture (sinon couleur unie)" coche={vue3d.textures} onChange={r.basculerTextures}
              titre="Decoche pour ignorer les textures Poly Haven et revenir a la couleur unie du plan, sans avoir a les retirer de chaque objet" />
            <Case id="terrasse3dShadows" controle="vue3d.ombres" libelle="Ombre portée" coche={vue3d.ombres} onChange={r.basculerOmbres}
              titre="Chaque objet projette une ombre sur ce qu'il survole - plus lent a calculer, coche par defaut" />
          </div>
          <Soleil ids={IDS_SOLEIL} soleil={vues.soleil3d} />
          <div className="controls ligneReglage">
            <button data-commande="3d.enregistrerPointDeVue" id="terrasse3dSaveViewBtn" type="button" className="objbtn small" title="Cree un objet Point de vue (Mode Plan) a la position et l'angle actuels de la camera"
              disabled={!commandes.etat('3d.enregistrerPointDeVue').utilisable}
              onClick={(e) => { commandes.executer('3d.enregistrerPointDeVue', e.currentTarget); }}>
              <Icone nom="camera" taille={20} /> Enregistrer la vue comme point de vue
            </button>
            <ListePointsDeVue vue="vue3d" id="terrasse3dViewSelect" magasin={magasin} aller={vues.allerAuPointDeVue} />
          </div>
          <div className="hint" id="terrasse3dHint">{affichage3d.indication3d}</div>
        </div>
      </div>
      <BarreHeure ids={IDS_SOLEIL} id="barreSoleil3d" soleil={vues.soleil3d} formatHeure={vues.formatHeure} info={affichage3d.soleilInfo} />
      {/* Hors du cadre de la scene : les reglages restent accessibles pendant le chargement de la
          bibliotheque 3D, et meme si elle ne se charge pas. */}
      <button id="reglages3dBtn" data-controle="vue3d.reglages" type="button" className="bouton3d boutonReglages boutonReglagesFlottant" aria-label="Réglages de la vue 3D"
        onClick={() => magasin.definirFeuille(magasin.store.getState().feuille === 'reglages3d' ? null : 'reglages3d')}>
        <Icone nom="reglages" taille={20} />
      </button>
      <div id="terrasse3dLoading" className="hint" style={{ display: affichage3d.vue3d === 'chargement' ? undefined : 'none' }}>Chargement de la bibliotheque 3D…</div>
      <div id="terrasse3dWrap" style={{ display: affichage3d.vue3d === 'pret' ? 'block' : 'none', marginTop: 10 }}>
        <div id="terrasse3dCanvasHost" className="hote3d" ref={(el) => { hotes3d.vue3d = el; }}
          style={pleinePage ? { height: 'calc(100vh - 210px)' } : undefined}>
          {vue3d.ombres && <Horloge minutes={vues.soleil3d.etat.minutes} formatHeure={vues.formatHeure} />}
          <div id="terrasse3dZoomControls" className="commandes3d">
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
