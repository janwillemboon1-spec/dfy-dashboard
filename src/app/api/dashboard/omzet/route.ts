import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { aggregeer, dagenInPeriode, groepeerPerMaand, groepeerPerListing } from '@/lib/dashboard/omzet-aggregatie';
import { nulmetingAlsMetrics, type NulmetingRij } from '@/lib/dashboard/nulmeting-metrics';

function shiftJaar(datum: string, jaren: number): string {
  return datum.replace(/^(\d{4})/, (jaarStr) => String(Number(jaarStr) + jaren));
}

// Geen expliciet client_id-filter nodig op onderstaande queries: de RLS-policies
// ("klant leest eigen listings/reserveringen") scopen dit al af tot precies de data
// van de ingelogde klant, zelfde patroon als src/app/[locale]/dashboard/page.tsx.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 });

  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const eind = url.searchParams.get('eind');
  const periodeType = url.searchParams.get('periodeType') === 'eigen' ? 'eigen' : 'vast';

  if (!start || !eind) {
    return NextResponse.json({ error: 'start en eind zijn verplicht.' }, { status: 400 });
  }
  if (start > eind) {
    return NextResponse.json({ error: 'start mag niet na eind liggen.' }, { status: 400 });
  }

  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select('id, naam, nulmeting(jaar, maand, omzet, bezetting)');
  if (listingsError) return NextResponse.json({ error: listingsError.message }, { status: 500 });

  const stlyStart = shiftJaar(start, -1);
  const stlyEind = shiftJaar(eind, -1);

  const { data: huidigeRijen, error: huidigeError } = await supabase
    .from('pricelabs_reserveringen_cache')
    .select('listing_id, check_in, check_out, rental_revenue, total_cost, no_of_days, booking_status, booking_channel')
    .gte('check_in', start)
    .lte('check_in', eind);
  if (huidigeError) return NextResponse.json({ error: huidigeError.message }, { status: 500 });

  const { data: stlyRijen, error: stlyError } = await supabase
    .from('pricelabs_reserveringen_cache')
    .select('listing_id, check_in, check_out, rental_revenue, total_cost, no_of_days, booking_status, booking_channel')
    .gte('check_in', stlyStart)
    .lte('check_in', stlyEind);
  if (stlyError) return NextResponse.json({ error: stlyError.message }, { status: 500 });

  const aantalListings = listings?.length ?? 0;
  const dagen = dagenInPeriode(start, eind);
  const stlyDagen = dagenInPeriode(stlyStart, stlyEind);

  const alleNulmeting: NulmetingRij[] = (listings ?? []).flatMap((l) => l.nulmeting ?? []);

  const portfolio = aggregeer(huidigeRijen ?? [], dagen * aantalListings);
  const portfolioStly = aggregeer(stlyRijen ?? [], stlyDagen * aantalListings);
  const portfolioNulmeting = periodeType === 'vast' ? nulmetingAlsMetrics(alleNulmeting, start, eind) : null;

  const perListingHuidig = groepeerPerListing(huidigeRijen ?? []);
  const perListingStly = groepeerPerListing(stlyRijen ?? []);

  const listingsUitkomst = (listings ?? []).map((l) => {
    const metrics = aggregeer(perListingHuidig[l.id] ?? [], dagen);
    const stlyMetrics = aggregeer(perListingStly[l.id] ?? [], stlyDagen);
    const nulmetingMetrics = periodeType === 'vast' ? nulmetingAlsMetrics(l.nulmeting ?? [], start, eind) : null;
    return {
      listing_id: l.id,
      listing_naam: l.naam,
      ...metrics,
      stly: stlyMetrics,
      nulmeting: nulmetingMetrics,
    };
  }).sort((a, b) => b.omzet - a.omzet);

  const trendMaanden: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const eindMaand = eind.slice(0, 7);
  while (cursor.toISOString().slice(0, 7) <= eindMaand) {
    trendMaanden.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const huidigPerMaand = groepeerPerMaand(huidigeRijen ?? []);
  const stlyPerMaand = groepeerPerMaand(stlyRijen ?? []);

  const trend = trendMaanden.map((maand) => {
    const stlyMaand = shiftJaar(`${maand}-01`, -1).slice(0, 7);
    const [, maandNummerStr] = maand.split('-');
    const maandNummer = Number(maandNummerStr);
    const omzetNulmeting = periodeType === 'vast'
      ? alleNulmeting.filter((r) => r.maand === maandNummer).reduce((s, r) => s + r.omzet, 0)
      : null;
    return {
      maand,
      omzet: aggregeer(huidigPerMaand[maand] ?? [], 30).omzet,
      omzetStly: aggregeer(stlyPerMaand[stlyMaand] ?? [], 30).omzet,
      omzetNulmeting,
    };
  });

  return NextResponse.json({
    periode: { start, eind, stlyStart, stlyEind },
    portfolio,
    portfolioStly,
    portfolioNulmeting,
    listings: listingsUitkomst,
    trend,
  });
}
