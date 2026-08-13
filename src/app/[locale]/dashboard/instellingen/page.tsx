import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ContactgegevensFormulier } from '@/components/dashboard/contactgegevens-formulier';
import { WachtwoordFormulier } from '@/components/dashboard/wachtwoord-formulier';

// Geen expliciet client_id-filter nodig op de query hieronder: de "klant leest eigen
// client"-RLS-policy (id = current_client_id()) scopet dit al af tot precies de klant van de
// ingelogde gebruiker. Dit klopt alleen voor een klant-sessie — dashboard/layout.tsx redirect
// een admin-sessie al weg vóórdat deze pagina rendert. (Het wachtwoord-wijzigen hieronder
// loopt via Supabase Auth, niet via deze RLS-policy — zie wijzigEigenWachtwoord.)
export default async function InstellingenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: client } = await supabase.from('clients').select('naam, telefoon, email').maybeSingle();

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-serif text-2xl">Instellingen</h1>
      <div className="mt-10">
        <h2 className="font-serif text-xl">Contactgegevens</h2>
        <div className="mt-4">
          <ContactgegevensFormulier
            naam={client?.naam ?? ''}
            telefoon={client?.telefoon ?? null}
            email={client?.email ?? ''}
          />
        </div>
      </div>
      <div className="mt-10">
        <h2 className="font-serif text-xl">Wachtwoord</h2>
        <div className="mt-4">
          <WachtwoordFormulier />
        </div>
      </div>
    </main>
  );
}
