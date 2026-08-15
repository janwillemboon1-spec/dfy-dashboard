import 'server-only';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITME = 'aes-256-gcm';
const IV_LENGTE = 12; // 96-bit — de aanbevolen/standaard IV-lengte voor GCM.

function haalSleutel(): Buffer {
  const sleutelBase64 = process.env.INLOGGEGEVENS_SLEUTEL;
  if (!sleutelBase64) {
    throw new Error('INLOGGEGEVENS_SLEUTEL ontbreekt — controleer de env vars van deze service.');
  }
  const sleutel = Buffer.from(sleutelBase64, 'base64');
  if (sleutel.length !== 32) {
    throw new Error('INLOGGEGEVENS_SLEUTEL moet een base64-gecodeerde 32-byte sleutel zijn.');
  }
  return sleutel;
}

export function versleutel(platteTekst: string): string {
  const sleutel = haalSleutel();
  const iv = randomBytes(IV_LENGTE);
  const cipher = createCipheriv(ALGORITME, sleutel, iv);
  const cijfertekst = Buffer.concat([cipher.update(platteTekst, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${authTag.toString('base64')}.${cijfertekst.toString('base64')}`;
}

export function ontsleutel(cijfertekstToken: string): string {
  const sleutel = haalSleutel();
  const [ivBase64, authTagBase64, cijfertekstBase64] = cijfertekstToken.split('.');
  if (!ivBase64 || !authTagBase64 || !cijfertekstBase64) {
    throw new Error('Ongeldig versleutelingsformaat.');
  }
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const cijfertekst = Buffer.from(cijfertekstBase64, 'base64');
  const decipher = createDecipheriv(ALGORITME, sleutel, iv);
  decipher.setAuthTag(authTag);
  const platteTekst = Buffer.concat([decipher.update(cijfertekst), decipher.final()]);
  return platteTekst.toString('utf8');
}
