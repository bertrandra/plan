// Lire un projet partage par un lien (lot 6 du parcours client, ADR-073 de la plateforme ; docs/plan-service.md §5.6).
//
//   https://plan.raillard.org/?product=plan#share=<jeton>
//
// La personne qui ouvre ce lien n'a pas de compte : la porte de connexion n'est pas pour elle. Ce module, appele avant tout le
// reste par main.ts :
//
// 1. lit le jeton dans le FRAGMENT de l'adresse (jamais envoye au serveur qui sert la page) et l'en **efface aussitot**
//    (`history.replaceState`), avant qu'aucune ressource tierce ne soit demandee : un signet, une capture de la barre d'adresse,
//    un historique synchronise ne le portent plus. Il n'est ecrit nulle part : ni stockage, ni journal, ni message d'erreur ;
// 2. pose `<meta name="referrer" content="no-referrer">` et `<meta name="robots" content="noindex">` : la page lue ne se range
//    dans aucun moteur, et aucune requete qu'elle fait ne dit d'ou elle vient. Seulement ici, et non dans index.html pour tout
//    Plan : l'atelier garde sa politique (`strict-origin-when-cross-origin`, deploy/htaccess.template), que les services de
//    l'IGN et des textures connaissent depuis toujours ;
// 3. demande le projet a la plateforme (`openSharedProject`), et le rend dans la forme courante du programme (migrations de schema
//    comprises), ou montre la raison d'un refus.

import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { LienPartage, type RefusLien } from '../zones/LienPartage.js';
import { ouvrirLienPartage, EchecLecturePartage } from '../plateforme/lecturePartage.js';
import { migrer } from '../model/migrations.js';
import { SCHEMA_VERSION } from '../model/version.js';
import { chargement } from '../shell/chargement.js';
import { hoteDeZone } from '../shell/dom.js';
import type { ReponseOpenSharedProject } from '../plateforme/contrat.js';
import type { ObjetBrut, Mesure } from '../model/types.js';
import type { InfoPartage } from './acces.js';
import type { ProjetResume } from '../io/api.js';

/** Le jeton d'un lien de partage dans un fragment d'adresse (`#share=…`), ou rien. */
export function jetonDuFragment(fragment: string): string | null {
  const m = /(?:^#|&)share=([^&]*)/.exec(fragment);
  if (!m) return null;
  try { return decodeURIComponent(m[1] ?? ''); } catch { return m[1] ?? ''; }
}

/** L'adresse sans son fragment : ce que la barre d'adresse garde (le `?product=` reste, il ne dit rien de secret). */
export function adresseSansFragment(href: string): string {
  const u = new URL(href);
  u.hash = '';
  return u.toString();
}

/** Retire le jeton de la barre d'adresse, sans recharger ni ajouter d'entree a l'historique. */
export function effacerLeJeton(): void {
  history.replaceState(history.state, '', adresseSansFragment(location.href));
}

/** La page lue ne se range nulle part et ne dit d'ou elle vient a personne (voir plus haut). */
export function poserLesMetasDuPartage(tete: HTMLElement = document.head): void {
  for (const [nom, contenu] of [['referrer', 'no-referrer'], ['robots', 'noindex, nofollow']] as const) {
    let m = tete.querySelector<HTMLMetaElement>('meta[name="' + nom + '"]');
    if (!m) { m = document.createElement('meta'); m.name = nom; tete.prepend(m); }
    m.content = contenu;
  }
}

/** Ce que boot() recoit d'un projet partage : la forme d'une graine sans depot (app/boot/graines.ts). */
export interface GrainePartage {
  apiAvailable: false;
  list: ProjetResume[];
  objects: ObjetBrut[];
  measures: Mesure[];
  meta: ProjetResume;
  schemaVersion: number;
  ouvrirAdresse: false;
}

/**
 * Le document lu, dans la forme courante, ou la raison de ne pas l'ouvrir : un schema que ce programme ne sait pas encore lire,
 * ou un document qui n'est pas un plan.
 */
export function graineDuPartage(r: ReponseOpenSharedProject): { graine: GrainePartage; info: InfoPartage } | { refus: RefusLien } {
  const p = r.project;
  const schema = typeof p.schema_version === 'number' ? p.schema_version : 1;
  if (schema > SCHEMA_VERSION) return { refus: { raison: 'recent', schema } };
  const d = p.document as { objects?: unknown; measures?: unknown } | null;
  if (!d || !Array.isArray(d.objects)) return { refus: { raison: 'pasUnPlan' } };
  const lu = migrer({ objects: d.objects as ObjetBrut[], measures: Array.isArray(d.measures) ? d.measures as Mesure[] : [] }, schema);
  const nom = p.name || 'Projet partagé';
  return {
    graine: {
      apiAvailable: false, list: [], objects: lu.objects, measures: (lu.measures ?? []) as Mesure[],
      // Un identifiant qui n'en est pas un chez la plateforme : rien ne s'enregistre sans depot (io/api.ts).
      meta: { id: 'partage', name: nom, updatedAt: p.updated_at }, schemaVersion: schema, ouvrirAdresse: false
    },
    info: { nom, partagePar: r.shared_by, jusquau: r.expires_at, enregistreLe: p.updated_at }
  };
}

/**
 * Ouvre le projet du lien : rend la graine et ce que le bandeau dit, une fois lus. Un refus s'affiche a la place de l'atelier, qui
 * ne demarre pas ; le reseau ou une panne proposent « Réessayer » (le jeton reste en memoire, dans cette fermeture seulement).
 */
export function ouvrirLeProjetPartage(jeton: string, lire?: typeof fetch): Promise<{ graine: GrainePartage; info: InfoPartage }> {
  let racine: Root | null = null;
  return new Promise((resoudre) => {
    const montrer = (refus: RefusLien) => {
      chargement(false);
      racine ||= createRoot(hoteDeZone('zoneLienPartage'));
      racine.render(createElement(LienPartage, { refus, reessayer: () => { chargement(true); void essayer(); } }));
    };
    const essayer = async (): Promise<void> => {
      let r: ReponseOpenSharedProject;
      try {
        r = await ouvrirLienPartage(jeton, lire);
      } catch (e) {
        montrer({ raison: e instanceof EchecLecturePartage ? e.raison : 'panne' });
        return;
      }
      const lu = graineDuPartage(r);
      if ('refus' in lu) { montrer(lu.refus); return; }
      if (racine) { racine.unmount(); racine = null; document.getElementById('zoneLienPartage')?.remove(); }
      resoudre(lu);
    };
    void essayer();
  });
}
