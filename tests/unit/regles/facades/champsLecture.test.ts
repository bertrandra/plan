// ====================================================================================================================================
// INVENTAIRE DES CHAMPS DE LA LECTURE DES FACADES, FIGE EN 5.1.0 (garde-fou, MD/RELEASE.md §8.2 bis, skill facades §5 quater).
//
// Ce test fige ce que la lecture d'une facade par Claude savait porter en 5.1.0 (commit 1ea13701) :
// - les champs du schema de sortie du run d'une facade (deploy/schema-facade.json, genere par `npm run regles:generer` depuis
//   src/regles/sujets/descriptions/facadesRun.ts) ; l'escalade lit le meme schema (usage `escalade`, meme prompt, modele plus fin) ;
// - ce que Plan en lit (`ObservationsFacade`) et ce qu'il garde d'un appel (`RunEnregistre`, escalade comprise) ;
// - la Facade du fichier et la facade validee (`ReleveFacade` et tout ce qu'elle porte : ouvertures, details, carreaux, dimensions,
//   forme, parement, pose de la texture, calage, grille, corrections).
//
// Il echoue si un champ disparait ou change de sens : un mot retire d'un vocabulaire, un nombre devenu texte, un `indetermine`
// remplace par une valeur sentinelle, un champ facultatif devenu obligatoire. Un champ ou un mot NOUVEAUX ne le font pas echouer.
//
// UN CHAMP NE SE RETIRE (ou ne change de sens) QU'EN MODIFIANT LES LISTES CI-DESSOUS, DANS LA MEME PR, AVEC SA RAISON : la
// modification de ce fichier doit se voir dans la revue. Ne pas regenerer ces listes depuis le code du jour.
// ====================================================================================================================================

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { genererRunFacade } from '../../../../src/regles/sujets/generation.js';
import { inventaireSchema, inventaireType, pertes, programme, type Inventaire } from '../../../fixtures/inventaireChamps.js';

/** Une liste figee : une ligne par champ, « chemin : jeton | jeton ». */
function lire(texte: string): Inventaire {
  return Object.fromEntries(texte.trim().split('\n').map((l) => { const [chemin, jetons] = l.split(' : ') as [string, string]; return [chemin.trim(), jetons.split(' | ').map((j) => j.trim())]; }));
}

const SCHEMA_RUN: Inventaire = lire(`
calage : objet
calage.angles : objet
calage.angles.droite : 'indetermine' | objet
calage.angles.droite.confiance : 'faible' | 'forte' | 'indetermine' | 'moyenne'
calage.angles.droite.egout : number
calage.angles.droite.sol : number
calage.angles.droite.x : number
calage.angles.gauche : 'indetermine' | objet
calage.angles.gauche.confiance : 'faible' | 'forte' | 'indetermine' | 'moyenne'
calage.angles.gauche.egout : number
calage.angles.gauche.sol : number
calage.angles.gauche.x : number
calage.appentis : liste
calage.appentis[] : objet
calage.appentis[].debut : number
calage.appentis[].fin : number
calage.cache : liste
calage.cache[] : objet
calage.cache[].debut : number
calage.cache[].fin : number
calage.cache[].quoi : 'arbre' | 'autre' | 'haie' | 'voiture'
calage.corps : liste
calage.corps[] : objet
calage.corps[].debut : number
calage.corps[].fin : number
calage.pointes : liste
calage.pointes[] : objet
calage.pointes[].confiance : 'faible' | 'forte' | 'indetermine' | 'moyenne'
calage.pointes[].u : number
calage.pointes[].v : number
confiance : 'faible' | 'forte' | 'moyenne'
elements : liste
elements[] : objet
elements[].confiance : 'faible' | 'forte' | 'indetermine' | 'moyenne'
elements[].element : 'cheminee' | 'lucarne'
elements[].u : number
forme : objet
forme.bout : 'brisis' | 'croupe' | 'demi-croupe' | 'indetermine' | 'pignon' | 'sans-objet'
forme.silhouette : 'indetermine' | 'ligne-droite' | 'marches' | 'plusieurs-sommets' | 'rampe' | 'trapeze' | 'triangle'
ouvertures : liste
ouvertures[] : objet
ouvertures[].carreaux : objet
ouvertures[].carreaux.colonnes : 'indetermine' | integer
ouvertures[].carreaux.imposte : 'aucune' | 'indetermine' | objet
ouvertures[].carreaux.imposte.colonnes : 'indetermine' | integer
ouvertures[].carreaux.imposte.hauteur : number
ouvertures[].carreaux.imposte.rangees : 'indetermine' | integer
ouvertures[].carreaux.petitsBois : 'aucun' | 'epais' | 'fins' | 'indetermine'
ouvertures[].carreaux.rangees : 'indetermine' | integer
ouvertures[].carreaux.vantaux : 'indetermine' | integer
ouvertures[].carreaux.vitrage : 'clair' | 'depoli' | 'indetermine' | 'teinte' | 'vitrail'
ouvertures[].confiance : 'faible' | 'forte' | 'indetermine' | 'moyenne'
ouvertures[].details : objet
ouvertures[].details.allege : 'balcon' | 'garde-corps' | 'indetermine' | 'pleine'
ouvertures[].details.forme : 'cintre' | 'indetermine' | 'rect' | 'rond'
ouvertures[].details.volets : 'aucun' | 'battants' | 'indetermine' | 'persiennes' | 'roulant'
ouvertures[].niveau : 'indetermine' | integer
ouvertures[].travee : 'indetermine' | integer
ouvertures[].type : 'fenetre' | 'garage' | 'porte' | 'porte-fenetre'
ouvertures[].u0 : number
ouvertures[].u1 : number
ouvertures[].v0 : number
ouvertures[].v1 : number
surface : objet
surface.confiance : 'faible' | 'forte' | 'indetermine' | 'moyenne'
surface.principale : 'bardage-bois' | 'bardage-metal' | 'beton' | 'brique' | 'colombage' | 'enduit' | 'indetermine' | 'mixte' | 'pierre'
surface.zones : liste
surface.zones[] : objet
surface.zones[].confiance : 'faible' | 'forte' | 'indetermine' | 'moyenne'
surface.zones[].type : 'bardage-bois' | 'bardage-metal' | 'beton' | 'brique' | 'colombage' | 'enduit' | 'pierre'
surface.zones[].u0 : number
surface.zones[].u1 : number
surface.zones[].v0 : number
surface.zones[].v1 : number
`);

const FACADE: Inventaire = lire(`
calage : absent | objet
calage.azimutCorrigeDeg : absent | number
calage.confiance : absent | number
calage.photos : liste
calage.photos[] : objet
calage.photos[].coins : liste
calage.photos[].coins[] : objet
calage.photos[].coins[].x : number
calage.photos[].coins[].y : number
calage.photos[].pxParMSource : null | number
calage.photos[].sourceCoins : absent | liste
calage.photos[].sourceCoins[] : 'claude' | 'doigt' | 'predit' | 'trouve'
calibration : absent | dictionnaire | objet
corrections : absent | liste
corrections[] : objet
corrections[].avant : 'fenetre' | 'garage' | 'porte' | 'porte-fenetre' | absent
corrections[].ecart : absent | objet
corrections[].ecart.h : number
corrections[].ecart.l : number
corrections[].ecart.x : number
corrections[].ecart.y : number
corrections[].geste : 'ajout' | 'deplacement' | 'retrait' | 'type'
corrections[].h : number
corrections[].l : number
corrections[].source : 'ajoutee' | 'claude' | 'corrigee' | 'detectee' | 'devinee' | absent
corrections[].type : 'fenetre' | 'garage' | 'porte' | 'porte-fenetre'
corrections[].x : number
corrections[].y : number
cote : number
depuisAudit : absent | boolean
dimensions : absent | objet
dimensions.ecartPhoto : absent | objet
dimensions.ecartPhoto.egout : absent | number
dimensions.ecartPhoto.largeur : absent | number
dimensions.egoutM : number
dimensions.faitageM : absent | number
dimensions.largeurM : number
dimensions.source : 'cadastre' | 'ign' | 'lidar' | 'saisie'
distance : null | number
forme : absent | objet
forme.bout : 'brisis' | 'croupe' | 'demi-croupe' | 'indetermine' | 'pignon' | 'sans-objet' | absent
forme.corps : absent | liste
forme.corps[] : objet
forme.corps[].mur : objet
forme.corps[].mur.droite : objet
forme.corps[].mur.droite.x : number
forme.corps[].mur.droite.y : number
forme.corps[].mur.gauche : objet
forme.corps[].mur.gauche.x : number
forme.corps[].mur.gauche.y : number
forme.corps[].u0 : number
forme.corps[].u1 : number
forme.gabarit : liste
forme.gabarit[] : objet
forme.gabarit[].u : number
forme.gabarit[].v : number
forme.pointes : absent | liste
forme.pointes[] : objet
forme.pointes[].source : 'deterministe' | 'doigt' | 'ia'
forme.pointes[].u : number
forme.pointes[].v : number
forme.silhouetteLue : 'indetermine' | 'ligne-droite' | 'marches' | 'plusieurs-sommets' | 'rampe' | 'trapeze' | 'triangle' | absent
forme.source : 'doigt' | 'ia' | 'photo' | 'plan'
grille : absent | objet
grille.niveaux : liste
grille.niveaux[] : objet
grille.niveaux[].appuiM : number
grille.niveaux[].linteauM : number
grille.travees : liste
grille.travees[] : objet
grille.travees[].largeurM : number
grille.travees[].xM : number
hauteur : number
hauteurTexture : absent | number
largeur : number
ouvertures : liste
ouvertures[] : objet
ouvertures[].confiance : absent | number
ouvertures[].details : absent | objet
ouvertures[].details.allege : 'balcon' | 'garde-corps' | 'pleine' | absent
ouvertures[].details.carreaux : absent | objet
ouvertures[].details.carreaux.grille : absent | objet
ouvertures[].details.carreaux.grille.colonnes : number
ouvertures[].details.carreaux.grille.rangees : number
ouvertures[].details.carreaux.imposte : absent | objet
ouvertures[].details.carreaux.imposte.grille : absent | objet
ouvertures[].details.carreaux.imposte.grille.colonnes : number
ouvertures[].details.carreaux.imposte.grille.rangees : number
ouvertures[].details.carreaux.imposte.hauteurM : number
ouvertures[].details.carreaux.petitsBois : 'aucun' | 'epais' | 'fins' | absent
ouvertures[].details.carreaux.source : 'doigt' | 'ia'
ouvertures[].details.carreaux.vantaux : 1 | 2 | 3 | absent
ouvertures[].details.carreaux.vitrage : 'clair' | 'depoli' | 'teinte' | 'vitrail' | absent
ouvertures[].details.couleurVolets : absent | string
ouvertures[].details.ferme : absent | boolean
ouvertures[].details.forme : 'cintre' | 'rect' | 'rond' | absent
ouvertures[].details.garage : 'basculante' | 'battants' | 'enroulable' | 'sectionnelle' | absent
ouvertures[].details.ouvrant : 'battants' | 'coulissant' | 'fixe' | 'guillotine' | 'soufflet' | absent
ouvertures[].details.remplissage : 'pleine' | 'semi-vitree' | 'vitree' | absent
ouvertures[].details.vitrage : 'imposte-petits-bois' | 'petits-bois' | 'plein' | absent
ouvertures[].details.volets : 'aucun' | 'battants' | 'persiennes' | 'roulant' | absent
ouvertures[].h : number
ouvertures[].id : absent | string
ouvertures[].l : number
ouvertures[].niveau : absent | number
ouvertures[].source : 'ajoutee' | 'claude' | 'corrigee' | 'detectee' | 'devinee' | absent
ouvertures[].travee : absent | number
ouvertures[].type : 'fenetre' | 'garage' | 'porte' | 'porte-fenetre'
ouvertures[].verifieeLe : absent | string
ouvertures[].x : number
ouvertures[].y : number
partieBasse : absent | null | objet
partieBasse.debut : number
partieBasse.fin : number
partieBasse.hauteur : number
photoLocale : absent | string
releveLe : string
sourceDistance : 'cadrage' | 'gps' | 'lidar' | 'rue' | 'webxr' | null
surface : absent | objet
surface.principale : 'bardage-bois' | 'bardage-metal' | 'beton' | 'brique' | 'colombage' | 'enduit' | 'mixte' | 'pierre'
surface.source : 'audit' | 'doigt' | 'ia'
surface.zones : absent | liste
surface.zones[] : objet
surface.zones[].confiance : number
surface.zones[].type : 'bardage-bois' | 'bardage-metal' | 'beton' | 'brique' | 'colombage' | 'enduit' | 'pierre'
surface.zones[].u0 : number
surface.zones[].u1 : number
surface.zones[].v0 : number
surface.zones[].v1 : number
texture : null | string
textureCalee : absent | objet
textureCalee.cadre : objet
textureCalee.cadre.x0 : number
textureCalee.cadre.x1 : number
textureCalee.cadre.y0 : number
textureCalee.cadre.y1 : number
textureCalee.pxParM : number
textureCalee.sansOmbres : absent | boolean
`);

const RUN_ENREGISTRE: Inventaire = lire(`
chaine : number
cout : null | number
escalade : absent | objet
escalade.cout : null | number
escalade.le : string
escalade.modele : string
escalade.prompt : number
escalade.schema : number
escalade.sha256 : absent | string
escalade.sortie : inconnu
escalade.tokens : objet
escalade.tokens.entree : number
escalade.tokens.sortie : number
image : objet
image.hauteur : number
image.largeur : number
image.octets : absent | number
image.sha256 : absent | string
le : string
modele : string
passes : 1 | 2 | 3
prompt : number
schema : number
sorties : liste
sorties[] : inconnu
synthetique : absent | boolean
tokens : objet
tokens.entree : number
tokens.sortie : number
`);

const OBSERVATIONS: Inventaire = lire(`
calage : objet
calage.angles : objet
calage.angles.droite : null | objet
calage.angles.droite.confiance : 'faible' | 'forte' | 'indetermine' | 'moyenne'
calage.angles.droite.egout : number
calage.angles.droite.sol : number
calage.angles.droite.x : number
calage.angles.gauche : null | objet
calage.angles.gauche.confiance : 'faible' | 'forte' | 'indetermine' | 'moyenne'
calage.angles.gauche.egout : number
calage.angles.gauche.sol : number
calage.angles.gauche.x : number
calage.appentis : liste
calage.appentis[] : objet
calage.appentis[].debut : number
calage.appentis[].fin : number
calage.cache : liste
calage.cache[] : objet
calage.cache[].debut : number
calage.cache[].fin : number
calage.cache[].quoi : 'arbre' | 'autre' | 'haie' | 'voiture'
calage.corps : liste
calage.corps[] : objet
calage.corps[].debut : number
calage.corps[].fin : number
calage.pointes : liste
calage.pointes[] : objet
calage.pointes[].confiance : 'faible' | 'forte' | 'indetermine' | 'moyenne'
calage.pointes[].u : number
calage.pointes[].v : number
confiance : 'faible' | 'forte' | 'moyenne'
elements : liste
elements[] : objet
elements[].confiance : 'faible' | 'forte' | 'indetermine' | 'moyenne'
elements[].element : 'cheminee' | 'lucarne'
elements[].u : number
escalade : absent | objet
escalade.modele : string
escalade.tranche : liste
escalade.tranche[] : string
forme : objet
forme.bout : 'brisis' | 'croupe' | 'demi-croupe' | 'indetermine' | 'pignon' | 'sans-objet'
forme.silhouette : 'indetermine' | 'ligne-droite' | 'marches' | 'plusieurs-sommets' | 'rampe' | 'trapeze' | 'triangle'
ouvertures : liste
ouvertures[] : objet
ouvertures[].carreaux : null | objet
ouvertures[].carreaux.colonnes : null | number
ouvertures[].carreaux.imposte : 'aucune' | null | objet
ouvertures[].carreaux.imposte.colonnes : null | number
ouvertures[].carreaux.imposte.hauteur : number
ouvertures[].carreaux.imposte.rangees : null | number
ouvertures[].carreaux.petitsBois : 'aucun' | 'epais' | 'fins' | null
ouvertures[].carreaux.rangees : null | number
ouvertures[].carreaux.vantaux : null | number
ouvertures[].carreaux.vitrage : 'clair' | 'depoli' | 'teinte' | 'vitrail' | null
ouvertures[].confiance : 'faible' | 'forte' | 'indetermine' | 'moyenne'
ouvertures[].details : objet
ouvertures[].details.allege : 'balcon' | 'garde-corps' | 'pleine' | absent
ouvertures[].details.forme : 'cintre' | 'rect' | 'rond' | absent
ouvertures[].details.volets : 'aucun' | 'battants' | 'persiennes' | 'roulant' | absent
ouvertures[].niveau : null | number
ouvertures[].source : 'escalade' | absent
ouvertures[].travee : null | number
ouvertures[].type : 'fenetre' | 'garage' | 'porte' | 'porte-fenetre'
ouvertures[].u0 : number
ouvertures[].u1 : number
ouvertures[].v0 : number
ouvertures[].v1 : number
surface : objet
surface.confiance : 'faible' | 'forte' | 'indetermine' | 'moyenne'
surface.principale : 'bardage-bois' | 'bardage-metal' | 'beton' | 'brique' | 'colombage' | 'enduit' | 'indetermine' | 'mixte' | 'pierre'
surface.zones : liste
surface.zones[] : objet
surface.zones[].confiance : 'faible' | 'forte' | 'indetermine' | 'moyenne'
surface.zones[].type : 'bardage-bois' | 'bardage-metal' | 'beton' | 'brique' | 'colombage' | 'enduit' | 'pierre'
surface.zones[].u0 : number
surface.zones[].u1 : number
surface.zones[].v0 : number
surface.zones[].v1 : number
`);

const fichier = (chemin: string) => fileURLToPath(new URL('../../../../src/' + chemin, import.meta.url));

describe('les champs de la lecture des facades ne se perdent pas (5.1.0)', () => {
  it('le schema de sortie du run d une facade (et de l escalade) garde chaque champ et chaque mot', () => {
    const schema = (JSON.parse(genererRunFacade().schema) as { schema: Parameters<typeof inventaireSchema>[0] }).schema;
    expect(pertes(SCHEMA_RUN, inventaireSchema(schema))).toEqual([]);
  });

  it('ce que Plan lit d une reponse, ce qu il garde d un appel, et la Facade du fichier gardent chaque champ', () => {
    const releve = fichier('model/typesReleve.ts'), observations = fichier('regles/facades/observations.ts');
    const p = programme([releve, observations]);
    expect(pertes(FACADE, inventaireType(p, releve, 'ReleveFacade'))).toEqual([]);
    expect(pertes(RUN_ENREGISTRE, inventaireType(p, observations, 'RunEnregistre'))).toEqual([]);
    expect(pertes(OBSERVATIONS, inventaireType(p, observations, 'ObservationsFacade'))).toEqual([]);
  });

  it('la comparaison voit un champ retire, un mot retire et un champ devenu obligatoire', () => {
    const hier: Inventaire = { a: ['number'], 'b.c': ["'x'", "'y'"], d: ['absent', 'string'] };
    expect(pertes(hier, { a: ['number'], 'b.c': ["'x'", "'y'", "'z'"], d: ['absent', 'string'], e: ['number'] })).toEqual([]);
    expect(pertes(hier, { 'b.c': ["'x'"], d: ['string'] })).toEqual(['a : disparu', "b.c : ne peut plus valoir 'y' (vaut 'x')", 'd : ne peut plus valoir absent (vaut string)']);
  });
});
