# Publier sur les réseaux : intégration maison ou Zernio en mode plateforme

Étude du 2026-11-12. Les prix et conditions viennent des pages officielles quand elles étaient lisibles (docs.x.com, zernio.com/pricing, docs Microsoft Learn de LinkedIn, docs Meta) ; les points tirés de guides tiers sont signalés. À revérifier avant de décider : ces conditions changent souvent.

## En bref

- **Le coût de Zernio n'est pas le problème** : les 2 premiers comptes sont gratuits, puis 6 $, 3 $ ou 1 $ par compte et par mois selon le volume. Pour un produit SaaS, compter de 3 à 7 $ par client actif.
- **Ce que Zernio fait vraiment gagner, ce sont les validations** : LinkedIn (pages entreprise), Meta (Facebook, Threads, Instagram) et X demandent une application validée, une entité légale, des démonstrations filmées et des semaines d'attente. Zernio les a déjà.
- **Ce qui est ouvert, gratuit et simple se fait très bien en direct** : Mastodon (déjà fait), Bluesky, Discord.
- **X coûte cher pour Pann, avec ou sans Zernio** : 0,20 $ par post contenant un lien, et tous les posts de Pann en contiennent un.
- **Recommandation** : un modèle hybride. En direct pour Bluesky, Mastodon et Discord ; Zernio pour LinkedIn, Facebook, Threads et X. Pour le SaaS, Zernio en mode plateforme pour ces derniers, ce qui réduit aussi le nombre de comptes facturés par Zernio.

## Aujourd'hui dans Pann

- **Zernio, clé par espace de travail** : chaque utilisateur ouvre son compte Zernio, y connecte ses réseaux, paie Zernio et, pour X, les appels refacturés. Pann garde la clé dans le Vault et publie avec.
- **Mastodon en direct** : jeton de l'utilisateur sur son instance, gratuit.

## Réseau par réseau

| Réseau                    | Accès à l'API                                                      | Validation                                                                                | Jetons                                                                                      | Coût de l'API                              | Effort en direct                                              |
| ------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| Mastodon                  | Ouvert, par instance                                               | Aucune                                                                                    | Jeton d'application, sans expiration                                                        | Gratuit                                    | Fait                                                          |
| Bluesky                   | Ouvert (AT Protocol) : mot de passe d'application ou OAuth         | Aucune                                                                                    | Session à rafraîchir                                                                        | Gratuit                                    | Faible                                                        |
| Discord                   | Webhook de salon (une adresse à coller)                            | Aucune (droit « gérer les webhooks » sur le serveur)                                      | Aucun : l'adresse fait office de clé                                                        | Gratuit                                    | Très faible                                                   |
| LinkedIn, profil          | Produit « Share on LinkedIn » en libre-service (`w_member_social`) | Légère                                                                                    | 60 jours, sans jeton de rafraîchissement hors partenaires : reconnexion tous les 2 mois     | Gratuit                                    | Moyen                                                         |
| LinkedIn, page entreprise | Community Management API (`w_organization_social`)                 | Demande d'accès, entité légale, palier « Standard » à obtenir (guides tiers)              | Idem, rafraîchissement réservé aux partenaires                                              | Gratuit                                    | Élevé                                                         |
| X                         | OAuth 2, compte développeur avec carte                             | Légère                                                                                    | Rafraîchissables                                                                            | **0,015 $ par post, 0,200 $ avec un lien** | Moyen                                                         |
| Facebook (Page)           | Graph API, `pages_manage_posts`                                    | Revue d'application Meta avec vidéo, vérification d'entreprise (souvent 10 jours et plus) | Jeton de Page sans expiration, mais invalidé par un changement de mot de passe ou de droits | Gratuit                                    | Élevé                                                         |
| Threads                   | Threads API, `threads_content_publish`                             | Revue d'application Meta                                                                  | Jetons longs, à rafraîchir                                                                  | Gratuit                                    | Élevé                                                         |
| Instagram                 | Graph API                                                          | Revue Meta                                                                                | Idem Facebook                                                                               | Gratuit                                    | Hors sujet : une image est obligatoire, Pann n'en produit pas |
| W                         | Pas d'API publique connue (dépôt public retiré selon la presse)    | Aucune info                                                                               | Aucune info                                                                                 | Aucune info                                | Impossible pour l'instant                                     |

« Effort en direct » est une estimation : _faible_ tient en un à deux jours, _moyen_ en deux à quatre jours plus la gestion des reconnexions, _élevé_ ajoute des semaines de validation qui ne dépendent pas de nous.

## Les coûts

### Zernio (même grille en clé par espace et en mode plateforme)

Vérifié sur zernio.com/pricing : facturation au compte connecté, toutes fonctions incluses, publications illimitées.

| Comptes connectés | Prix par compte et par mois |
| ----------------- | --------------------------- |
| 1 à 2             | Gratuit                     |
| 3 à 10            | 6 $                         |
| 11 à 100          | 3 $                         |
| 101 et plus       | 1 $                         |

X est refacturé au prix d'X, sans marge.

- **Aujourd'hui (clé par espace)** : c'est l'utilisateur qui paie. Avec LinkedIn, Bluesky, X et une Page Facebook, il a 4 comptes, soit 2 gratuits et 2 à 6 $ : 12 $ par mois, plus X.
- **Mode plateforme** : c'est Pann qui paie, pour tous ses clients. Avec 50 clients à 3 comptes chacun, soit 150 comptes, on arrive à environ 368 $ par mois, soit 7,40 $ par client. Avec 500 clients, 1 718 $ par mois, soit 3,40 $ par client (exemple de Zernio).
- **Avec le modèle hybride**, Bluesky, Mastodon et Discord ne passent plus par Zernio. Si la moitié des comptes sont sur ces réseaux, la facture Zernio baisse d'autant.

### X, le poste le plus cher

Vérifié sur docs.x.com : 0,015 $ par post, et **0,200 $ par post contenant un lien**. Un thème qui publie 2 éléments par jour, en français et en anglais, sur X, envoie environ 120 posts par mois, soit **24 $ par mois et par thème**, que l'on passe par Zernio ou non. Pistes :

- publier sur X sans lien (0,015 $), en renvoyant au profil ou au site, avec une perte de trafic ;
- ne publier sur X qu'une langue ;
- laisser X de côté tant que le réseau n'apporte pas assez.

### Intégration maison

- Aucun abonnement, et les API de Mastodon, Bluesky, Discord, LinkedIn et Meta sont gratuites. X reste payant, à ton nom.
- Le vrai coût, c'est le temps :
  - un socle commun d'environ une semaine : connexion OAuth avec retour dans Pann, stockage chiffré des jetons (le Vault existe déjà), rafraîchissement, détection des comptes déconnectés, erreurs propres à chaque réseau ;
  - puis le travail par réseau du tableau ci-dessus.
- La maintenance ne s'arrête jamais : les API changent, des permissions sont retirées, et les revues de Meta et de LinkedIn sont à refaire quand l'application évolue.
- Les démarches : une entité légale pour LinkedIn (pages) et pour la vérification d'entreprise de Meta, une politique de confidentialité publique et des vidéos de démonstration.

## Avantages et inconvénients

### Intégration maison

- **Avantages** :
  - pas d'intermédiaire, ni de coût par compte ;
  - pas de dépendance à la santé ou aux prix d'un tiers ;
  - les données ne transitent que par Pann (un argument RGPD) ;
  - tout le détail de chaque API est accessible (langue du post, mentions, réponses).
- **Inconvénients** :
  - validations longues et incertaines chez Meta et LinkedIn ;
  - reconnexion LinkedIn tous les 60 jours ;
  - une maintenance par réseau ;
  - la responsabilité des incidents (jetons invalidés, API modifiées) ;
  - les réseaux à revue (pages LinkedIn, Facebook, Threads) sont très difficiles à ouvrir à des clients sans structure établie.

### Zernio en mode plateforme

- **Avantages** :
  - validations déjà faites ;
  - une seule API pour tous les réseaux ;
  - jetons, rafraîchissement et changements d'API gérés par Zernio ;
  - une connexion « en un clic » pour l'utilisateur, qui ne voit jamais Zernio ;
  - un profil par client, cloisonné ;
  - des webhooks quand un compte se déconnecte ;
  - des fonctions annexes possibles plus tard (statistiques, commentaires).
- **Inconvénients** :
  - un coût par compte porté par Pann, à répercuter dans le prix ;
  - une dépendance à un tiers (prix, disponibilité, conditions) ;
  - les données des clients transitent par Zernio (contrat de sous-traitance RGPD à prévoir) ;
  - une clé « plateforme » détenue par Pann, contraire à la règle actuelle (« clés par espace ») : décision à inscrire dans DECISIONS ;
  - une facturation à mettre en place (Stripe).

### Zernio avec une clé par espace (l'existant)

- Parfait pour toi et les utilisateurs avancés : zéro coût pour Pann, rien à valider.
- Bloquant pour un SaaS grand public : créer un compte Zernio, connecter ses réseaux et copier une clé, c'est trop de friction.

## Recommandation

1. **Maintenant, pour ton usage** :
   - passer Bluesky et Discord en direct (gratuits, ouverts, un à deux jours de travail), comme Mastodon ;
   - garder Zernio pour LinkedIn, et pour Facebook et X si tu les utilises ;
   - décider ce qu'on fait des liens sur X, vu le prix.
2. **Quand le SaaS se précise** : ajouter un mode « comptes gérés par Pann » avec Zernio en plateforme pour LinkedIn, Facebook, Threads et X, à côté du mode « j'apporte ma clé », qui reste là. Prévoir la facturation, le contrat avec Zernio et l'entrée dans DECISIONS.
3. **Ne pas intégrer en direct** les réseaux à revue Meta ou à pages LinkedIn, tant que Pann n'a pas une structure légale et un volume qui justifient des semaines de validation.

## Sources

- [X API, tarifs à l'usage](https://docs.x.com/x-api/getting-started/pricing) (lu le 2026-11-12)
- [Zernio, tarifs](https://zernio.com/pricing) et [Zernio pour les plateformes SaaS](https://zernio.com/use-cases/saas-platforms)
- [LinkedIn, Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) et [jetons de rafraîchissement](https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens)
- [Meta, jetons longs](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived) et [cas d'usage Threads](https://developers.facebook.com/docs/development/create-an-app/threads-use-case)
- Guides tiers pour les délais Meta et l'accès Community Management : [bundle.social](https://bundle.social/blog/meta-app-review-20-days), [upload-post](https://www.upload-post.com/how-to/post-to-linkedin-company-page-api/)
- W Social : [Tech Policy Press](https://www.techpolicy.press/europes-w-social-bet-tests-its-vision-of-digital-sovereignty/), [ticket Postiz](https://github.com/gitroomhq/postiz-app/issues/1484)
