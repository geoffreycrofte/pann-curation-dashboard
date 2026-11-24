# Modèles d'e-mails Supabase

Les e-mails que Supabase envoie (connexion, invitation, changement d'adresse), dans la mise en page de ceux de Glimr : logo à gauche, texte, pied de page foncé.

Ils s'écrivent dans la langue du compte (`user_metadata.lang`, que le board tient à jour, et que l'invitation d'une équipe reprend de la personne qui invite). Langue inconnue : français puis anglais.

## Mise en place

Tableau de bord Supabase, Authentication, Emails. Pour chaque modèle, coller le sujet et le contenu du fichier :

| Modèle Supabase | Sujet | Fichier |
| --- | --- | --- |
| Magic Link | `Votre lien de connexion à Glimr / Your Glimr sign-in link` | `magic-link.html` |
| Invite user | `Invitation à rejoindre Glimr / Invitation to join Glimr` | `invite.html` |
| Change Email Address | `Confirmez votre nouvelle adresse / Confirm your new address` | `email-change.html` |

Le logo est lu à `{{ .SiteURL }}/email/glimr-logo.png` : le Site URL (Authentication, URL Configuration) doit être `https://glimr.cc`.

## Modifier

Ne pas modifier ces fichiers à la main : ils sont produits par `apps/api/src/lib/supabase-templates.ts`, avec la même mise en page que les e-mails de Glimr (`apps/api/src/lib/email-layout.ts`). Après un changement :

```sh
pnpm --filter @glimr/api exec vitest run src/lib/supabase-templates -u
```

puis coller à nouveau les fichiers changés dans Supabase.
