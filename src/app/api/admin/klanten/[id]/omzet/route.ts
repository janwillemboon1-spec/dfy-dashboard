import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertIsAdmin } from '@/lib/auth/assert-admin';
import type { CacheReservering } from '@/lib/dashboard/omzet-aggregatie';
import { berekenOmzetVoorPeriode, shiftJaar, waarschuwBijMogelijkeAfkapping } from '@/lib/dashboard/omzet-voor-periode';

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertIsAdmin();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createClient();

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

  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select('id, naam, nulmeting(jaar, maand, omzet, bezetting)')
    .eq('client_id', id);
  if (listingsError) return NextResponse.json({ error: listingsError.message }, { status: 500 });

  const listingIds = (listings ?? []).map((l) => l.id);

  // .in('listing_id', []) is niet gegarandeerd betrouwbaar tussen PostgREST-versies bij een
  // lege lijst — voor een klant zonder (nog) gekoppelde listings slaan we de queries dus over
  // i.p.v. te vertrouwen op hoe een lege .in() zich toevallig gedraagt.
  let huidigeRijen: CacheReservering[] = [];
  let stlyRijen: CacheReservering[] = [];

  if (listingIds.length > 0) {
    const [{ data: huidigeData, error: huidigeError }, { data: stlyData, error: stlyError }] = await Promise.all([
      supabase
        .from('pricelabs_reserveringen_cache')
        .select('listing_id, check_in, check_out, rental_revenue, total_cost, no_of_days, booking_status, booking_channel')
        .in('listing_id', listingIds)
        .lte('check_in', eind)
        .gt('check_out', start),
      supabase
        .from('pricelabs_reserveringen_cache')
        .select('listing_id, check_in, check_out, rental_revenue, total_cost, no_of_days, booking_status, booking_channel')
        .in('listing_id', listingIds)
        .lte('check_in', stlyEind)
        .gt('check_out', stlyStart),
    ]);
    if (huidigeError) return NextResponse.json({ error: huidigeError.message }, { status: 500 });
    if (stlyError) return NextResponse.json({ error: stlyError.message }, { status: 500 });

    huidigeRijen = huidigeData ?? [];
    stlyRijen = stlyData ?? [];

    waarschuwBijMogelijkeAfkapping('huidige periode', huidigeRijen);
    waarschuwBijMogelijkeAfkapping('STLY-periode', stlyRijen);
  }

  const data = berekenOmzetVoorPeriode({
    listings: listings ?? [],
    huidigeRijen,
    stlyRijen,
    start,
    eind,
    periodeType,
  });

  return NextResponse.json(data);
}
