# Station d’écriture

Un atelier d’écriture complet qui tourne entièrement dans le navigateur. Pas d’étape de build, pas de compte, rien n’est envoyé sur un serveur.

Quatre modes, chacun avec ses outils :

| Mode | Ce qu’il apporte |
| --- | --- |
| 📖 **Roman** | Classeur Parties / Chapitres / Scènes, mise en forme complète (styles de paragraphe, polices, tailles, couleurs, surlignage, alignements, listes, citations, liens, ruptures de scène ⁂, exposant / indice), retrait de première ligne, texte justifié, tableau de liège des chapitres. |
| 🎬 **Scénario** (cinéma / télé) | Format standard en Courier : en-tête de scène, action, personnage, parenthèse, dialogue, transition, plan, centré, note. **Entrée** et **Tab** enchaînent les éléments comme dans les logiciels pros, **Ctrl+1…9** choisit l’élément. Une ligne qui commence par `INT.` / `EXT.` devient un en-tête de scène. Autocomplétion des personnages, des lieux, des moments de la journée et des transitions. Scènes numérotées, durée estimée (1 page ≈ 1 minute), page de titre, import et export **Fountain**. |
| 🎭 **Théâtre** | Actes, scènes, personnages en scène, didascalies, personnage, réplique, vers. « Acte II » ou « Scène 3 » en début de ligne crée l’élément. Décompte des répliques et des mots par personnage, durée de jeu estimée. |
| 🌳 **Dialogues interactifs** | Graphe de nœuds (réplique + choix) qu’on déplace et qu’on zoome, liens tirés à la souris, conditions et effets sur des variables (`courage >= 2 && !trahi`, `argent -= 5; trahi = vrai`, `{argent}` dans le texte), vérification (impasses, nœuds inaccessibles, variables inconnues), **mode test** jouable, export **JSON**, **Ink**, **Yarn Spinner** et texte lisible. |

## Navigation

- **Plan** : le classeur, avec glisser-déposer, statuts (idée, premier jet, révision, terminé), compteurs de mots, menu contextuel, dupliquer. Un clic sur un dossier ouvre le **tableau de liège** (une fiche par scène, synopsis modifiable, réordonnable).
- **Scènes / Titres / Nœuds** : le plan du document ouvert (en-têtes de scène, actes et scènes, titres de chapitre, nœuds du graphe), avec filtre. On y saute d’un clic et on y monte ou descend des scènes entières. Les annotations y sont listées aussi.
- **Fiches** : personnages, lieux, objets, recherches. Les noms des personnages alimentent l’autocomplétion, et la fiche indique dans quels documents ils apparaissent.
- **Infos** : synopsis, notes et statut du document, **instantanés** (copies figées à restaurer), titre du projet, auteur·e, logline, objectif en mots et échéance (avec le rythme quotidien nécessaire).
- **Ctrl+K** : palette « Aller à… » qui cherche dans les documents, les scènes, les fiches et toutes les actions.

## Confort d’écriture

- Widgets (colonne de droite ; on peut les replier, les réordonner, les masquer) :
  - minuteur de concentration (pomodoro) qui compte les mots écrits pendant la session, avec mode zen automatique si on le souhaite ;
  - objectifs : mots du jour, série de jours, graphique sur 7 jours ;
  - **musique** : on colle un lien YouTube / YouTube Music, Spotify, SoundCloud, Apple Music, Deezer, Mixcloud, Vimeo, Twitch, ou une radio en ligne ; il y a une liste de lecture et un mini-lecteur dans la barre d’état (repris de *solitaire n’ chill*) ;
  - ambiance générée dans le navigateur : pluie, vent, feu de bois, café ;
  - statistiques du document, bloc-notes, horloge, relances d’écriture et générateur de noms.
- Typographie automatique **Québec** ou **France** : guillemets « », apostrophe ’, tiret —, points de suspension …, espaces insécables (France : espaces fines avant ; ! ?).
- Mode **zen** (plein écran, sans interface), défilement **machine à écrire**, paragraphes inactifs estompés, sons de machine à écrire.
- Rechercher / remplacer dans le document ou dans tout le projet, avec un instantané automatique avant un remplacement global.
- Annotations sur un passage (Ctrl+Alt+M), jamais exportées.
- Thèmes Nuit, Encre, Forêt, Papier, Sépia, plusieurs fonds ou une image à vous, couleur d’accent, police, taille, interligne et largeur de la page.
- Sauvegarde automatique dans le navigateur (IndexedDB), et un rappel d’exporter une sauvegarde de temps en temps.

## Exports et imports

PDF (via l’impression, mise en page manuscrit ou scénario), page web, Word (.doc), Fountain, Markdown, texte brut, et **sauvegarde complète .json**, réimportable. L’import accepte une sauvegarde .json, un fichier .fountain (qui devient un projet scénario), ou un fichier .txt / .md / .html (qui devient un document).

## Raccourcis

`Ctrl+K` aller à… · `Ctrl+F` / `Ctrl+H` rechercher / remplacer · `Ctrl+S` enregistrer · `Alt+↑/↓` document précédent / suivant · `Ctrl+\` plan · `Ctrl+.` widgets · `Ctrl+Maj+F` zen · `Ctrl+Maj+E` exporter · `Ctrl+1…9` élément · `F1` aide. Maintenir `Ctrl` affiche les numéros des éléments dans la barre d’outils.

## Lancer / publier

C’est un site statique : servez le dossier en **http(s)** (les lecteurs YouTube refusent de jouer depuis `file://`).

```sh
python3 -m http.server   # puis http://localhost:8000
```

GitHub Pages : **Settings → Pages → Deploy from a branch**, branche par défaut, dossier `/ (root)`.

## Structure

| Fichier | Rôle |
| --- | --- |
| `js/modes.js` | Définition des quatre modes : éléments, enchaînements Entrée / Tab, détection automatique, plan, modèles de départ. |
| `js/editor.js` | Éditeur riche (contenteditable) : barre d’outils, clavier, autocomplétion, typographie, collage nettoyé, annotations, estimations. |
| `js/graph.js` | Dialogues interactifs : mini-langage de conditions et d’effets, graphe, inspecteur, mode test, exports Ink / Yarn / JSON. |
| `js/projects.js` | Modèle de données (classeur, fiches, instantanés) et persistance IndexedDB. |
| `js/nav.js` | Panneau Plan / Scènes / Fiches / Infos et tableau de liège. |
| `js/fountain.js`, `js/exporter.js` | Format Fountain, exports, impression, imports. |
| `js/find.js`, `js/palette.js` | Rechercher / remplacer, palette de commandes. |
| `js/widgets.js`, `js/music.js`, `js/audio.js` | Widgets, lecteur de musique et ambiances (inspirés de *solitaire n’ chill*). |
| `js/app.js`, `js/settings.js`, `js/util.js` | Application, préférences et statistiques, utilitaires. |

Tests : `node tests/logic.test.js` (sans dépendance) et `node tests/app.test.js` (de bout en bout dans Chromium, nécessite `npm i playwright`).
