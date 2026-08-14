import 'server-only';
import { cookies } from 'next/headers';
import { maakToegangsToken, tokenIsGeldig } from './toegang-token';

const COOKIE_NAAM = 'registratie_toegang';
const GELDIGHEID_MS = 24 * 60 * 60 * 1000;

export async function zetRegistratieToegangCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAAM, maakToegangsToken(Date.now() + GELDIGHEID_MS), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: GELDIGHEID_MS / 1000,
    path: '/',
  });
}

export async function heeftRegistratieToegang(): Promise<boolean> {
  const cookieStore = await cookies();
  return tokenIsGeldig(cookieStore.get(COOKIE_NAAM)?.value);
}
