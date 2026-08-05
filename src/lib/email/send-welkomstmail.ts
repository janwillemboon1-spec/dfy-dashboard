import 'server-only';
import { Resend } from 'resend';
import { createAdminClient } from '@/lib/supabase/admin';
import { welkomstmailHtml } from './templates/welkomstmail';

export async function sendWelkomstmail({ naam, email }: { naam: string; email: string }) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    // generateLink() produces an implicit-flow link (tokens in the URL fragment), which
    // can only be completed client-side — see src/app/auth/confirm/page.tsx. This is
    // deliberately NOT /auth/callback, which handles the separate PKCE ?code= flow used
    // by the browser-initiated signInWithOtp() on /login.
    options: { redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL}/auth/confirm` },
  });

  if (error || !data.properties?.action_link) {
    throw new Error(`Kon magic link niet genereren: ${error?.message}`);
  }

  const { error: sendError } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: email,
    subject: 'Welkom bij je Boon Vakantieverhuur dashboard',
    html: welkomstmailHtml({ naam, magicLink: data.properties.action_link }),
  });

  if (sendError) {
    throw new Error(`Kon welkomstmail niet versturen: ${sendError.message}`);
  }
}
