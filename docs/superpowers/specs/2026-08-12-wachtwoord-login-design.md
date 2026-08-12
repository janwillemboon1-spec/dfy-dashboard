# Wachtwoord-login voor klanten — Design

## Context

Klanten (en admins) loggen nu uitsluitend in via een magic link per e-mail
(`supabase.auth.signInWithOtp`) — er bestaat geen wachtwoord-login in de app. Geen enkele
gebruiker heeft momenteel een wachtwoord ingesteld (accounts worden aangemaakt via
`admin.auth.admin.createUser({ email, email_confirm: true })`, zonder `password`-veld).

Belangrijke ontdekking tijdens het onderzoek: de Supabase Auth-backend ondersteunt
wachtwoord-login al volledig — dit is puur een kwestie van de frontend uitbreiden, er is geen
nieuwe Supabase-configuratie of migratie voor nodig.

## Ontwerp

### 1. Wachtwoord ernaast, niet in plaats van

Magic-link-login blijft volledig functioneren zoals nu. Wachtwoord-login komt er **naast**
op dezelfde, gedeelde `/login`-pagina (admin en klant gebruiken dezelfde pagina/component).
Na een geslaagde login (via welke methode dan ook) landt de gebruiker op `/dashboard`; de
bestaande rol-gebaseerde redirects (in de layouts) bepalen daarna of dat de klant- of
admin-omgeving wordt — geen aparte behandeling nodig voor wachtwoord vs. magic link hierin.

### 2. Wachtwoord instellen (self-service)

Op de inlogpagina komt een link "Wachtwoord vergeten of nog geen wachtwoord ingesteld? Stel
er een in", die `supabase.auth.resetPasswordForEmail(email, { redirectTo: ... })` aanroept.
De klant vult zijn e-mailadres in, krijgt een link per mail (verstuurd door Supabase zelf,
niet via de eigen Resend-integratie van deze app), en stelt op een nieuwe pagina zijn
wachtwoord in.

De `redirectTo` wijst naar `${origin}/auth/callback?next=/auth/reset-wachtwoord` —
**dezelfde** route die de bestaande magic-link-flow al gebruikt (`exchangeCodeForSession` +
redirect naar `next`). Geen nieuwe Supabase-dashboardconfiguratie nodig (geen nieuwe
redirect-URL hoeft te worden toegevoegd aan de allowlist), en geen nieuwe backend-logica —
puur hergebruik van wat er al is.

### 3. Nieuwe bestanden/wijzigingen

- **`src/app/[locale]/login/page.tsx`** (wijzigen): wachtwoordveld + "Inloggen"-knop
  (`signInWithPassword`, bij succes redirect naar `/dashboard`). Eronder de
  "wachtwoord instellen/vergeten"-link. De bestaande "Stuur inloglink"-knop (magic link)
  blijft ongewijzigd staan als alternatief. Bij een mislukte wachtwoord-login toont een
  generieke foutmelding ("Inloggen mislukt. Controleer je e-mailadres en wachtwoord, of vraag
  een nieuwe wachtwoordlink aan.") — bewust niet specifieker (Supabase onderscheidt zelf ook
  niet tussen "verkeerd wachtwoord" en "geen wachtwoord ingesteld", om geen informatie te
  lekken over welke accounts bestaan).

- **`src/app/auth/reset-wachtwoord/page.tsx`** (nieuw): simpel formulier (nieuw wachtwoord +
  bevestiging), roept `supabase.auth.updateUser({ password })` aan zodra de sessie via de
  reset-link tot stand is gekomen (die sessie is er al dankzij de hergebruikte
  `/auth/callback`-stap ervoor). Toont een duidelijke foutmelding als er geen geldige sessie
  is (verlopen/al-gebruikte link) — zelfde patroon als de bestaande `auth/confirm`-pagina's
  "mislukt"-status. Bij succes: bevestiging + redirect naar `/dashboard`.

  Deze pagina staat bewust buiten `[locale]` (bij `auth/callback` en `auth/confirm`), zelfde
  conventie als de andere auth-redirect-bestemmingen in deze codebase.

### 4. Bewust buiten scope

- Geen eigen wachtwoordsterkte-eisen bovenop wat Supabase zelf afdwingt (standaard minimaal
  6 tekens; strenger instellen kan via het Supabase-dashboard, niet via deze codebase).
- Geen eigen e-mailsjabloon voor de reset-mail — die wordt door Supabase's eigen
  transactionele e-mailsysteem verstuurd met hun standaardsjabloon (later zelf aan te passen
  via Supabase Dashboard → Authentication → Email Templates).
- Geen wijziging aan hoe klant-accounts worden aangemaakt (onboarding blijft accounts zonder
  wachtwoord aanmaken; het wachtwoord wordt pas gezet zodra de klant zelf de
  instellen/vergeten-link gebruikt).

## Testen

Dit is een puur client-side auth-UI-flow zonder geautomatiseerde testdekking mogelijk in dit
project (zelfde als de bestaande magic-link-flow, die ook geen tests heeft — er is geen
component-testinfrastructuur, en dit betreft directe Supabase Auth SDK-aanroepen). Verificatie
gebeurt handmatig: wachtwoord instellen via de link, daarna succesvol inloggen met dat
wachtwoord, en controleren dat een verlopen/ongeldige reset-link een duidelijke foutmelding
geeft in plaats van een crash.
