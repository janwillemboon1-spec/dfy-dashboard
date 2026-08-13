'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { MenuIcon, XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface PortaalMenuItem {
  label: string;
  href: string;
}

// Gedeeld tussen de desktop-nav en het mobiele uitschuifpaneel hieronder, zodat de
// item-lijst (incl. "actief"-markering) maar op één plek onderhouden hoeft te worden.
// onItemClick is alleen nodig in het mobiele paneel, om het paneel te sluiten zodra een
// item aangetikt wordt — op desktop is er niets om te sluiten.
function NavItems({
  items,
  pathname,
  onItemClick,
}: {
  items: PortaalMenuItem[];
  pathname: string | null;
  onItemClick?: () => void;
}) {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        // startsWith i.p.v. alleen ===: een geneste route binnen een sectie (bv. later
        // /dashboard/voortgang/iets) moet die sectie ook als actief markeren.
        const actief = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onItemClick}
              className={cn(
                'block rounded-md px-3 py-2 text-sm',
                actief
                  ? 'bg-secondary text-secondary-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function PortaalSidebar({
  titel,
  subtitel,
  items,
  terug,
}: {
  titel: string;
  subtitel?: string;
  items: PortaalMenuItem[];
  terug?: { label: string; href: string };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop (>=768px): bestaande, altijd-zichtbare sidebar, ongewijzigd qua uiterlijk. */}
      <nav className="hidden md:block w-56 shrink-0 border-r border-border p-4 space-y-6">
        <div>
          {terug && (
            <Link
              href={terug.href}
              className="mb-2 inline-block text-xs text-muted-foreground hover:underline"
            >
              ← {terug.label}
            </Link>
          )}
          <p className="font-serif text-lg">{titel}</p>
          {subtitel && <p className="text-xs text-muted-foreground">{subtitel}</p>}
        </div>
        <NavItems items={items} pathname={pathname} />
      </nav>

      {/* Mobiel (<768px): smalle bovenbalk met hamburger die de nav als uitschuifpaneel
          opent. De Dialog-Root is gecontroleerd (open/onOpenChange) i.p.v. oncontrolled,
          zodat een klik op een nav-item het paneel ook programmatisch kan sluiten
          (Link's eigen navigatie sluit de Dialog niet vanzelf). */}
      <div className="md:hidden flex items-center gap-2 border-b border-border px-4 py-3">
        <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
          <DialogPrimitive.Trigger render={<Button variant="ghost" size="icon-lg" />}>
            <MenuIcon />
            <span className="sr-only">Menu openen</span>
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/20 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
            <DialogPrimitive.Popup className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-6 border-r border-border bg-background p-4 outline-none data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left">
              <div className="flex items-start justify-between gap-2">
                <div>
                  {terug && (
                    <Link
                      href={terug.href}
                      onClick={() => setOpen(false)}
                      className="mb-2 inline-block text-xs text-muted-foreground hover:underline"
                    >
                      ← {terug.label}
                    </Link>
                  )}
                  <DialogPrimitive.Title render={<p className="font-serif text-lg" />}>
                    {titel}
                  </DialogPrimitive.Title>
                  {subtitel && <p className="text-xs text-muted-foreground">{subtitel}</p>}
                </div>
                <DialogPrimitive.Close render={<Button variant="ghost" size="icon-lg" />}>
                  <XIcon />
                  <span className="sr-only">Menu sluiten</span>
                </DialogPrimitive.Close>
              </div>
              <NavItems items={items} pathname={pathname} onItemClick={() => setOpen(false)} />
            </DialogPrimitive.Popup>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
        <p className="font-serif text-lg">{titel}</p>
      </div>
    </>
  );
}
