import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { registratieSchema, type RegistratieInput } from '@/lib/validation/registratie-schema';
import { sendAdminNotificatieNieuweKlant } from '@/lib/email/send-admin-notificatie-nieuwe-klant';

export class RegistratieError extends Error {}

export async function registreerKlant(input: RegistratieInput) {
  const data = registratieSchema.parse(input);
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('clients')
    .select('id')
    .eq('email', data.email)
    .maybeSingle();

  if (existing) {
    throw new RegistratieError('Er bestaat al een klant met dit e-mailadres.');
  }

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .insert({
      naam: data.naam,
      email: data.email,
      telefoon: data.telefoon ?? null,
      status: 'onboarding',
      zelf_geregistreerd: true,
    })
    .select('id')
    .single();

  if (clientError || !client) {
    throw new RegistratieError(`Kon klant niet aanmaken: ${clientError?.message}`);
  }

  const clientId = client.id;
  let authUserId: string | undefined;

  try {
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: data.email,
      password: data.wachtwoord,
      email_confirm: true,
    });

    if (authError || !authUser.user) {
      throw new RegistratieError(`Kon account niet aanmaken: ${authError?.message}`);
    }
    authUserId = authUser.user.id;

    const { error: profileError } = await supabase.from('profiles').insert({
      id: authUser.user.id,
      role: 'klant',
      client_id: clientId,
      email: data.email,
      naam: data.naam,
    });

    if (profileError) {
      throw new RegistratieError(`Kon profiel niet aanmaken: ${profileError.message}`);
    }

    // Bewust geen rollback op een mislukte adminmail: de klant heeft op dit punt al een
    // volledig werkend account (met eigen wachtwoord, in tegenstelling tot de bestaande
    // onboarding-flow die voor inloggen afhankelijk is van de welkomstmail). De admin ziet
    // de nieuwe klant sowieso terug via de "Nieuw"-badge in het klantenoverzicht.
    try {
      await sendAdminNotificatieNieuweKlant({
        naam: data.naam,
        email: data.email,
        telefoon: data.telefoon ?? null,
        clientId,
      });
    } catch (emailError) {
      console.error('[registreerKlant] admin-notificatiemail is mislukt:', emailError);
    }

    return { clientId };
  } catch (error) {
    try {
      const { error: cascadeError } = await supabase.rpc('delete_client_cascade', {
        target_client_id: clientId,
      });
      if (cascadeError) {
        console.error(`[registreerKlant] rollback van client ${clientId} is mislukt:`, cascadeError);
      }
    } catch (rollbackException) {
      console.error(`[registreerKlant] rollback van client ${clientId} gooide een fout:`, rollbackException);
    }

    if (authUserId) {
      const { error: deleteUserError } = await supabase.auth.admin.deleteUser(authUserId);
      if (deleteUserError) {
        console.error(`[registreerKlant] opruimen van auth user ${authUserId} is mislukt:`, deleteUserError);
      }
    }

    console.error('[registreerKlant] registratie mislukt, oorspronkelijke fout:', error);
    throw error;
  }
}
