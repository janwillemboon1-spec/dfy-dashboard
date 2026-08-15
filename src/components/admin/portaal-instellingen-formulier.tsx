'use client';

import { useState, useTransition } from 'react';
import { wijzigPortaalInstellingen } from '@/app/[locale]/admin/instellingen/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PortaalInstellingenFormulier({
  videoUrl: initieleVideoUrl,
  formulierUrl: initieleFormulierUrl,
}: {
  videoUrl: string | null;
  formulierUrl: string | null;
}) {
  const [videoUrl, setVideoUrl] = useState(initieleVideoUrl ?? '');
  const [formulierUrl, setFormulierUrl] = useState(initieleFormulierUrl ?? '');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [opgeslagen, setOpgeslagen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function opslaan() {
    setFoutmelding(null);
    setOpgeslagen(false);
    startTransition(async () => {
      const resultaat = await wijzigPortaalInstellingen({
        videoUrl: videoUrl.trim() || null,
        formulierUrl: formulierUrl.trim() || null,
      });
      if (!resultaat.succes) {
        setFoutmelding(resultaat.fout ?? 'Onbekende fout bij opslaan.');
        return;
      }
      setOpgeslagen(true);
    });
  }

  return (
    <div className="max-w-md space-y-4">
      <div>
        <Label htmlFor="instellingen-video-url">Video-link</Label>
        <Input
          id="instellingen-video-url"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://player.vimeo.com/video/..."
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Plak hier de embed-link van Vimeo of Loom, niet de gewone deel-link.
        </p>
      </div>
      <div>
        <Label htmlFor="instellingen-formulier-url">Formulier-link</Label>
        <Input
          id="instellingen-formulier-url"
          value={formulierUrl}
          onChange={(e) => setFormulierUrl(e.target.value)}
          placeholder="https://tally.so/embed/..."
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Plak hier de embed-link van je formuliertool (Typeform, Tally, enz.).
        </p>
      </div>
      <Button onClick={opslaan} disabled={isPending}>
        {isPending ? 'Bezig...' : 'Opslaan'}
      </Button>
      {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
      {opgeslagen && !foutmelding && <p className="text-sm text-muted-foreground">Opgeslagen.</p>}
    </div>
  );
}
