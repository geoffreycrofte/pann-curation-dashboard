# Nouveaux réseaux : lesquels, et en direct ou via Zernio

Étude du 2026-11-24, qui prolonge `social-publishing.md` (12 novembre). Question de Geoffrey : quels réseaux les outils de planification (Buffer, Hootsuite, Publer) voient le plus branchés, et lesquels Glimr peut intégrer en direct, Zernio ne servant qu'en dernier recours. Les chiffres viennent de pages publiques ; ce qui vient de guides tiers est signalé. Conditions d'accès à revérifier au moment de s'y mettre : elles changent souvent.

## En bref

- **Le trio de tête ne bouge pas** : Facebook, Instagram, LinkedIn, puis X. TikTok et YouTube suivent, mais ce sont des réseaux de vidéo, que Glimr ne produit pas.
- **Meta est le meilleur investissement** : une seule vérification d'entreprise et une revue d'application ouvrent Facebook (aujourd'hui via Zernio), Threads et Instagram. C'est long (des semaines), pas difficile.
- **LinkedIn en direct** demande l'accès à la Community Management API. Crofte Studio est une entité légale, donc éligible ; à demander tout de suite, Zernio restant en place pendant l'attente.
- **X** est simple techniquement mais payant à l'appel (0,20 $ par post avec lien, que l'on passe par Zernio ou non) : à réserver à la clé du client, ou à décompter de son quota.
- **Gains rapides** : Telegram (une demi-journée, comme Discord). Puis Pinterest et Google Business Profile, une fois les images systématiques.
- **Zernio en dernier recours** : TikTok et YouTube (vidéo, audit ou vérification obligatoires, sinon publications privées). Reddit : ne pas publier.

## Ce que les outils voient branché

Aucun de ces outils ne publie de part de comptes connectés par réseau, sauf Buffer.

**Buffer** (« From Instagram to Bluesky », publié le 12 décembre 2024, données 2022 à 2024, sur ses propres clients : créateurs, petites entreprises, professionnels du social) :

| Réseau         | Connexions | Actives | Évolution depuis 2022                         |
| -------------- | ---------- | ------- | --------------------------------------------- |
| Facebook       | 1,85 M     | 108 k   | +70 %                                         |
| X              | 1,39 M     | 81 k    | +37 %, la plus lente                          |
| Instagram      | 1,28 M     | 104 k   | +95 %                                         |
| LinkedIn       | 822 k      | 72 k    | +89 %                                         |
| TikTok         | 276 k      | 30,5 k  | depuis juin 2022, adoption la plus rapide     |
| YouTube Shorts | 147 k      | 18,4 k  | depuis juin 2023                              |
| Pinterest      | 120 k      | 9,7 k   | +113 %                                        |
| Bluesky        | 27,6 k     | 20,7 k  | depuis juillet 2024, croissance la plus forte |
| Threads        | 23,1 k     | 13,8 k  | depuis juin 2024                              |
| Mastodon       | 13,3 k     | 4,3 k   | depuis janvier 2023                           |

À noter : Bluesky et Threads ont la meilleure part de comptes actifs (75 % et 60 %), contre 6 % pour Facebook, dont beaucoup de connexions dorment.

**Hootsuite, Publer** : pas de chiffre de comptes branchés trouvé. À défaut, les enquêtes auprès des marketeurs donnent le même ordre :

- Statista (2026, monde) : Facebook 86 %, Instagram 82 %, LinkedIn 72 % des marketeurs ;
- Sprout Social : Facebook 83 %, Instagram 78 % ;
- HubSpot 2026 (cité par Forbes) : Instagram 80 %, Facebook 66 %, YouTube 60 %, TikTok 57 %.

Pour Glimr (B2B, sujets de niche, posts de texte avec un lien), LinkedIn compte plus que son rang : c'est aussi, selon Buffer, le réseau au meilleur taux d'engagement médian en 2025 (6,2 %).

## Faisabilité réseau par réseau

Glimr publie aujourd'hui en direct sur Bluesky, Mastodon et Discord, et via Zernio sur LinkedIn et Facebook. Ses posts sont du texte avec un lien ; Création peut y joindre des images. Pas de vidéo.

| Réseau                  | Accès                                                                     | Validation                                                                                                                         | Coût de l'API                                                                            | Contenu de Glimr                                           | Verdict                                           |
| ----------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| Facebook (Page)         | Graph API, `pages_manage_posts`                                           | Revue Meta et vérification d'entreprise (Meta, officiel)                                                                           | Gratuit                                                                                  | Adapté                                                     | **Direct**, avec Threads et Instagram             |
| Threads                 | Threads API, `threads_content_publish`                                    | Revue Meta par permission, vidéo de démonstration ; sans revue, seulement les comptes testeurs (guides tiers)                      | Gratuit ; 250 posts par profil et par 24 h (guide tiers)                                 | Très adapté (texte, lien)                                  | **Direct**, même dossier Meta                     |
| Instagram               | API Instagram (connexion Instagram), `instagram_business_content_publish` | Revue Meta (officiel) ; compte professionnel requis                                                                                | Gratuit                                                                                  | Image obligatoire : posts de Création avec image seulement | **Direct**, après Facebook et Threads             |
| LinkedIn (page)         | Community Management API, `w_organization_social`                         | Palier Développement (formulaire), puis Standard avec vidéo ; entité légale, adresse professionnelle, page vérifiée (guides tiers) | Gratuit ; 500 appels par jour au palier Développement                                    | Très adapté                                                | **Direct**, à demander maintenant                 |
| LinkedIn (profil)       | « Share on LinkedIn », `w_member_social`                                  | Libre-service                                                                                                                      | Gratuit ; reconnexion tous les 60 jours                                                  | Très adapté                                                | **Direct** (étude du 12 novembre)                 |
| X                       | OAuth 2, crédits prépayés                                                 | Légère                                                                                                                             | 0,015 $ par post, **0,20 $ avec un lien** (guides tiers ; Zernio refacture au même prix) | Adapté, mais cher                                          | **Direct**, clé du client                         |
| Telegram                | Bot API, publication dans un canal                                        | Aucune                                                                                                                             | Gratuit                                                                                  | Adapté (texte, lien, image)                                | **Direct**, gain rapide                           |
| Pinterest               | API v5                                                                    | Accès d'essai (épingles privées), puis Standard avec vidéo de démonstration (guides tiers)                                         | Gratuit                                                                                  | Image obligatoire                                          | **Direct**, quand les images seront systématiques |
| Google Business Profile | API Local Posts (v4)                                                      | Formulaire d'accès, réponse sous 14 jours (Google, officiel)                                                                       | Gratuit                                                                                  | Adapté (texte, lien, image) aux activités locales          | **Direct**, si des clients locaux le demandent    |
| TikTok                  | Content Posting API                                                       | Audit obligatoire, sinon publications privées (TikTok, officiel)                                                                   | Gratuit                                                                                  | Vidéo ou carrousel photo                                   | **Zernio**, plus tard                             |
| YouTube                 | Data API, `videos.insert`                                                 | Projet non vérifié : vidéos privées ; 1 600 unités par envoi sur 10 000 par jour et par projet (Google, officiel)                  | Gratuit, mais 6 envois par jour pour tout Glimr                                          | Vidéo                                                      | **Zernio**, plus tard                             |
| Reddit                  | Data API                                                                  | Usage commercial soumis à un accord avec Reddit ; accès public en cours de fermeture (guides tiers)                                | Négocié                                                                                  | Autopromotion mal vue                                      | **Ne pas publier**                                |

## Recommandation

1. **Dossier Meta, tout de suite** : vérification d'entreprise de Crofte Studio, puis une application avec Facebook Pages, Threads et Instagram, et une vidéo par permission. Pendant les semaines d'attente, Glimr se développe et se teste sur nos propres comptes (les comptes ayant un rôle sur l'application fonctionnent sans revue). Ensuite, Facebook quitte Zernio, Threads et Instagram arrivent.
2. **LinkedIn, en parallèle** : demander la Community Management API (palier Développement, puis Standard). Zernio reste branché jusqu'à l'accord ; le profil personnel peut passer en direct dès maintenant.
3. **Telegram** : une demi-journée, sur le modèle de Discord.
4. **X** : connecteur direct, avec la clé et les crédits du client (offre Perso) ; pour Essential et Pro, soit l'exclure, soit le facturer à part. Le prix est le même via Zernio.
5. **Pinterest, Google Business Profile** : après les images générées par IA, qui donneraient une image à chaque post.
6. **TikTok, YouTube** : via Zernio, le jour où Glimr produit de la vidéo.

Effort estimé par connecteur direct (adaptateur de publication, connexion OAuth, jetons dans le Vault, reconnexion) : Telegram une demi-journée ; Threads, Facebook, X, Pinterest deux à trois jours chacun ; Instagram et LinkedIn trois jours (hébergement public des images pour Instagram, reconnexion tous les 60 jours pour LinkedIn) ; Google Business Profile trois jours. Les validations ajoutent des semaines qui ne dépendent pas de nous.

## Sources

- Buffer, [From Instagram to Bluesky: How Social Media Use Has Evolved Since 2022](https://buffer.com/resources/social-media-network-usage/) ; [State of Social Media Engagement 2026](https://buffer.com/resources/state-of-social-media-engagement-2026/)
- [Statista, plateformes utilisées par les marketeurs](https://www.statista.com/statistics/259379/social-media-platforms-used-by-marketers-worldwide/) ; [Sprout Social, statistiques](https://sproutsocial.com/insights/social-media-statistics/) ; [Forbes, statistiques 2026](https://www.forbes.com/advisor/business/social-media-statistics/)
- Meta : [permissions](https://developers.facebook.com/docs/permissions), [vérification d'accès](https://developers.facebook.com/docs/development/release/access-verification/), [revue Instagram](https://developers.facebook.com/documentation/instagram-platform/app-review), [publication Instagram](https://developers.facebook.com/documentation/instagram-platform/content-publishing) ; Threads : [guide Postproxy](https://postproxy.dev/blog/threads-api-posting-integration-guide/) (tiers)
- LinkedIn : [guide Upload-Post](https://www.upload-post.com/linkedin-api/), [guide Postproxy](https://postproxy.dev/blog/linkedin-api-automate-company-page-publishing/) (tiers)
- X : [Postproxy, tarifs 2026](https://postproxy.dev/blog/x-api-pricing-2026/), [Zernio, tarifs de l'API X](https://zernio.com/blog/twitter-api-pricing) (tiers)
- TikTok : [Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post) ; YouTube : [coût des quotas](https://developers.google.com/youtube/v3/determine_quota_cost) ; Google : [FAQ Business Profile API](https://developers.google.com/my-business/content/faq) ; Pinterest : [guide Upload-Post](https://www.upload-post.com/pinterest-api/) (tiers) ; Reddit : [redditapis.com](https://www.redditapis.com/blogs/reddit-api-commercial-use-licensing-explained-2026) (tiers)
- Zernio : [tarifs](https://zernio.com/pricing.md)
