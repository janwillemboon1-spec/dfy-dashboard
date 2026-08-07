import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { aggregeer, dagenInPeriode, groepeerPerListing } from '@/lib/dashboard/omzet-aggregatie';
import { nulmetingAlsMetrics, type NulmetingRij } from '@/lib/dashboard/nulmeting-metrics';

function shiftJaar(datum: string, jaren: number): string {
  return datum.replace(/^(\d{4})/, (jaarStr) => String(Number(jaarStr) + jaren));
}

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

// PostgREST's max_rows staat op 1000 (supabase/config.toml) — geen paginering op de
// reserveringen-queries hieronder, dus een resultaat van precies 1000 rijen is een
// signaal dat de data mogelijk afgekapt is i.p.v. compleet. Geen harde fout (de
// dashboardcijfers zijn dan nog steeds bruikbaar, alleen mogelijk een onderschatting),
// wel zichtbaar loggen zodat dit opvalt vóórdat een klant het zelf meldt.
const MAX_RIJEN_PER_QUERY = 1000;
function waarschuwBijMogelijkeAfkapping(label: string, rijen: unknown[] | null): void {
  if ((rijen?.length ?? 0) >= MAX_RIJEN_PER_QUERY) {
    console.warn(`[api/dashboard/omzet] ${label}: ${rijen!.length} rijen opgehaald — mogelijk afgekapt door PostgREST's max_rows.`);
  }
}

// Geen expliciet client_id-filter nodig op onderstaande queries: de RLS-policies
// ("klant leest eigen listings/reserveringen") scopen dit al af tot precies de data
// van de ingelogde klant, zelfde patroon als src/app/[locale]/dashboard/page.tsx. Dat
// patroon werkt alléén omdat admin-sessies hieronder expliciet geweigerd worden — voor
// role=admin laten de "admin volledige toegang ..."-policies namelijk juist alles
// ongefilterd door (zie de admin-redirect + toelichting in dashboard/page.tsx voor de
// achtergrond van precies dit risico).
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
  // Faalt dicht: alleen de letterlijke waarde "vast" schakelt de nulmeting-vergelijking
  // in. Een ontbrekende/verkeerd gespelde/toekomstige param-waarde onderdrukt 'm dus
  // (portfolioNulmeting/nulmeting = null) i.p.v. per ongeluk een misleidende
  // nulmeting-vergelijking te berekenen tegen een periode die daar niet voor bedoeld is.
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

  const aantalListings = listings?.length ?? 0;
  const dagen = dagenInPeriode(start, eind);
  const stlyDagen = dagenInPeriode(stlyStart, stlyEind);

  const alleNulmeting: NulmetingRij[] = (listings ?? []).flatMap((l) => l.nulmeting ?? []);

  // aggregeer() gebruikt een exclusieve periodeEind (net als check_out) om de overlap per
  // reservering te bepalen — eind/stlyEind zelf zijn de laatste inclusieve kalenderdag
  // (dagenInPeriode telt daarom ook inclusief), dus hier +1 dag zodat een reservering die
  // op eind zelf incheckt niet ten onrechte buiten de periode valt.
  function exclusieveGrens(datum: string): string {
    const d = new Date(`${datum}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  const eindExclusief = exclusieveGrens(eind);
  const stlyEindExclusief = exclusieveGrens(stlyEind);

  const portfolio = aggregeer(huidigeRijen ?? [], start, eindExclusief, dagen * aantalListings);
  const portfolioStly = aggregeer(stlyRijen ?? [], stlyStart, stlyEindExclusief, stlyDagen * aantalListings);
  const portfolioNulmeting = periodeType === 'vast' ? nulmetingAlsMetrics(alleNulmeting, start, eind) : null;

  const perListingHuidig = groepeerPerListing(huidigeRijen ?? []);
  const perListingStly = groepeerPerListing(stlyRijen ?? []);

  const listingsUitkomst = (listings ?? []).map((l) => {
    const metrics = aggregeer(perListingHuidig[l.id] ?? [], start, eindExclusief, dagen);
    const stlyMetrics = aggregeer(perListingStly[l.id] ?? [], stlyStart, stlyEindExclusief, stlyDagen);
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

  function maandGrenzen(maand: string): { start: string; eind: string } {
    const [jaarStr, maandNummerStr] = maand.split('-');
    const jaar = Number(jaarStr);
    const maandNummer = Number(maandNummerStr);
    const volgende = maandNummer === 12 ? { jaar: jaar + 1, maand: 1 } : { jaar, maand: maandNummer + 1 };
    return {
      start: `${maand}-01`,
      eind: `${volgende.jaar}-${String(volgende.maand).padStart(2, '0')}-01`,
    };
  }

  // Hergebruikt de al overlap-gefetchte huidigeRijen/stlyRijen (i.p.v. per maand vooraf te
  // bucketen): aggregeer() filtert zelf al op overlap met [maandStart, maandEind), dus een
  // reservering die een maandgrens overschrijdt telt vanzelf naar rato mee in beide maanden.
  const trend = trendMaanden.map((maand) => {
    const stlyMaand = shiftJaar(`${maand}-01`, -1).slice(0, 7);
    const [, maandNummerStr] = maand.split('-');
    const maandNummer = Number(maandNummerStr);
    const omzetNulmeting = periodeType === 'vast'
      ? alleNulmeting.filter((r) => r.maand === maandNummer).reduce((s, r) => s + r.omzet, 0)
      : null;
    const { start: maandStart, eind: maandEind } = maandGrenzen(maand);
    const { start: stlyMaandStart, eind: stlyMaandEind } = maandGrenzen(stlyMaand);
    return {
      maand,
      omzet: aggregeer(huidigeRijen ?? [], maandStart, maandEind, 30).omzet,
      omzetStly: aggregeer(stlyRijen ?? [], stlyMaandStart, stlyMaandEind, 30).omzet,
      omzetNulmeting,
    };
  });

  return NextResponse.json({
    periode: { start, eind, stlyStart, stlyEind },
    periodeType,
    portfolio,
    portfolioStly,
    portfolioNulmeting,
    listings: listingsUitkomst,
    trend,
  });
}
