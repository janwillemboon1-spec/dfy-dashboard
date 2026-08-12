import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { berekenOmzetVoorPeriode, shiftJaar, waarschuwBijMogelijkeAfkapping } from '@/lib/dashboard/omzet-voor-periode';

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

// Geen expliciet client_id-filter nodig op onderstaande queries: de RLS-policies
// ("klant leest eigen listings/reserveringen") scopen dit al af tot precies de data
// van de ingelogde klant, zelfde patroon als src/app/[locale]/dashboard/page.tsx. Dat
// patroon werkt alléén omdat admin-sessies hieronder expliciet geweigerd worden — voor
// role=admin laten de "admin volledige toegang ..."-policies namelijk juist alles
// ongefilterd door (zie de admin-redirect + toelichting in dashboard/page.tsx voor de
// achtergrond van precies dit risico). De admin-variant van dit endpoint zit apart in
// src/app/api/admin/klanten/[id]/omzet/route.ts, met een expliciet client_id-filter.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 });

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (profile?.role === 'admin') {
    return NextResponse.json({ error: 'Dit endpoint is alleen voor klant-sessies.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const eind = url.searchParams.get('eind');
  const periodeType = url.searchParams.get('periodeType') === 'vast' ? 'vast' : 'eigen';

  if (!start || !eind) {
    return NextResponse.json({ error: 'start en eind zijn verplicht.' }, { status: 400 });
  }
  if (!ISO_DATUM.test(start) || !ISO_DATUM.test(eind)) {
    return NextResponse.json({ error: 'start en eind moeten het formaat JJJJ-MM-DD hebben.' }, { status: 400 });
  }
  if (start > eind) {
    return NextResponse.json({ error: 'start mag niet na eind liggen.' }, { status: 400 });
  }

  const stlyStart = shiftJaar(start, -1);
  const stlyEind = shiftJaar(eind, -1);

  const [
    { data: listings, error: listingsError },
    { data: huidigeRijen, error: huidigeError },
    { data: stlyRijen, error: stlyError },
  ] = await Promise.all([
    supabase.from('listings').select('id, naam, nulmeting(jaar, maand, omzet, bezetting)'),
    supabase
      .from('pricelabs_reserveringen_cache')
      .select('listing_id, check_in, check_out, rental_revenue, total_cost, no_of_days, booking_status, booking_channel')
      .lte('check_in', eind)
      .gt('check_out', start),
    supabase
      .from('pricelabs_reserveringen_cache')
      .select('listing_id, check_in, check_out, rental_revenue, total_cost, no_of_days, booking_status, booking_channel')
      .lte('check_in', stlyEind)
      .gt('check_out', stlyStart),
  ]);
  if (listingsError) return NextResponse.json({ error: listingsError.message }, { status: 500 });
  if (huidigeError) return NextResponse.json({ error: huidigeError.message }, { status: 500 });
  if (stlyError) return NextResponse.json({ error: stlyError.message }, { status: 500 });

  waarschuwBijMogelijkeAfkapping('huidige periode', huidigeRijen);
  waarschuwBijMogelijkeAfkapping('STLY-periode', stlyRijen);

  const data = berekenOmzetVoorPeriode({
    listings: listings ?? [],
    huidigeRijen: huidigeRijen ?? [],
    stlyRijen: stlyRijen ?? [],
    start,
    eind,
    periodeType,
  });

  return NextResponse.json(data);
}
