// Z4, le mode Toit de la Vue 3D (MD/spec-mode-toit-3d.md) : la barre de session et le catalogue du toit, sur le bas de la scene.
//
// Le panneau n'existe que pendant une session (app/modeToit.ts). Tout bouton est une commande du registre ; le panneau ne sait ni
// poser ni valider, il demande. La facade choisie se dit dans l'indice ; tant qu'aucune ne l'est, l'indice invite a toucher un mur.

import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { altitudeDuBatiment, etatToit, sessionToit } from '../../app/modeToit.js';
import { enPoints } from '../../model/formes.js';
import { cameraDeVue, hotes3d, vue3d } from '../../three/etat3d.js';
import { reglesAllumees } from '../../app/ecouteurs/toitCatalogue.js';
import { piecesDe, raisonIndisponible, type FamillePiece, type PieceCatalogue } from '../../three/gestesToits.js';
import { vueDeElementToit, vueDeSaillie } from '../../three/vueSaillie.js';
import { VignetteToit, VignetteVue } from '../EcranChaine.js';
import { NavigateurFacades } from './NavigateurFacades.js';
import { PoigneesToit } from './PoigneesToit.js';
import { PlanToit } from './PlanToit.js';
import { Icone, type NomIcone } from '../icones.js';
import { ImageChoix } from './iconesToit.js';
import { groupesDe, listerElements, memeCible, valeurDuGroupe, type CibleElement } from '../../facade/regles/toits/elements.js';
import type { CorpsToit } from '../../model/types.js';
import type { Magasin } from '../../app/magasin.js';
import type { RegistreCommandes } from '../../app/commandes.js';

interface Props { magasin: Magasin; commandes: RegistreCommandes }

const ONGLETS: { id: FamillePiece; libelle: string }[] = [
  { id: 'corps', libelle: 'Corps' }, { id: 'toit', libelle: 'Toit' }, { id: 'sur', libelle: 'Sur le toit' }, { id: 'facade', libelle: 'Façade' }
];

const vuesFacade = new Map<string, ReturnType<typeof vueDeSaillie>>();
/** L'image d'une piece : la vignette du catalogue, ou celle de l'element de facade (calculee une fois). */
function ImagePiece({ p }: { p: PieceCatalogue }) {
  if (p.exemple) return <VignetteToit forme={p.exemple} />;
  const nom = p.id.replace(/^[a-z]+:/, '');
  if (nom === 'fenetre-toit' || nom === 'solaire') {
    if (!vuesFacade.has(nom)) vuesFacade.set(nom, vueDeElementToit(nom));
    return <VignetteVue vue={vuesFacade.get(nom) as ReturnType<typeof vueDeSaillie>} titre={p.libelle} />;
  }
  if (p.famille !== 'facade') return <Icone nom="polygone" />;
  if (!vuesFacade.has(nom)) vuesFacade.set(nom, vueDeSaillie(nom));
  return <VignetteVue vue={vuesFacade.get(nom) as ReturnType<typeof vueDeSaillie>} titre={p.libelle} />;
}

/** Un bouton de la barre de session : une commande, une icone, son etat (grise avec sa raison, ou enfonce). */
function BoutonToit({ commandes, id, icone, libelle, texte, presse, valider, miroir }: { commandes: RegistreCommandes; id: string; icone: NomIcone; libelle: string; texte?: string; presse?: boolean; valider?: boolean; miroir?: boolean }) {
  const e = commandes.etat(id);
  const refus = !e.utilisable && 'message' in e ? e.message : null;
  return (
    <button type="button" className={'boutonToit' + (valider ? ' valider' : '') + (miroir ? ' miroir' : '')} data-commande={id} aria-label={libelle} aria-pressed={presse}
      title={libelle + (refus ? ' — ' + refus : '')} disabled={!e.utilisable} onClick={(ev) => { commandes.executer(id, ev.currentTarget); }}>
      <Icone nom={icone} taille={20} />{texte && <span>{texte}</span>}
    </button>
  );
}

/** Les elements du batiment, une pastille chacun, et l'inspecteur de celui qui est choisi : des boutons-images a choix exclusif, sans formulaire. */
function ElementsToit({ corps, selection, commandes }: { corps: readonly CorpsToit[]; selection: CibleElement | null; commandes: RegistreCommandes }) {
  const liste = listerElements(corps);
  if (!liste.length) return null;
  const groupes = selection ? groupesDe(corps, selection) : [];
  const bouton = (id: string, icone: NomIcone, libelle: string, danger = false) => (
    <button type="button" className={'boutonToit' + (danger ? ' danger' : '')} data-commande={id} aria-label={libelle} title={libelle}
      disabled={!commandes.etat(id).utilisable} onClick={(ev) => { commandes.executer(id, ev.currentTarget); }}><Icone nom={icone} taille={20} /></button>
  );
  return (
    <div className="elementsToit">
      <div className="puces" role="group" aria-label="Éléments du bâtiment">
        {liste.map((e) => (
          <button key={e.cible.type + e.cible.rang + ':' + e.cible.i} type="button" className="puceToit" data-commande="toit.selection" data-type={e.cible.type} data-rang={e.cible.rang} data-i={e.cible.i}
            aria-pressed={memeCible(e.cible, selection)} onClick={(ev) => { commandes.executer('toit.selection', ev.currentTarget); }}>{e.libelle}</button>
        ))}
      </div>
      {selection && (
        <div className="inspecteurToit" role="group" aria-label="Réglages de l’élément">
          {groupes.map((g) => (
            <div key={g.groupe} className="groupeChoix" role="group" aria-label={g.groupe}>
              {g.valeurs.map((v) => (
                <button key={v.valeur} type="button" className="boutonToit" data-commande="toit.regler" data-groupe={g.groupe} data-valeur={v.valeur} title={v.libelle} aria-label={v.libelle}
                  aria-pressed={valeurDuGroupe(corps, selection, g.groupe) === v.valeur} onClick={(ev) => { commandes.executer('toit.regler', ev.currentTarget); }}><ImageChoix groupe={g.groupe} valeur={v.valeur} /></button>
              ))}
            </div>
          ))}
          <div className="groupeChoix" role="group" aria-label="actions">
            {selection.type === 'corps' ? (
              <>
                <button type="button" className="boutonToit" data-commande="toit.tourner" data-sens="1" aria-label="Tourner à gauche" title="Tourner à gauche (15°)"
                  disabled={!commandes.etat('toit.tourner').utilisable} onClick={(ev) => { commandes.executer('toit.tourner', ev.currentTarget); }}><Icone nom="annuler" taille={20} /></button>
                <button type="button" className="boutonToit miroir" data-commande="toit.tourner" data-sens="-1" aria-label="Tourner à droite" title="Tourner à droite (15°)"
                  disabled={!commandes.etat('toit.tourner').utilisable} onClick={(ev) => { commandes.executer('toit.tourner', ev.currentTarget); }}><Icone nom="annuler" taille={20} /></button>
              </>
            ) : (
              <>
                {bouton('toit.moins', 'moins', 'Réduire')}
                {bouton('toit.plus', 'plus', 'Agrandir')}
                {bouton('toit.dupliquer', 'dupliquer', 'Dupliquer')}
              </>
            )}
            {bouton('toit.supprimer', 'supprimer', selection.type === 'corps' ? 'Supprimer ce corps' : 'Supprimer', true)}
          </div>
        </div>
      )}
    </div>
  );
}

/** Le doigt qui invite a toucher le batiment, au-dessus de lui, tant que rien n'a ete touche. */
function IndiceMain({ magasin }: { magasin: Magasin }) {
  const [, redessiner] = useState(0);
  useEffect(() => {
    const id = setInterval(() => redessiner((n) => n + 1), 150);
    return () => clearInterval(id);
  }, []);
  const s = sessionToit(), sc = vue3d.scene, hote = hotes3d.vue3d;
  if (!s || !s.indice || !sc || !hote) return null;
  const o = magasin.store.getState().etat.objects.find((x) => x.key === s.cle);
  const pts = o ? (enPoints(o).pts as { x: number; y: number }[]) : [];
  if (!pts.length) return null;
  const cx = pts.reduce((t, p) => t + p.x, 0) / pts.length, cy = pts.reduce((t, p) => t + p.y, 0) / pts.length;
  const v = new THREE.Vector3(cx - sc.cen.x, altitudeDuBatiment(o) + (o?.elevation ?? 3) + 2, sc.cen.y - cy).project(cameraDeVue(sc));
  if (v.z > 1) return null;
  const r = hote.getBoundingClientRect();
  return (
    <svg className="indiceMain" style={{ left: ((v.x + 1) / 2) * r.width, top: ((1 - v.y) / 2) * r.height }} width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 12V5.5a1.5 1.5 0 013 0V11M12 10.5V9a1.5 1.5 0 013 0v2M15 11a1.5 1.5 0 013 0v4c0 3.5-2.5 6-5.5 6S8 18.5 6.5 15.5L5 12.5a1.5 1.5 0 012.5-1L9 13" />
    </svg>
  );
}

export function ModeToit({ magasin, commandes }: Props) {
  useStore(magasin.store, (s) => s.version);
  const [onglet, setOnglet] = useState<FamillePiece>('toit');
  const e = etatToit(), s = sessionToit();
  if (!e.actif || !s) return null;
  const o = magasin.store.getState().etat.objects.find((x) => x.key === s.cle);
  const allumees = reglesAllumees(o);
  const pose = commandes.etat('toit.poser');
  return (
    <>
    <NavigateurFacades magasin={magasin} commandes={commandes} />
    <PlanToit magasin={magasin} commandes={commandes} />
    <IndiceMain magasin={magasin} />
    <PoigneesToit magasin={magasin} />
    <div className="panneauToit" role="region" aria-label="Mode Toit">
      <div className="barreToit" role="toolbar" aria-label="Session du toit">
        <BoutonToit commandes={commandes} id="toit.abandonner" icone="chevronGauche" libelle="Retour : abandonner les changements" />
        <BoutonToit commandes={commandes} id="toit.annuler" icone="annuler" libelle="Annuler (Ctrl+Z)" />
        <BoutonToit commandes={commandes} id="toit.retablir" icone="annuler" libelle="Rétablir (Ctrl+Maj+Z)" miroir />
        <BoutonToit commandes={commandes} id="toit.depart" icone="positionInitiale" libelle="Revenir au départ (annulable)" />
        <BoutonToit commandes={commandes} id="toit.isoler" icone={e.isole ? 'oeilBarre' : 'oeil'} libelle="Isoler ce bâtiment" presse={e.isole} />
        <span className="separateurToit" aria-hidden="true" />
        <BoutonToit commandes={commandes} id="toit.vueLibre" icone="cube" libelle="Vue 3D" presse={e.vue === 'libre'} />
        <BoutonToit commandes={commandes} id="toit.vueFacade" icone="rectangle" libelle="Vue de la façade" presse={e.vue === 'facade'} />
        <BoutonToit commandes={commandes} id="toit.vueDessus" icone="ajuster" libelle="Vue de dessus" presse={e.vue === 'dessus'} />
        <BoutonToit commandes={commandes} id="toit.isolerCorps" icone="isoler" libelle="Isoler ce corps" presse={e.corpsIsole} />
        <span className="espaceToit" />
        <BoutonToit commandes={commandes} id="toit.valider" icone="coche" libelle="Valider" texte="Valider" valider />
      </div>
      <p className="indiceToit" role="status">{e.facade ?? 'Touchez un mur du bâtiment pour choisir sa façade.'}</p>
      <button type="button" className="toitRegles" data-commande="toit.regles" aria-pressed={allumees} disabled={!commandes.etat('toit.regles').utilisable}
        title={allumees ? 'Règles allumées : le toit se lit tout seul. Cliquez pour le régler vous-même.' : 'Règles coupées : le toit reste comme vous le réglez. Cliquez pour reprendre la lecture automatique.'}
        onClick={(ev) => { commandes.executer('toit.regles', ev.currentTarget); }}>
        {'Règles ' + (allumees ? 'allumées' : 'coupées')}
      </button>
      <ElementsToit corps={o?.corpsToit ?? []} selection={e.selection} commandes={commandes} />
      <h3 className="titrePlateau" id="titrePlateauToit">Ajouter un élément</h3>
      <div className="toitOnglets" role="tablist" aria-labelledby="titrePlateauToit">
        {ONGLETS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={onglet === t.id} className="toitOnglet" onClick={() => setOnglet(t.id)}>{t.libelle}</button>
        ))}
      </div>
      <div className="toitCatalogue">
        {piecesDe(onglet).map((p) => {
          const refus = o ? raisonIndisponible(o, p.id, s.facade ?? s.derniere) : 'Aucun bâtiment.';
          return (
            <button key={p.id} type="button" className="toitPiece" data-commande="toit.poser" data-piece={p.id}
              disabled={!!refus || !pose.utilisable} title={p.libelle + (refus ? ' — ' + refus : '')} aria-label={p.libelle}
              onClick={(ev) => { commandes.executer('toit.poser', ev.currentTarget); }}>
              <span className="glyphe"><ImagePiece p={p} /></span>
              <span className="libelle">{p.libelle}</span>
            </button>
          );
        })}
      </div>
    </div>
    </>
  );
}

/** Le bouton des commandes de la scene qui ouvre le mode : seulement quand un batiment du projet est selectionne. */
export function BoutonModifierToit({ commandes }: { commandes: RegistreCommandes }) {
  if (!commandes.etat('toit.modifier').utilisable) return null;
  return (
    <button id="terrasse3dModifierToit" data-commande="toit.modifier" type="button" className="bouton3d" aria-label="Modifier la toiture"
      title="Modifier la toiture : choisir une façade, poser des éléments, tout annuler ; rien ne change avant la validation"
      onClick={(e) => { commandes.executer('toit.modifier', e.currentTarget); }}>
      <Icone nom="toit" taille={20} />
    </button>
  );
}
