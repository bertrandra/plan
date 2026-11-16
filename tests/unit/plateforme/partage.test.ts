import { describe, it, expect } from 'vitest';
import { creerServicePartage, phraseRefusPartage, CAPACITE_PARTAGE, DUREES_PARTAGE } from '../../../src/plateforme/partage.js';
import { EchecPlateforme, type OptionsAppel, type Session } from '../../../src/plateforme/session.js';
import type { IdOperation } from '../../../src/plateforme/contrat.js';

// Le partage d'un projet par un lien (ADR-073 de la plateforme, lot 6) : les trois gestes passent par les operations du contrat, et
// chaque refus de la plateforme se dit en clair, par son code.

function sessionEnregistreuse(reponses: Partial<Record<IdOperation, unknown>> = {}) {
  const appels: { id: IdOperation; options: OptionsAppel | undefined }[] = [];
  const session = {
    jeton: () => null, ouverte: () => true, ouvrir: async () => {}, reprendre: async () => true, fermer: async () => {},
    appeler: async <T>(id: IdOperation, options?: OptionsAppel) => { appels.push({ id, options }); return reponses[id] as T; }
  } satisfies Session;
  return { session, appels };
}

const refus = (code: string, statut: number, details: Record<string, unknown> = {}) =>
  new EchecPlateforme({ code, message: 'm', details, requestId: 'req-1', statut });

describe('le service du partage', () => {
  it('appelle les operations du contrat, avec le projet et le lien dans le chemin', async () => {
    const { session, appels } = sessionEnregistreuse({ listProjectShares: { shares: [] }, createProjectShare: { url: 'u' } });
    const s = creerServicePartage(session);
    expect(await s.lister('p1')).toEqual([]);
    await s.creer('p1', { jours: 90, nomAffiche: '  Ada  ', destinataire: '' });
    await s.retirer('p1', 'l1');
    expect(appels.map((a) => a.id)).toEqual(['listProjectShares', 'createProjectShare', 'revokeProjectShare']);
    expect(appels[0]!.options).toEqual({ params: { projectId: 'p1' } });
    // Un champ vide ne part pas ; le nom est rogne de ses blancs.
    expect(appels[1]!.options).toEqual({ params: { projectId: 'p1' }, corps: { expires_in_days: 90, display_name: 'Ada' } });
    expect(appels[2]!.options).toEqual({ params: { projectId: 'p1', shareId: 'l1' } });
  });

  it('borne ce qui part aux longueurs du contrat', async () => {
    const { session, appels } = sessionEnregistreuse();
    await creerServicePartage(session).creer('p1', { jours: 7, nomAffiche: 'n'.repeat(200), destinataire: 'd'.repeat(200) });
    const corps = appels[0]!.options!.corps as { display_name: string; recipient_label: string };
    expect(corps.display_name).toHaveLength(80);
    expect(corps.recipient_label).toHaveLength(120);
  });

  it('nomme la fonction comme la plateforme, et propose des durees qu elle accepte', () => {
    expect(CAPACITE_PARTAGE).toBe('project_sharing');
    for (const j of DUREES_PARTAGE) { expect(j).toBeGreaterThanOrEqual(1); expect(j).toBeLessThanOrEqual(365); }
  });
});

describe('les refus du partage', () => {
  it('disent chaque code en clair, avec ce qu il faut faire', () => {
    expect(phraseRefusPartage(refus('SHARE_LIMIT_REACHED', 409, { limit: 50 }))).toMatch(/déjà 50 liens actifs.*Retirez-en un/);
    expect(phraseRefusPartage(refus('ENTITLEMENT_REQUIRED', 403))).toMatch(/pas compris dans votre offre/);
    expect(phraseRefusPartage(refus('SUBSCRIPTION_PAST_DUE', 403))).toMatch(/facture.*impayée/);
    expect(phraseRefusPartage(refus('SUBSCRIPTION_REQUIRED', 403))).toMatch(/Aucun abonnement/);
    expect(phraseRefusPartage(refus('PERMISSION_DENIED', 403))).toMatch(/administrateur/);
    expect(phraseRefusPartage(refus('SHARE_HAS_NO_VIEWER', 409))).toMatch(/adresse de Plan.*req-1/);
    expect(phraseRefusPartage(refus('VALIDATION_FAILED', 400, { field: 'expires_in_days', requirement: '1..365' }))).toMatch(/« expires_in_days ».*1\.\.365/);
    expect(phraseRefusPartage(refus('PROJECT_NOT_FOUND', 404))).toMatch(/introuvable/);
    expect(phraseRefusPartage(refus('RATE_LIMITED', 429))).toMatch(/une minute/);
    expect(phraseRefusPartage(new TypeError('Failed to fetch'))).toMatch(/injoignable/);
    expect(phraseRefusPartage(refus('INTERNAL', 500))).toMatch(/INTERNAL.*req-1/);
  });
});
