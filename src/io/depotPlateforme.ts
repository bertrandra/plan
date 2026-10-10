// Les projets vivent chez la plateforme (spec-connexion-plateforme §6, §16 etape 4).
//
// `api.php` est retire. Ce module met les quatre memes gestes — lister, ouvrir, enregistrer,
// supprimer — sur la ressource `projects` de backprod, qui stocke exactement ce que Plan a a
// stocker : un document JSONB opaque, l'ordre des cles preserve, avec une version de schema
// obligatoire a l'ecriture. C'est, champ pour champ, l'enveloppe de `projet.json`.
//
// ---------------------------------------------------------------------------------------------
// Ce que la plateforme apporte et que `api.php` n'avait pas
// ---------------------------------------------------------------------------------------------
//
// L'isolation par locataire, appliquee par ses propres tests ; un projet d'un autre locataire
// repond `404` et non `403`, parce qu'une ressource qui n'est pas a vous est indistinguable d'une
// ressource qui n'existe pas. L'historique des versions. La suppression douce — une date, pas une
// cascade — et donc la restauration. Rien de tout cela n'est ecrit ici : c'est la raison meme de
// s'appuyer dessus.
//
// **Ce qui reste a la charge de Plan**, et qui n'est pas rien : la forme du document. La plateforme
// ne la connait pas et ne la validera jamais. `schema_version` est le seul contrat de forme, et il
// est refuse a l'ecriture s'il manque.

import { schemaMinimal, migrer } from '../model/migrations.js';
import { EchecPlateforme, type Session } from '../plateforme/session.js';
import type { ProjetResume, ProjetServeur, MotifEchec } from './api.js';
import type { ObjetBrut, Mesure } from '../model/types.js';
import { phraseLimite } from '../plateforme/quotaProjets.js';

/** Le document tel que Plan l'ecrit et le relit. La plateforme ne le regarde pas. */
interface DocumentPlan {
  /** Ecrit tel que le projet le porte, jamais relu : la barre de projet reconstruit `meta` depuis les colonnes. */
  meta?: unknown;
  /** Le schema auquel le document a ete ecrit ; c'est aussi la colonne `schema_version`. */
  schemaVersion?: number;
  objects: ObjetBrut[];
  measures?: Mesure[];
}

interface ResumeApi { id: string; name: string; updated_at: string; deleted_at: string | null; schema_version?: number }

/** `{}`, ou rien : le document d'un projet cree mais jamais ecrit. */
export function documentVide(d: unknown): boolean {
  return d === null || d === undefined || (typeof d === 'object' && !Array.isArray(d) && Object.keys(d).length === 0);
}

function echec(message: string, motif: MotifEchec): Error & { reason: MotifEchec } {
  return Object.assign(new Error(message), { reason: motif });
}

/**
 * Traduit une defaillance de la plateforme dans le vocabulaire que l'interface connait deja.
 *
 * Le `motif` existait pour distinguer « le serveur n'existe pas » de « il a repondu de travers » ;
 * la distinction vaut toujours, avec une source de plus : `404` est un projet absent **ou** un
 * projet d'un autre locataire, et l'interface doit dire la meme chose dans les deux cas.
 */
function traduire(e: unknown, quoi: string): Error & { reason: MotifEchec } {
  // Une defaillance qui porte deja son motif est une defaillance que ce module a levee lui-meme —
  // le refus d'un document qui n'est pas un plan, par exemple. La retraduire en « reseau » ferait
  // dire au programme que la plateforme n'a pas repondu alors qu'elle a tres bien repondu, et le
  // repli qui depend de ce motif ne se declencherait jamais.
  if (e && typeof e === 'object' && 'reason' in e) return e as Error & { reason: MotifEchec };
  if (e instanceof EchecPlateforme && e.erreur.code === 'UNSUPPORTED_SCHEMA_VERSION') return refusDeSchema(e, quoi);
  if (e instanceof EchecPlateforme && e.erreur.code === 'QUOTA_EXCEEDED') return refusDeQuota(e);
  if (e instanceof EchecPlateforme && e.erreur.code === 'PAYLOAD_TOO_LARGE') return refusDeTaille(e, quoi);
  if (e instanceof EchecPlateforme && e.erreur.code === 'EMBEDDED_ASSET_REJECTED') return refusDActif(e, quoi);
  if (e instanceof EchecPlateforme) {
    const motif: MotifEchec = e.erreur.statut === 404 ? 'notfound' : 'server';
    const ref = e.erreur.requestId ? ' (' + e.erreur.requestId + ')' : '';
    return echec(quoi + ' : ' + e.erreur.code + ref, motif);
  }
  return echec(quoi + ' : ' + ((e as Error).message || String(e)), 'network');
}

/**
 * La plateforme refuse un document qui embarque un contenu : une URI `data:`, ou une chaine de plus
 * de 64 Kio (`422 EMBEDDED_ASSET_REJECTED`, avec `details.path` et `details.reason`). Le chemin est
 * dit : c'est lui qui designe le champ fautif, sans quoi l'erreur ne se diagnostique pas.
 */
function refusDActif(e: EchecPlateforme, quoi: string): Error & { reason: MotifEchec } {
  const d = e.erreur.details;
  const chemin = typeof d.path === 'string' ? d.path : null;
  const taille = typeof d.size_bytes === 'number' ? ' (' + Math.round(d.size_bytes / 1024) + ' Kio)' : '';
  const ref = e.erreur.requestId ? ' (' + e.erreur.requestId + ')' : '';
  return echec(quoi + ' : la plateforme refuse un contenu embarque dans le document'
    + (chemin ? ', champ « ' + chemin + ' »' + taille : '') + ' — EMBEDDED_ASSET_REJECTED' + ref, 'server');
}

/**
 * La plateforme refuse un projet de plus : l'organisation a atteint la limite de son abonnement
 * (`403 QUOTA_EXCEEDED`, avec `details.limit` et `details.used`). La phrase est celle que Plan dit
 * quand il voit la limite lui-meme, avec les nombres de la plateforme, qui font foi.
 */
function refusDeQuota(e: EchecPlateforme): Error & { reason: MotifEchec } {
  const d = e.erreur.details;
  const l = typeof d.limit === 'number' && typeof d.used === 'number' ? { limite: d.limit, utilise: d.used } : null;
  return Object.assign(echec(phraseLimite(l), 'server'), { quota: true as const });
}

/**
 * La plateforme ne connait pas encore le schema que Plan vient d'ecrire. Ce n'est ni une panne ni
 * une faute de la personne : c'est la configuration du produit Plan, cote plateforme, qui est en
 * retard sur le programme. Le code brut (`UNSUPPORTED_SCHEMA_VERSION`) n'aide personne ; la phrase
 * dit quoi faire, et a qui le demander.
 */
function refusDeSchema(e: EchecPlateforme, quoi: string): Error & { reason: MotifEchec } {
  const d = e.erreur.details;
  const ecrit = typeof d.schema_version === 'number' ? d.schema_version : null;
  const acceptes = Array.isArray(d.supported) ? d.supported.join(', ') : null;
  const ref = e.erreur.requestId ? ' (' + e.erreur.requestId + ')' : '';
  return echec(quoi + ' refusé : la plateforme n’accepte pas encore le schéma '
    + (ecrit ?? 'de projet') + ' de Plan' + (acceptes ? ' (acceptés : ' + acceptes + ')' : '')
    + '. Un administrateur de la plateforme doit ajouter ' + (ecrit ?? 'ce schéma')
    + ' à « project_schema_versions » du produit Plan. Rien n’est perdu : le plan reste ouvert ici.' + ref, 'server');
}

/** Un nombre d'octets en Mo, a la francaise : « 2,4 Mo ». */
const enMo = (octets: number) => (octets / 1048576).toFixed(1).replace('.', ',') + ' Mo';

/**
 * La plateforme refuse un document trop gros (`413 PAYLOAD_TOO_LARGE`, `details.limit` quand elle
 * le donne). Le code brut n'aide personne : la phrase dit ce qui pese, et comment alleger.
 */
function refusDeTaille(e: EchecPlateforme, quoi: string): Error & { reason: MotifEchec } {
  const d = e.erreur.details;
  const limite = typeof d.limit === 'number' ? ' (limite : ' + enMo(d.limit) + ')' : '';
  const ref = e.erreur.requestId ? ' (' + e.erreur.requestId + ')' : '';
  return echec(quoi + ' refusé : le projet est trop volumineux pour la plateforme' + limite
    + '. Ce qui pèse le plus : le voisinage étendu et le relief sur toutes les parcelles. Masquer ne suffit pas :'
    + ' supprimez une partie du voisinage, ou relisez le relief sur la parcelle seule (« Actualiser le relief »).'
    + ' Rien n’est perdu : le plan reste ouvert ici.' + ref, 'server');
}

export interface DepotProjets {
  lister(): Promise<ProjetResume[]>;
  ouvrir(id: string): Promise<ProjetServeur>;
  enregistrer(charge: { id?: string; name?: string; objects: ObjetBrut[]; measures?: Mesure[]; meta?: unknown }): Promise<{ id: string; updatedAt?: string }>;
  supprimer(id: string): Promise<unknown>;
}

export function creerDepotPlateforme(session: Session): DepotProjets {
  return {
    async lister() {
      try {
        const r = await session.appeler<{ projects: ResumeApi[] }>('listProjects', { requete: { limit: 100 } });
        return r.projects
          // Une suppression est une date : la liste rend aussi ce qui est efface, et Plan ne
          // propose pas d'ouvrir ce que quelqu'un a supprime.
          .filter((p) => !p.deleted_at)
          .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updated_at }));
      } catch (e) { throw traduire(e, 'liste des projets'); }
    },

    async ouvrir(id) {
      try {
        const p = await session.appeler<ResumeApi & { document: DocumentPlan }>('showProject', { params: { projectId: id } });
        const d = p.document;
        // Un document vide, `{}` : un projet que la plateforme vient de creer pour Plan, et que
        // personne n'a encore rempli. Ce n'est pas un document etranger, c'est un plan neuf — rendu
        // vide, et marque comme tel, pour que le demarrage propose d'en saisir l'adresse.
        if (documentVide(d)) {
          return { objects: [], measures: [], schemaVersion: p.schema_version ?? null, nouveau: true, meta: { id: p.id, name: p.name, updatedAt: p.updated_at } };
        }
        // La plateforme ne connait pas la forme du document et ne la validera jamais : elle stocke
        // ce qu'on lui donne. Un projet cree par autre chose que Plan s'ouvrirait donc en plan
        // vide, sans un mot — le pire des deux mondes. On le dit.
        if (!d || !Array.isArray(d.objects)) {
          throw echec('Ce projet n a pas la forme d un plan (aucun objet dans le document).', 'badjson');
        }
        // Un document ancien est lu dans la forme courante : le programme n'en connait qu'une.
        const schema = p.schema_version ?? 1;
        const lu = migrer(d, schema);
        return {
          objects: lu.objects || [],
          schemaVersion: schema,
          ...(lu.measures ? { measures: lu.measures } : {}),
          // `meta` est ce que la barre de projet affiche : on le reconstruit depuis les colonnes de
          // la plateforme plutot que depuis le document, pour que le nom affiche soit celui que la
          // plateforme connait — c'est lui qui sert a lister, donc c'est lui qui fait foi.
          meta: { id: p.id, name: p.name, updatedAt: p.updated_at }
        };
      } catch (e) { throw traduire(e, 'ouverture du projet'); }
    },

    async enregistrer(charge) {
      const { id, name, ...reste } = charge;
      const document: DocumentPlan = reste;
      // Le schema vient de l'appelant quand il le connait (le projet ouvert, peut-etre mis a jour) ;
      // sinon — la demonstration creee au premier pas — c'est le plus petit qui decrit le document.
      const schema = typeof document.schemaVersion === 'number' ? document.schemaVersion : schemaMinimal(document.objects);
      try {
        if (id) {
          const p = await session.appeler<ResumeApi>('updateProject', {
            params: { projectId: id },
            // PATCH, et non PUT : le contrat le dit, et l'etape 0 l'a corrige dans la specification.
            corps: { ...(name !== undefined ? { name } : {}), schema_version: schema, document }
          });
          return { id: p.id, updatedAt: p.updated_at };
        }
        const p = await session.appeler<ResumeApi>('createProject', {
          corps: { name: name || 'Projet sans nom', schema_version: schema, document }
        });
        return { id: p.id, updatedAt: p.updated_at };
      } catch (e) { throw traduire(e, 'enregistrement du projet'); }
    },

    async supprimer(id) {
      try {
        // `204`, sans corps. La plateforme pose une date de suppression et garde tout le reste.
        await session.appeler<void>('deleteProject', { params: { projectId: id } });
        return {};
      } catch (e) { throw traduire(e, 'suppression du projet'); }
    }
  };
}
