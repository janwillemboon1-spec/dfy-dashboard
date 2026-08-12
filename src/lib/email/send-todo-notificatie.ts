import 'server-only';
import { Resend } from 'resend';
import { todoNotificatieHtml } from './templates/todo-notificatie';

export async function sendTodoNotificatie({
  klantNaam,
  klantEmail,
  taakNaam,
  deadline,
}: {
  klantNaam: string;
  klantEmail: string;
  taakNaam: string;
  deadline: string;
}) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const deadlineLabel = new Date(`${deadline}T00:00:00Z`).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: klantEmail,
    subject: `Nieuwe taak: ${taakNaam}`,
    html: todoNotificatieHtml({
      naam: klantNaam,
      taakNaam,
      deadlineLabel,
      link: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/voortgang`,
    }),
  });

  if (error) {
    throw new Error(`Kon to-do-notificatie niet versturen: ${error.message}`);
  }
}
