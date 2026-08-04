import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function KlantenPage() {
  const supabase = await createClient();
  const { data: klanten } = await supabase
    .from('clients')
    .select('id, naam, email, status, aangemaakt_op, listings(count)')
    .order('aangemaakt_op', { ascending: false });

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
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2">Naam</th>
            <th>E-mail</th>
            <th>Status</th>
            <th>Accommodaties</th>
            <th>Aangemaakt</th>
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
    </main>
  );
}
