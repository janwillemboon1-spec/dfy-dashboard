import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { onboardingSchema, type OnboardingInput } from '@/lib/validation/onboarding-schema';
import { sendWelkomstmail } from '@/lib/email/send-welkomstmail';

export class OnboardingError extends Error {}

export async function createClientWithListings(input: OnboardingInput) {
  const data = onboardingSchema.parse(input);
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('clients')
    .select('id')
    .eq('email', data.email)
    .maybeSingle();

  if (existing) {
    throw new OnboardingError('Er bestaat al een klant met dit e-mailadres.');
  }

  const { data: clientId, error: rpcError } = await supabase.rpc('create_client_with_listings', {
    payload: {
      naam: data.naam,
      email: data.email,
      telefoon: data.telefoon ?? null,
      listings: data.accommodaties.map((a) => ({
        naam: a.naam,
        adres: a.adres ?? null,
        nulmeting: a.nulmeting,
      })),
    },
  });

  if (rpcError || !clientId) {
    throw new OnboardingError(`Kon klant niet aanmaken: ${rpcError?.message}`);
  }

  let authUserId: string | undefined;

  try {
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: data.email,
      email_confirm: true,
    });

    if (authError || !authUser.user) {
      throw new OnboardingError(`Kon account niet aanmaken: ${authError?.message}`);
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
      throw new OnboardingError(`Kon profiel niet aanmaken: ${profileError.message}`);
    }

    try {
      await sendWelkomstmail({ naam: data.naam, email: data.email });
    } catch (emailError) {
      throw new OnboardingError(
        `Kon welkomstmail niet versturen: ${(emailError as Error).message}`
      );
    }

    return { clientId };
  } catch (error) {
    try {
      const { error: cascadeError } = await supabase.rpc('delete_client_cascade', {
        target_client_id: clientId,
      });
      if (cascadeError) {
        console.error(
          `[createClientWithListings] rollback van client ${clientId} is mislukt:`,
          cascadeError
        );
      }
    } catch (rollbackException) {
      console.error(
        `[createClientWithListings] rollback van client ${clientId} gooide een fout:`,
        rollbackException
      );
    }

    if (authUserId) {
      const { error: deleteUserError } = await supabase.auth.admin.deleteUser(authUserId);
      if (deleteUserError) {
        console.error(
          `[createClientWithListings] opruimen van auth user ${authUserId} is mislukt:`,
          deleteUserError
        );
      }
    }

    console.error('[createClientWithListings] onboarding mislukt, oorspronkelijke fout:', error);
    throw error;
  }
}
