<?php
// Configuration de l'admin des demos (admin.php, MD/spec-demos-admin.md).
//
// 1. Copier ce fichier sous le nom `plan-admin-config.php` a cote de `public_html/` (au-dessus de
//    la racine web, pas dedans) : il n'est alors jamais servi. Vaut aussi pour Plan en sous-dossier.
//    A defaut, le copier a cote d'admin.php sous le nom `admin-config.php` ; .htaccess en refuse
//    l'acces direct.
// 2. Remplacer le mot de passe. Tant qu'il vaut « A-CHANGER », l'admin n'existe pas.
//    Il peut etre ecrit en clair, ou sous forme de hachage : php -r 'echo password_hash("...", PASSWORD_DEFAULT);'
// 3. `dossierDemos` : ou ranger les fichiers de demo. Hors du dossier publie de preference, pour
//    qu'une mise en ligne qui remplace ce dossier ne les emporte pas.

return [
    'motDePasse' => 'A-CHANGER',
    'dossierDemos' => __DIR__ . '/plan-demos',
];
