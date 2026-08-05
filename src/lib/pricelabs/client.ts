const PRICELABS_API_BASE = 'https://api.pricelabs.co/v1';

export interface PricelabsListing {
  id: string;
  pms: string;
  name: string;
}

export interface PricelabsReservering {
  check_in: string;
  check_out: string;
  rental_revenue: string;
  booking_status: string;
}

function apiKeyHeader(): HeadersInit {
  return { 'X-API-Key': process.env.PRICELABS_API_KEY! };
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

  for (;;) {
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

    if (!body.next_page || body.data.length === 0) break;
    offset += body.data.length;
  }

  return alle;
}
