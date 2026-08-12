import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PortaalSidebar } from '@/components/portal/portaal-sidebar';

// Geen eigen rol-check hier: admin/layout.tsx (hoger in de boom) checkt al dat dit een
// admin-sessie is. Wél een eigen, lichte klant-lookup + notFound()-guard, zodat élke
// subroute (ook de voortgang/cijfers-placeholders) 404't op een ongeldig klant-id, niet
// alleen instellingen/page.tsx.
export default async function KlantPortaalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: klant } = await supabase.from('clients').select('naam').eq('id', id).maybeSingle();
  if (!klant) notFound();

  return (
    <div className="flex">
      <PortaalSidebar
        titel={klant.naam}
        subtitel="Klantportaal"
        terug={{ label: 'Terug naar klantoverzicht', href: '/admin/klanten' }}
        items={[
          { label: 'Voortgang', href: `/admin/klanten/${id}/voortgang` },
          { label: 'Cijfers', href: `/admin/klanten/${id}/cijfers` },
          { label: 'Instellingen', href: `/admin/klanten/${id}/instellingen` },
        ]}
      />
      <div className="flex-1">{children}</div>
    </div>
  );
}
