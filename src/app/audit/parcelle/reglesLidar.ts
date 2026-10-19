// Les regles qui produisent les constats (MD/spec-reconciliation.md §4) : pour chaque source, le seuil ou la regle qui fait la
// lecture. Les noms qui sont des seuils de regles/toits/reglages.json se retrouvent dans l'ecran Admin › Regles : un test
// refuse un nom qui n'y serait plus. Ce que dit un constat de sa regle est ce qui fait surface des regles LiDAR.

/** Un nom de seuil de regles/toits/reglages.json, ou une phrase quand la regle n'est pas un seuil. */
export const REGLES_LIDAR = {
  ign: {
    hauteur: 'hauteur BD TOPO (sol à l’égout)',
    estimee: 'hauteur estimée par la BD TOPO (étages × 2,7 m)',
    materiau: 'matériaux des fichiers fonciers (BD TOPO)',
    forme: 'toit de repli de la BD TOPO',
    toit: 'hauteur du toit de la BD TOPO (égout + pente par défaut)',
  },
  lidar: {
    /** L'egout se lit loin des murs (10e centile) : RETRAIT_EGOUT_M. */
    egout: 'RETRAIT_EGOUT_M',
    /** Le faitage de la surface nettoyee des saillies : SAILLIE_M. */
    faite: 'SAILLIE_M',
    /** Les corps se coupent aux marches de la couverture : SEUIL_MARCHE_M. */
    corps: 'SEUIL_MARCHE_M',
    bouts: 'GAIN_CROUPES',
    sens: 'SEUIL_MARCHE_M',
    /** La silhouette d'un mur sous les corps lus, lue sur le cote du corps qui le porte (facade/regles/toits/silhouetteDesCorps.ts). */
    silhouette: 'silhouette du mur sous les corps lus (LiDAR)',
  },
  photo: {
    hauteur: 'hauteur mesurée sur la photo (coins trouvés)',
    silhouette: 'regles/toits/silhouettes.json',
    ouvertures: 'ouvertures detectees sur la photo (contours, coins trouves)',
  },
  claude: {
    silhouette: 'regles/toits/silhouettes.json',
    ouvertures: 'ouvertures renforcees par Claude sur la photo',
  },
} as const;

/** Les noms de cette table qui doivent etre des seuils de regles/toits/reglages.json. */
export const SEUILS_LIDAR_CITES: readonly string[] = [REGLES_LIDAR.lidar.egout, REGLES_LIDAR.lidar.faite, REGLES_LIDAR.lidar.corps, REGLES_LIDAR.lidar.bouts, REGLES_LIDAR.lidar.sens];
