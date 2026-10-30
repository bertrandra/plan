import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEMANDES, juger, planDe, contenuDe } from '../../../fixtures/assistant/reference.js';
import { construireCatalogue } from '../../../../src/app/assistant/catalogue.js';
import { lireReponse, resoudre } from '../../../../src/app/assistant/etapes.js';
import { appliquerEtapes } from '../../../../src/app/assistant/appliquer.js';

// Les dix demandes de reference de l'assistant (lot L6, MD/spec-lecture-ia-elargie.md §7), rejouees HORS LIGNE sur les reponses
// enregistrees de l'API (tests/fixtures/assistant/reponses.json, ecrit par scripts/assistant-reference.ts --enregistrer) : chaque
// liste est juste sur la demonstration ; « Appliquer » puis Ctrl+Z rend le projet a l'identique ; en lecture seule, seules les
// preferences d'affichage s'appliquent.

const enregistrees = JSON.parse(readFileSync(new URL('../../../fixtures/assistant/reponses.json', import.meta.url), 'utf8')) as { source: string; reponses: Record<string, { sortie: unknown }> };

describe('les dix demandes de reference de l assistant, sur la demonstration', () => {
  it('sont dix, et chacune a sa reponse enregistree', () => {
    expect(DEMANDES).toHaveLength(10);
    expect(Object.keys(enregistrees.reponses).sort()).toEqual(DEMANDES.map((d) => d.id).sort());
  });

  for (const d of DEMANDES) {
    describe(d.id + ' : « ' + d.demande + ' »', () => {
      it('se traduit en une liste juste', () => {
        const j = juger(d, enregistrees.reponses[d.id]?.sortie);
        expect(j.juste, j.raison).toBe(true);
      });

      it('« Appliquer » puis Ctrl+Z rend le projet a l identique, en une seule etape d annulation', () => {
        const plan = planDe(d);
        const etapes = resoudre(lireReponse(enregistrees.reponses[d.id]?.sortie), construireCatalogue(plan.source()));
        const avant = plan.projetHorsAffichage(), affichage = [plan.etat.showNorth, plan.etat.grilleVisible, plan.etat.voisinageVisible];
        const utiles = etapes.filter((e) => !e.refus);
        const r = appliquerEtapes(etapes, plan.application);
        if (!utiles.length) { expect(r.ok).toBe(false); expect(plan.projetHorsAffichage()).toBe(avant); return; }
        expect(r).toMatchObject({ ok: true, faites: utiles.length });
        const projet = utiles.some((e) => e.ecrit === 'projet');
        // Une etape d'historique pour la liste entiere, et aucune si elle ne touche que l'affichage.
        expect(plan.historique.pile.taille).toBe(projet ? 1 : 0);
        if (projet) expect(plan.projetHorsAffichage()).not.toBe(avant);
        plan.historique.annuler();
        // Le projet d'avant, a l'identique ; seules les preferences d'affichage que la parcelle range (la grille, le voisinage)
        // restent, comme apres les memes bascules a la main.
        expect(plan.projetHorsAffichage()).toBe(avant);
        // Les preferences d'affichage ne reviennent pas avec Ctrl+Z (comme a la main) : elles restent posees.
        if (utiles.some((e) => e.ecrit === 'affichage')) expect([plan.etat.showNorth, plan.etat.grilleVisible, plan.etat.voisinageVisible]).not.toEqual(affichage);
      });
    });
  }

  it('en lecture seule, seules les preferences d affichage s appliquent : la grille, pas les lames', () => {
    const d = DEMANDES.find((x) => x.lectureSeule);
    if (!d) throw new Error('aucune demande en lecture seule');
    const plan = planDe(d);
    const etapes = resoudre(lireReponse(enregistrees.reponses[d.id]?.sortie), construireCatalogue(plan.source()));
    expect(etapes.filter((e) => e.ecrit === 'projet').every((e) => /Lecture seule/.test(e.refus ?? ''))).toBe(true);
    const avant = plan.projetHorsAffichage();
    expect(appliquerEtapes(etapes, plan.application)).toMatchObject({ ok: true });
    expect(plan.etat.grilleVisible).toBe(true);
    expect(plan.projetHorsAffichage()).toBe(avant);
    expect(plan.historique.pile.vide).toBe(true);
  });

  it('envoient le catalogue genere, puis la demande, et la requete de la verification de l API est celle que Plan genere', () => {
    const verification = JSON.parse(readFileSync(new URL('../../../fixtures/assistant/requete-verification.json', import.meta.url), 'utf8')) as { id: string; contenu: unknown };
    const d = DEMANDES.find((x) => x.id === verification.id);
    if (!d) throw new Error('demande de la verification absente');
    // Regenerer : npx tsx scripts/assistant-reference.ts --verification
    expect(verification.contenu).toEqual(contenuDe(d));
    const [catalogue, demande] = contenuDe(d) as { type: 'text'; text: string }[];
    expect(catalogue?.text).toMatch(/^# Catalogue de Plan \(version 1\)/);
    expect(demande?.text).toBe('Demande :\n' + d.demande + '\nFin de la demande.');
  });
});
