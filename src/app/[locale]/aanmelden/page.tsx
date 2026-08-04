import { OnboardingForm } from '@/components/onboarding/onboarding-form';

export default function AanmeldenPage() {
  return (
    <main className="mx-auto max-w-3xl py-16 px-4">
      <h1 className="font-serif text-3xl mb-2">Welkom bij Boon Vakantieverhuur</h1>
      <p className="text-muted-foreground mb-10">
        Vul je gegevens in om je dashboard te activeren.
      </p>
      <OnboardingForm />
    </main>
  );
}
