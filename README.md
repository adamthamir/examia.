# EXAMIA — Le générateur intelligent de QCM

EXAMIA transforme vos cours (PDF, PowerPoint, Word, images) en QCM d'entraînement de style examen
(facultés de sciences de la santé, format inspiré de l'UM6SS), puis simule l'épreuve : chronomètre,
navigation, validation définitive, note sur 20, correction détaillée et suivi de vos points faibles.

> Les questions sont des **questions d'entraînement originales** construites à partir de vos documents.
> EXAMIA ne prétend pas reproduire des sujets officiels.

## Démarrage

Prérequis : **Node.js ≥ 22.13** (utilise le module SQLite intégré à Node, sans dépendance native).

```bash
npm install
cp .env.example .env        # puis renseignez ANTHROPIC_API_KEY
npm run dev                 # API sur :3001 + interface sur http://localhost:5173
```

Production (un seul processus qui sert l'API et l'interface compilée) :

```bash
npm run build
npm start                   # http://localhost:3001
```

Sans clé d'API, l'application fonctionne en **mode démo** : un générateur local fabrique des questions
à trous et des affirmations altérées tirées mot pour mot du cours (utile pour tester, pédagogiquement limité).

## Mise en ligne (application installable)

EXAMIA est une **PWA** : une fois en ligne, elle s'installe depuis le navigateur
(« Ajouter à l'écran d'accueil » sur téléphone, icône d'installation sur ordinateur).

**Render (recommandé)** — le fichier `render.yaml` décrit tout le service :

1. Poussez ce dépôt sur GitHub.
2. Sur Render : *New → Blueprint* → choisissez le dépôt.
3. Renseignez `ANTHROPIC_API_KEY` et `EXAMIA_ACCESS_CODE` quand Render les demande.
4. Ouvrez l'adresse `https://examia-xxxx.onrender.com`, saisissez le code, puis installez l'application.

Un **disque persistant** est indispensable (base SQLite + fichiers importés) : sans lui, les données
sont effacées à chaque redémarrage. Il faut donc une offre payante (plan *Starter* + disque) ;
vérifiez les tarifs actuels sur render.com.

**Autres hébergeurs** (Railway, Fly.io, VPS) : utilisez le `Dockerfile` et montez un volume sur `/data`.

> En ligne, définissez toujours `EXAMIA_ACCESS_CODE` : sans lui, toute personne connaissant
> l'adresse pourrait utiliser l'application et consommer votre crédit IA.

## Fonctionnalités (MVP)

| Domaine | Ce qui est livré |
|---|---|
| Import | Glisser-déposer multi-fichiers : PDF, PPTX (diapositives + notes), DOCX (découpé par titres), PNG/JPG/WEBP, TXT |
| Extraction | Texte découpé en **sections citables** (page, diapositive, titre). PDF scannés et images transcrits par Claude ; OCR Tesseract en mode démo |
| Bibliothèque | Matières → chapitres → documents ; renommer, reclasser, consulter et rechercher dans le texte extrait |
| Génération | Matière, chapitre ou cours entier, sélection fine des documents ; 10/20/30/50/100 questions ; 4 niveaux ; réponse unique ou multiple ; barème tout-ou-rien ou partiel |
| Questions | Énoncé, 4 propositions A–D, bonne(s) réponse(s), correction détaillée, explication pédagogique, justification de chaque proposition, référence (document + page/diapositive) |
| Fidélité au cours | Chaque question cite ses blocs sources ; une question sans source vérifiable ou mobilisant une notion absente du cours est **signalée « hors cours »** |
| Examen | Chronomètre (45–120 s/question), une question à la fois, palette de navigation, marquage, raccourcis clavier, sauvegarde automatique et reprise, validation définitive, envoi automatique à la fin du temps. Les corrections ne quittent pas le serveur avant la validation |
| Entraînement | Sans chronomètre, correction immédiate question par question |
| Résultats | Note /20, %, justes/fausses/sans réponse, durée, réussite par chapitre (maîtrisés / à consolider / à retravailler), correction filtrable |
| Tableau de bord | Moyenne, meilleure note, évolution des notes, points faibles agrégés, derniers examens/QCM/cours |

## Architecture

```
server/                  API Express (TypeScript, exécuté par tsx)
  config.ts              configuration (.env) — la clé API ne sort jamais du serveur
  db.ts                  schéma SQLite (tables users, subjects, chapters, documents, quizzes, attempts)
  repo.ts                accès aux données, toutes les requêtes filtrées par user_id
  extract/               extraction PDF (unpdf), PPTX (jszip), DOCX (mammoth), images
  ai/
    types.ts             interface QuizAIProvider — contrat pour brancher un autre fournisseur
    prompt.ts            prompt système « style examen », schéma JSON des questions
    anthropic.ts         Claude : sorties structurées, lots parallèles, cache du cours, repli serveur en cas de refus
    demo.ts              générateur local sans IA
  generation.ts          tâche de fond : lots → validation/normalisation → complément → sauvegarde
  scoring.ts             notation (tout-ou-rien, ou discordances 1 / 0,5 / 0,2 / 0)
  routes/                bibliothèque, QCM & examens, statistiques
shared/types.ts          types partagés client/serveur
src/                     interface React (Vite) — pages, composants, design system (styles.css)
```

### Génération par IA

- Le cours est envoyé sous forme de blocs `<bloc ref="D1-S4" …>` ; le modèle doit citer les références utilisées.
  Le serveur reconstruit la référence lisible et le chapitre à partir de ces identifiants (pas de référence inventée).
- Les demandes de plus de 20 questions sont découpées en lots ; chaque lot se concentre sur une partie du cours
  et reçoit la liste des énoncés déjà produits pour éviter les doublons. Le premier lot amorce le **cache de prompt**,
  ce qui rend les lots suivants nettement moins coûteux.
- Sortie contrainte par **JSON Schema** (structured outputs), puis validation serveur : 4 propositions, bonnes
  réponses cohérentes avec le format, sinon la question est rejetée et un lot de complément est demandé.
- Modèle et effort de raisonnement configurables (`EXAMIA_MODEL`, `EXAMIA_EFFORT`).

### Sécurité

- `ANTHROPIC_API_KEY` est lue uniquement par le processus Node ; l'interface ne connaît que l'état « connecté / démo ».
- Pendant un examen, l'API ne renvoie ni les bonnes réponses ni les corrections ; la note est calculée côté serveur.
- Types de fichiers en liste blanche, taille limitée (`MAX_UPLOAD_MB`), limitation du nombre de générations par minute.

### Évolutions prévues par l'architecture

- **Comptes** : remplacer `userId()` dans `server/routes/util.ts` par la lecture d'une session/JWT ; la table `users`
  et la colonne `user_id` existent déjà sur toutes les données.
- **Abonnements / paiements** : colonne `users.plan` prête ; ajouter des quotas dans `routes/quizzes.ts` (point
  unique de création des QCM) et un webhook de paiement.
- **Autre fournisseur d'IA** : implémenter `QuizAIProvider` et l'enregistrer dans `server/ai/index.ts`.
- **Base de données** : `repo.ts` isole tout le SQL ; un passage à PostgreSQL ne touche que ce fichier et `db.ts`.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | API (rechargement auto) + interface Vite |
| `npm run build` | Compile l'interface dans `dist/` |
| `npm start` | Sert l'API et l'interface compilée |
| `npm run typecheck` | Vérification TypeScript |
