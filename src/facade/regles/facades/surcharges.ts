// Les valeurs de la detection posees par la calibration de l'admin (Admin › Calibrer la détection, `admin/calibration` du serveur).
//
// Un registre de module, vide tant que rien n'est pose : le code, le banc et les empreintes lisent alors les valeurs livrees,
// au bit pres. `reglagesDetection` et `reglagesStructure` les superposent aux valeurs livrees ; une surcharge explicite (le
// banc, un profil) passe encore devant. Pose a l'ouverture de la page (io/calibrationServeur.ts), jamais dans le calcul.

let posees: Readonly<Record<string, number>> = {};

/** Pose les valeurs calibrees ({} les retire). */
export function poserSurchargesCalibrees(valeurs: Readonly<Record<string, number>>): void {
  posees = { ...valeurs };
}

/** Les valeurs calibrees en usage. */
export function surchargesCalibrees(): Readonly<Record<string, number>> {
  return posees;
}
