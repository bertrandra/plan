// Les commandes du relief du terrain (MD/spec-relief.md §4, §8, app/).
//
// Trois commandes, toutes sous la capacite `plan.relief` et la permission d'ecrire : lire le relief
// a l'IGN, l'actualiser, le supprimer. Une lecture est une modification du projet (regle 4 de la
// spec) : annulable, « projet modifie », refusee en lecture seule. L'instantane n'est empile qu'au
// succes : une lecture qui echoue — l'IGN n'a pas repondu, pas de relief pour cette parcelle — ne
// laisse pas d'etape vide dans la pile, et rien n'est ecrit.
//
// Rien ne relit le service tout seul (regle 5) : l'ouverture jamais ; l'import et l'actualisation IGN
// seulement si leur case « Relief du terrain » est cochee (app/importCadastre.ts, actualisationIgn.ts).

import { CAPACITES } from '../../plateforme/capacites.js';
import { PERMISSION_ECRITURE } from '../acces.js';
import { showToast } from '../../shell/dialogs.js';
import { lireRelief } from '../../geo/relief.js';
import { reliefDe, reliefMontre, resumeRelief } from '../../model/relief.js';
import { parcelleDuProjet } from '../../model/fonctions.js';
import { aDesSommets } from '../../model/formes.js';
import { lectureRelief } from '../../core/lectureRelief.js';
import { vue3d } from '../../three/etat3d.js';
import type { referenceGeoPlan } from '../../render/ortho.js';
import type { Atelier } from '../atelier.js';
import type { RegistreCommandes } from '../commandes.js';
import type { ObjetPlan, Relief } from '../../model/types.js';

/** Ce que les commandes du relief demandent, en plus de l'atelier. */
export interface ContexteRelief {
  /** Le calage du plan sur le monde (render/ortho.ts) : exact quand il vient du cadastre. */
  reference: () => ReturnType<typeof referenceGeoPlan>;
  /** Reconstruit la scene 3D : le sol en relief se bati avec elle. */
  buildThreeScene: (obj: ObjetPlan | null) => void;
  /** Redessine les zones (le bouton « Lecture… », les onglets du tiroir). */
  rafraichir: () => void;
  /** La lecture a l'IGN ; remplacable dans les tests, qui ne touchent pas le reseau. */
  lire?: typeof lireRelief;
}

export function brancherRelief(a: Atelier, ctx: ContexteRelief, cmd: RegistreCommandes): void {
  const parcelle = () => parcelleDuProjet(a.etat.objects);
  const relief = () => reliefDe(a.etat.objects);
  /** Le plan est cale par le cadastre : la seule facon de savoir ou est la parcelle sur la Terre. */
  const calee = () => {
    const p = parcelle();
    return !!p && aDesSommets(p) && p.pts.length >= 3 && !!ctx.reference()?.exact;
  };
  const reconstruire3d = () => {
    if (vue3d.scene) ctx.buildThreeScene(a.etat.objects.find(o => o.key === a.etat.terrasseSelectedKey) || null);
  };

  /** Lit la grille et l'ecrit sur la parcelle, d'un bloc ; `verbe` est celui du toast (« lu », « actualisé »). */
  async function lire(verbe: 'lu' | 'actualisé'): Promise<void> {
    const p = parcelle();
    const ref = ctx.reference();
    if (!p || !aDesSommets(p) || !ref?.exact || lectureRelief.enCours()) return;
    lectureRelief.definir(true);
    ctx.rafraichir();
    try {
      const r: Relief = await (ctx.lire ?? lireRelief)({ parcelle: p.pts, ref, objets: a.etat.objects, cleTerrasse: a.etat.terrasseSelectedKey });
      // La parcelle se retrouve apres l'attente : le plan a pu changer pendant la lecture.
      const cible = parcelle();
      if (!cible) return;
      // « Actualiser » remplace la grille entiere, zRef compris ; les preferences d'affichage, elles,
      // ne sont pas une donnee de la grille et restent ce que la personne avait regle.
      const affichage = cible.relief?.affichage;
      a.pushHistory();
      cible.relief = affichage ? { ...r, affichage } : r;
      a.markDirty();
      a.render();
      reconstruire3d();
      showToast('Relief ' + verbe + ' : ' + resumeRelief(r));
    } catch (e) {
      showToast((e as Error).message || 'L’IGN n’a pas répondu ; réessayez.');
    } finally {
      lectureRelief.definir(false);
      ctx.rafraichir();
    }
  }

  cmd.declarer({
    id: 'relief.lire', libelle: 'Lire le relief (IGN)', groupe: 'relief',
    capacite: CAPACITES.relief.code, permission: PERMISSION_ECRITURE,
    actif: () => calee() && !relief() && !lectureRelief.enCours(),
    executer: () => { void lire('lu'); }
  });

  cmd.declarer({
    id: 'relief.actualiser', libelle: 'Actualiser le relief', groupe: 'relief',
    capacite: CAPACITES.relief.code, permission: PERMISSION_ECRITURE,
    actif: () => calee() && !!relief() && !lectureRelief.enCours(),
    executer: () => { void lire('actualisé'); }
  });

  // « Affichage › Relief » : les courbes de niveau et le sol en relief de la 3D, d'un geste. Coche
  // quand les deux sont montres ; sinon, un clic les montre tous les deux. Une preference
  // d'affichage, comme les deux cases de l'inspecteur : ni Ctrl+Z, ni « projet modifie », permise
  // en lecture seule, rangee dans `relief.affichage` pour etre retrouvee a la reouverture. Sans la
  // capacite `plan.relief` non plus : elle porte sur la lecture, une grille deja la s'affiche.
  cmd.declarer({
    id: 'affichage.relief', libelle: 'Relief', groupe: 'affichage', ecrit: 'affichage',
    actif: () => !!relief(),
    executer: () => {
      const r = relief();
      if (!r) return;
      const montre = reliefMontre(r);
      r.affichage = { ...(r.affichage ?? {}), courbes: !montre, sol3d: !montre };
      a.render();
      reconstruire3d();
      ctx.rafraichir();
    }
  });

  cmd.declarer({
    id: 'relief.supprimer', libelle: 'Supprimer le relief', groupe: 'relief',
    capacite: CAPACITES.relief.code, permission: PERMISSION_ECRITURE,
    actif: () => !!relief() && !lectureRelief.enCours(),
    executer: () => {
      const p = parcelle();
      if (!p || !p.relief) return;
      a.pushHistory();
      delete p.relief;
      a.markDirty();
      a.render();
      reconstruire3d();
    }
  });
}
