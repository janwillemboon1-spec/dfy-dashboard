import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Fase 1 placeholder — the middleware (src/lib/supabase/middleware.ts) already
// guards /dashboard, and klant-role users land here after login (auth callback)
// or after being bounced out of /admin. The redirect below is defense-in-depth
// only (matching admin/layout.tsx's pattern), not the primary auth boundary.
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('naam, client_id')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) console.error('Kon profiel niet laden voor dashboard:', profileError);

  return (
    <main className="mx-auto max-w-2xl py-24 px-4 text-center">
      <h1 className="font-serif text-3xl">Welkom, {profile?.naam ?? 'daar'}!</h1>
      <p className="mt-4 text-muted-foreground">
        Je volledige dashboard met resultaten, doelen en meer volgt binnenkort.
      </p>
    </main>
  );
}
