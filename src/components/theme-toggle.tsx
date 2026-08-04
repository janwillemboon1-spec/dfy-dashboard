'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  // useEffect only runs on the client, so we can safely show theme-dependent
  // UI once mounted, without risking a server/client hydration mismatch
  // (see https://github.com/pacocoursey/next-themes#avoid-hydration-mismatch).
  useEffect(() => {
    setMounted(true);
  }, []);

  // Before mount, `theme` is undefined on both server and client renders.
  // Render a disabled placeholder that matches the server-rendered text
  // (defaultTheme is 'dark') so there's no visible flash, and disable it so
  // it can't be clicked before we actually know/can change the theme.
  if (!mounted) {
    return (
      <Button variant="ghost" size="sm" disabled>
        Donker
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? 'Licht' : 'Donker'}
    </Button>
  );
}
