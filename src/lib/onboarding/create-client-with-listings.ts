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

  try {
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: data.email,
      email_confirm: true,
    });

    if (authError || !authUser.user) {
      throw new OnboardingError(`Kon account niet aanmaken: ${authError?.message}`);
    }

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

    await sendWelkomstmail({ naam: data.naam, email: data.email });

    return { clientId };
  } catch (error) {
    await supabase.rpc('delete_client_cascade', { target_client_id: clientId });
    throw error;
  }
}
