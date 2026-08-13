# Wachtwoord wijzigen (klantportaal) — Design

## Context

Klanten kunnen hun wachtwoord momenteel alleen wijzigen via de "wachtwoord vergeten"-flow
(`/auth/reset-wachtwoord`, bereikbaar via een e-mail-link). Er is geen manier om het
wachtwoord zelf aan te passen terwijl je al bent ingelogd. Dit voegt die mogelijkheid toe aan
de bestaande Instellingen-pagina van het klantportaal (`/dashboard/instellingen`). Alleen de
klant-kant — de admin-kant heeft dit niet nodig.

## Ontwerp

### Server action

Nieuwe functie `wijzigEigenWachtwoord` in `src/app/[locale]/dashboard/actions.ts`, in dezelfde
stijl als de bestaande `wijzigEigenClientGegevens`:

```typescript
export async function wijzigEigenWachtwoord(input: {
  huidigWachtwoord: string;
  nieuwWachtwoord: string;
}): Promise<{ succes: boolean; fout?: string }>
```

Stappen:
1. `nieuwWachtwoord.length < 6` → `{ succes: false, fout: 'Nieuw wachtwoord moet minimaal 6 tekens zijn.' }`
   (zelfde ondergrens als de bestaande reset-wachtwoord-pagina).
2. Haal de ingelogde gebruiker op (`supabase.auth.getUser()`); niet ingelogd → `{ succes: false, fout: 'Niet ingelogd.' }`.
3. Herbevestig het huidige wachtwoord via `supabase.auth.signInWithPassword({ email: user.email, password: input.huidigWachtwoord })`.
   Faalt dit → `{ succes: false, fout: 'Huidig wachtwoord is onjuist.' }`. Supabase's
   `updateUser`-API vereist zelf geen herbevestiging (alleen een actieve sessie) — deze
   losse stap is er bewust bij, zodat iemand met tijdelijke toegang tot een
   ontgrendelde/ingelogde sessie (bv. een gedeelde computer) het wachtwoord niet kan
   overnemen zonder het huidige wachtwoord te kennen.
4. `supabase.auth.updateUser({ password: input.nieuwWachtwoord })`. Bij een fout: geef
   `error.message` terug als `fout`.
5. Bij succes: `{ succes: true }` (geen `revalidatePath` nodig — er wordt geen server-gerenderde
   data getoond die hierdoor verandert).

### Formulier-component

Nieuwe `WachtwoordFormulier` in `src/components/dashboard/wachtwoord-formulier.tsx`, qua
opbouw een directe zus van `ContactgegevensFormulier` (client component, `useState` +
`useTransition`, zelfde knop-/foutmelding-stijl). Drie velden: huidig wachtwoord, nieuw
wachtwoord, bevestig nieuw wachtwoord (alle drie `type="password"`). Vóór het aanroepen van de
server action wordt client-side gecontroleerd dat "nieuw wachtwoord" en "bevestig nieuw
wachtwoord" gelijk zijn (zelfde patroon als `reset-wachtwoord/page.tsx`); zo niet, dan een
foutmelding zonder de server action aan te roepen. Bij succes worden alle drie de velden
geleegd (in tegenstelling tot `ContactgegevensFormulier`, dat de opgeslagen waarden laat staan
— een wachtwoordveld moet nooit blijven staan nadat het is verstuurd).

### Instellingen-pagina

`src/app/[locale]/dashboard/instellingen/page.tsx` krijgt een nieuwe sectie "Wachtwoord" na de
bestaande "Contactgegevens"-sectie, met dezelfde `mt-10`/`h2`-opbouw, die `<WachtwoordFormulier />`
rendert (geen props nodig — de server action leidt de ingelogde gebruiker zelf af uit de sessie).

## Testen

- Server-actie-tests (in dezelfde stijl als de bestaande integratietests voor server actions in
  dit project): weigert een te kort nieuw wachtwoord, weigert een onjuist huidig wachtwoord,
  weigert een niet-ingelogde aanroep, slaagt bij een juist huidig wachtwoord + geldig nieuw
  wachtwoord (en kan daarna succesvol inloggen met het nieuwe wachtwoord).
- Handmatige verificatie: op `/dashboard/instellingen` het wachtwoord wijzigen, uitloggen, en
  bevestigen dat inloggen met het oude wachtwoord niet meer lukt maar met het nieuwe wel.
