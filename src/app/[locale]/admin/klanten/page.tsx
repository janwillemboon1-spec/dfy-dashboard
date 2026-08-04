import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function KlantenPage() {
  const supabase = await createClient();
  const { data: klanten, error } = await supabase
    .from('clients')
    .select('id, naam, email, status, aangemaakt_op, listings(count)')
    .order('aangemaakt_op', { ascending: false });

  if (error) console.error('Kon klanten niet laden:', error);

  return (
    <main className="mx-auto max-w-5xl py-10 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl">Klanten</h1>
        <div className="flex gap-2">
          <Link href="/admin/klanten/nieuw" className="rounded bg-primary px-4 py-2 text-primary-foreground text-sm">
            + Nieuwe klant
          </Link>
          <Link href="/admin/import" className="rounded border border-border px-4 py-2 text-sm">
            CSV importeren
          </Link>
        </div>
      </div>
      {error ? (
        <p className="text-sm text-destructive">Kon klanten niet laden. Probeer de pagina te vernieuwen.</p>
      ) : klanten && klanten.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nog geen klanten. Voeg je eerste klant toe.</p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Overzicht van alle klanten</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="py-2">Naam</th>
              <th scope="col">E-mail</th>
              <th scope="col">Status</th>
              <th scope="col">Accommodaties</th>
              <th scope="col">Aangemaakt</th>
            </tr>
          </thead>
          <tbody>
            {klanten?.map((klant) => (
              <tr key={klant.id} className="border-b border-border/50">
                <td className="py-2">
                  <Link href={`/admin/klanten/${klant.id}`} className="hover:underline">{klant.naam}</Link>
                </td>
                <td>{klant.email}</td>
                <td>{klant.status}</td>
                <td>{klant.listings?.[0]?.count ?? 0}</td>
                <td>{new Date(klant.aangemaakt_op).toLocaleDateString('nl-NL')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
