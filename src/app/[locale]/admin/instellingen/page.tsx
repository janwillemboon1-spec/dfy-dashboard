import { createClient } from '@/lib/supabase/server';
import { PortaalInstellingenFormulier } from '@/components/admin/portaal-instellingen-formulier';

export default async function AdminInstellingenPage() {
  const supabase = await createClient();
  const { data: instellingen } = await supabase
    .from('portaal_instellingen')
    .select('video_url, formulier_url')
    .maybeSingle();

  return (
    <main className="mx-auto max-w-5xl py-10 px-4 space-y-8">
      <h1 className="font-serif text-2xl">Instellingen</h1>
      <div>
        <h2 className="font-serif text-xl mb-4">&quot;Start hier&quot;-pagina</h2>
        <PortaalInstellingenFormulier
          videoUrl={instellingen?.video_url ?? null}
          formulierUrl={instellingen?.formulier_url ?? null}
        />
      </div>
    </main>
  );
}
