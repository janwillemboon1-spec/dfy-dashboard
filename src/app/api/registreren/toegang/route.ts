import { NextRequest, NextResponse } from 'next/server';
import { magPogingDoen } from '@/lib/rate-limit';
import { zetRegistratieToegangCookie } from '@/lib/registratie/toegang';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'onbekend';
  if (!magPogingDoen(ip)) {
    return NextResponse.json({ error: 'Te veel pogingen, probeer het later opnieuw.' }, { status: 429 });
  }

  const { wachtwoord } = await request.json();

  if (wachtwoord !== process.env.REGISTRATIE_WACHTWOORD) {
    return NextResponse.json({ error: 'Onjuist wachtwoord.' }, { status: 401 });
  }

  await zetRegistratieToegangCookie();
  return NextResponse.json({ ok: true });
}
