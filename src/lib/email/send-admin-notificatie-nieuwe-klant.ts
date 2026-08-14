import 'server-only';
import { Resend } from 'resend';
import { adminNotificatieNieuweKlantHtml } from './templates/admin-notificatie-nieuwe-klant';

export async function sendAdminNotificatieNieuweKlant({
  naam,
  email,
  telefoon,
  clientId,
}: {
  naam: string;
  email: string;
  telefoon: string | null;
  clientId: string;
}) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: process.env.ADMIN_NOTIFICATIE_EMAIL!,
    subject: `Nieuwe zelfregistratie: ${naam}`,
    html: adminNotificatieNieuweKlantHtml({
      naam,
      email,
      telefoon,
      link: `${process.env.NEXT_PUBLIC_BASE_URL}/admin/klanten/${clientId}/instellingen`,
    }),
  });

  if (error) {
    throw new Error(`Kon admin-notificatiemail niet versturen: ${error.message}`);
  }
}
