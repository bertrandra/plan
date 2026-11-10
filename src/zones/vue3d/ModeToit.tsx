// Z4, le mode Toit de la Vue 3D (MD/spec-mode-toit-3d.md) : la barre de session et le catalogue du toit, sur le bas de la scene.
//
// Le panneau n'existe que pendant une session (app/toits/modeToit.ts). Tout bouton est une commande du registre ; le panneau ne sait ni
// poser ni valider, il demande. La facade choisie se dit dans l'indice ; tant qu'aucune ne l'est, l'indice invite a toucher un mur.

import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { altitudeDuBatiment, etatToit, sessionToit } from '../../app/toits/modeToit.js';
import { useCle, CLE_GELEE } from '../composants/abonnement.js';
import { enPoints } from '../../model/formes.js';
import { abonnerImage, cameraDeVue, hotes3d, vue3d } from '../../three/etat3d.js';
import { insertionToit, reglesAllumees, type InsertionToit } from '../../app/ecouteurs/toitCatalogue.js';
import { OPTIONS_PIECE, formeEnPlace, piece, piecesDe, raisonIndisponible, type FamillePiece, type PieceCatalogue } from '../../three/gestesToits.js';
import { vueDeSaillie, vueSurLeToit } from '../../three/vueSaillie.js';
import { VignetteToit, VignetteVue } from '../EcranChaine.js';
import { NavigateurFacades } from './NavigateurFacades.js';
import { PoigneesToit } from './PoigneesToit.js';
import { PlanToit } from './PlanToit.js';
import { Icone, type NomIcone } from '../icones.js';
import { ImageChoix } from './iconesToit.js';
import { groupesDe, groupesDuBatiment, libellesDesElements, memeCible, titreDuGroupe, valeurDuBatiment, valeurDuGroupe, type CibleElement, type GroupeChoix } from '../../facade/modeToit/elements.js';
import type { CorpsToit } from '../../model/types.js';
import type { Magasin } from '../../app/magasin.js';
import type { RegistreCommandes } from '../../app/commandes.js';

interface Props { magasin: Magasin; commandes: RegistreCommandes }

const ONGLETS: { id: FamillePiece; libelle: string }[] = [
  { id: 'corps', libelle: 'Corps' }, { id: 'toit', libelle: 'Toit' }, { id: 'sur', libelle: 'Sur le toit' }, { id: 'facade', libelle: 'Façade' }
];

const vuesFacade = new Map<string, ReturnType<typeof vueDeSaillie>>();
const vuesSurLeToit = new Map<string, ReturnType<typeof vueSurLeToit>>();
/**
 * L'image d'une piece : la vignette du catalogue, celle de l'element de facade, ou (onglet « Sur le toit ») l'element cadre de pres sur
 * son toit, chacune calculee une fois.
 */
/** Les pieces qui ne se posent pas d'un coup ont leur propre commande : le decroche attend le point touche sur l'egout ou le mur. */
const COMMANDE_DE_PIECE: Record<string, string> = { 'facade:decroche': 'toit.decrocher' };

function ImagePiece({ p }: { p: PieceCatalogue }) {
  const nom = p.id.replace(/^[a-z]+:/, '');
  if (p.famille === 'sur') {
    if (!vuesSurLeToit.has(nom)) vuesSurLeToit.set(nom, vueSurLeToit(nom));
    const vue = vuesSurLeToit.get(nom);
    if (vue) return <VignetteVue vue={vue} titre={p.libelle} />;
  }
  if (p.exemple) return <VignetteToit forme={p.exemple} />;
  if (p.id === 'facade:travee') return <Icone nom="travee" taille={40} />;
  if (p.id === 'facade:decroche') return <Icone nom="decroche" taille={40} />;
  if (p.famille !== 'facade') return <Icone nom="polygone" />;
  if (!vuesFacade.has(nom)) vuesFacade.set(nom, vueDeSaillie(nom));
  return <VignetteVue vue={vuesFacade.get(nom) as ReturnType<typeof vueDeSaillie>} titre={p.libelle} />;
}

/**
 * L'image d'un choix de l'inspecteur : le type d'une lucarne garde la vignette de la piece qui la pose (onglet « Sur le toit ») ; les
 * autres choix ont leur trace.
 */
function ImageDuChoix({ groupe, valeur }: { groupe: string; valeur: string }) {
  const p = groupe === 'lucarne' ? piece('sur:' + valeur) : undefined;
  return p ? <span className="glyphe"><ImagePiece p={p} /></span> : <ImageChoix groupe={groupe} valeur={valeur} />;
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

/**
 * Les groupes de choix de l'inspecteur, chacun sous son titre : des boutons-images a choix exclusif (`toit.regler`), celui en place
 * enfonce. Un groupe qui ne s'applique pas est grise et dit pourquoi sous ses boutons (au doigt, il n'y a pas d'infobulle) ; son aide dit
 * ce qu'il fait quand ce n'est pas evident.
 */
function GroupesReglage({ groupes, valeur, commandes }: { groupes: readonly GroupeChoix[]; valeur: (groupe: string) => string | null; commandes: RegistreCommandes }) {
  const e = commandes.etat('toit.regler'), permise = e.utilisable, refus = !e.utilisable && 'message' in e ? e.message : null;
  return (
    <>
      {groupes.map((g) => (
        <div key={g.groupe} className="groupeReglage">
          <span className="titreGroupe" aria-hidden="true">{titreDuGroupe(g)}</span>
          <div className="groupeChoix" role="group" aria-label={titreDuGroupe(g)}>
            {g.valeurs.map((v) => (
              <button key={v.valeur} type="button" className="boutonToit" data-commande="toit.regler" data-groupe={g.groupe} data-valeur={v.valeur} title={v.libelle + (g.raison ? ' — ' + g.raison : refus ? ' — ' + refus : '')} aria-label={v.libelle}
                aria-pressed={valeur(g.groupe) === v.valeur} disabled={!!g.raison || !permise} onClick={(ev) => { commandes.executer('toit.regler', ev.currentTarget); }}><ImageDuChoix groupe={g.groupe} valeur={v.valeur} /></button>
            ))}
          </div>
          {g.aide && !g.raison && <p className="aideGroupe">{g.aide}</p>}
          {g.raison && <p className="raisonGroupe" role="note">{g.raison}</p>}
        </div>
      ))}
    </>
  );
}

/** Les elements du batiment, une pastille chacun, et l'inspecteur de celui qui est choisi : des boutons-images a choix exclusif, sans formulaire. */
function ElementsToit({ corps, selection, commandes }: { corps: readonly CorpsToit[]; selection: CibleElement | null; commandes: RegistreCommandes }) {
  const liste = libellesDesElements(corps);
  if (!liste.length) return null;
  const groupes = selection ? groupesDe(corps, selection) : [];
  // Rien de choisi : le batiment entier, dont tout le toit se regle d'un coup quand il a plusieurs corps (le sens du faitage).
  const groupesBatiment = selection ? [] : groupesDuBatiment(corps);
  const bouton = (id: string, icone: NomIcone, libelle: string, danger = false) => (
    <button type="button" className={'boutonToit' + (danger ? ' danger' : '') + (insertionToit()?.commande === id ? ' arme' : '')} data-commande={id} aria-label={libelle} title={libelle}
      aria-pressed={id === 'toit.murSur3d' ? insertionToit()?.commande === id : undefined}
      disabled={!commandes.etat(id).utilisable} onClick={(ev) => { commandes.executer(id, ev.currentTarget); }}><Icone nom={icone} taille={20} /></button>
  );
  return (
    <div className="elementsToit">
      <div className="puces" role="group" aria-label="Éléments du bâtiment">
        {/* Le batiment entier : les gestes reviennent a lui (retoucher la pastille enfoncee d'un element fait de meme). */}
        <button type="button" className="puceToit" data-commande="toit.selection" aria-pressed={!selection}
          onClick={(ev) => { commandes.executer('toit.selection', ev.currentTarget); }}>Bâtiment entier</button>
        {liste.map((e) => (
          <button key={e.cible.type + e.cible.rang + ':' + e.cible.i} type="button" className="puceToit" data-commande="toit.selection" data-type={e.cible.type} data-rang={e.cible.rang} data-i={e.cible.i}
            aria-pressed={memeCible(e.cible, selection)} onClick={(ev) => { commandes.executer('toit.selection', ev.currentTarget); }}>{e.libelle}</button>
        ))}
      </div>
      {!selection && groupesBatiment.length > 0 && (
        <div className="inspecteurToit" data-cible="batiment" role="group" aria-label="Réglages de tout le toit">
          <GroupesReglage groupes={groupesBatiment} valeur={(g) => valeurDuBatiment(corps, g)} commandes={commandes} />
        </div>
      )}
      {selection && (
        <div className="inspecteurToit" role="group" aria-label="Réglages de l’élément">
          {/* Chaque groupe dit ce qu'il regle, au-dessus de ses boutons-images : au doigt, il n'y a pas d'infobulle. */}
          <GroupesReglage groupes={groupes} valeur={(g) => valeurDuGroupe(corps, selection, g)} commandes={commandes} />
          <div className="groupeReglage">
          <span className="titreGroupe" aria-hidden="true">Gestes</span>
          <div className="groupeChoix" role="group" aria-label="Gestes">
            {selection.type === 'corps' ? (
              <>
                <button type="button" className="boutonToit" data-commande="toit.tourner" data-sens="1" aria-label="Tourner le corps à gauche" title="Tourner le corps à gauche (15°)"
                  disabled={!commandes.etat('toit.tourner').utilisable} onClick={(ev) => { commandes.executer('toit.tourner', ev.currentTarget); }}><Icone nom="tournerCorps" taille={20} /></button>
                <button type="button" className="boutonToit miroir" data-commande="toit.tourner" data-sens="-1" aria-label="Tourner le corps à droite" title="Tourner le corps à droite (15°)"
                  disabled={!commandes.etat('toit.tourner').utilisable} onClick={(ev) => { commandes.executer('toit.tourner', ev.currentTarget); }}><Icone nom="tournerCorps" taille={20} /></button>
                {bouton('toit.scinder', 'scinder', 'Couper le corps en deux')}
                <button type="button" className="boutonToit miroir" data-commande="toit.retour" data-cote="gauche" aria-label="Retour d’angle à gauche" title="Retour d’angle à gauche"
                  disabled={!commandes.etat('toit.retour').utilisable} onClick={(ev) => { commandes.executer('toit.retour', ev.currentTarget); }}><Icone nom="angle" taille={20} /></button>
                <button type="button" className="boutonToit" data-commande="toit.retour" data-cote="droite" aria-label="Retour d’angle à droite" title="Retour d’angle à droite"
                  disabled={!commandes.etat('toit.retour').utilisable} onClick={(ev) => { commandes.executer('toit.retour', ev.currentTarget); }}><Icone nom="angle" taille={20} /></button>
                {bouton('toit.fusionner', 'fusionner', 'Réunir avec le corps voisin')}
              </>
            ) : (
              <>
                {bouton('toit.moins', 'moins', 'Réduire')}
                {bouton('toit.plus', 'plus', 'Agrandir')}
                {bouton('toit.dupliquer', 'dupliquer', 'Dupliquer')}
                {/* Un element de facade (bow-window, galerie, appentis) change de mur au toucher d'un mur dans la scene. */}
                {selection.type === 'saillie' && bouton('toit.murSur3d', 'deplacer', 'Choisir le mur dans la 3D')}
              </>
            )}
            {bouton('toit.supprimer', 'supprimer', selection.type === 'corps' ? 'Supprimer ce corps' : 'Supprimer', true)}
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Le doigt qui invite a toucher le batiment, au-dessus de lui, tant que rien n'a ete touche. */
function IndiceMain({ magasin }: { magasin: Magasin }) {
  const [, redessiner] = useState(0);
  // Il suit chaque image rendue (la camera de l'image meme), tant qu'il se montre.
  useEffect(() => abonnerImage(() => { if (sessionToit()?.indice) redessiner((n) => n + 1); }), []);
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
    <svg className="indiceMain" data-suit-la-camera="" style={{ left: ((v.x + 1) / 2) * r.width, top: ((1 - v.y) / 2) * r.height }} width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 12V5.5a1.5 1.5 0 013 0V11M12 10.5V9a1.5 1.5 0 013 0v2M15 11a1.5 1.5 0 013 0v4c0 3.5-2.5 6-5.5 6S8 18.5 6.5 15.5L5 12.5a1.5 1.5 0 012.5-1L9 13" />
    </svg>
  );
}

/**
 * L'etat de la session, d'un coup d'oeil (retour du proprietaire, 8 novembre 2026 : « j'ai du mal a distinguer si je suis en modif ou
 * insertion ») : « Modification » (les poignees, les reglages, les pieces qui se posent d'un coup) ou « Insertion » d'une piece armee qui
 * attend un toucher sur la scene, avec ou toucher et comment en sortir. Toujours en mots, jamais par la couleur seule ; pose sur la scene,
 * hors du panneau, il ne defile pas avec lui et reste au-dessus de lui au telephone. Au doigt, pas d'Echap : le bouton « Annuler » le dit.
 */
function EtatSession({ insertion, commandes, clavier }: { insertion: InsertionToit | null; commandes: RegistreCommandes; clavier: boolean }) {
  return (
    <div className="etatToit" data-etat={insertion ? 'insertion' : 'modification'} role="status" aria-live="polite">
      <span className="badgeEtatToit"><Icone nom={insertion ? 'plus' : 'deplacer'} taille={16} />{insertion ? insertion.nature + ' : ' + insertion.piece : 'Modification'}</span>
      <span className="texteEtatToit">
        {insertion ? '— ' + insertion.consigne + (clavier ? ' · Échap pour annuler' : '') : 'Tirez les poignées de l’élément choisi, ou choisissez une pièce à ajouter.'}
      </span>
      {insertion && (
        <button type="button" className="annulerEtatToit" data-commande="toit.quitterInsertion" title="Quitter l’insertion sans rien poser (Échap)"
          onClick={(ev) => { commandes.executer('toit.quitterInsertion', ev.currentTarget); }}>Annuler</button>
      )}
    </div>
  );
}

/** Ce sur quoi agissent les gestes du catalogue : le corps choisi (celui de l'element choisi) ; sans choix, la facade regardee. */
function corpsCible(corps: readonly CorpsToit[], sel: CibleElement | null): string | null {
  if (corps.length < 2) return 'Les gestes s’appliquent au toit du bâtiment.';
  // Un corps choisi se dit une fois, dans la ligne « Corps · Façade » du haut du panneau.
  if (sel) return null;
  return 'Sans corps choisi, les gestes vont au corps de la façade regardée, sinon au corps principal. Choisissez un corps pour n’agir que sur lui.';
}

export function ModeToit({ magasin, commandes }: Props) {
  // Hors d'une session du toit, rien a montrer : la zone ne suit pas les rendus du plan ; en session, elle les suit tous.
  useCle(magasin, 'mode Toit', (s) => (sessionToit() ? String(s.version) : CLE_GELEE));
  const [onglet, setOnglet] = useState<FamillePiece>('toit');
  // Sur telephone le panneau est une feuille : repliee, elle ne laisse que sa barre et la scene respire.
  const [replie, setReplie] = useState(false);
  const tactile = useStore(magasin.store, (x) => x.classe) !== 'large';
  // Pendant une session, les messages passent en haut de l'ecran au telephone et a la tablette : en bas, ils couvraient la barre du mode.
  const enSession = !!sessionToit();
  useEffect(() => {
    document.documentElement.toggleAttribute('data-mode-toit', enSession);
    return () => { document.documentElement.removeAttribute('data-mode-toit'); };
  }, [enSession]);
  // L'insertion en cours se lit aussi sur la scene : le curseur de pose, le cadre de la couleur d'insertion, les poignees estompees (app.css).
  const insertion = enSession ? insertionToit() : null, enInsertion = !!insertion;
  useEffect(() => {
    document.documentElement.toggleAttribute('data-insertion-toit', enInsertion);
    return () => { document.documentElement.removeAttribute('data-insertion-toit'); };
  }, [enInsertion]);
  // La hauteur du panneau, sur la scene : au telephone et a la tablette, l'indicateur d'etat se pose juste au-dessus de lui (app.css,
  // `--hauteur-panneau-toit`), replie ou deplie.
  const panneau = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const p = panneau.current, hote = hotes3d.vue3d;
    if (!p || !hote || typeof ResizeObserver === 'undefined') return;
    const poser = () => { hote.style.setProperty('--hauteur-panneau-toit', p.getBoundingClientRect().height + 'px'); };
    poser();
    const r = new ResizeObserver(poser);
    r.observe(p);
    return () => { r.disconnect(); hote.style.removeProperty('--hauteur-panneau-toit'); };
  }, [enSession]);
  const e = etatToit(), s = sessionToit();
  if (!e.actif || !s) return null;
  const o = magasin.store.getState().etat.objects.find((x) => x.key === s.cle);
  const allumees = reglesAllumees(o);
  const pose = commandes.etat('toit.poser');
  // La forme du corps sur lequel agirait une forme : sa vignette est enfoncee (le catalogue dit ce qui est en place).
  const enPlace = o ? formeEnPlace(o, e.selection?.rang ?? null) : null;
  const cible = corpsCible(o?.batiment?.corpsToit ?? [], e.selection);
  // Les raisons qui grisent des vignettes de l'onglet ouvert, chacune une fois, avec les vignettes qu'elle grise.
  const raisonsDuCatalogue = [...piecesDe(onglet).reduce((m, p) => {
    const r = o ? raisonIndisponible(o, p.id, s.facade ?? s.derniere, e.selection?.rang ?? null) : null;
    if (r) m.set(r, [...(m.get(r) ?? []), p.libelle]);
    return m;
  }, new Map<string, string[]>())];
  return (
    <>
    <NavigateurFacades magasin={magasin} commandes={commandes} />
    <PlanToit magasin={magasin} commandes={commandes} />
    <IndiceMain magasin={magasin} />
    <PoigneesToit magasin={magasin} />
    <EtatSession insertion={insertion} commandes={commandes} clavier={!tactile} />
    <div ref={panneau} className={'panneauToit' + (replie ? ' replie' : '')} role="region" aria-label="Mode Toit">
      <button type="button" className="languetteToit" aria-expanded={!replie} aria-label={replie ? 'Déployer le catalogue' : 'Replier le catalogue'}
        title={replie ? 'Déployer le catalogue' : 'Replier le catalogue'} onClick={() => { setReplie(!replie); }}><Icone nom={replie ? 'chevronHaut' : 'chevronBas'} taille={20} /></button>
      {/* Ce qui defile, transparent, dans le panneau opaque qui ne defile pas : un defilement opaque pose sur la scene la faisait
          disparaitre (Chromium ecarte le canevas 3D qu'il croit cache ; app.css, `.defilementToit`). */}
      <div className="defilementToit">
      <div className="barreToit" role="toolbar" aria-label="Session du toit">
        <BoutonToit commandes={commandes} id="toit.abandonner" icone="chevronGauche" libelle="Retour : abandonner les changements" />
        <BoutonToit commandes={commandes} id="toit.annuler" icone="annuler" libelle="Annuler (Ctrl+Z)" />
        <BoutonToit commandes={commandes} id="toit.retablir" icone="annuler" libelle="Rétablir (Ctrl+Maj+Z)" miroir />
        <BoutonToit commandes={commandes} id="toit.depart" icone="positionInitiale" libelle="Revenir au départ (annulable)" />
        <BoutonToit commandes={commandes} id="toit.isoler" icone={e.isole ? 'oeilBarre' : 'oeil'} libelle="Isoler ce bâtiment" presse={e.isole} />
        <span className="separateurToit" aria-hidden="true" />
        <BoutonToit commandes={commandes} id="toit.vueLibre" icone="cube" libelle="Vue 3D" presse={e.vue === 'libre'} />
        <BoutonToit commandes={commandes} id="toit.vueFacade" icone="rectangle" libelle="Vue de la façade" presse={e.vue === 'facade'} />
        <BoutonToit commandes={commandes} id="toit.vueDessus" icone="vueDessus" libelle="Vue de dessus" presse={e.vue === 'dessus'} />
        <BoutonToit commandes={commandes} id="toit.recadrer" icone="recadrer" libelle="Recadrer le bâtiment" />
        <BoutonToit commandes={commandes} id="toit.voirValide" icone="toitAvant" libelle="Voir le toit du projet (avant vos changements)" presse={e.validee} />
        <BoutonToit commandes={commandes} id="toit.isolerCorps" icone="isoler" libelle="Isoler ce corps" presse={e.corpsIsole} />
        <span className="espaceToit" />
        <BoutonToit commandes={commandes} id="toit.valider" icone="coche" libelle="Valider" texte="Valider" valider />
      </div>
      <p className="indiceToit designationToit" role="status">{e.designation}</p>
      <button type="button" className="toitRegles" data-commande="toit.regles" aria-pressed={allumees} disabled={!commandes.etat('toit.regles').utilisable}
        title={allumees ? 'Règles allumées : le toit se lit tout seul. Cliquez pour le régler vous-même.' : 'Règles coupées : le toit reste comme vous le réglez. Cliquez pour reprendre la lecture automatique.'}
        onClick={(ev) => { commandes.executer('toit.regles', ev.currentTarget); }}>
        {'Règles ' + (allumees ? 'allumées' : 'coupées')}
      </button>
      <ElementsToit corps={o?.batiment?.corpsToit ?? []} selection={e.selection} commandes={commandes} />
      <h3 className="titrePlateau" id="titrePlateauToit">Ajouter un élément</h3>
      {cible && <p className="indiceToit">{cible}</p>}
      <div className="toitOnglets" role="tablist" aria-labelledby="titrePlateauToit">
        {ONGLETS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={onglet === t.id} className="toitOnglet" onClick={() => setOnglet(t.id)}>{t.libelle}</button>
        ))}
      </div>
      <div className="toitCatalogue">
        {piecesDe(onglet).map((p) => {
          const refusDe = (id: string) => (o ? raisonIndisponible(o, id, s.facade ?? s.derniere, e.selection?.rang ?? null) : 'Aucun bâtiment.');
          const refus = refusDe(p.id), options = OPTIONS_PIECE[p.id], idCommande = COMMANDE_DE_PIECE[p.id] ?? 'toit.poser';
          const permise = idCommande === 'toit.poser' ? pose.utilisable : commandes.etat(idCommande).utilisable;
          // La piece armee (elle attend son toucher sur la scene) est enfoncee, de la couleur de l'insertion ; un second appui la lache.
          const armee = insertion?.commande === idCommande;
          const bouton = (
            <button key={p.id} type="button" className={'toitPiece' + (armee ? ' armee' : '')} data-commande={idCommande} data-piece={p.id}
              aria-pressed={p.famille === 'toit' ? p.id === enPlace : armee ? true : idCommande !== 'toit.poser' ? false : undefined}
              disabled={!!refus || !permise} title={p.libelle + (refus ? ' — ' + refus : armee ? ' — touchez la scène pour poser ; appuyez de nouveau pour annuler' : '')} aria-label={p.libelle}
              onClick={(ev) => { commandes.executer(idCommande, ev.currentTarget); }}>
              <span className="glyphe"><ImagePiece p={p} /></span>
              <span className="libelle">{p.libelle}</span>
            </button>
          );
          if (!options) return bouton;
          // Les variantes de la piece, sous sa vignette : le quatre-pans en trois pans, la croupe a un seul bout du faitage.
          return (
            <div key={p.id} className="toitPieceOptions" role="group" aria-label={p.libelle}>
              {bouton}
              {options.map((v) => {
                const r = refusDe(v.id);
                return (
                  <button key={v.id} type="button" className="optionPiece" data-commande="toit.poser" data-piece={v.id}
                    disabled={!!r || !pose.utilisable} title={(p.id === 'forme:croupes' ? 'Trois pans : ' + v.libelle.toLowerCase() + ' du faîtage, un pignon à l’autre bout' : p.libelle + ' : ' + v.libelle.toLowerCase()) + (r ? ' — ' + r : '')}
                    onClick={(ev) => { commandes.executer('toit.poser', ev.currentTarget); }}>{v.libelle}</button>
                );
              })}
            </div>
          );
        })}
      </div>
      {/* Au doigt, l'infobulle n'existe pas : ce qui grise une vignette s'ecrit sous le catalogue, une ligne par raison (design-ui, §1 bis). */}
      {tactile && raisonsDuCatalogue.length > 0 && (
        <ul className="raisonsToit" aria-label="Pourquoi des vignettes sont grisées">
          {raisonsDuCatalogue.map(([raison, noms]) => <li key={raison}>{noms.join(', ') + ' : ' + raison}</li>)}
        </ul>
      )}
      </div>
    </div>
    </>
  );
}

