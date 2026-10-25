// La plateforme repond-elle, ici et maintenant ? La pastille de la porte (zones/Porte.tsx) la pose avant toute tentative : quelqu'un
// qui voit « adresse ou mot de passe refuse » sur une plateforme injoignable cherchera son mot de passe pendant dix minutes.
//
// On interroge `GET /auth/jwks`, qui est publique, sans corps et sans effet : c'est la seule route du contrat qu'on puisse appeler
// sans session et sans rien deranger.

/** Au-dela, une plateforme qui ne repond pas est une plateforme injoignable pour qui attend devant un formulaire. */
export const DELAI_SONDE_MS = 8000;

/** Vrai si la plateforme repond (2xx) dans le delai ; faux sinon, ou si `stop` interrompt la sonde. */
export function sonderPlateforme(plateforme: string, stop: AbortSignal): Promise<boolean> {
  const interne = new AbortController();
  const arreter = () => interne.abort();
  stop.addEventListener('abort', arreter);
  const minuterie = setTimeout(arreter, DELAI_SONDE_MS);
  // `cache: 'no-store'` n'est pas un detail : la plateforme declare ses cles publiques cachables cinq minutes, et sans cela le
  // navigateur repondait 200 depuis son cache alors que la plateforme etait eteinte. Une pastille qui dit « connectee » sur une
  // plateforme arretee est pire que pas de pastille du tout.
  return fetch(plateforme.replace(/\/+$/, '') + '/api/v1/auth/jwks', { signal: interne.signal, cache: 'no-store' })
    .then((r) => r.ok, () => false)
    .finally(() => { clearTimeout(minuterie); stop.removeEventListener('abort', arreter); });
}
