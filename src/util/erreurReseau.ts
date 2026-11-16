// Les erreurs du reseau, dites en clair (audit de l'IHM du 16 novembre 2026, lot 1).
//
// La personne lisait « Geocodage impossible : Failed to fetch » : le message du navigateur, en anglais,
// qui ne dit ni ce qui se passe ni quoi faire. Une erreur de reseau a quelques formes seulement — le
// service ne repond pas (coupure, delai depasse), il est indisponible (5xx), il refuse trop de demandes
// (429), il refuse celle-ci (4xx) — et chacune a sa phrase : ce qui se passe, puis quoi faire.
//
// Une erreur qui n'est pas de reseau (un refus deja dit en phrase : quota, schema, taille, « aucune
// parcelle sous ce point ») n'est pas touchee : `phraseReseau` rend alors `null` et l'appelant garde
// son texte. Le detail technique (le message d'origine) reste a cote, pour la reference a copier du
// bandeau d'erreur (shell/dialogs.ts::showErreur).

export type NatureErreurReseau = 'injoignable' | 'indisponible' | 'surcharge' | 'refus';

/** Ce que les navigateurs ecrivent quand la requete n'a pas pu partir ou n'a pas eu de reponse. */
const INJOIGNABLE = /failed to fetch|networkerror|network error|load failed|fetch failed|err_[a-z_]+|ne r[ée]pond pas|injoignable|timed? ?out|delai depasse|d[ée]lai d[ée]pass[ée]|importing a module script failed|dynamically imported module/i;
/** Le code d'une plateforme en fin de message (io/depotPlateforme.ts::traduire) : « … : INTERNAL (req_…) ». */
const CODE_PLATEFORME = /:\s*([A-Z][A-Z0-9_]{2,})(\s*\([^)]*\))?\s*$/;

type ErreurLue = { name?: unknown; message?: unknown; statut?: unknown; status?: unknown; reason?: unknown; erreur?: { statut?: unknown } } | null | undefined;

/** Le message d'origine, tel que l'erreur le porte : le detail technique. */
export function detailTechnique(e: unknown): string {
  const x = e as ErreurLue;
  const m = x && typeof x === 'object' && typeof x.message === 'string' ? x.message : String(e ?? '');
  return m.trim();
}

/** Le statut HTTP d'une erreur, s'il se lit : un champ pose par le client, ou « HTTP 503 » dans le message. */
export function statutHttp(e: unknown): number | null {
  const x = e as ErreurLue;
  for (const v of [x?.statut, x?.status, x?.erreur?.statut]) if (typeof v === 'number' && v >= 100) return v;
  // Seulement un message brut (« HTTP 503 », « Le service a repondu HTTP 503. ») : une phrase qui cite son statut
  // (« … ne sert pas ce reglement (HTTP 404). ») dit deja ce qui se passe, et reste telle quelle.
  const m = /^(?:[^:]*:\s*)?(?:le service a r[ée]pondu\s+)?HTTP\s*(\d{3})\.?$/i.exec(detailTechnique(e));
  return m ? Number(m[1]) : null;
}

/** La nature d'une erreur de reseau, ou `null` quand ce n'en est pas une (un refus deja dit en phrase). */
export function natureErreurReseau(e: unknown): NatureErreurReseau | null {
  const x = e as ErreurLue;
  const nom = x && typeof x === 'object' && typeof x.name === 'string' ? x.name : '';
  if (nom === 'AbortError' || nom === 'TimeoutError') return 'injoignable';
  if (x && typeof x === 'object' && x.reason === 'network') return 'injoignable';
  const detail = detailTechnique(e);
  const statut = statutHttp(e);
  if (statut === 429) return 'surcharge';
  if (statut !== null && statut >= 500) return 'indisponible';
  if (statut !== null && statut >= 400) return 'refus';
  if (INJOIGNABLE.test(detail)) return 'injoignable';
  // Une plateforme qui repond par un code brut, sans phrase (« enregistrement du projet : INTERNAL (req_42) »).
  if (x && typeof x === 'object' && x.reason === 'server' && CODE_PLATEFORME.test(detail)) return 'indisponible';
  return null;
}

/**
 * La phrase d'une erreur de reseau : ce qui se passe, puis quoi faire. `service` est le sujet de la
 * phrase (« Le service d'adresses de l'IGN »), `ensuite` ce que la personne peut faire (« Reessayez dans
 * un instant, ou dessinez votre terrain a la main. »). `null` quand l'erreur n'est pas de reseau.
 */
export function phraseReseau(e: unknown, service: string, ensuite = 'Réessayez dans un instant.'): string | null {
  const nature = natureErreurReseau(e);
  if (!nature) return null;
  const suite = ensuite ? ' ' + ensuite : '';
  switch (nature) {
    case 'injoignable': return service + ' ne répond pas.' + suite;
    case 'indisponible': return service + ' est momentanément indisponible.' + suite;
    case 'surcharge': return service + ' reçoit trop de demandes en ce moment. Réessayez dans une minute.';
    case 'refus': return service + ' a refusé la demande.' + suite;
  }
}

/** La phrase, ou a defaut le texte de l'appelant suivi du detail (une erreur qui n'est pas de reseau). */
export function enClair(e: unknown, service: string, ensuite: string, sinon: (detail: string) => string): { texte: string; detail: string } {
  const detail = detailTechnique(e);
  return { texte: phraseReseau(e, service, ensuite) ?? sinon(detail), detail };
}
