// Les commandes du relief du terrain (MD/spec-relief.md §4, §8, app/).
//
// Trois commandes, toutes sous la capacite `plan.relief` et la permission d'ecrire : lire le relief
// a l'IGN, l'actualiser, le supprimer. Une lecture est une modification du projet (regle 4 de la
// spec) : annulable, « projet modifie », refusee en lecture seule. L'instantane n'est empile qu'au
// succes : une lecture qui echoue — l'IGN n'a pas repondu, pas de relief pour cette parcelle — ne
// laisse pas d'etape vide dans la pile, et rien n'est ecrit.
//
// Rien ne relit le service tout seul (regle 5) : l'ouverture jamais ; l'import et l'actualisation IGN
// seulement si leur case « Relief du terrain » est cochee (app/cadastre/importCadastre.ts, actualisationIgn.ts).

import { CAPACITES } from '../../plateforme/capacites.js';
import { PERMISSION_ECRITURE } from '../acces.js';
import { showToast } from '../../shell/dialogs.js';
import { etendueDuPlan, lireRelief } from '../../geo/relief.js';
import { reliefDe, affichageRelief, avecReglages, plafondRelief, resumeRelief } from '../../model/relief.js';
import { parcelleDuProjet } from '../../model/fonctions.js';
import { aDesSommets } from '../../model/formes.js';
import { lectureRelief } from '../../core/lectureRelief.js';
import { toucher } from '../../core/controleurObjets.js';
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
      // « Actualiser » relit avec le plafond de points regle dans l'inspecteur, et relit le paysage
      // (le voisinage du sol 3D) s'il y en avait un.
      const ancien = p.relief;
      const etendue = ancien?.paysage ? etendueDuPlan(a.etat.objects) : [];
      const r: Relief = await (ctx.lire ?? lireRelief)({
        parcelle: p.pts, ref, objets: a.etat.objects, cleTerrasse: a.etat.terrasseSelectedKey, maxCellules: plafondRelief(ancien),
        ...(etendue.length ? { etendue } : {})
      });
      // La parcelle se retrouve apres l'attente : le plan a pu changer pendant la lecture.
      const cible = parcelle();
      if (!cible) return;
      // « Actualiser » remplace la grille entiere, zRef compris ; les preferences d'affichage et le
      // plafond de points, eux, ne sont pas des donnees de la grille et restent ce que la personne a regle.
      a.pushHistory(cible);
      cible.relief = avecReglages(r, cible.relief);
      a.markDirty(cible);
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

  // « Affichage › Relief » et « Affichage › Courbes de niveau » : deux bascules distinctes, le sol en
  // relief de la 3D (montre par defaut) et les courbes du plan (cachees par defaut). Des preferences
  // d'affichage, comme les cases de l'inspecteur : ni Ctrl+Z, permises en lecture seule, rangees dans
  // `relief.affichage` ; elles marquent le projet a enregistrer pour etre retrouvees a la reouverture. Sans la
  // capacite `plan.relief` non plus : elle porte sur la lecture, une grille deja la s'affiche.
  const basculer = (cle: 'sol3d' | 'courbes') => {
    const r = relief();
    if (!r) return;
    r.affichage = { ...(r.affichage ?? {}), [cle]: !affichageRelief(r)[cle] };
    // Sans annulation, mais le projet est a enregistrer : sinon le reglage se perdait a la reouverture.
    // L'ecriture nomme la parcelle qui porte le relief (core/controleurObjets.ts), en lecture seule aussi : le plan la redessine.
    const p = parcelle();
    toucher(p);
    if (!a.etat.lectureSeule) { if (p) a.markDirty(p); else a.markDirty(); }
    a.render();
    if (cle === 'sol3d') reconstruire3d();
    ctx.rafraichir();
  };
  cmd.declarer({
    id: 'affichage.relief', libelle: 'Relief', groupe: 'affichage', ecrit: 'affichage',
    actif: () => !!relief(),
    executer: () => basculer('sol3d')
  });
  cmd.declarer({
    id: 'affichage.courbes', libelle: 'Courbes de niveau', groupe: 'affichage', ecrit: 'affichage',
    actif: () => !!relief(),
    executer: () => basculer('courbes')
  });

  cmd.declarer({
    id: 'relief.supprimer', libelle: 'Supprimer le relief', groupe: 'relief',
    capacite: CAPACITES.relief.code, permission: PERMISSION_ECRITURE,
    actif: () => !!relief() && !lectureRelief.enCours(),
    executer: () => {
      const p = parcelle();
      if (!p || !p.relief) return;
      a.pushHistory(p);
      delete p.relief;
      a.markDirty(p);
      a.render();
      reconstruire3d();
    }
  });
}
