# Campus PAÏA

Base de connaissances personnelle construite avec Next.js, React, TypeScript et l’App Router.

## Démarrage

```bash
npm install
npm run dev
```

## Configuration du corpus

Copier `.env.example` vers `.env.local`. `OPENAI_API_KEY`, `OPENAI_VECTOR_STORE_ID`, `OPENAI_MODEL`, `CAMPUS_SYNC_SECRET` et `CAMPUS_SEARCH_SECRET` restent exclusivement côté serveur. `CAMPUS_SEARCH_SECRET` protège la consultation du corpus privé : l’utilisateur le saisit dans le champ « Accès au Campus privé » et il n’est conservé que dans la session du navigateur. Sans configuration OpenAI, `/api/search` répond explicitement « Corpus Campus PAÏA non connecté ».

Le catalogue maître reste l’onglet `07_CATALOGUE_CORPUS` du Projet 20. Le Google Apps Script transmet chaque position à `POST /api/admin/index-document`, avec le secret dans `x-campus-sync-secret` ou `Authorization: Bearer …`. La route accepte :

- du JSON pour les métadonnées et le texte extrait ;
- du `multipart/form-data` avec `metadata` (JSON) et `file` pour un PDF ou document textuel.

Chaque position reçoit un manifeste indexable, y compris les vidéos sans transcription, les `.webloc` et les six positions réservées. Les ressources sans plein texte restent ainsi recommandables par leurs métadonnées. Une ressource possédant un code bloc/module sans intitulé renvoie `422 metadata_incomplete` et une entrée structurée est écrite dans le journal serveur.

La synchronisation doit transmettre séparément `blockCode`, `blockTitle`, `moduleCode` et `moduleTitle`. Pour le Projet 15, les six intitulés de blocs connus sont restaurés côté serveur si nécessaire ; les intitulés des 46 modules doivent provenir des dossiers Drive et être transmis par le Google Apps Script.

## Compatibilité Google Apps Script V2

Les anciennes routes Cloudflare sont reproduites côté serveur pour permettre une migration sans réécriture du parcours Drive :

- `GET /api/controller/ping` ;
- `POST /api/controller/setup-search` ;
- `GET /api/controller/corpus-stats` ;
- `POST /api/controller/index-document`.

Elles acceptent l’ancien header `X-Campus-Controller-Token`, ainsi que `x-campus-sync-secret` et `Authorization: Bearer`. Les trois formes sont comparées uniquement à `CAMPUS_SYNC_SECRET` côté serveur. L’ancienne indexation JSON `{ key, text }` ou `{ key, contentBase64 }` est acceptée ; une entrée portant la même `key` remplace son rattachement précédent dans le Vector Store afin de limiter les doublons.

## Actifs de marque officiels

Les fichiers PAÏA et MMPA originaux sont conservés sans modification dans `public/brand/`. Les maquettes et le guide graphique reçus sont archivés dans `public/reference/`. Ne jamais convertir, recadrer, recolorer ou écraser les actifs placés dans `public/brand/`.

Les quatre fichiers binaires à déposer manuellement dans `public/brand/`, avec leurs noms d’origine inchangés, sont :

- `01_PAIA_Circulaire_Logo_Principal.png` ;
- `02_PAIA_Circulaire_Logo_Compact.png` ;
- `03_MMPA_Circulaire_Logo.png` ;
- `04_PAIA_Circulaire_Icone.png`.

## Mise en service, dans l’ordre

1. Ajouter les quatre PNG officiels ci-dessus et l’image officielle de Pia attendue dans `public/reference/image_1.png`.
2. Renseigner les cinq variables de `.env.example` dans Vercel pour les environnements Preview concernés.
3. Redéployer la Preview, puis vérifier que `/api/controller/ping` répond avec le secret de synchronisation.
4. Configurer le Google Apps Script avec l’URL de cette Preview et le même `CAMPUS_SYNC_SECRET`.
5. Lancer d’abord le test de raccordement, puis seulement ensuite la synchronisation complète du catalogue.
