import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';

function handtekening(verlooptOp: number): string {
  const wachtwoord = process.env.REGISTRATIE_WACHTWOORD;
  if (!wachtwoord) {
    throw new Error('REGISTRATIE_WACHTWOORD ontbreekt — controleer de env vars van deze service.');
  }
  const hmac = createHmac('sha256', wachtwoord);
  hmac.update(String(verlooptOp));
  return hmac.digest('hex');
}

export function maakToegangsToken(verlooptOp: number): string {
  return `${verlooptOp}.${handtekening(verlooptOp)}`;
}

export function tokenIsGeldig(token: string | undefined): boolean {
  if (!token) return false;

  const [verlooptOpStr, opgegevenHandtekening] = token.split('.');
  const verlooptOp = Number(verlooptOpStr);
  if (!verlooptOp || !opgegevenHandtekening || Date.now() > verlooptOp) return false;

  const verwacht = handtekening(verlooptOp);
  const a = Buffer.from(opgegevenHandtekening);
  const b = Buffer.from(verwacht);
  // timingSafeEqual vereist gelijke buffer-lengte — een lengteverschil betekent sowieso
  // een ongeldig/geknoeid token.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
