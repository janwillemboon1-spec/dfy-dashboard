import { redirect } from 'next/navigation';

export default async function KlantDetailRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/klanten/${id}/instellingen`);
}
