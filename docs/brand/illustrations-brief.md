# Brief illustrations 3D : univers de l'orpaillage

Pour la page marketing de Pann. Brief à utiliser dans un générateur d'images (OpenAI gpt-image / ChatGPT, Midjourney, Recraft, Ideogram…). Les prompts sont en anglais : les générateurs les suivent mieux.

## 1. Analyse des références

Deux images de référence (stock, filigrane visible) : un orpailleur avec sa batée et des pépites à ses pieds, et un baquet en bois rempli de pièces d'or sous un filet d'or liquide, entouré de rochers.

| Aspect      | Ce qu'on observe                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Rendu       | 3D « jouet » : matières mates et lisses, entre pâte à modeler et figurine en vinyle. Pas de texture réaliste, pas de grain.       |
| Proportions | Style chibi : tête très grosse (environ 40 % de la hauteur), corps trapu, mains simplifiées.                                      |
| Visages     | Très simples : deux yeux en points ou ovales, petit sourire, joues rosées. Barbe et cheveux en volumes lisses, sans mèches.       |
| Formes      | Tout est arrondi : aucun angle vif, bords biseautés. Objets légèrement « gonflés ».                                               |
| Lumière     | Studio douce, une lumière principale en haut à gauche, ombres portées courtes et floues, occlusion ambiante légère.               |
| Matières    | Le décor est mat ; **seul l'or brille** (reflets spéculaires, petits éclats). C'est ce contraste mat / brillant qui attire l'œil. |
| Couleurs    | Chaudes et saturées mais douces : ocres, bruns, ardoise bleutée pour les rochers, or vif. Fond uni pastel (jaune ou crème).       |
| Cadrage     | Objet ou personnage isolé, centré, vue de trois quarts légèrement plongeante (presque isométrique), beaucoup d'espace autour.     |
| Détail      | Peu d'éléments, chacun lisible. Petits « débris » au sol (pépites, sable) pour ancrer la scène.                                   |

Ambiance : chaleureuse, ludique, rassurante. Elle désamorce le côté « outil technique » et raconte l'orpaillage en une image.

## 2. Constantes de style (à coller dans chaque prompt)

```
cute 3D render, stylized toy-like miniature, soft matte clay and vinyl materials, rounded chunky shapes with beveled edges, chibi proportions, simple friendly face with dot eyes, soft studio lighting from top left, soft short shadows, subtle ambient occlusion, only the gold is glossy with small sparkles, warm palette of ochre, warm brown and slate blue with bright golden yellow, plain warm cream background, centered subject, three-quarter view from slightly above, generous empty space around the subject, high detail but minimal clutter
```

Liste d'exclusions (champ « negative prompt » quand l'outil le propose, sinon en fin de prompt : « Avoid: … ») :

```
text, letters, numbers, logo, watermark, signature, UI elements, realistic skin, photorealism, scary or grotesque features, extra fingers, cluttered background, gradient background, harsh shadows, frying pan, food, butter, popcorn, cubic gold blocks
```

Les dernières exclusions viennent de nos essais de logo : une batée vue de profil évoque vite une poêle, et une pépite trop régulière un cube de beurre. Préciser **« shallow wide gold-panning dish with ridged inner rim »** et **« irregular rough gold nuggets »**.

## 3. Palette alignée sur la marque

Les générateurs ne respectent pas les codes hexadécimaux, mais on peut les orienter :

- Fond : « plain warm cream background » (proche de `#f6f3ea`) ou « soft pastel golden yellow background » pour les visuels forts.
- Or : « bright golden yellow » (proche de `#ffc72c`).
- Accents sombres : « deep charcoal » (proche de `#141414`) pour les outils, bottes, détails.

Ensuite, harmoniser dans un éditeur si besoin (balance des blancs, teinte du fond).

## 4. Le personnage récurrent

Un même personnage sur toute la page rend l'ensemble cohérent. Le décrire **toujours avec les mêmes mots** :

```
a small friendly prospector character, chibi proportions, round head, short dark brown hair and a neat dark brown beard, dot eyes, rosy cheeks, gentle smile, mustard yellow t-shirt, olive green apron with charcoal straps, olive trousers, chunky charcoal boots
```

Variantes possibles pour une distribution plus diverse (plusieurs personnages, ou un par section) : changer la coiffure, la pilosité, la carnation, ajouter un foulard ou des lunettes, tout en gardant la tenue (t-shirt moutarde, tablier olive) comme signe d'appartenance.

Pour la constance d'une image à l'autre : générer d'abord une « fiche personnage » (le personnage de face, de trois quarts, de dos, sur fond uni), puis la fournir comme image de référence pour chaque scène (référence d'image dans ChatGPT, `--cref` dans Midjourney, style personnalisé dans Recraft).

## 5. Scènes pour la page marketing

Une scène par idée clé de l'outil. Chaque prompt = constantes de style (section 2) + description de la scène.

| Section         | Idée                      | Description de la scène (en anglais)                                                                                                                                                     |
| --------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Héros           | Pann trouve l'essentiel   | The prospector proudly lifts a shallow wide gold-panning dish; inside, wet sand swirls and one large irregular gold nugget shines with sparkles; a few grains of sand fall from the rim. |
| Collecte        | Beaucoup d'entrées        | Several small wooden pipes and chutes pour streams of sand and water into one big wooden sluice box; tiny glints of gold mixed in the sand.                                              |
| Tri par IA      | Séparer le sable de l'or  | A small wooden sluice with ridges: sand washes away to the left, a few gold nuggets stay caught behind the ridges; a tiny friendly robot-shaped brass lantern helps sorting.             |
| Validation      | Garder les pépites        | The prospector carefully places a gold nugget into a small glass display jar already holding a few nuggets; rejected pebbles sit in a little pile on the side.                           |
| Rédaction       | Mettre en valeur          | A gold nugget on a small velvet cushion next to a tiny quill and a folded paper label (blank, no text).                                                                                  |
| Diffusion       | Partager                  | Little paper planes, each carrying a tiny gold nugget, fly out of a small mine-cart toward the top right.                                                                                |
| Newsletter      | L'essentiel de la semaine | A small wooden crate, lid open, neatly filled with gold nuggets and tied with a charcoal ribbon, ready to be shipped.                                                                    |
| Coûts maîtrisés | Budget                    | A small balance scale: a pile of sand on one side, one gold nugget balancing it on the other.                                                                                            |
| Page vide / 404 | Rien ici                  | The prospector shrugs, looking into an empty gold-panning dish, with a single grain of sand in it.                                                                                       |

Formats : héros en paysage (1536 × 1024 ou 16:9), sections en carré (1024 × 1024) ou en portrait pour le mobile. Demander un **fond transparent** quand l'outil le permet (gpt-image le propose pour le PNG) afin de poser les illustrations sur le fond crème de la page.

## 6. Exemple de prompt complet (héros)

```
Cute 3D render of a small friendly prospector character, chibi proportions, round head, short dark brown hair and a neat dark brown beard, dot eyes, rosy cheeks, gentle smile, mustard yellow t-shirt, olive green apron with charcoal straps, olive trousers, chunky charcoal boots. He proudly lifts a shallow wide gold-panning dish with a ridged inner rim; inside, wet sand swirls and one large irregular rough gold nugget shines with small sparkles; a few grains of sand fall from the rim. A few irregular gold nuggets and pebbles lie at his feet on a small patch of sand.
Stylized toy-like miniature, soft matte clay and vinyl materials, rounded chunky shapes with beveled edges, soft studio lighting from top left, soft short shadows, subtle ambient occlusion, only the gold is glossy, warm palette of ochre, warm brown and slate blue with bright golden yellow, plain warm cream background, centered subject, three-quarter view from slightly above, generous empty space around the subject.
Avoid: text, letters, logo, watermark, photorealism, frying pan, food, butter, cubic gold blocks, cluttered background.
```

## 7. Conseils par outil

- **OpenAI (ChatGPT ou API gpt-image)** : suit bien les descriptions longues et les modifications par conversation (« même personnage, maintenant il… »). Fond transparent possible en PNG. Fournir la fiche personnage en image de référence.
- **Midjourney** : excellent pour ce rendu « jouet 3D ». Ajouter par exemple `--ar 3:2` pour le format, `--cref <url de la fiche personnage>` pour la constance du personnage, `--no text, watermark, food` pour les exclusions.
- **Recraft** : permet de fixer une palette et un style réutilisable sur toute une série, pratique pour la cohérence d'une page.

Vérifier les conditions d'usage commercial de l'outil retenu (droits sur les images générées, mentions éventuelles). Les deux images de référence sont des images de stock avec filigrane : ne pas les réutiliser ni les fournir en référence, ce brief décrit le style sans les copier.

## 8. Accessibilité et intégration

- Images **décoratives** (ambiance) : `alt=""`. Images qui **portent une idée** (le schéma Collecte → Tri → Diffusion) : un texte alternatif court qui dit l'idée, par exemple « Un orpailleur soulève sa batée : au milieu du sable, une seule pépite brille. »
- Jamais de texte important dans l'image : il ne serait ni traduit, ni lisible par les lecteurs d'écran, ni redimensionnable.
- Si une illustration passe derrière du texte, vérifier le contraste du texte (4,5:1) sur la zone la plus claire de l'image, ou poser le texte sur un aplat.
- Animation éventuelle (pépite qui scintille) : courte, et coupée avec `prefers-reduced-motion`.
- Export en WebP ou AVIF, plusieurs tailles (`srcset`), dimensions déclarées pour éviter les sauts de mise en page.
