// Z4 en visionneuse : le dernier modele .glb produit, relu tel quel (spec-ihm-zones §4.4).
//
// Comme pour la Vue 3D, la scene est du WebGL natif (three/glbViewer.ts) : ce composant fournit son
// hote, `#glbViewerCanvasHost`, l'enregistre dans `hotes3d`, et rend tout le reste depuis l'etat de
// la visionneuse (`glb`, `affichage3d`) — aucun modele, chargement, ou modele affiche.

import { useLayoutEffect } from 'react';
import { useStore } from 'zustand';
import { affichage3d, glb, hotes3d } from '../../three/etat3d.js';
import { BoutonCommande } from '../composants/BoutonCommande.js';
import { Icone } from '../icones.js';
import { useEtat3d } from './Vue3d.js';
import { BarreHeure, CaseAppoint, EnteteReglages, LigneDate, LigneIntensite, ListePointsDeVue, type IdsSoleil, type ServiceVues3d } from './communs.js';
import type { Magasin } from '../../app/magasin.js';
import type { RegistreCommandes } from '../../app/commandes.js';

interface Props { magasin: Magasin; commandes: RegistreCommandes; vues: ServiceVues3d }

const IDS_SOLEIL: IdsSoleil = {
  date: 'glbViewerDate', semaine: 'glbViewerSemaine', heure: 'glbViewerHeure', heureTexte: 'glbViewerHeureTexte',
  intensite: 'glbViewerIntensite', intensiteTexte: 'glbViewerIntensiteTexte', appoint: 'glbViewerLumiereAppoint'
};

function Bouton3d({ commandes, id, domId, icone, libelle, titre }: { commandes: RegistreCommandes; id: string; domId: string; icone: 'plus' | 'moins' | 'personne'; libelle: string; titre: string }) {
  return (
    <button id={domId} data-commande={id} type="button" className="bouton3d" title={titre} aria-label={libelle} onClick={(e) => { commandes.executer(id, e.currentTarget); }}>
      <Icone nom={icone} taille={20} />
    </button>
  );
}

export function Visionneuse({ magasin, commandes, vues }: Props) {
  useEtat3d();
  const visible = useStore(magasin.store, (s) => s.vue) === 'visionneuse';
  const pleinePage = affichage3d.pleinePageGlb;
  const v = vues.visionneuse, soleil = vues.soleilGlb;
  const enCours = affichage3d.generation ? (affichage3d.generation === 'export' ? 'Export en cours…' : 'Génération…') : false;
  useLayoutEffect(() => { vues.redimensionnerGlb(); }, [pleinePage, vues]);

  return (
    <div id="glbViewerPanel" className={'vue3dPanneau panneauVisionneuse' + (pleinePage ? ' pleinePage' : '')} style={{ display: visible ? 'block' : 'none' }}>
      <div className="sectionTitle titre3d titreAvecAction">
        <span>Visionneuse GLB</span>
        <BoutonCommande commandes={commandes} id="visionneuse.pleinePage" domId="glbViewerFullPageBtn" className="secondary small">
          {pleinePage ? 'Format normal' : 'Plein écran'}
        </BoutonCommande>
      </div>
      <div id="glbViewerEmpty" className="hint" style={{ display: affichage3d.glb === 'vide' ? 'block' : 'none' }}>
        Aucun modèle généré pour l'instant.
        <BoutonCommande commandes={commandes} id="visionneuse.generer" domId="glbViewerExporterBtn" className="objbtn small boutonGenerer" enCours={enCours}>Générer le modèle 3D</BoutonCommande>
      </div>
      <div id="glbViewerLoading" className="hint" style={{ display: affichage3d.glb === 'chargement' ? 'block' : 'none' }}>Chargement du modele…</div>
      <div id="glbViewerContent" style={{ display: affichage3d.glb === 'pret' ? 'block' : 'none' }}>
        <div id="zoneReglagesGlb" className="reglages3d" role="group" aria-label="Réglages de la visionneuse">
          <EnteteReglages titre="Réglages de la visionneuse" idLieu="glbViewerLieu" lieu={vues.libelleLieu()} magasin={magasin} />
          <div className="corpsFeuille">
            <LigneDate ids={IDS_SOLEIL} soleil={soleil} />
            <div className="controls">
              <label className="caseReglage"><input type="checkbox" id="glbViewerFilaire" checked={glb.filaire} onChange={(e) => v.basculerFilaire(e.target.checked)} /> Filaire (sinon plein)</label>
              <label className="caseReglage"><input type="checkbox" id="glbViewerShadows" checked={glb.ombres} onChange={(e) => v.basculerOmbres(e.target.checked)} /> Ombre portée</label>
              <CaseAppoint ids={IDS_SOLEIL} soleil={soleil} />
              <span className="caseReglage">
                <label htmlFor="glbViewerFond">Fond</label>
                <select id="glbViewerFond" value={glb.fond} onChange={(e) => v.choisirFond(e.target.value)}>
                  <option value="clair">Clair</option>
                  <option value="sombre">Sombre</option>
                  <option value="damier">Damier neutre</option>
                </select>
              </span>
              <ListePointsDeVue id="glbViewerViewSelect" magasin={magasin} aller={vues.allerAuPointDeVueGlb} />
              <BoutonCommande commandes={commandes} id="visionneuse.regenerer" domId="glbViewerRegenBtn" className="objbtn small" enCours={enCours}>
                <Icone nom="positionInitiale" taille={20} /> Régénérer depuis le plan
              </BoutonCommande>
            </div>
            <LigneIntensite ids={IDS_SOLEIL} soleil={soleil} />
            <div id="glbViewerHint" className="hint">{affichage3d.indicationGlb}</div>
            <div className="hint">Glisser = tourner, molette = zoom, clic droit + glisser = deplacer. Necessite une connexion internet (bibliotheque 3D chargee a la demande, pas embarquee dans ce fichier).</div>
          </div>
        </div>
        <BarreHeure ids={IDS_SOLEIL} id="barreSoleilGlb" soleil={soleil} formatHeure={vues.formatHeure} />
        <div id="glbViewerCanvasHost" className="hote3d hoteVisionneuse" ref={(el) => { hotes3d.glb = el; }}
          style={pleinePage ? { height: 'calc(100vh - 210px)' } : undefined}>
          <div className="commandes3d">
            <Bouton3d commandes={commandes} id="visionneuse.zoomAvant" domId="glbViewerZoomIn" icone="plus" libelle="Zoom avant" titre="Zoom avant" />
            <Bouton3d commandes={commandes} id="visionneuse.zoomArriere" domId="glbViewerZoomOut" icone="moins" libelle="Zoom arrière" titre="Zoom arriere" />
            <div className="separateur3d"></div>
            <Bouton3d commandes={commandes} id="visionneuse.hauteurDesYeux" domId="glbViewerEyeLevel" icone="personne" libelle="Hauteur des yeux" titre="Hauteur d'yeux (1,60 m au-dessus du platelage) - ne change que l'altitude de la camera, pas sa position au sol" />
            <button id="reglagesGlbBtn" type="button" className="bouton3d boutonReglages" aria-label="Réglages de la visionneuse"
              onClick={() => magasin.definirFeuille(magasin.store.getState().feuille === 'reglages3d' ? null : 'reglages3d')}>
              <Icone nom="reglages" taille={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
