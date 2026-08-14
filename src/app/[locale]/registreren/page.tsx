import { heeftRegistratieToegang } from '@/lib/registratie/toegang';
import { WachtwoordGate } from '@/components/registratie/wachtwoord-gate';
import { RegistratieForm } from '@/components/registratie/registratie-form';

export default async function RegistrerenPage() {
  const toegang = await heeftRegistratieToegang();

  return (
    <main className="mx-auto max-w-3xl py-16 px-4">
      <h1 className="font-serif text-3xl mb-2">Maak je account aan</h1>
      <p className="text-muted-foreground mb-10">
        Vul je gegevens in om toegang te krijgen tot je klantportaal.
      </p>
      {toegang ? <RegistratieForm /> : <WachtwoordGate />}
    </main>
  );
}
