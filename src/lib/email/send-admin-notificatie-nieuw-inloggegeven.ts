import 'server-only';
import { Resend } from 'resend';
import { adminNotificatieNieuwInloggegevenHtml } from './templates/admin-notificatie-nieuw-inloggegeven';

export async function sendAdminNotificatieNieuwInloggegeven({
  klantNaam,
  itemNaam,
  clientId,
}: {
  klantNaam: string;
  itemNaam: string;
  clientId: string;
}) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: process.env.ADMIN_NOTIFICATIE_EMAIL!,
    subject: `Nieuw inloggegeven: ${itemNaam}`,
    html: adminNotificatieNieuwInloggegevenHtml({
      klantNaam,
      itemNaam,
      link: `${process.env.NEXT_PUBLIC_BASE_URL}/admin/klanten/${clientId}/instellingen`,
    }),
  });

  if (error) {
    throw new Error(`Kon admin-notificatiemail niet versturen: ${error.message}`);
  }
}
