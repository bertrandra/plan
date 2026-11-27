// Z4, le mode Toit de la Vue 3D (MD/spec-mode-toit-3d.md) : le parcours simple (modifier le toit en trois reglages, ajouter une piece
// parmi six), et derriere « Plus de reglages » la barre de session, l'inspecteur et le catalogue entier, sur le bas de la scene.
//
// Le panneau n'existe que pendant une session (app/toits/modeToit.ts). Tout bouton est une commande du registre ; le panneau ne sait ni
// poser ni valider, il demande. La facade choisie se dit dans l'indice ; tant qu'aucune ne l'est, l'indice invite a toucher un mur.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { altitudeDuBatiment, etatToit, sessionToit } from '../../app/toits/modeToit.js';
import { abonnerIntentionToit, intentionToit, MOTS_INTENTION, type IntentionToit } from '../../app/toits/intention.js';
import { useCle, CLE_GELEE } from '../composants/abonnement.js';
import { enPoints } from '../../model/formes.js';
import { abonnerImage, cameraDeVue, hotes3d, vue3d } from '../../three/etat3d.js';
import { insertionToit, reglesAllumees, type InsertionToit } from '../../app/ecouteurs/toitCatalogue.js';
import { OPTIONS_PIECE, formeEnPlace, piece, piecesDe, raisonIndisponible, type FamillePiece, type PieceCatalogue } from '../../three/gestesToits.js';
import { FORMES_SIMPLES, MOTS_SENS, PIECES_SIMPLES, faitageDuToitSimple, faitageSimple, rangDesReglages, sensDuToitSimple, sensSimple } from '../../facade/modeToit/simple.js';
import { vueDeSaillie, vueSurLeToit } from '../../three/vueSaillie.js';
import { VignetteToit, VignetteVue } from '../EcranChaine.js';
import { NavigateurFacades } from './NavigateurFacades.js';
import { PoigneesToit } from './PoigneesToit.js';
import { PlanToit } from './PlanToit.js';
import { Icone, type NomIcone } from '../icones.js';
import { ImageChoix } from './iconesToit.js';
import { groupesDe, groupesDuBatiment, libellesDesElements, memeCible, titreDuGroupe, valeurDuBatiment, valeurDuGroupe, type CibleElement, type GroupeChoix } from '../../facade/modeToit/elements.js';
import type { CorpsToit, ObjetPlan } from '../../model/types.js';
import type { Magasin } from '../../app/magasin.js';
import type { RegistreCommandes } from '../../app/commandes.js';

interface Props { magasin: Magasin; commandes: RegistreCommandes }

// Ce qui s'AJOUTE, par famille. Les formes de toit (famille « toit ») n'y sont pas : changer la forme d'un toit ne cree rien, c'est
// une modification, rangee avec les reglages (retour du proprietaire, 24 novembre 2026).
const ONGLETS: { id: FamillePiece; libelle: string }[] = [
  { id: 'sur', libelle: 'Sur le toit' }, { id: 'facade', libelle: 'Façade' }, { id: 'corps', libelle: 'Corps' }
];

const vuesFacade = new Map<string, ReturnType<typeof vueDeSaillie>>();
const vuesSurLeToit = new Map<string, ReturnType<typeof vueSurLeToit>>();
/**
 * L'image d'une piece : la vignette du catalogue, celle de l'element de facade, ou (onglet « Sur le toit ») l'element cadre de pres sur
 * son toit, chacune calculee une fois.
 */
/** Les pieces qui ne se posent pas d'un coup ont leur propre commande : le decroche attend le point touche sur l'egout ou le mur. */
const COMMANDE_DE_PIECE: Record<string, string> = { 'facade:decroche': 'toit.decrocher' };

/** Les pieces que le parcours simple offre deja (les quatre formes, les six pieces) : le catalogue de « Plus de reglages » montre les autres. */
const DANS_LE_SIMPLE = new Set([...FORMES_SIMPLES, ...PIECES_SIMPLES].map((x) => x.piece));

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
/**
 * `partie` : « cible » = les pastilles (ce sur quoi l'on travaille, que l'on modifie ou que l'on ajoute), toujours montrees ;
 * « reglages » = l'inspecteur de la cible, montre quand on modifie.
 */
function ElementsToit({ corps, selection, commandes, partie }: { corps: readonly CorpsToit[]; selection: CibleElement | null; commandes: RegistreCommandes; partie: 'cible' | 'reglages' }) {
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
  if (partie === 'cible') return (
    <div className="elementsToit cibleToit">
      <span className="titreGroupe" id="titreCibleToit">Vous travaillez sur</span>
      <div className="puces" role="group" aria-labelledby="titreCibleToit">
        {/* Le batiment entier : les gestes reviennent a lui (retoucher la pastille enfoncee d'un element fait de meme). */}
        <button type="button" className="puceToit" data-commande="toit.selection" aria-pressed={!selection}
          onClick={(ev) => { commandes.executer('toit.selection', ev.currentTarget); }}>Bâtiment entier</button>
        {liste.map((e) => (
          <button key={e.cible.type + e.cible.rang + ':' + e.cible.i} type="button" className="puceToit" data-commande="toit.selection" data-type={e.cible.type} data-rang={e.cible.rang} data-i={e.cible.i}
            aria-pressed={memeCible(e.cible, selection)} onClick={(ev) => { commandes.executer('toit.selection', ev.currentTarget); }}>{e.libelle}</button>
        ))}
      </div>
    </div>
  );
  if (!groupes.length && !groupesBatiment.length && !selection) return null;
  return (
    <div className="elementsToit">
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
                {/* Réduire, agrandir et retirer un element sont dans le parcours simple, au-dessus : un geste n'existe qu'a un endroit. */}
                {bouton('toit.dupliquer', 'dupliquer', 'Dupliquer')}
                {/* Un element de facade (bow-window, galerie, appentis) change de mur au toucher d'un mur dans la scene. */}
                {selection.type === 'saillie' && bouton('toit.murSur3d', 'deplacer', 'Choisir le mur dans la 3D')}
              </>
            )}
            {selection.type === 'corps' && bouton('toit.supprimer', 'supprimer', 'Supprimer ce corps', true)}
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
 * L'etat de la session, d'un coup d'oeil, sur la scene (retour du proprietaire, 8 novembre 2026 : « j'ai du mal a distinguer si je suis en
 * modif ou insertion ») : une pastille « Modification » ou « Ajout », un mot et son icone, sans phrase (le titre du panneau et sa promesse
 * la disent, parcours simple du 27 novembre 2026 : la scene garde sa place) ; et, quand une piece armee attend un toucher, « Insertion » en
 * toutes lettres, avec ou toucher et comment en sortir. Toujours en mots, jamais par la couleur seule ; pose sur la scene, hors du panneau,
 * il ne defile pas avec lui et reste au-dessus de lui au telephone. Au doigt, pas d'Echap : le bouton « Annuler » le dit.
 */
function EtatSession({ insertion, intention, commandes, clavier }: { insertion: InsertionToit | null; intention: IntentionToit; commandes: RegistreCommandes; clavier: boolean }) {
  const etat = insertion ? 'insertion' : intention === 'ajouter' ? 'ajout' : 'modification';
  return (
    <div className="etatToit" data-etat={etat} role="status" aria-live="polite">
      <span className="badgeEtatToit"><Icone nom={etat === 'modification' ? 'crayon' : 'plus'} taille={16} />{insertion ? insertion.nature + ' : ' + insertion.piece : etat === 'ajout' ? 'Ajout' : 'Modification'}</span>
      {insertion && (
        <>
          <span className="texteEtatToit">{'— ' + insertion.consigne + (clavier ? ' · Échap pour annuler' : '')}</span>
          <button type="button" className="annulerEtatToit" data-commande="toit.quitterInsertion" title="Quitter l’insertion sans rien poser (Échap)"
            onClick={(ev) => { commandes.executer('toit.quitterInsertion', ev.currentTarget); }}>Annuler</button>
        </>
      )}
    </div>
  );
}

/** Ce sur quoi agissent les gestes du catalogue : le corps choisi (celui de l'element choisi) ; sans choix, la facade regardee. */
function corpsCible(corps: readonly CorpsToit[], sel: CibleElement | null): string | null {
  if (corps.length < 2) return null;
  // Un corps choisi se dit par sa pastille enfoncee, sous « Vous travaillez sur ».
  if (sel) return null;
  return 'Sans corps choisi ci-dessus, la pièce va au corps de la façade regardée, sinon au corps principal.';
}

/**
 * Les vignettes d'une famille : les formes de toit (une modification : celle en place est enfoncee), ou les pieces a poser. Chaque
 * vignette est une commande ; grisee, elle dit pourquoi (infobulle, et au doigt une ligne par raison sous le catalogue).
 */
function CatalogueToit({ famille, o, commandes, insertion, tactile }: { famille: FamillePiece; o: ObjetPlan | undefined; commandes: RegistreCommandes; insertion: InsertionToit | null; tactile: boolean }) {
  // Un geste n'existe qu'a un endroit (design-ui, §1) : les pieces du parcours simple ne sont pas redites ici. Leurs variantes restent.
  const pieces = piecesDe(famille).filter((p) => !DANS_LE_SIMPLE.has(p.id) || !!OPTIONS_PIECE[p.id]);
  const e = etatToit(), s = sessionToit();
  if (!s) return null;
  const pose = commandes.etat('toit.poser');
  // La forme du corps sur lequel agirait une forme : sa vignette est enfoncee (le catalogue dit ce qui est en place).
  const enPlace = o ? formeEnPlace(o, e.selection?.rang ?? null) : null;
  const refusDe = (id: string) => (o ? raisonIndisponible(o, id, s.facade ?? s.derniere, e.selection?.rang ?? null) : 'Aucun bâtiment.');
  // Les raisons qui grisent des vignettes montrees, chacune une fois, avec les vignettes qu'elle grise.
  const raisonsDuCatalogue = [...pieces.reduce((m, p) => {
    const r = o ? refusDe(p.id) : null;
    if (r) m.set(r, [...(m.get(r) ?? []), p.libelle]);
    return m;
  }, new Map<string, string[]>())];
  // Tout est grise pour une seule raison (un toit pas encore decoupe en corps) : elle se dit en clair au-dessus, avec le geste qui la
  // leve, au lieu de quinze vignettes grises a survoler.
  const [seule] = raisonsDuCatalogue;
  const blocage = seule && raisonsDuCatalogue.length === 1 && seule[1].length === pieces.length ? seule[0] : null;
  return (
    <>
      {blocage && (
        <div className="blocageToit" role="note">
          <p>{blocage}</p>
          {famille !== 'toit' && !o?.batiment?.corpsToit?.length && (
            <button type="button" className="boutonToit" data-commande="toit.intention" data-intention="modifier"
              onClick={(ev) => { commandes.executer('toit.intention', ev.currentTarget); }}><Icone nom="toit" taille={20} /><span>Choisir la forme du toit</span></button>
          )}
        </div>
      )}
      <div className="toitCatalogue" data-famille={famille}>
        {pieces.map((p) => {
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
              {!DANS_LE_SIMPLE.has(p.id) && bouton}
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
      {tactile && !blocage && raisonsDuCatalogue.length > 0 && (
        <ul className="raisonsToit" aria-label="Pourquoi des vignettes sont grisées">
          {raisonsDuCatalogue.map(([raison, noms]) => <li key={raison}>{noms.join(', ') + ' : ' + raison}</li>)}
        </ul>
      )}
    </>
  );
}

/** Amene un bloc en haut de ce qui defile dans le panneau, et rien d'autre (`scrollIntoView` ferait aussi defiler la page). */
function monterDansLePanneau(bloc: HTMLElement): void {
  const zone = bloc.closest<HTMLElement>('.defilementToit');
  if (zone) zone.scrollTop += bloc.getBoundingClientRect().top - zone.getBoundingClientRect().top;
}

const enMetres = (v: number): string => v.toFixed(1).replace('.', ',') + ' m';

/** Un bouton − ou + d'un pas : une commande, son etat, et l'effet qu'il a encore (en butee, il se grise). */
function BoutonPas({ commandes, id, sens, libelle, effet }: { commandes: RegistreCommandes; id: string; sens: 1 | -1; libelle: string; effet: boolean }) {
  const e = commandes.etat(id), refus = !e.utilisable && 'message' in e ? e.message : null;
  return (
    <button type="button" className="boutonPas" data-commande={id} data-sens={sens} aria-label={libelle} title={libelle + (refus ? ' — ' + refus : '')}
      disabled={!e.utilisable || !effet} onClick={(ev) => { commandes.executer(id, ev.currentTarget); }}><Icone nom={sens > 0 ? 'plus' : 'moins'} taille={20} /></button>
  );
}

/**
 * « Modifier le toit », le parcours simple (maquette du 27 novembre 2026) : la forme (quatre vignettes, celle en place marquee ; une forme
 * rare en place reste montree), la hauteur du faitage par pas de dix centimetres, son sens. Sur le corps choisi, sinon tout le toit.
 */
function ModifierSimple({ o, corps, selection, commandes }: { o: ObjetPlan | undefined; corps: readonly CorpsToit[]; selection: CibleElement | null; commandes: RegistreCommandes }) {
  const pose = commandes.etat('toit.poser');
  const t = o?.batiment?.toit?.forme;
  const enPlace = o ? formeEnPlace(o, selection?.rang ?? null) ?? (!corps.length && t ? 'forme:' + (t === 'quatre-pans' ? 'croupes' : t) : null) : null;
  // Une forme rare en place (Mansart, pavillon…) reste sous les yeux, marquee, a cote des quatre formes courantes.
  const rare = enPlace && !FORMES_SIMPLES.some((f) => f.piece === enPlace) ? piece(enPlace) : undefined;
  const formes = [...FORMES_SIMPLES, ...(rare ? [{ piece: rare.id, libelle: rare.libelle }] : [])];
  const nCorps = corps.filter((c) => !c.saillie).length;
  // Sans corps encore, c'est le toit simple du batiment qui se regle (sa hauteur, sa direction).
  const f = corps.length ? faitageSimple(corps, rangDesReglages(corps, selection)) : o ? faitageDuToitSimple(o) : null;
  const sens = corps.length ? sensSimple(corps, selection) : o ? sensDuToitSimple(o) : null;
  // La mesure du LiDAR est celle du batiment : elle se rappelle quand on regle son corps principal.
  const mesure = !selection ? o?.batiment?.toitMesure?.faite : undefined;
  const tourner = commandes.etat('toit.sens');
  return (
    <>
      <div className="reglageSimple">
        <span className="titreReglage" id="titreFormeToit">Forme</span>
        <div className="formesSimples" role="group" aria-labelledby="titreFormeToit">
          {formes.map((x) => (
            <button key={x.piece} type="button" className="toitPiece" data-commande="toit.poser" data-piece={x.piece} aria-pressed={x.piece === enPlace}
              disabled={!pose.utilisable} title={x.libelle + (x.piece === enPlace ? ' — la forme en place' : '')} onClick={(ev) => { commandes.executer('toit.poser', ev.currentTarget); }}>
              <span className="glyphe"><VignetteToit forme={x.piece.replace(/^forme:/, '')} /></span>
              <span className="libelle">{x.libelle}</span>
              {/* La forme en place : une coche et son mot (pour qui ne voit pas la coche), la couleur ne la dit jamais seule. */}
              {x.piece === enPlace && <span className="marqueEnPlace"><Icone nom="coche" taille={14} /><span className="horsEcran"> (en place)</span></span>}
            </button>
          ))}
        </div>
        {!selection && nCorps > 1 && <p className="noteReglage">{'Ce toit a ' + nCorps + ' corps : une forme les remplace tous. Pour n’en changer qu’un, choisissez-le ci-dessus.'}</p>}
      </div>
      {f && (
        <div className="reglageSimple enLigne">
          <div className="texteReglage">
            <span className="titreReglage" id="titreFaitageToit">Hauteur du faîtage</span>
            {f.raison ? <span className="noteReglage" role="note">{f.raison}</span> : typeof mesure === 'number' && <span className="noteReglage">{'Mesuré au LiDAR : ' + enMetres(mesure)}</span>}
          </div>
          <div className="pasAPas" role="group" aria-labelledby="titreFaitageToit">
            <BoutonPas commandes={commandes} id="toit.faitage" sens={-1} libelle="Baisser le faîtage de 10 cm" effet={f.descend} />
            <span className="valeurPas" data-valeur="faitage" aria-live="polite">{enMetres(f.hauteur)}</span>
            <BoutonPas commandes={commandes} id="toit.faitage" sens={1} libelle="Monter le faîtage de 10 cm" effet={f.monte} />
          </div>
        </div>
      )}
      {sens && (
        <div className="reglageSimple enLigne">
          <div className="texteReglage">
            <span className="titreReglage">Sens du faîtage</span>
            {sens.raison ? <span className="noteReglage" role="note">{sens.raison}</span> : <span className="valeurSens" data-valeur="sens" aria-live="polite">{MOTS_SENS[sens.valeur]}</span>}
          </div>
          <button type="button" className="boutonToit boutonTourner" data-commande="toit.sens" disabled={!tourner.utilisable}
            title={'Tourner le faîtage d’un quart de tour' + (sens.raison ? ' — ' + sens.raison : '')} onClick={(ev) => { commandes.executer('toit.sens', ev.currentTarget); }}>
            <Icone nom="tournerDroite" taille={20} /><span>Tourner</span>
          </button>
        </div>
      )}
    </>
  );
}

/** Ce que − et + reglent sur un element choisi, en un mot : sa largeur, ou sa taille quand il grandit en tous sens. */
const MOT_TAILLE: Partial<Record<CibleElement['type'], string>> = { saillie: 'Largeur', pignon: 'Largeur', lucarne: 'Largeur', cheminee: 'Taille', 'fenetre-toit': 'Taille', solaire: 'Taille' };

/**
 * L'element choisi (celui qu'on vient de poser, ou qu'on a touche), dans le parcours simple : sa largeur par − et +, le retirer. Sa
 * forme, sa place et ses reglages fins sont dans « Plus de reglages » et sous ses poignees.
 */
function ElementSimple({ corps, selection, commandes }: { corps: readonly CorpsToit[]; selection: CibleElement; commandes: RegistreCommandes }) {
  const nom = libellesDesElements(corps).find((x) => memeCible(x.cible, selection))?.libelle ?? 'Élément', mot = MOT_TAILLE[selection.type];
  const retirer = commandes.etat('toit.supprimer');
  return (
    <>
      {mot && (
        <div className="reglageSimple enLigne">
          <div className="texteReglage">
            <span className="titreReglage" id="titreTailleToit">{mot}</span>
            <span className="noteReglage">Ses poignées, sur la maison, la déplacent.</span>
          </div>
          <div className="pasAPas" role="group" aria-labelledby="titreTailleToit">
            <BoutonPas commandes={commandes} id="toit.moins" sens={-1} libelle="Réduire" effet />
            <span className="valeurPas nomPas">{nom}</span>
            <BoutonPas commandes={commandes} id="toit.plus" sens={1} libelle="Agrandir" effet />
          </div>
        </div>
      )}
      <button type="button" className="boutonToit danger retirerSimple" data-commande="toit.supprimer" disabled={!retirer.utilisable}
        title={'Retirer ' + nom + ' (Ctrl+Z le rend)'} onClick={(ev) => { commandes.executer('toit.supprimer', ev.currentTarget); }}>
        <Icone nom="supprimer" taille={20} /><span>{'Retirer ' + nom.charAt(0).toLowerCase() + nom.slice(1)}</span>
      </button>
    </>
  );
}

/**
 * « Ajouter au toit », le parcours simple : six pieces, on en choisit une, le bouton du pied la pose (« Poser la lucarne »). La consigne
 * dit ou elle ira : une piece de facade va sur le mur que l'on a touche, une piece de toit au milieu du toit, d'ou ses poignees la deplacent.
 */
function AjouterSimple({ choisie, choisir, facade, refus }: { choisie: string; choisir: (id: string) => void; facade: string | null; refus: string | null }) {
  const surFacade = choisie.startsWith('facade:');
  return (
    <>
      <div className="piecesSimples" role="group" aria-label="La pièce à poser">
        {PIECES_SIMPLES.map((x) => {
          const p = piece(x.piece);
          return (
            <button key={x.piece} type="button" className="toitPiece" data-choix-piece={x.piece} aria-pressed={x.piece === choisie} onClick={() => { choisir(x.piece); }}>
              <span className="glyphe">{p && <ImagePiece p={p} />}</span>
              <span className="libelle">{x.libelle}</span>
            </button>
          );
        })}
      </div>
      <p className={'noteReglage consignePose' + (refus ? ' refus' : '')} role="note">
        {refus ?? (surFacade ? (facade ? 'Elle ira sur la ' + facade.charAt(0).toLowerCase() + facade.slice(1).replace(/ · vue sur la photo.*$/, '') + '. Touchez un autre mur pour changer.' : 'Touchez un mur de la maison pour choisir la façade.')
          : 'Elle se pose au milieu du toit. Vous réglerez sa largeur et sa place juste après.')}
      </p>
    </>
  );
}

/** La barre de la session, rangee sous « Plus de reglages » : defaire, retablir, revenir au depart, isoler, les vues. Quitter et valider sont au pied du panneau. */
function BarreSession({ commandes, e }: { commandes: RegistreCommandes; e: ReturnType<typeof etatToit> }) {
  return (
    <div className="barreToit" role="toolbar" aria-label="Session du toit">
      <BoutonToit commandes={commandes} id="toit.annuler" icone="annuler" libelle="Défaire le dernier geste (Ctrl+Z)" />
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
    </div>
  );
}

export function ModeToit({ magasin, commandes }: Props) {
  // Hors d'une session du toit, rien a montrer : la zone ne suit pas les rendus du plan ; en session, elle les suit tous.
  useCle(magasin, 'mode Toit', (s) => (sessionToit() ? String(s.version) : CLE_GELEE));
  const [onglet, setOnglet] = useState<FamillePiece>('sur');
  // Modifier ce qui existe, ou ajouter un element : le panneau ne montre que l'un des deux (app/toits/intention.ts).
  const intention = useSyncExternalStore(abonnerIntentionToit, intentionToit);
  // Sur telephone le panneau est une feuille : repliee, elle ne laisse que sa barre et la scene respire.
  const [replie, setReplie] = useState(false);
  // « Plus de reglages » : tout ce que le mode sait faire au-dela du parcours simple, replie a chaque session qui s'ouvre.
  const [plus, setPlus] = useState(false);
  // La piece que « Poser » posera (parcours simple) : un choix d'ecran, comme un onglet.
  const [pieceChoisie, setPieceChoisie] = useState<string>(PIECES_SIMPLES[0]?.piece ?? '');
  const tactile = useStore(magasin.store, (x) => x.classe) !== 'large';
  // Pendant une session, les messages passent en haut de l'ecran au telephone et a la tablette : en bas, ils couvraient la barre du mode.
  const enSession = !!sessionToit();
  useEffect(() => { if (!enSession) setPlus(false); }, [enSession]);
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
  const cible = corpsCible(o?.batiment?.corpsToit ?? [], e.selection);
  const corps = o?.batiment?.corpsToit ?? [];
  // La forme, la hauteur et le sens se reglent sur le batiment entier ou sur un corps ; un element choisi (lucarne, bow-window) a les siens.
  const surLeToit = !e.selection || e.selection.type === 'corps';
  const famille: FamillePiece = intention === 'modifier' ? 'toit' : onglet;
  // Plusieurs corps ou des elements poses : ce sur quoi l'on travaille reste sous les yeux ; une maison d'un seul corps n'a rien a choisir.
  const aChoisir = libellesDesElements(corps).length > 1;
  const aPoser = PIECES_SIMPLES.find((x) => x.piece === pieceChoisie) ?? (PIECES_SIMPLES[0] as typeof PIECES_SIMPLES[number]);
  const refusDePoser = o ? raisonIndisponible(o, aPoser.piece, s.facade ?? s.derniere, e.selection?.rang ?? null) : null;
  const quitter = commandes.etat('toit.abandonner'), valider = commandes.etat('toit.valider'), poser = commandes.etat('toit.poser');
  const refusDe = (x: ReturnType<RegistreCommandes['etat']>) => (!x.utilisable && 'message' in x ? ' — ' + x.message : '');
  const boutonIntention = (i: IntentionToit, icone: NomIcone, quoi: string) => (
    <button type="button" className="boutonIntention" data-commande="toit.intention" data-intention={i} aria-pressed={intention === i}
      title={MOTS_INTENTION[i].verbe + ' ' + quoi + ' : ' + MOTS_INTENTION[i].promesse}
      onClick={(ev) => { commandes.executer('toit.intention', ev.currentTarget); }}>
      <Icone nom={icone} taille={20} /><span className="verbeIntention">{MOTS_INTENTION[i].verbe}</span><span className="quoiIntention">{quoi}</span>
    </button>
  );
  return (
    <>
    <NavigateurFacades magasin={magasin} commandes={commandes} />
    <PlanToit magasin={magasin} commandes={commandes} />
    <IndiceMain magasin={magasin} />
    <PoigneesToit magasin={magasin} />
    <EtatSession insertion={insertion} intention={intention} commandes={commandes} clavier={!tactile} />
    <div ref={panneau} className={'panneauToit' + (replie ? ' replie' : '')} data-intention={intention} role="region" aria-label="Mode Toit">
      <button type="button" className="languetteToit" aria-expanded={!replie} aria-label={replie ? 'Déployer le panneau' : 'Replier le panneau'}
        title={replie ? 'Déployer le panneau' : 'Replier le panneau'} onClick={() => { setReplie(!replie); }}><Icone nom={replie ? 'chevronHaut' : 'chevronBas'} taille={20} /></button>
      {/* Ce qui defile, transparent, dans le panneau opaque qui ne defile pas : un defilement opaque pose sur la scene la faisait
          disparaitre (Chromium ecarte le canevas 3D qu'il croit cache ; app.css, `.defilementToit`). */}
      <div className="defilementToit">
      {/* 1. Pour quoi faire : modifier ce qui existe, ou ajouter une piece. Le titre du panneau, et jamais les deux a la fois sous les yeux. */}
      <div className="intentionToit" role="group" aria-label="Que voulez-vous faire ?">
        {boutonIntention('modifier', 'crayon', 'le toit')}
        {boutonIntention('ajouter', 'plus', 'au toit')}
      </div>
      <p className="promesseToit">{intention === 'modifier' ? 'Vous changez ce qui existe. Rien n’est créé.' : 'Vous posez une pièce. Rien d’existant n’est touché.'}</p>
      {/* 2. Sur quoi, quand il y a le choix : le batiment entier, un corps, un element. */}
      {aChoisir && <ElementsToit corps={corps} selection={e.selection} commandes={commandes} partie="cible" />}
      {/* 3. Le faire, en peu de gestes ; tout le reste du mode est range dessous, replie. */}
      <div className="voletToit" data-volet={intention} role="group" aria-label={intention === 'modifier' ? 'Modifier le toit' : 'Ajouter au toit'}>
        {intention === 'ajouter' ? <AjouterSimple choisie={aPoser.piece} choisir={setPieceChoisie} facade={e.facade} refus={refusDePoser} />
          : surLeToit ? <ModifierSimple o={o} corps={corps} selection={e.selection} commandes={commandes} />
            : e.selection && <ElementSimple corps={corps} selection={e.selection} commandes={commandes} />}
        <details className="plusToit" open={plus} onToggle={(ev) => { setPlus(ev.currentTarget.open); if (ev.currentTarget.open) monterDansLePanneau(ev.currentTarget); }}>
          <summary>Plus de réglages</summary>
          <div className="contenuPlusToit">
            <BarreSession commandes={commandes} e={e} />
            {!aChoisir && <ElementsToit corps={corps} selection={e.selection} commandes={commandes} partie="cible" />}
            <p className="indiceToit designationToit" role="status">{e.designation}</p>
            {intention === 'modifier' ? (
              <>
                {surLeToit && (
                  <div className="groupeReglage groupeForme">
                    <span className="titreGroupe" aria-hidden="true">Autres formes de toit</span>
                    <CatalogueToit famille={famille} o={o} commandes={commandes} insertion={insertion} tactile={tactile} />
                  </div>
                )}
                <ElementsToit corps={corps} selection={e.selection} commandes={commandes} partie="reglages" />
                <button type="button" className="toitRegles" data-commande="toit.regles" aria-pressed={allumees} disabled={!commandes.etat('toit.regles').utilisable}
                  title={allumees ? 'Règles allumées : le toit se lit tout seul. Cliquez pour le régler vous-même.' : 'Règles coupées : le toit reste comme vous le réglez. Cliquez pour reprendre la lecture automatique.'}
                  onClick={(ev) => { commandes.executer('toit.regles', ev.currentTarget); }}>
                  {'Règles ' + (allumees ? 'allumées' : 'coupées')}
                </button>
              </>
            ) : (
              <>
                <h3 className="titrePlateau" id="titrePlateauToit">Autres pièces : un toucher les pose</h3>
                {cible && <p className="indiceToit">{cible}</p>}
                <div className="toitOnglets" role="tablist" aria-labelledby="titrePlateauToit">
                  {ONGLETS.map((t) => (
                    <button key={t.id} type="button" role="tab" aria-selected={onglet === t.id} className="toitOnglet" onClick={() => setOnglet(t.id)}>{t.libelle}</button>
                  ))}
                </div>
                <CatalogueToit famille={famille} o={o} commandes={commandes} insertion={insertion} tactile={tactile} />
              </>
            )}
          </div>
        </details>
      </div>
      </div>
      {/* Le pied, hors du defilement : quitter sans rien garder, ou garder. Quand on ajoute, le bouton principal pose la piece choisie. */}
      <div className="piedToit">
        <button type="button" className="boutonPied" data-commande="toit.abandonner" disabled={!quitter.utilisable}
          title={'Annuler : quitter sans garder les changements' + refusDe(quitter)} onClick={(ev) => { commandes.executer('toit.abandonner', ev.currentTarget); }}>Annuler</button>
        {intention === 'ajouter' && (
          <button type="button" className="boutonPied principal poser" data-commande="toit.poser" data-piece={aPoser.piece} disabled={!poser.utilisable || !!refusDePoser}
            title={aPoser.poser + (refusDePoser ? ' — ' + refusDePoser : refusDe(poser))} onClick={(ev) => { commandes.executer('toit.poser', ev.currentTarget); }}>
            <Icone nom="plus" taille={20} /><span>{aPoser.poser}</span>
          </button>
        )}
        {/* Quand on ajoute, « Valider » ne se montre que s'il y a quelque chose a garder : le geste attendu est de poser. */}
        {(intention === 'modifier' || e.change) && (
          <button type="button" className={'boutonPied valider' + (intention === 'modifier' ? ' principal' : '')} data-commande="toit.valider" disabled={!valider.utilisable}
            title={'Valider : garder les changements dans le projet' + refusDe(valider)} onClick={(ev) => { commandes.executer('toit.valider', ev.currentTarget); }}>
            <Icone nom="coche" taille={20} /><span>Valider</span>
          </button>
        )}
      </div>
    </div>
    </>
  );
}
