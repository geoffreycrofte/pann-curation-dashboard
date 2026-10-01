# CONTEXT.md : Pann, outil de curation de veille multi-thèmes

Document de passation pour Claude Code. Rédigé le 30/09/2026, révision 3 du 01/10/2026 (hébergement Cloudflare, stack alignée sur CheckFox, budget, nom et vocabulaire).
Nom de travail : **Pann** (outil) et **Lede** (newsletter). Voir section 11.
Porteur du projet : Geoffrey Crofte (UX/UI designer, dev front-end, auditeur accessibilité, créateur de CheckFox.eu).
Utilisateur unique : Geoffrey. Deux boards prévus à terme.

---

## 1. Objectif

Semi-automatiser une veille thématique, en commençant par l'**accessibilité numérique**, puis d'autres thèmes (IA, UX Design…).

Le flux cible :

1. **Collecter** régulièrement des actualités, mises à jour légales, outils et ressources.
2. **Afficher** ces items dans un board de tri, par thème.
3. **Valider** manuellement une partie des items pour constituer une top-list.
4. **Diffuser** la top-list automatiquement :
   - réseaux sociaux (LinkedIn, Bluesky, Mastodon, W Social) à raison de 1 à 2 posts par jour ;
   - newsletter hebdomadaire en mode digest (liste complète de la semaine).
5. **Publier** les items validés dans un espace « veille » public sur checkfox.eu (bibliothèque de liens avec résumé).

### Contraintes fonctionnelles

- **Bilingue FR / EN** : les sources peuvent être en anglais, mais toutes les communications sortantes (posts, newsletter, résumés publics) existent en français et en anglais.
- **Pas de reproposition** : un item déjà sélectionné ne revient pas dans le board. Exception : les **outils**, moins sensibles au temps, peuvent revenir s'ils évoluent (nouvelle version, changement notable).
- **Validation humaine obligatoire** avant toute publication. Rien ne sort sans passage par le board.
- L'outil est **indépendant de CheckFox**, mais alimente automatiquement l'espace veille de CheckFox.

---

## 2. Briques identifiées

| Besoin | Outil pressenti | Remarque |
|---|---|---|
| Recherche web sémantique planifiée | Exa (exa.ai) | Requêtes paramétrées par thème, contenu des pages inclus |
| Sources institutionnelles / blogs | Flux RSS / Atom | Complément indispensable à Exa, notamment pour le légal. Gratuit |
| Veille outils | API GitHub (releases, topics) | Sert aussi à détecter l'évolution d'un outil |
| Résumés, classification, posts | API Claude (Haiku + Sonnet) | Voir section 5 |
| Publication LinkedIn + Bluesky | Zernio (API / MCP, déjà connecté) | Zernio ne supporte pas Mastodon ni W |
| Publication Mastodon | API Mastodon directe | Simple (token d'application, champ `language` natif) |
| Publication W Social | À vérifier | W repose sur l'AT Protocol, mais aucune API de publication documentée trouvée au 30/09/2026 |
| Newsletter | Brevo | Listmonk écarté : non hébergeable sur Cloudflare. Voir section 7 |

Sources consultées le 30/09/2026 :
- Plateformes Zernio : https://docs.zernio.com/platforms (LinkedIn, Bluesky listés ; pas de Mastodon ni W).
- W et AT Protocol : https://www.journaldugeek.com/2026/06/18/le-reseau-social-europeen-w-veut-remplacer-x-delon-musk-et-obtient-la-validation-de-lunion-europeenne/

⚠️ Tâche Claude Code : vérifier l'existence d'une API de publication W, et si W est compatible avec les clients Bluesky / AT Protocol (auquel cas l'adaptateur Bluesky pourrait être réutilisé).

---

## 3. Architecture : outil neutre, multi-thèmes

Le thème n'est **jamais codé en dur**. Tout ce qui est propre à l'accessibilité est de la **configuration** rattachée à un `topic`.

### Principe

Un `topic` (board) porte :
- ses sources (flux RSS, requêtes Exa, recherches GitHub) ;
- ses catégories (ex. accessibilité : actu, légal, outil, ressource ; IA : modèle, recherche, outil…) ;
- ses prompts IA (critères de pertinence, vocabulaire, règles éditoriales) ;
- ses canaux de diffusion (comptes sociaux, liste newsletter, cible de publication CheckFox ou autre) ;
- son rythme (nombre de posts par jour, créneaux, jour du digest) ;
- ses langues de sortie (par défaut `["fr", "en"]`) ;
- son **plafond de coût mensuel** (voir section 8).

Un **item est unique par URL canonique** à l'échelle de l'outil, et peut être rattaché à plusieurs topics (table de liaison). Un article sur l'IA appliquée à l'accessibilité peut ainsi apparaître dans deux boards sans doublon, et sans être traité deux fois par l'IA.

### Modèle de données (esquisse)

```
topics            id, slug, name_fr, name_en, config (jsonb), monthly_budget, active
sources           id, topic_id, type (rss|exa|github), config (jsonb), last_run_at
items             id, canonical_url (unique), title, source_lang, fetched_content,
                  published_at, discovered_at, kind (news|legal|tool|resource),
                  change_signature (outils : tag de release, hash)
item_topics       item_id, topic_id, relevance_score, status
                  (new|validated|rejected|published|archived), validated_at
summaries         item_id, lang, summary, key_excerpt, model, prompt_version, edited_by_human
posts             id, item_id, topic_id, channel, lang, body, status
                  (draft|scheduled|sent|failed), scheduled_at, external_id
digests           id, topic_id, lang, period_start, period_end, status, external_id
publications      id, item_id, target (checkfox|…), status, external_id, published_at
usage_log         id, topic_id, provider (anthropic|exa), model, units, cost_usd, created_at
```

### Règle anti-reproposition

- Normalisation d'URL avant insertion (suppression des paramètres UTM, fragments, slash final, http → https).
- Déduplication de second niveau sur le titre : `pg_trgm` suffit pour le MVP. Des embeddings (pgvector) peuvent venir plus tard si nécessaire.
- Un item `published` ou `rejected` est verrouillé.
- Pour `kind = tool` : si `change_signature` change (nouvelle release GitHub, changelog modifié), l'item repasse en `new` avec un badge « déjà publié le JJ/MM/AAAA, mis à jour depuis ».

### Diffusion : file d'attente par créneaux

- Chaque topic définit des créneaux (ex. 9 h et 16 h, heure de Luxembourg).
- À la validation, l'IA génère les brouillons de posts par canal et par langue. Geoffrey peut les modifier dans le board.
- Un planificateur prend le prochain item validé non publié et l'affecte au prochain créneau libre.
- Stratégie bilingue par canal (à confirmer, voir section 10) :
  - LinkedIn : un post bilingue possible ;
  - Bluesky et Mastodon : un post par langue (limites de caractères, champ langue).
- Digest hebdomadaire : tous les items validés de la semaine, une édition FR et une édition EN.

---

## 4. Publication automatique vers CheckFox (outil indépendant)

Stack CheckFox déclarée par Geoffrey : API via **Supabase Edge Functions**, front Vue + Radix (à confirmer dans le dépôt CheckFox), fichiers sur VPS, CI/CD GitHub.

### Recommandation principale : push vers une Edge Function d'ingestion

- Créer dans CheckFox une Edge Function `veille-ingest` (ex. `POST /functions/v1/veille-ingest`).
- Authentification : token dédié (secret partagé), **pas** la clé `service_role` de CheckFox. Signature HMAC du corps de requête en plus.
- L'outil de veille pousse chaque item au passage au statut choisi (`validated` ou `published`, voir section 10).
- Charge utile : identifiant externe stable, URL, titre, catégorie, résumés FR et EN, date, tags, topic.
- **Idempotence** : upsert sur l'identifiant externe côté CheckFox. Un item modifié (outil mis à jour, résumé corrigé) est simplement renvoyé.
- Dépublication : champ `status: unpublished` sur le même endpoint.
- Côté CheckFox, table dédiée (ex. schéma `veille`) avec RLS en lecture publique pour les items publiés.

### Filet de sécurité : flux public

- L'outil expose un flux JSON Feed (ou Atom) par topic et par langue, servi par un Worker avec cache.
- Utile pour une resynchronisation complète et pour d'autres consommateurs (lecteurs RSS du public).

### MCP : complément, pas le canal principal

- Un serveur MCP sur l'outil de veille est pertinent pour la **curation conversationnelle** (« montre-moi les items légaux de la semaine », « valide les trois premiers », « rédige le post LinkedIn »). Cloudflare permet d'héberger un serveur MCP distant sur Workers.
- Il ne remplace pas l'API pour la publication automatique : l'automatisation doit fonctionner sans session IA ouverte.

---

## 5. Comportement de l'IA

### Pipeline en deux niveaux

1. **Tri (Haiku)**, appliqué à chaque item collecté :
   - détection de langue ;
   - classification (`kind`) ;
   - score de pertinence 0 à 100 selon les critères du topic ;
   - détection de contenu commercial ou promotionnel ;
   - sortie JSON stricte ;
   - contenu tronqué (ex. 1 500 premiers tokens) : le tri n'a pas besoin de l'article entier.
   Les items sous un seuil configurable sont archivés sans apparaître dans le board (mais restent consultables).
2. **Rédaction (Sonnet)** : moment d'appel configurable par topic, selon le budget (section 8) :
   - `on_validate` : seulement à la validation (économique) ;
   - `on_display` : pour tout item au-dessus du seuil de pertinence (confortable).
   Produit : résumé FR et EN, un extrait verbatim court de la source, brouillons de posts par canal et par langue.

Identifiants de modèles (vérifier sur https://platform.claude.com/docs avant implémentation) : `claude-haiku-4-5-20251001` pour le tri, `claude-sonnet-5-5` pour la rédaction. Les rendre configurables par topic, avec possibilité de basculer la rédaction sur Haiku.

Optimisations :
- **Prompt caching** du pré-prompt (identique pour tous les items d'un topic).
- **Batch API** pour le tri (non urgent, -50 %).
- Journaliser chaque appel dans `usage_log` pour suivre le coût réel.

### Pré-prompt de rédaction : règles à intégrer

Inspirées des protocoles éditoriaux de Geoffrey (`grounding.md` et `voice.md`) :

**Véracité**
- Résumer **uniquement** à partir du contenu récupéré de la source, jamais de mémoire.
- Aucun chiffre, date, numéro de critère ou d'article qui ne figure pas dans le contenu fourni.
- Distinguer directive européenne et transposition nationale ; nommer le pays.
- Pour un référentiel, citer la version exacte (RGAA 4.1 et RGAA 5 ne sont pas interchangeables).
- Si le contenu est insuffisant (paywall, page vide), renvoyer `"insufficient_content": true` au lieu de combler.
- Signaler la nature de la source : institutionnelle, presse, commerciale. Une source commerciale décrit ce que l'entreprise affirme d'elle-même, pas un fait.
- `key_excerpt` : 25 mots maximum, verbatim, dans la langue d'origine.

**Style**
- Résumé : 2 à 3 phrases, phrases courtes, ton factuel.
- FR et EN rédigés chacun **nativement**, pas traduits mot à mot.
- Français : jamais de tiret cadratin (—) ni de double tiret, espace insécable avant `! ? : ;`.
- Inclusivité : pas de point médian, formulations neutres privilégiées (« l'équipe de développement »), « personne handicapée » ou « personne en situation de handicap ».
- Expressions bannies : « personne avec des besoins spécifiques » (et variantes), « au jour d'aujourd'hui ».
- Pas de paraphrase proche de la source : résumé reformulé, lien vers l'original.

**Format de sortie**
```json
{
  "summary_fr": "…",
  "summary_en": "…",
  "key_excerpt": "…",
  "source_type": "institutional|regulatory|primary|expert|press|commercial",
  "insufficient_content": false,
  "posts": {
    "linkedin": { "fr": "…", "en": "…" },
    "bluesky":  { "fr": "…", "en": "…" },
    "mastodon": { "fr": "…", "en": "…" }
  }
}
```

Versionner les prompts (`prompt_version` stocké avec chaque résumé) pour pouvoir comparer et régénérer.

---

## 6. Stack technique recommandée

Principe : **s'aligner sur CheckFox** pour mutualiser les compétences, les composants et les outils (Supabase, Vue, Radix, CI GitHub).

| Couche | Recommandation | Pourquoi |
|---|---|---|
| Langage | TypeScript partout | Un seul langage, types partagés |
| Organisation | Monorepo (pnpm workspaces) | `apps/board`, `apps/worker`, `packages/shared` |
| Board | Vue 3 + Vite, composants Radix pour Vue (Reka UI, à aligner sur ce qu'utilise CheckFox) | Réutilisation des composants et habitudes CheckFox. React reste possible, sans bénéfice particulier ici |
| Données côté board | Pinia Colada ou TanStack Query (Vue) | Cache et synchronisation des listes |
| API | Hono sur Cloudflare Workers | Léger, typé, conçu pour Workers |
| Jobs | Cron Triggers + Cloudflare Queues (ou Workflows pour un pipeline multi-étapes avec reprises) | Voir section 7 |
| Base | Supabase Postgres, projet séparé de CheckFox, région UE | Même techno que CheckFox, `pg_trgm`, pgvector, RLS |
| Accès base depuis Workers | Hyperdrive + Drizzle, ou supabase-js | Hyperdrive gère le pooling de connexions vers Postgres |
| Auth board | Cloudflare Access devant le board et l'API | Zéro code d'auth pour un utilisateur unique |
| CI/CD | GitHub Actions : `wrangler deploy` + `supabase db push` | Même logique que CheckFox |

Alternative écartée : D1 (SQLite de Cloudflare). Plus intégré, mais pas de `pg_trgm` ni de pgvector, et cela ferait deux technos de base de données entre CheckFox et la veille.

---

## 7. Hébergement : Cloudflare

**Faisabilité : très bonne**, à condition de découper les traitements en petites unités.

### Pourquoi ça tient

- Le calcul lourd (IA, recherche) passe par des API externes. Sur Workers, **l'attente réseau n'est pas du temps CPU facturé ni limité** : un appel Claude de 20 secondes ne consomme presque pas de CPU.
- Plan Workers Paid : 5 $/mois minimum, 10 millions de requêtes et 30 millions de ms CPU inclus. Jusqu'à 15 minutes de CPU par invocation de Cron Trigger ou de consommateur de Queue. Largement suffisant (source : https://developers.cloudflare.com/workers/platform/pricing/, consulté le 30/09/2026).
- Board statique servi gratuitement (assets statiques illimités).

### Découpage recommandé

```
Cron (par source, ex. toutes les 6 h)
  → Worker "collect" : interroge RSS / Exa / GitHub, normalise, déduplique, insère
  → Queue "triage" : un message par nouvel item → Haiku → score, statut
  → Queue "draft" (si on_display) : Sonnet → résumés
Board (action "valider")
  → API → Queue "draft" (si on_validate) → brouillons de posts
Cron (créneaux de publication)
  → Worker "publish" : Zernio / Mastodon / W, puis push vers CheckFox
Cron (hebdomadaire)
  → Worker "digest" : campagne Brevo FR + EN
```

Chaque message de Queue est idempotent et rejouable. Les échecs vont dans une dead-letter queue visible dans le board.

### Points de vigilance

- **Pages rendues en JavaScript** : un simple `fetch` ne suffit pas. Privilégier le contenu renvoyé par Exa ; en dernier recours, Cloudflare Browser Rendering (coût supplémentaire).
- **Compatibilité des SDK** : activer `nodejs_compat`. Vérifier que les SDK Anthropic, Zernio et Mastodon fonctionnent sur Workers, sinon appeler les API REST en `fetch`.
- **Newsletter** : Listmonk n'est pas hébergeable sur Workers. Recommandation : **Brevo** (entreprise française, API de campagnes, formulaires double opt-in, désinscription gérée). Limites du plan gratuit à vérifier.
- **Supabase gratuit** : un projet inactif peut être mis en pause, mais les crons quotidiens maintiennent l'activité. Nombre de projets gratuits limité : vérifier selon le plan actuel de CheckFox.
- **Souveraineté** : Supabase en région UE, Cloudflare configuré avec les options de localisation des données si nécessaire.

### Rôle restant du VPS

Aucun pour cet outil. Il garde son rôle actuel pour CheckFox.

---

## 8. Budget : deux scénarios (1 utilisateur, 2 boards)

Hypothèses de tarifs (consultés le 30/09/2026) :
- Claude Haiku 4.5 : 1 $ / million de tokens en entrée, 5 $ / million en sortie (https://platform.claude.com/docs/en/about-claude/pricing).
- Claude Sonnet 5.5 : ⚠️ NON VÉRIFIÉ. Hypothèse de calcul : 3 $ / 15 $ (tarif historique de la gamme Sonnet). À confirmer sur la page officielle.
- Batch API : -50 %. Prompt caching : lecture du cache facturée environ 10 % du prix d'entrée.
- Exa : 7 $ / 1 000 recherches, contenu de 10 résultats inclus (https://exa.ai/docs/changelog/pricing-update, 03/03/2026). Crédit gratuit mensuel de 10 $ selon une source secondaire, à vérifier.
- Cloudflare Workers Paid : 5 $/mois.

Les montants sont en dollars ; compter à peu près autant en euros, un peu moins.

### Scénario A : environ 20 €/mois

| Poste | Hypothèse de volume (2 boards cumulés) | Estimation |
|---|---|---|
| Exa | 10 recherches/jour → 300/mois | ~2 $ (possiblement couvert par le crédit gratuit) |
| Tri Haiku (batch) | 60 items/jour → 1 800/mois, ~2 500 tokens entrée, 200 sortie | ~3 $ |
| Rédaction Sonnet | `on_validate`, 5 items validés/jour → 150/mois, ~5 000 entrée, 1 500 sortie | ~6 $ |
| Cloudflare | Plan Paid | 5 $ |
| Supabase | Plan gratuit | 0 $ |
| Brevo, Zernio, Mastodon | Plans gratuits (limites à vérifier) | 0 $ |
| **Total** | | **~16 $** |

Compromis : collecte moins fréquente (1 à 2 fois par jour), résumés uniquement après validation, donc le board n'affiche que titre + score + extrait avant décision. Marge faible si les plans gratuits Zernio ou Brevo ne suffisent pas.

### Scénario B : environ 100 €/mois

| Poste | Hypothèse de volume (2 boards cumulés) | Estimation |
|---|---|---|
| Exa | 60 recherches/jour → 1 800/mois, + quelques recherches Deep hebdomadaires | ~15 $ |
| Tri Haiku | 250 items/jour → 7 500/mois, en temps réel | ~26 $ (~13 $ en batch) |
| Rédaction Sonnet | `on_display`, 40 items/jour au-dessus du seuil → 1 200/mois, résumés seuls (~4 000 entrée, 400 sortie) | ~22 $ |
| Posts Sonnet | à la validation, 150/mois | ~6 $ |
| Cloudflare | Plan Paid (+ éventuellement Browser Rendering) | 5 à 10 $ |
| Supabase | Plan Pro (sauvegardes quotidiennes, pas de pause) | ~25 $ ⚠️ à vérifier, peut être mutualisé avec l'organisation CheckFox |
| Brevo / Zernio | Plans payants d'entrée de gamme si besoin | marge restante |
| **Total** | | **~85 à 100 $** |

Confort : collecte toutes les 4 à 6 heures, résumés prêts dans le board avant décision, meilleure couverture des sources, sauvegardes gérées.

### Recommandation

Démarrer sur le **scénario A** avec les paramètres configurables par topic (`frequency`, `draft_mode`, modèles), puis monter en gamme en regardant `usage_log` après un mois réel. Implémenter un **plafond de coût mensuel par topic** : au-delà, le tri continue sur Haiku, la rédaction automatique se suspend.

---

## 9. Plan de livraison (MVP d'abord)

1. **Socle** : monorepo, projet Supabase, migrations, config d'un premier topic « accessibilité », Worker Hono, Cloudflare Access.
2. **Collecte** : adaptateurs RSS, Exa, GitHub ; normalisation d'URL ; déduplication ; Cron + Queues.
3. **Tri IA** (Haiku) + board avec filtres, statuts, validation.
4. **Rédaction IA** (Sonnet) des résumés et brouillons de posts, éditables dans le board. `usage_log` et plafond de coût.
5. **Publication CheckFox** (Edge Function d'ingestion côté CheckFox + flux JSON).
6. **Diffusion sociale** : Zernio (LinkedIn, Bluesky), Mastodon direct, W si faisable ; planificateur par créneaux.
7. **Newsletter** hebdomadaire via Brevo.
8. **Second topic** activé (le modèle de données le permet dès l'étape 1).
9. Optionnel : serveur MCP de curation sur Workers.

Les étapes 1 à 4 rendent l'outil utile dès la première semaine, même sans diffusion.

### Sources de départ pour le topic « accessibilité » (à compléter)

- W3C WAI (actualités, publications WCAG)
- Publications officielles françaises (DINUM / numerique.gouv.fr, RGAA)
- EUR-Lex pour la directive (UE) 2019/882 (EAA) et textes associés
- Sources luxembourgeoises (RAWeb, RAAM, RAPDF)
- Blogs d'expertise et associations d'usagers
- Recherches GitHub : topics `accessibility`, `a11y`, `wcag`

⚠️ URLs des flux à récupérer et vérifier une à une (ne pas les deviner).

---

## 10. Questions ouvertes

Réglées :
- ~~Stack CheckFox~~ : Supabase Edge Functions, Vue + Radix, VPS pour les fichiers, CI/CD GitHub.
- ~~Hébergement~~ : Cloudflare.
- ~~Budget~~ : deux scénarios évalués, démarrage sur A.

Restantes :
1. **Vérifier dans le dépôt CheckFox** la bibliothèque Vue exacte (Reka UI, Radix Vue, autre) et le plan Supabase actuel.
2. **Moment de publication sur CheckFox** : tous les items validés, ou seulement ceux diffusés sur les réseaux ?
3. **Stratégie bilingue sur LinkedIn** : un post bilingue, deux posts, ou deux comptes / pages ?
4. **Créneaux de publication** et jour / heure du digest.
5. **Newsletter** : une liste par langue ou une liste avec préférence de langue ?
6. **W Social** : API disponible ? Compatibilité AT Protocol exploitable ?
7. **Tarif Sonnet 5.5** à confirmer ; limites des plans gratuits Zernio et Brevo.
8. **Fréquence de collecte** par type de source (le légal peut être quotidien, les outils hebdomadaires).
9. **Disponibilité des noms** Pann et Lede : domaines, comptes sociaux (Bluesky, Mastodon, LinkedIn), marques déposées dans la classe de services concernée. Rien n'a été vérifié.

---

## 11. Identité : nom, vocabulaire, charte

### Noms (favoris de Geoffrey, non définitifs tant que la disponibilité n'est pas vérifiée)

- **Pann** : l'outil. Référence à l'orpaillage (*gold panning*) : on lave beaucoup de sable pour ne garder que les pépites. C'est la métaphore de la veille : beaucoup de collecte, peu de sélection.
- **Lede** : la newsletter hebdomadaire. En journalisme anglophone, le *lede* est l'information essentielle placée en tête d'article ; le digest est l'essentiel de la semaine.

Catégorie de produit : « outil de curation de veille » (FR), « content curation tool » (EN).

### Vocabulaire produit

La métaphore de l'orpaillage peut structurer l'interface et les communications. Proposition à valider avec Geoffrey avant d'en faire des libellés définitifs :

| Concept technique | FR | EN |
|---|---|---|
| Item validé | pépite | nugget |
| Top-list en attente de diffusion | batée | pan |
| Topic / board | à définir (ex. « filon ») | à définir (ex. « vein ») |

Règles :
- Le **code** (tables, statuts, API) garde des noms techniques neutres (`items`, `validated`, `topics`). La métaphore ne vit que dans l'interface et les textes, pour ne pas compliquer la maintenance ni l'ajout de nouveaux thèmes.
- Les libellés d'interface sont centralisés dans des fichiers de traduction FR / EN dès le départ, puisque l'outil est bilingue.
- Un libellé métaphorique ne doit jamais être la seule information : un bouton « Garder la pépite » reste compréhensible par son contexte, sinon préférer « Valider ».

### Charte graphique

- Couleur principale : **jaune / or**, en écho aux pépites.
- ⚠️ Contraste : le jaune vif atteint rarement 4,5:1 sur fond blanc. Prévoir :
  - une teinte or foncée pour le texte, les liens et les icônes porteuses de sens sur fond clair ;
  - le jaune vif réservé aux fonds, aplats et éléments décoratifs, avec du texte sombre dessus ;
  - des tokens de couleur vérifiés en contraste (texte normal 4,5:1, grand texte et composants d'interface 3:1) en thème clair et sombre.
- Le board doit lui-même être exemplaire en accessibilité : c'est un outil de veille accessibilité.

