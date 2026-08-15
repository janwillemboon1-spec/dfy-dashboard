import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ThemeToggle } from '@/components/theme-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import { PortaalSidebar } from '@/components/portal/portaal-sidebar';

// De auth/rol-check (voorheen in page.tsx) staat nu hier, centraal voor alle
// klant-portaalpagina's (cijfers/voortgang/instellingen) — zelfde patroon als
// admin/layout.tsx al gebruikt. Faalt dicht i.p.v. open: als de rol niet betrouwbaar
// vastgesteld kan worden (query-fout), NIET stilzwijgend doorgaan alsof het een klant is
// — dat zou een admin-sessie hier laten binnenkomen en, via de RLS-scoping in de
// onderliggende pagina's, een opgeteld mengelmoes van alle klanten laten zien.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('Kon profiel niet laden voor dashboard:', profileError);
    redirect('/login');
  }
  if (profile?.role === 'admin') redirect('/admin/klanten');

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-end gap-1">
        <ThemeToggle />
        <SignOutButton />
      </header>
      <div className="flex flex-col md:flex-row">
        <PortaalSidebar
          titel="Boon Vakantieverhuur"
          items={[
            { label: 'Start hier', href: '/dashboard/start-hier' },
            { label: 'Voortgang', href: '/dashboard/voortgang' },
            { label: 'Cijfers', href: '/dashboard/cijfers' },
            { label: 'Instellingen', href: '/dashboard/instellingen' },
          ]}
        />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
