'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

// No-op subscribe: there's nothing to subscribe to, we only need
// useSyncExternalStore's server/client snapshot split (see below).
const subscribe = () => () => {};

export function ThemeToggle() {
  // useSyncExternalStore is React's recommended way to read a value that is
  // known to differ between the server render and the client render
  // (mount detection is exactly this case). It reports `false` for the
  // SSR/hydration pass via getServerSnapshot and `true` once running on the
  // client via getSnapshot, without calling setState from inside an effect
  // (avoiding the react-hooks/set-state-in-effect cascading-render warning)
  // while still avoiding a server/client hydration mismatch
  // (see https://github.com/pacocoursey/next-themes#avoid-hydration-mismatch).
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
  const { theme, setTheme } = useTheme();

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
