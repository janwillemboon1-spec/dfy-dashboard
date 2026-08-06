import { ThemeToggle } from '@/components/theme-toggle';
import { SignOutButton } from '@/components/sign-out-button';

// Geen eigen auth-check hier: dashboard/page.tsx doet die zelf al (redirect naar
// /login zonder sessie, redirect naar /admin/klanten voor een admin-rol) — een layout
// rendert samen met de pagina, dus die redirect voorkomt al dat dit header-omhulsel
// ooit zichtbaar wordt zonder geldige klant-sessie.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-end gap-1">
        <ThemeToggle />
        <SignOutButton />
      </header>
      {children}
    </div>
  );
}
