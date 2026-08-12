'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface PortaalMenuItem {
  label: string;
  href: string;
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

  return (
    <nav className="w-56 shrink-0 border-r border-border p-4 space-y-6">
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
      <ul className="space-y-1">
        {items.map((item) => {
          // startsWith i.p.v. alleen ===: een geneste route binnen een sectie (bv. later
          // /dashboard/voortgang/iets) moet die sectie ook als actief markeren.
          const actief = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
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
    </nav>
  );
}
