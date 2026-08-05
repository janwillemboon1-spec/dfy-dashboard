// Geen `import 'server-only'` hier, anders dan de andere secret-rakende modules in
// src/lib (supabase/admin.ts, email/send-welkomstmail.ts) — dit bestand wordt ook
// geïmporteerd door het losse cron-script (scripts/sync-pricelabs-cron.ts), dat
// buiten Next.js' build om draait via tsx. `server-only` gooit een harde runtime-fout
// zodra hij buiten die build geïmporteerd wordt, dus die guard zou het cron-script
// breken. PRICELABS_API_KEY heeft geen NEXT_PUBLIC_-prefix, dus Next.js bundelt 'm
// sowieso nooit in client-JS — het enige dat deze guard normaal extra voorkomt is dat
// iemand dit bestand per ongeluk vanuit een 'use client'-component importeert (dan
// faalt de fetch met een 401 i.p.v. een duidelijke build-fout).
const PRICELABS_API_BASE = 'https://api.pricelabs.co/v1';

export interface PricelabsListing {
  id: string;
  pms: string;
  name: string;
}

export interface PricelabsReservering {
  reservation_id: string;
  check_in: string;
  check_out: string;
  rental_revenue: string;
  // Nullable, in tegenstelling tot rental_revenue: rechtstreeks-Airbnb-gekoppelde
  // listings (pms=airbnb) geven geen booking_channel terug, en total_cost ontbreekt
  // in dezelfde gevallen — geverifieerd tegen het echte PriceLabs-account.
  total_cost: string | null;
  no_of_days: number;
  booking_status: string;
  booking_channel: string | null;
}

function apiKeyHeader(): HeadersInit {
  const apiKey = process.env.PRICELABS_API_KEY;
  if (!apiKey) {
    // Faalt hier expliciet i.p.v. de non-null assertion een lege header te laten
    // sturen: dat zou anders per listing een cryptische 401 opleveren i.p.v. één
    // duidelijke melding — met name relevant voor de losse cron-service (Taak 11),
    // die deze env var apart van de hoofdservice geconfigureerd moet krijgen.
    throw new Error('PRICELABS_API_KEY ontbreekt — controleer de env vars van deze service.');
  }
  return { 'X-API-Key': apiKey };
}

export async function fetchAllListings(): Promise<PricelabsListing[]> {
  const response = await fetch(`${PRICELABS_API_BASE}/listings`, { headers: apiKeyHeader() });
  if (!response.ok) {
    throw new Error(`PriceLabs /listings gaf status ${response.status} terug`);
  }
  const body = (await response.json()) as { listings: PricelabsListing[] };
  return body.listings;
}

// /v1/reservation_data pagineert via een `offset`-parameter (in aantal records, niet
// documenteerd op de landingspagina — geverifieerd door het echte master-account te
// bevragen: offset=0/100/200 geeft telkens andere rijen, next_page wordt false zodra
// de data op is).
export async function fetchReservationData(input: {
  pms: string;
  listingId: string;
  startDate: string;
  endDate: string;
}): Promise<PricelabsReservering[]> {
  const alle: PricelabsReservering[] = [];
  let offset = 0;

  // Hard cap op het aantal paginas: de offset-paginering hierboven is niet door
  // PriceLabs gedocumenteerd, alleen empirisch geverifieerd. Zonder deze cap zou een
  // onverwachte responsvorm (bv. next_page dat true blijft met identieke data) deze
  // loop voor altijd laten draaien — en dit draait binnen de per-listing loop van het
  // dagelijkse cron-script (Taak 11), dus dat zou de hele sync-run laten hangen.
  // 500 paginas × 100 rijen = 50.000 reserveringen, ruim boven wat één listing ooit
  // realistisch heeft binnen het opgevraagde datumvenster.
  const MAX_PAGINAS = 500;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const url = new URL(`${PRICELABS_API_BASE}/reservation_data`);
    url.searchParams.set('pms', input.pms);
    url.searchParams.set('listing_id', input.listingId);
    url.searchParams.set('start_date', input.startDate);
    url.searchParams.set('end_date', input.endDate);
    url.searchParams.set('offset', String(offset));

    const response = await fetch(url, { headers: apiKeyHeader() });
    if (!response.ok) {
      throw new Error(
        `PriceLabs /reservation_data gaf status ${response.status} terug voor listing ${input.listingId}`
      );
    }
    const body = (await response.json()) as { next_page: boolean; data: PricelabsReservering[] };
    alle.push(...body.data);

    if (!body.next_page || body.data.length === 0) return alle;
    offset += body.data.length;
  }

  throw new Error(
    `PriceLabs /reservation_data bleef na ${MAX_PAGINAS} paginas nog steeds next_page=true melden voor listing ${input.listingId} — mogelijk een API-probleem, sync afgebroken.`
  );
}
