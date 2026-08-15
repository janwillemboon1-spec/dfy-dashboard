import { createClient } from '@/lib/supabase/server';

export default async function StartHierPage() {
  const supabase = await createClient();
  const { data: instellingen } = await supabase
    .from('portaal_instellingen')
    .select('video_url, formulier_url')
    .maybeSingle();

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 space-y-10">
      <div>
        <h1 className="font-serif text-2xl">Start hier</h1>
        <p className="mt-2 text-muted-foreground">
          Bekijk de video hieronder en vul alvast het formulier in — dat heeft ons team nodig
          om jouw accommodatie(s) te koppelen.
        </p>
      </div>

      <section>
        <h2 className="font-serif text-lg mb-3">Introductievideo</h2>
        {instellingen?.video_url ? (
          <div className="aspect-video w-full">
            <iframe
              src={instellingen.video_url}
              className="h-full w-full rounded-lg border border-border"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              title="Introductievideo"
            />
          </div>
        ) : (
          <p className="rounded-lg border border-border py-8 text-center text-sm text-muted-foreground">
            Deze video wordt binnenkort toegevoegd.
          </p>
        )}
      </section>

      <section>
        <h2 className="font-serif text-lg mb-3">Formulier</h2>
        {instellingen?.formulier_url ? (
          <iframe
            src={instellingen.formulier_url}
            className="h-[800px] w-full rounded-lg border border-border"
            title="Formulier"
          />
        ) : (
          <p className="rounded-lg border border-border py-8 text-center text-sm text-muted-foreground">
            Dit formulier wordt binnenkort toegevoegd.
          </p>
        )}
      </section>
    </main>
  );
}
