import { NextRequest, NextResponse } from 'next/server';
import { registreerKlant, RegistratieError } from '@/lib/registratie/registreer-klant';
import { magPogingDoen } from '@/lib/rate-limit';
import { heeftRegistratieToegang } from '@/lib/registratie/toegang';

export async function POST(request: NextRequest) {
  if (!(await heeftRegistratieToegang())) {
    return NextResponse.json({ error: 'Niet geautoriseerd.' }, { status: 401 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'onbekend';
  if (!magPogingDoen(ip)) {
    return NextResponse.json({ error: 'Te veel pogingen, probeer het later opnieuw.' }, { status: 429 });
  }

  const body = await request.json();

  if (body.honeypot) {
    return NextResponse.json({ ok: true });
  }

  try {
    const result = await registreerKlant(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RegistratieError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Er ging iets mis, probeer het later opnieuw.' }, { status: 500 });
  }
}
