// Z10, l'atelier du toit (MD/spec-ihm-zones.md §3, MD/spec-mode-toit-3d.md) : le seul endroit ou l'on edite un toit, sur le plan comme
// dans la Vue 3D. Le parcours simple (modifier le toit en trois reglages, ajouter une piece parmi six), « Défaire », et derriere « Plus de
// réglages » la barre de la session, les autres formes, l'inspecteur de la cible et le catalogue entier ; au pied, « Quitter sans garder »
// et « Valider ».
//
// L'atelier lit l'etat du controleur du toit (facade/modeToit/controleurToit.ts, par la session : app/toits/modeToit.ts) et emet ses
// intentions par les commandes du registre : il ne sait ni poser, ni borner, ni dire sur quoi agit un geste. Il se pose sur le canevas
// montre (un portail : la scene de la Vue 3D, ou le plan), pour que la scene et le plan se cadrent dans ce qu'il laisse libre.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from 'zustand';
import { etatToit, sessionToit } from '../app/toits/modeToit.js';
import { insertionToit, type InsertionToit } from '../app/ecouteurs/toitCatalogue.js';
import { MOTS_INTENTION, type EtatEdition, type IntentionToit } from '../facade/modeToit/controleurToit.js';
import { FORMES_SIMPLES, OPTIONS_PIECE, PIECES_SIMPLES, piece, piecesDe, type FamillePiece, type PieceCatalogue } from '../facade/modeToit/pieces.js';
import { MOTS_SENS } from '../facade/modeToit/gestes.js';
import { libellesDesElements, memeCible, titreDuGroupe, type CibleElement } from '../facade/modeToit/elements.js';
import { vueDeSaillie, vueSurLeToit } from '../three/vueSaillie.js';
import { hotes3d } from '../three/etat3d.js';
import { VignetteToit, VignetteVue } from './EcranChaine.js';
import { Icone, type NomIcone } from './icones.js';
import { ImageChoix } from './vue3d/iconesToit.js';
import type { CorpsToit } from '../model/types.js';
import type { Magasin } from '../app/magasin.js';
import type { RegistreCommandes } from '../app/commandes.js';

interface Props { magasin: Magasin; commandes: RegistreCommandes }

// Ce qui s'AJOUTE, par famille. Les formes de toit n'y sont pas : changer la forme d'un toit ne cree rien (retour du 24 novembre 2026).
const ONGLETS: { id: FamillePiece; libelle: string }[] = [
  { id: 'sur', libelle: 'Sur le toit' }, { id: 'facade', libelle: 'Façade' }, { id: 'corps', libelle: 'Corps' }
];

const vuesFacade = new Map<string, ReturnType<typeof vueDeSaillie>>();
const vuesSurLeToit = new Map<string, ReturnType<typeof vueSurLeToit>>();
/** Les pieces qui ne se posent pas d'un coup ont leur propre commande : le decroche attend le point touche sur l'egout ou le mur. */
const COMMANDE_DE_PIECE: Record<string, string> = { 'facade:decroche': 'toit.decrocher' };
/** Les pieces que le parcours simple offre deja : le catalogue de « Plus de réglages » montre les autres (un geste, un endroit). */
const DANS_LE_SIMPLE = new Set([...FORMES_SIMPLES, ...PIECES_SIMPLES].map((x) => x.piece));

/** L'image d'une piece : la vignette du catalogue, celle de l'element de facade, ou l'element cadre de pres sur son toit, une fois. */
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

/** L'image d'un choix de l'inspecteur : le type d'une lucarne garde la vignette de la piece qui la pose ; les autres choix ont leur trace. */
function ImageDuChoix({ groupe, valeur }: { groupe: string; valeur: string }) {
  const p = groupe === 'lucarne' ? piece('sur:' + valeur) : undefined;
  return p ? <span className="glyphe"><ImagePiece p={p} /></span> : <ImageChoix groupe={groupe} valeur={valeur} />;
}

const refusDe = (x: ReturnType<RegistreCommandes['etat']>): string | null => (!x.utilisable && 'message' in x ? x.message : null);

/** Un bouton d'une commande, une icone, son etat (grise avec sa raison, ou enfonce). */
function BoutonToit({ commandes, id, icone, libelle, texte, presse, miroir, danger, donnees }: { commandes: RegistreCommandes; id: string; icone: NomIcone; libelle: string; texte?: string; presse?: boolean; miroir?: boolean; danger?: boolean; donnees?: Record<string, string> }) {
  const e = commandes.etat(id), refus = refusDe(e);
  const data = Object.fromEntries(Object.entries(donnees ?? {}).map(([k, v]) => ['data-' + k, v]));
  return (
    <button type="button" className={'boutonToit' + (miroir ? ' miroir' : '') + (danger ? ' danger' : '') + (insertionToit()?.commande === id ? ' arme' : '')} data-commande={id} {...data}
      aria-label={libelle} aria-pressed={presse} title={libelle + (refus ? ' — ' + refus : '')} disabled={!e.utilisable} onClick={(ev) => { commandes.executer(id, ev.currentTarget); }}>
      <Icone nom={icone} taille={20} />{texte && <span>{texte}</span>}
    </button>
  );
}

/** Les groupes de choix de la cible, chacun sous son titre : des boutons-images a choix exclusif (`toit.regler`), celui en place enfonce. */
function GroupesReglage({ e, commandes }: { e: EtatEdition; commandes: RegistreCommandes }) {
  const c = commandes.etat('toit.regler'), refus = refusDe(c);
  if (!e.groupes.length) return null;
  return (
    <div className="inspecteurToit" data-cible={e.batimentEntier ? 'batiment' : undefined} role="group" aria-label={'Réglages · ' + e.portee.mots}>
      {e.groupes.map((g) => (
        <div key={g.groupe} className="groupeReglage">
          <span className="titreGroupe" aria-hidden="true">{titreDuGroupe(g)}</span>
          <div className="groupeChoix" role="group" aria-label={titreDuGroupe(g)}>
            {g.valeurs.map((v) => (
              <button key={v.valeur} type="button" className="boutonToit" data-commande="toit.regler" data-groupe={g.groupe} data-valeur={v.valeur} title={v.libelle + (g.raison ? ' — ' + g.raison : refus ? ' — ' + refus : '')} aria-label={v.libelle}
                aria-pressed={g.enPlace === v.valeur} disabled={!!g.raison || !c.utilisable} onClick={(ev) => { commandes.executer('toit.regler', ev.currentTarget); }}><ImageDuChoix groupe={g.groupe} valeur={v.valeur} /></button>
            ))}
          </div>
          {g.aide && !g.raison && <p className="aideGroupe">{g.aide}</p>}
          {g.raison && <p className="raisonGroupe" role="note">{g.raison}</p>}
        </div>
      ))}
    </div>
  );
}

/** Ce sur quoi l'on travaille : le batiment entier (un choix explicite), un corps, un element. Une pastille chacun. */
function CibleToit({ corps, e, commandes }: { corps: readonly CorpsToit[]; e: EtatEdition; commandes: RegistreCommandes }) {
  const liste = libellesDesElements(corps);
  if (!liste.length) return null;
  return (
    <div className="elementsToit cibleToit">
      <span className="titreGroupe" id="titreCibleToit">Vous travaillez sur</span>
      <div className="puces" role="group" aria-labelledby="titreCibleToit">
        <button type="button" className="puceToit" data-commande="toit.selection" data-portee="batiment" aria-pressed={e.batimentEntier}
          title="Tout le toit : une forme le remplace en entier, le sens tourne tout le toit" onClick={(ev) => { commandes.executer('toit.selection', ev.currentTarget); }}>Bâtiment entier</button>
        {liste.map((x) => (
          <button key={x.cible.type + x.cible.rang + ':' + x.cible.i} type="button" className="puceToit" data-commande="toit.selection" data-type={x.cible.type} data-rang={x.cible.rang} data-i={x.cible.i}
            aria-pressed={memeCible(x.cible, e.selection)} onClick={(ev) => { commandes.executer('toit.selection', ev.currentTarget); }}>{x.libelle}</button>
        ))}
      </div>
    </div>
  );
}

/** Les gestes de la cible : sur un corps, le tourner, le couper, le reunir, le supprimer ; un element de facade change de mur (3D). */
function GestesModifier({ e, commandes, en3d }: { e: EtatEdition; commandes: RegistreCommandes; en3d: boolean }) {
  const t = e.selection;
  if (!t) return null;
  return (
    <div className="groupeReglage">
      <span className="titreGroupe" aria-hidden="true">Gestes</span>
      <div className="groupeChoix" role="group" aria-label="Gestes">
        {t.type === 'corps' ? (
          <>
            <BoutonToit commandes={commandes} id="toit.tourner" icone="tournerCorps" libelle="Tourner le corps à gauche (15°)" donnees={{ sens: '1' }} />
            <BoutonToit commandes={commandes} id="toit.tourner" icone="tournerCorps" libelle="Tourner le corps à droite (15°)" donnees={{ sens: '-1' }} miroir />
            <BoutonToit commandes={commandes} id="toit.scinder" icone="scinder" libelle="Couper le corps en deux" />
            <BoutonToit commandes={commandes} id="toit.fusionner" icone="fusionner" libelle="Réunir avec le corps voisin" />
            <BoutonToit commandes={commandes} id="toit.supprimer" icone="supprimer" libelle="Supprimer ce corps" danger />
          </>
        ) : t.type === 'saillie' && en3d ? <BoutonToit commandes={commandes} id="toit.murSur3d" icone="deplacer" libelle="Choisir le mur dans la 3D" presse={insertionToit()?.commande === 'toit.murSur3d'} /> : null}
      </div>
    </div>
  );
}

/** Ce qui s'ajoute a partir de la cible : la dupliquer (un element), lui faire retourner l'angle (un corps). Des ajouts : sous « Ajouter ». */
function AjoutsDeLaCible({ e, commandes }: { e: EtatEdition; commandes: RegistreCommandes }) {
  const t = e.selection;
  if (!t) return null;
  return (
    <div className="groupeReglage">
      <span className="titreGroupe" aria-hidden="true">À partir de l’élément choisi</span>
      <div className="groupeChoix" role="group" aria-label="À partir de l’élément choisi">
        {t.type === 'corps' ? (
          <>
            <BoutonToit commandes={commandes} id="toit.retour" icone="angle" libelle="Retour d’angle à gauche" donnees={{ cote: 'gauche' }} miroir />
            <BoutonToit commandes={commandes} id="toit.retour" icone="angle" libelle="Retour d’angle à droite" donnees={{ cote: 'droite' }} />
          </>
        ) : <BoutonToit commandes={commandes} id="toit.dupliquer" icone="dupliquer" libelle="Dupliquer" />}
      </div>
    </div>
  );
}

/**
 * Les vignettes d'une famille : les formes de toit (une modification : celle en place est enfoncee), ou les pieces a poser. Chaque
 * vignette est une commande ; grisee, elle dit pourquoi (la raison du controleur : infobulle, et au doigt une ligne sous le catalogue).
 */
function CatalogueToit({ famille, e, commandes, insertion, tactile }: { famille: FamillePiece; e: EtatEdition; commandes: RegistreCommandes; insertion: InsertionToit | null; tactile: boolean }) {
  const s = sessionToit();
  // Un geste n'existe qu'a un endroit : les pieces du parcours simple ne sont pas redites ici. Leurs variantes restent.
  const pieces = piecesDe(famille).filter((p) => !DANS_LE_SIMPLE.has(p.id) || !!OPTIONS_PIECE[p.id]);
  if (!s) return null;
  const pose = commandes.etat('toit.poser');
  const refusDePiece = (id: string) => s.ctl.raisonDePiece(id) ?? (COMMANDE_DE_PIECE[id] ? refusDe(commandes.etat(COMMANDE_DE_PIECE[id] as string)) : null);
  const raisons = [...pieces.reduce((m, p) => { const r = refusDePiece(p.id); if (r) m.set(r, [...(m.get(r) ?? []), p.libelle]); return m; }, new Map<string, string[]>())];
  const [seule] = raisons;
  const blocage = seule && raisons.length === 1 && seule[1].length === pieces.length ? seule[0] : null;
  return (
    <>
      {blocage && <Blocage raison={blocage} e={e} commandes={commandes} />}
      <div className="toitCatalogue" data-famille={famille}>
        {pieces.map((p) => {
          const refus = refusDePiece(p.id), options = OPTIONS_PIECE[p.id], idCommande = COMMANDE_DE_PIECE[p.id] ?? 'toit.poser';
          const permise = idCommande === 'toit.poser' ? pose.utilisable : commandes.etat(idCommande).utilisable;
          const armee = insertion?.commande === idCommande;
          const bouton = (
            <button key={p.id} type="button" className={'toitPiece' + (armee ? ' armee' : '')} data-commande={idCommande} data-piece={p.id}
              aria-pressed={p.famille === 'toit' ? p.id === e.forme.enPlace : armee ? true : idCommande !== 'toit.poser' ? false : undefined}
              disabled={!!refus || !permise} title={p.libelle + (refus ? ' — ' + refus : armee ? ' — touchez la scène pour poser ; appuyez de nouveau pour annuler' : '')} aria-label={p.libelle}
              onClick={(ev) => { commandes.executer(idCommande, ev.currentTarget); }}>
              <span className="glyphe"><ImagePiece p={p} /></span>
              <span className="libelle">{p.libelle}</span>
            </button>
          );
          if (!options) return bouton;
          return (
            <div key={p.id} className="toitPieceOptions" role="group" aria-label={p.libelle}>
              {!DANS_LE_SIMPLE.has(p.id) && bouton}
              {options.map((v) => {
                const r = refusDePiece(v.id);
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
      {/* Au doigt, l'infobulle n'existe pas : ce qui grise une vignette s'ecrit sous le catalogue, une ligne par raison. */}
      {tactile && !blocage && raisons.length > 0 && (
        <ul className="raisonsToit" aria-label="Pourquoi des vignettes sont grisées">
          {raisons.map(([raison, noms]) => <li key={raison}>{noms.join(', ') + ' : ' + raison}</li>)}
        </ul>
      )}
    </>
  );
}

/** Un blocage se dit, avec le geste qui le leve : un toit pas encore en corps se decoupe d'un bouton a verbe (audit UX du 28 novembre 2026). */
function Blocage({ raison, e, commandes }: { raison: string; e: EtatEdition; commandes: RegistreCommandes }) {
  return (
    <div className="blocageToit" role="note">
      <p>{raison}</p>
      {e.forme.decoupe && <BoutonToit commandes={commandes} id="toit.decouper" icone="toit" libelle={e.forme.decoupe.libelle} texte={e.forme.decoupe.libelle} />}
    </div>
  );
}

/** Amene un bloc en haut de ce qui defile dans l'atelier, et rien d'autre (`scrollIntoView` ferait aussi defiler la page). */
function monterDansLePanneau(bloc: HTMLElement): void {
  const zone = bloc.closest<HTMLElement>('.defilementToit');
  if (zone) zone.scrollTop += bloc.getBoundingClientRect().top - zone.getBoundingClientRect().top;
}

const enMetres = (v: number): string => v.toFixed(1).replace('.', ',') + ' m';

/** Un bouton − ou + d'un pas : une commande, son etat, et l'effet qu'il a encore (en butee, il se grise). */
function BoutonPas({ commandes, id, sens, libelle, effet }: { commandes: RegistreCommandes; id: string; sens: 1 | -1; libelle: string; effet: boolean }) {
  const e = commandes.etat(id), refus = refusDe(e);
  return (
    <button type="button" className="boutonPas" data-commande={id} data-sens={sens} aria-label={libelle} title={libelle + (refus ? ' — ' + refus : '')}
      disabled={!e.utilisable || !effet} onClick={(ev) => { commandes.executer(id, ev.currentTarget); }}><Icone nom={sens > 0 ? 'plus' : 'moins'} taille={20} /></button>
  );
}

/**
 * « Modifier le toit », le parcours simple : la forme (quatre vignettes, celle en place marquee ; une forme rare en place reste montree),
 * la hauteur du faitage par pas de dix centimetres, son sens — sur la portee que le controleur dit, ecrite au-dessus.
 */
function ModifierSimple({ e, commandes }: { e: EtatEdition; commandes: RegistreCommandes }) {
  const pose = commandes.etat('toit.poser'), enPlace = e.forme.enPlace;
  const rare = enPlace && !FORMES_SIMPLES.some((f) => f.piece === enPlace) ? piece(enPlace) : undefined;
  const formes = [...FORMES_SIMPLES, ...(rare ? [{ piece: rare.id, libelle: rare.libelle }] : [])];
  const f = e.faitage, sens = e.sens, tourner = commandes.etat('toit.sens');
  return (
    <>
      <p className="porteeToit" data-portee={e.portee.entier ? 'batiment' : e.portee.rang ?? 'toit'}>{'Sur : ' + e.portee.mots}</p>
      <div className="reglageSimple">
        <span className="titreReglage" id="titreFormeToit">Forme</span>
        <div className="formesSimples" role="group" aria-labelledby="titreFormeToit">
          {formes.map((x) => (
            <button key={x.piece} type="button" className="toitPiece" data-commande="toit.poser" data-piece={x.piece} aria-pressed={x.piece === enPlace}
              disabled={!pose.utilisable} title={x.libelle + (x.piece === enPlace ? (e.forme.decoupe ? ' — la forme en place : touchez-la pour découper le toit en corps' : ' — la forme en place') : '')}
              onClick={(ev) => { commandes.executer('toit.poser', ev.currentTarget); }}>
              <span className="glyphe"><VignetteToit forme={x.piece.replace(/^forme:/, '')} /></span>
              <span className="libelle">{x.libelle}</span>
              {/* La forme en place : une coche et son mot, la couleur ne la dit jamais seule. */}
              {x.piece === enPlace && <span className="marqueEnPlace"><Icone nom="coche" taille={14} /><span className="horsEcran"> (en place)</span></span>}
            </button>
          ))}
        </div>
        {/* Une forme qui remplace tout le toit dit d'avance ce qui disparait (revue du 28 novembre 2026, constat 2). */}
        {e.portee.entier && <p className="noteReglage avertissementToit" role="note">{'Une forme remplace tout le toit' + (e.forme.disparait.length ? ' : disparaîtront ' + e.forme.disparait.join(', ') + '.' : '.')}</p>}
        {/* Un toit d'un seul tenant : toucher une forme, celle en place comprise, le decoupe en corps (audit UX du 28 novembre 2026). */}
        {e.forme.decoupe && <p className="noteReglage" role="note">Ce toit est d’un seul tenant : touchez une forme, celle en place comprise, pour le découper en corps.</p>}
      </div>
      {f && (
        <div className="reglageSimple enLigne">
          <div className="texteReglage">
            <span className="titreReglage" id="titreFaitageToit">Hauteur du faîtage</span>
            {f.raison && <span className="noteReglage" role="note">{f.raison}</span>}
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

/** L'element choisi, dans le parcours simple : sa largeur par − et +, le retirer. */
function ElementSimple({ corps, selection, commandes }: { corps: readonly CorpsToit[]; selection: CibleElement; commandes: RegistreCommandes }) {
  const nom = libellesDesElements(corps).find((x) => memeCible(x.cible, selection))?.libelle ?? 'Élément', mot = MOT_TAILLE[selection.type];
  const retirer = commandes.etat('toit.supprimer');
  return (
    <>
      {mot && (
        <div className="reglageSimple enLigne">
          <div className="texteReglage">
            <span className="titreReglage" id="titreTailleToit">{mot}</span>
            <span className="noteReglage">Ses poignées, sur la maison en 3D, la déplacent.</span>
          </div>
          <div className="pasAPas" role="group" aria-labelledby="titreTailleToit">
            <BoutonPas commandes={commandes} id="toit.moins" sens={-1} libelle="Réduire" effet />
            <span className="valeurPas nomPas">{nom}</span>
            <BoutonPas commandes={commandes} id="toit.plus" sens={1} libelle="Agrandir" effet />
          </div>
        </div>
      )}
      <button type="button" className="boutonToit danger retirerSimple" data-commande="toit.supprimer" disabled={!retirer.utilisable}
        title={'Retirer ' + nom + ' (Défaire le rend)'} onClick={(ev) => { commandes.executer('toit.supprimer', ev.currentTarget); }}>
        <Icone nom="supprimer" taille={20} /><span>{'Retirer ' + nom.charAt(0).toLowerCase() + nom.slice(1)}</span>
      </button>
    </>
  );
}

/**
 * « Ajouter au toit », le parcours simple : six pieces, chacune grisee avec la raison du controleur tant qu'elle ne se pose pas ; le
 * bouton du pied pose la piece choisie. La consigne dit ou elle ira.
 */
function AjouterSimple({ choisie, choisir, facade, e, commandes }: { choisie: string; choisir: (id: string) => void; facade: string | null; e: EtatEdition; commandes: RegistreCommandes }) {
  const s = sessionToit(), surFacade = choisie.startsWith('facade:');
  const refusDe = (id: string) => s?.ctl.raisonDePiece(id) ?? null, refus = refusDe(choisie);
  const tous = PIECES_SIMPLES.map((x) => refusDe(x.piece)), memeRaison = tous[0] && tous.every((r) => r === tous[0]) ? tous[0] : null;
  return (
    <>
      {memeRaison && <Blocage raison={memeRaison} e={e} commandes={commandes} />}
      <div className="piecesSimples" role="group" aria-label="La pièce à poser">
        {PIECES_SIMPLES.map((x, k) => {
          const p = piece(x.piece), r = tous[k];
          return (
            <button key={x.piece} type="button" className="toitPiece" data-choix-piece={x.piece} aria-pressed={x.piece === choisie} disabled={!!r}
              title={x.libelle + (r ? ' — ' + r : '')} onClick={() => { choisir(x.piece); }}>
              <span className="glyphe">{p && <ImagePiece p={p} />}</span>
              <span className="libelle">{x.libelle}</span>
            </button>
          );
        })}
      </div>
      {!memeRaison && (
        <p className={'noteReglage consignePose' + (refus ? ' refus' : '')} role="note">
          {refus ?? (surFacade ? (facade ? 'Elle ira sur la ' + facade.charAt(0).toLowerCase() + facade.slice(1).replace(/ · vue sur la photo.*$/, '') + '. Touchez un autre mur pour changer.' : 'Elle ira sur un mur libre de ' + e.portee.mots.toLowerCase() + (etatToit().en3d ? ' ; touchez un mur de la maison pour choisir la façade.' : '.'))
            : 'Elle se pose au milieu du toit de ' + e.portee.mots.toLowerCase() + '. Vous réglerez sa largeur juste après.')}
        </p>
      )}
    </>
  );
}

/** La barre de la session, rangee sous « Plus de réglages » : refaire, revenir au depart, voir le toit du projet ; en 3D, isoler et les vues. */
function BarreSession({ commandes, en3d }: { commandes: RegistreCommandes; en3d: boolean }) {
  const e = etatToit();
  return (
    <div className="barreToit" role="toolbar" aria-label="Session du toit">
      <BoutonToit commandes={commandes} id="toit.retablir" icone="annuler" libelle="Refaire (Ctrl+Maj+Z)" miroir />
      <BoutonToit commandes={commandes} id="toit.depart" icone="positionInitiale" libelle="Revenir au départ (annulable)" />
      <BoutonToit commandes={commandes} id="toit.voirValide" icone="toitAvant" libelle="Voir le toit du projet (avant vos changements)" presse={e.validee} />
      {en3d && (
        <>
          <span className="separateurToit" aria-hidden="true" />
          <BoutonToit commandes={commandes} id="toit.isoler" icone={e.isole ? 'oeilBarre' : 'oeil'} libelle="Isoler ce bâtiment" presse={e.isole} />
          <BoutonToit commandes={commandes} id="toit.vueLibre" icone="cube" libelle="Vue 3D" presse={e.vue === 'libre'} />
          <BoutonToit commandes={commandes} id="toit.vueFacade" icone="rectangle" libelle="Vue de la façade" presse={e.vue === 'facade'} />
          <BoutonToit commandes={commandes} id="toit.vueDessus" icone="vueDessus" libelle="Vue de dessus" presse={e.vue === 'dessus'} />
          <BoutonToit commandes={commandes} id="toit.recadrer" icone="recadrer" libelle="Recadrer le bâtiment" />
          <BoutonToit commandes={commandes} id="toit.isolerCorps" icone="isoler" libelle="Isoler ce corps" presse={e.corpsIsole} />
        </>
      )}
    </div>
  );
}

/** Le canevas montre, sur lequel l'atelier se pose : la scene de la Vue 3D, ou le plan. */
function hoteDeLAtelier(vue: string): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return vue === 'vue3d' ? hotes3d.vue3d ?? null : document.getElementById('stage');
}

export function AtelierToit({ magasin, commandes }: Props) {
  const [onglet, setOnglet] = useState<FamillePiece>('sur');
  // Au telephone l'atelier est une feuille : repliee, elle ne laisse que sa barre et la scene respire.
  const [replie, setReplie] = useState(false);
  // « Plus de réglages » : tout ce que l'atelier sait faire au-dela du parcours simple, replie a chaque session qui s'ouvre.
  const [plus, setPlus] = useState(false);
  const [pieceChoisie, setPieceChoisie] = useState<string>(PIECES_SIMPLES[0]?.piece ?? '');
  const tactile = useStore(magasin.store, (x) => x.classe) !== 'large';
  const vue = useStore(magasin.store, (x) => x.vue);
  const s = sessionToit(), cle = s?.cle ?? null;
  useEffect(() => { setPlus(false); setReplie(false); }, [cle]);
  useEffect(() => {
    document.documentElement.toggleAttribute('data-mode-toit', !!cle);
    return () => { document.documentElement.removeAttribute('data-mode-toit'); };
  }, [cle]);
  const insertion = s ? insertionToit() : null, enInsertion = !!insertion;
  useEffect(() => {
    document.documentElement.toggleAttribute('data-insertion-toit', enInsertion);
    return () => { document.documentElement.removeAttribute('data-insertion-toit'); };
  }, [enInsertion]);
  // La hauteur de l'atelier, sur le canevas : l'indicateur d'etat de la 3D se pose juste au-dessus de lui au telephone et a la tablette.
  const panneau = useRef<HTMLDivElement | null>(null);
  const hote = hoteDeLAtelier(vue);
  useEffect(() => {
    const p = panneau.current;
    if (!p || !hote || typeof ResizeObserver === 'undefined') return;
    const poser = () => { hote.style.setProperty('--hauteur-panneau-toit', p.getBoundingClientRect().height + 'px'); };
    poser();
    const r = new ResizeObserver(poser);
    r.observe(p);
    return () => { r.disconnect(); hote.style.removeProperty('--hauteur-panneau-toit'); };
  }, [hote, cle]);
  if (!s || !hote) return null;
  const e = s.ctl.etat(), a = etatToit(), en3d = a.en3d;
  const o = magasin.store.getState().etat.objects.find((x) => x.key === s.cle);
  const corps = o?.batiment?.corpsToit ?? [];
  const intention = e.intention;
  const surLeToit = !e.selection || e.selection.type === 'corps';
  const aChoisir = libellesDesElements(corps).length > 1;
  const aPoser = PIECES_SIMPLES.find((x) => x.piece === pieceChoisie) ?? (PIECES_SIMPLES[0] as typeof PIECES_SIMPLES[number]);
  const refusDePoser = s.ctl.raisonDePiece(aPoser.piece);
  const quitter = commandes.etat('toit.abandonner'), valider = commandes.etat('toit.valider'), poser = commandes.etat('toit.poser');
  const suffixe = (x: ReturnType<RegistreCommandes['etat']>) => { const r = refusDe(x); return r ? ' — ' + r : ''; };
  const boutonIntention = (i: IntentionToit, icone: NomIcone, quoi: string) => (
    <button type="button" className="boutonIntention" data-commande="toit.intention" data-intention={i} aria-pressed={intention === i}
      title={MOTS_INTENTION[i].verbe + ' ' + quoi + ' : ' + MOTS_INTENTION[i].promesse}
      onClick={(ev) => { commandes.executer('toit.intention', ev.currentTarget); }}>
      <Icone nom={icone} taille={20} /><span className="verbeIntention">{MOTS_INTENTION[i].verbe}</span><span className="quoiIntention">{quoi}</span>
    </button>
  );
  return createPortal(
    <div ref={panneau} className={'panneauToit' + (replie ? ' replie' : '')} data-zone="Z10" data-intention={intention} data-vue={en3d ? 'vue3d' : 'plan'} role="region" aria-label="Atelier du toit">
      <button type="button" className="languetteToit" aria-expanded={!replie} aria-label={replie ? 'Déployer l’atelier' : 'Replier l’atelier'}
        title={replie ? 'Déployer l’atelier' : 'Replier l’atelier'} onClick={() => { setReplie(!replie); }}><Icone nom={replie ? 'chevronHaut' : 'chevronBas'} taille={20} /></button>
      {/* Ce qui defile, transparent, dans le panneau opaque qui ne defile pas (app.css, `.defilementToit`). */}
      <div className="defilementToit">
        <div className="intentionToit" role="group" aria-label="Que voulez-vous faire ?">
          {boutonIntention('modifier', 'crayon', 'le toit')}
          {boutonIntention('ajouter', 'plus', 'au toit')}
        </div>
        <p className="promesseToit">{intention === 'modifier' ? 'Vous changez ce qui existe. Rien n’est créé.' : 'Vous posez une pièce. Rien d’existant n’est touché.'}</p>
        {aChoisir && <CibleToit corps={corps} e={e} commandes={commandes} />}
        <div className="voletToit" data-volet={intention} role="group" aria-label={intention === 'modifier' ? 'Modifier le toit' : 'Ajouter au toit'}>
          {intention === 'ajouter' ? <AjouterSimple choisie={aPoser.piece} choisir={setPieceChoisie} facade={a.facade} e={e} commandes={commandes} />
            : surLeToit ? <ModifierSimple e={e} commandes={commandes} />
              : e.selection && <ElementSimple corps={corps} selection={e.selection} commandes={commandes} />}
          {/* Defaire, sous les yeux des le premier geste (revue du 28 novembre 2026, constat 10) : le pied, lui, quitte sans rien garder. */}
          {e.peutDefaire && (
            <button type="button" className="boutonToit defaireToit" data-commande="toit.annuler" disabled={!commandes.etat('toit.annuler').utilisable}
              title="Défaire le dernier geste (Ctrl+Z)" onClick={(ev) => { commandes.executer('toit.annuler', ev.currentTarget); }}>
              <Icone nom="annuler" taille={20} /><span>Défaire</span>
            </button>
          )}
          <details className="plusToit" open={plus} onToggle={(ev) => { setPlus(ev.currentTarget.open); if (ev.currentTarget.open) monterDansLePanneau(ev.currentTarget); }}>
            <summary>Plus de réglages</summary>
            <div className="contenuPlusToit">
              <BarreSession commandes={commandes} en3d={en3d} />
              {!aChoisir && <CibleToit corps={corps} e={e} commandes={commandes} />}
              {en3d && <p className="indiceToit designationToit" role="status">{a.designation}</p>}
              {intention === 'modifier' ? (
                <>
                  {surLeToit && (
                    <div className="groupeReglage groupeForme">
                      <span className="titreGroupe" aria-hidden="true">Autres formes de toit</span>
                      <CatalogueToit famille="toit" e={e} commandes={commandes} insertion={insertion} tactile={tactile} />
                    </div>
                  )}
                  <GroupesReglage e={e} commandes={commandes} />
                  <GestesModifier e={e} commandes={commandes} en3d={en3d} />
                  <button type="button" className="toitRegles" data-commande="toit.regles" aria-pressed={e.regles} disabled={!commandes.etat('toit.regles').utilisable}
                    title={e.regles ? 'Règles allumées : le toit se lit tout seul. Cliquez pour le régler vous-même.' : 'Règles coupées : le toit reste comme vous le réglez. Cliquez pour reprendre la lecture automatique.'}
                    onClick={(ev) => { commandes.executer('toit.regles', ev.currentTarget); }}>
                    {'Règles ' + (e.regles ? 'allumées' : 'coupées')}
                  </button>
                </>
              ) : (
                <>
                  <AjoutsDeLaCible e={e} commandes={commandes} />
                  <h3 className="titrePlateau" id="titrePlateauToit">{'Autres pièces, sur ' + e.portee.mots.toLowerCase() + ' : un toucher les pose'}</h3>
                  <div className="toitOnglets" role="tablist" aria-labelledby="titrePlateauToit">
                    {ONGLETS.map((t) => (
                      <button key={t.id} type="button" role="tab" aria-selected={onglet === t.id} className="toitOnglet" onClick={() => setOnglet(t.id)}>{t.libelle}</button>
                    ))}
                  </div>
                  <CatalogueToit famille={onglet} e={e} commandes={commandes} insertion={insertion} tactile={tactile} />
                </>
              )}
            </div>
          </details>
        </div>
      </div>
      {/* Le pied, hors du defilement : quitter sans rien garder, ou garder. Quand on ajoute, le bouton principal pose la piece choisie. */}
      <div className="piedToit">
        <button type="button" className="boutonPied" data-commande="toit.abandonner" disabled={!quitter.utilisable}
          title={'Quitter sans garder les changements' + suffixe(quitter)} onClick={(ev) => { commandes.executer('toit.abandonner', ev.currentTarget); }}>Quitter sans garder</button>
        {intention === 'ajouter' && (
          <button type="button" className="boutonPied principal poser" data-commande="toit.poser" data-piece={aPoser.piece} disabled={!poser.utilisable || !!refusDePoser}
            title={aPoser.poser + (refusDePoser ? ' — ' + refusDePoser : suffixe(poser))} onClick={(ev) => { commandes.executer('toit.poser', ev.currentTarget); }}>
            <Icone nom="plus" taille={20} /><span>{aPoser.poser}</span>
          </button>
        )}
        {(intention === 'modifier' || e.change) && (
          <button type="button" className={'boutonPied valider' + (intention === 'modifier' ? ' principal' : '')} data-commande="toit.valider" disabled={!valider.utilisable}
            title={'Valider : garder les changements dans le projet' + suffixe(valider)} onClick={(ev) => { commandes.executer('toit.valider', ev.currentTarget); }}>
            <Icone nom="coche" taille={20} /><span>Valider</span>
          </button>
        )}
      </div>
    </div>,
    hote
  );
}
