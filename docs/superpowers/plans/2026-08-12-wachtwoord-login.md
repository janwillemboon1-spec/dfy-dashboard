# Wachtwoord-login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let klanten (and admins) log in with a password, alongside the existing magic-link flow, with self-service password setup via a reset-link.

**Architecture:** Supabase Auth already fully supports password login — this is a frontend-only change. The login page gets a password field (`signInWithPassword`) plus a "set/forgot password" trigger (`resetPasswordForEmail`). The reset link reuses the existing `/auth/callback` route (via `?next=/auth/reset-wachtwoord`) rather than adding new callback logic, so no Supabase dashboard redirect-URL configuration is needed. A new page collects the new password and calls `updateUser({ password })`.

**Tech Stack:** Next.js App Router client components, Supabase Auth JS SDK (`@supabase/ssr` browser client).

**Reference:** Spec at `docs/superpowers/specs/2026-08-12-wachtwoord-login-design.md`.

---

### Task 1: Password login + reset-link trigger on the login page

**Files:**
- Modify: `src/app/[locale]/login/page.tsx`

- [ ] **Step 1: Replace the full contents of the file**

Replace the full contents of `src/app/[locale]/login/page.tsx` with:

```tsx
'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'versturen' | 'verstuurd' | 'mislukt'>('idle');
  const [linkFout, setLinkFout] = useState(searchParams.get('fout') === '1');
  const [wachtwoordStatus, setWachtwoordStatus] = useState<'idle' | 'bezig' | 'mislukt'>('idle');
  const [resetStatus, setResetStatus] = useState<'idle' | 'bezig' | 'verstuurd'>('idle');
  const [resetFoutmelding, setResetFoutmelding] = useState<string | null>(null);

  async function handleMagicLink() {
    setLinkFout(false);
    setStatus('versturen');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setStatus(error ? 'mislukt' : 'verstuurd');
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setWachtwoordStatus('bezig');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setWachtwoordStatus('mislukt');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  async function handleResetPassword() {
    setResetFoutmelding(null);
    if (!email) {
      setResetFoutmelding('Vul eerst je e-mailadres in.');
      return;
    }
    setResetStatus('bezig');
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-wachtwoord`,
    });
    if (error) {
      setResetStatus('idle');
      setResetFoutmelding('Er ging iets mis, probeer het opnieuw.');
      return;
    }
    setResetStatus('verstuurd');
  }

  if (status === 'verstuurd') {
    return (
      <main className="mx-auto max-w-md py-24 text-center">
        <h1 className="font-serif text-2xl">Check je mailbox</h1>
        <p className="mt-2 text-muted-foreground">We hebben een inloglink gestuurd naar {email}.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md py-24">
      <h1 className="font-serif text-2xl mb-6">Inloggen</h1>
      <form onSubmit={handlePasswordSubmit} className="space-y-4">
        <div>
          <Label htmlFor="email">E-mailadres</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="password">Wachtwoord</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={wachtwoordStatus === 'bezig'} className="w-full">
          {wachtwoordStatus === 'bezig' ? 'Bezig...' : 'Inloggen'}
        </Button>
        {wachtwoordStatus === 'mislukt' && (
          <p className="text-sm text-destructive">
            Inloggen mislukt. Controleer je e-mailadres en wachtwoord, of vraag een nieuwe wachtwoordlink aan.
          </p>
        )}
      </form>

      <div className="mt-3 text-sm">
        <button type="button" onClick={handleResetPassword} className="underline text-muted-foreground">
          Wachtwoord vergeten of nog geen wachtwoord ingesteld? Stel er een in
        </button>
        {resetStatus === 'bezig' && <p className="mt-2 text-muted-foreground">Bezig...</p>}
        {resetStatus === 'verstuurd' && (
          <p className="mt-2 text-muted-foreground">
            We hebben een link gestuurd naar {email} om een wachtwoord in te stellen.
          </p>
        )}
        {resetFoutmelding && <p className="mt-2 text-destructive">{resetFoutmelding}</p>}
      </div>

      <div className="mt-6 border-t border-border pt-6">
        <p className="text-sm text-muted-foreground mb-2">Liever een inloglink per e-mail?</p>
        <Button
          type="button"
          variant="outline"
          onClick={handleMagicLink}
          disabled={status === 'versturen'}
          className="w-full"
        >
          {status === 'versturen' ? 'Versturen...' : 'Stuur inloglink'}
        </Button>
        {linkFout && (
          <p className="mt-2 text-sm text-destructive">Deze link is verlopen of al gebruikt. Vraag een nieuwe aan.</p>
        )}
        {status === 'mislukt' && <p className="mt-2 text-sm text-destructive">Er ging iets mis, probeer het opnieuw.</p>}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
```

Note what changed from the original: the magic-link trigger (`handleMagicLink`, renamed from `handleSubmit`) moved from the `<form>`'s `onSubmit` to a plain `type="button"` `onClick`, since the `<form onSubmit>` slot is now used by the new password-login submit (`handlePasswordSubmit`) instead — a page can only have one submit-triggering `<form>` per set of Enter-key-submits-nearest-form semantics, and password login is the primary action.

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: builds successfully, no TypeScript or ESLint errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/login/page.tsx"
git commit -m "feat: wachtwoord-login en wachtwoord-instellen-link op de inlogpagina"
```

---

### Task 2: New "set new password" page

**Files:**
- Create: `src/app/auth/reset-wachtwoord/page.tsx`

This page lives outside the `[locale]` segment, matching the existing convention for auth-redirect destinations (`src/app/auth/callback/`, `src/app/auth/confirm/`).

- [ ] **Step 1: Create the page**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ResetWachtwoordPage() {
  const router = useRouter();
  const [sessieStatus, setSessieStatus] = useState<'laden' | 'geldig' | 'ongeldig'>('laden');
  const [wachtwoord, setWachtwoord] = useState('');
  const [bevestiging, setBevestiging] = useState('');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'bezig' | 'opgeslagen'>('idle');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setSessieStatus(user ? 'geldig' : 'ongeldig');
    });
  }, []);

  async function opslaan(e: React.FormEvent) {
    e.preventDefault();
    setFoutmelding(null);
    if (wachtwoord.length < 6) {
      setFoutmelding('Wachtwoord moet minimaal 6 tekens zijn.');
      return;
    }
    if (wachtwoord !== bevestiging) {
      setFoutmelding('De wachtwoorden komen niet overeen.');
      return;
    }
    setStatus('bezig');
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: wachtwoord });
    if (error) {
      setStatus('idle');
      setFoutmelding(error.message);
      return;
    }
    setStatus('opgeslagen');
  }

  if (sessieStatus === 'laden') {
    return (
      <main className="mx-auto max-w-md py-24 text-center">
        <p className="text-muted-foreground">Bezig met laden...</p>
      </main>
    );
  }

  if (sessieStatus === 'ongeldig') {
    return (
      <main className="mx-auto max-w-md py-24 text-center">
        <h1 className="font-serif text-2xl">Link verlopen</h1>
        <p className="mt-2 text-muted-foreground">
          Deze link is verlopen of al gebruikt. Vraag een nieuwe aan via{' '}
          <a href="/login" className="underline">
            de inlogpagina
          </a>
          .
        </p>
      </main>
    );
  }

  if (status === 'opgeslagen') {
    return (
      <main className="mx-auto max-w-md py-24 text-center">
        <h1 className="font-serif text-2xl">Wachtwoord ingesteld</h1>
        <p className="mt-2 text-muted-foreground">Je kunt nu inloggen met je nieuwe wachtwoord.</p>
        <Button className="mt-6" onClick={() => router.push('/dashboard')}>
          Naar het dashboard
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md py-24">
      <h1 className="font-serif text-2xl mb-6">Nieuw wachtwoord instellen</h1>
      <form onSubmit={opslaan} className="space-y-4">
        <div>
          <Label htmlFor="wachtwoord">Nieuw wachtwoord</Label>
          <Input
            id="wachtwoord"
            type="password"
            value={wachtwoord}
            onChange={(e) => setWachtwoord(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="bevestiging">Bevestig wachtwoord</Label>
          <Input
            id="bevestiging"
            type="password"
            value={bevestiging}
            onChange={(e) => setBevestiging(e.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={status === 'bezig'} className="w-full">
          {status === 'bezig' ? 'Bezig...' : 'Wachtwoord instellen'}
        </Button>
        {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: builds successfully. Confirm the route `/auth/reset-wachtwoord` appears in the build's route table.

- [ ] **Step 3: Commit**

```bash
git add src/app/auth/reset-wachtwoord/page.tsx
git commit -m "feat: pagina om een nieuw wachtwoord in te stellen na de reset-link"
```

---

### Task 3: Full verification and deploy

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all existing tests still pass (no new tests in this plan — see the spec's Testing section for why: this is a pure client-side auth-UI flow with no automated test coverage possible in this project, consistent with the pre-existing magic-link flow).

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no new errors (the two pre-existing, unrelated lint issues in `src/app/auth/confirm/page.tsx` and the gitignored `supabase/.temp/` directory are not part of this change).

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 4: Manual verification**

Start the dev server (`npm run dev`) and, using a test account:
- On `/login`, click "Wachtwoord vergeten of nog geen wachtwoord ingesteld? Stel er een in" with a valid email filled in — confirm the "We hebben een link gestuurd..." message appears.
- Open the email (local dev: check Mailpit at the URL from `npx supabase status`; production: check the actual inbox), click the link, and confirm it lands on `/auth/reset-wachtwoord` with the form visible (not the "Link verlopen" state).
- Set a new password (test both: too-short password shows the "minimaal 6 tekens" error; mismatched confirmation shows the "komen niet overeen" error) and submit successfully — confirm the "Wachtwoord ingesteld" screen appears.
- Go back to `/login` and log in with that email + the new password — confirm it redirects to `/dashboard`.
- Confirm the existing magic-link flow ("Stuur inloglink") still works unchanged.
- Visit `/auth/reset-wachtwoord` directly without a valid session (e.g. in a private/incognito window) — confirm it shows "Link verlopen" rather than crashing.

- [ ] **Step 5: Push to `main`**

```bash
git push origin main
```

Railway auto-deploys on push to `main`. No database migration in this plan — nothing to hand over for manual application in Supabase.
