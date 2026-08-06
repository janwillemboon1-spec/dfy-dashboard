'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

export function SignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function uitloggen() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={uitloggen} disabled={isPending}>
      {isPending ? 'Bezig...' : 'Uitloggen'}
    </Button>
  );
}
