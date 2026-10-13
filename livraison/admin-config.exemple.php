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
//    qu'une mise en ligne qui remplace ce dossier ne les emporte pas. L'analyse par Claude y range
//    aussi ses donnees, dans `claude/` : journal des appels, tarifs, plafonds, batches en cours.
// 4. `anthropicCle` : la cle d'API Anthropic de l'analyse par Claude (analyse.php,
//    MD/spec-audit.md 13.2). Elle ne quitte jamais le serveur. Tant qu'elle vaut « A-CHANGER »,
//    l'analyse repond 503 et rien n'est envoye a Anthropic. Les plafonds par jour et par mois
//    (1 $ et 10 $ par defaut) se reglent dans `claude/plafonds.json`.

return [
    'motDePasse' => 'A-CHANGER',
    'dossierDemos' => __DIR__ . '/plan-demos',
    'anthropicCle' => 'A-CHANGER',
];
