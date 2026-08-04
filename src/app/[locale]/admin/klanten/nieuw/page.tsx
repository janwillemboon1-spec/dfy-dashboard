import { OnboardingForm } from '@/components/onboarding/onboarding-form';

export default function NieuweKlantPage() {
  return (
    <main className="mx-auto max-w-3xl py-10 px-4">
      <h1 className="font-serif text-2xl mb-6">Nieuwe klant toevoegen</h1>
      <OnboardingForm />
    </main>
  );
}
