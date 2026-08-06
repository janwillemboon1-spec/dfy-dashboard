'use client';

import { useState, useTransition } from 'react';
import { corrigeerNulmeting } from '@/app/[locale]/admin/klanten/[id]/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAAND_NAMEN_KORT } from '@/lib/constants/maanden';

interface NulmetingRij {
  id: string;
  jaar: number;
  maand: number;
  omzet: number;
  bezetting: number;
}

export function NulmetingTabel({
  listingId,
  clientId,
  rijen,
}: {
  listingId: string;
  clientId: string;
  rijen: NulmetingRij[];
}) {
  const [bewerkId, setBewerkId] = useState<string | null>(null);
  const gesorteerd = [...rijen].sort((a, b) => a.jaar - b.jaar || a.maand - b.maand);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th>Maand</th><th>Omzet</th><th>Bezetting</th><th />
        </tr>
      </thead>
      <tbody>
        {gesorteerd.map((rij) =>
          bewerkId === rij.id ? (
            <CorrectieRij
              key={rij.id}
              rij={rij}
              listingId={listingId}
              clientId={clientId}
              onKlaar={() => setBewerkId(null)}
            />
          ) : (
            <tr key={rij.id}>
              <td>{MAAND_NAMEN_KORT[rij.maand - 1]} {rij.jaar}</td>
              <td>€ {rij.omzet.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}</td>
              <td>{rij.bezetting}%</td>
              <td>
                <Button variant="ghost" size="sm" onClick={() => setBewerkId(rij.id)}>Corrigeren</Button>
              </td>
            </tr>
          )
        )}
      </tbody>
    </table>
  );
}

function CorrectieRij({
  rij,
  listingId,
  clientId,
  onKlaar,
}: {
  rij: NulmetingRij;
  listingId: string;
  clientId: string;
  onKlaar: () => void;
}) {
  const [omzet, setOmzet] = useState(rij.omzet);
  const [bezetting, setBezetting] = useState(rij.bezetting);
  const [reden, setReden] = useState('');
  const [foutmelding, setFoutmelding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function opslaan() {
    setFoutmelding(null);
    startTransition(async () => {
      try {
        await corrigeerNulmeting({ nulmetingId: rij.id, omzet, bezetting, reden, listingId, clientId });
        onKlaar();
      } catch (error) {
        setFoutmelding((error as Error).message);
      }
    });
  }

  return (
    <tr>
      <td>{MAAND_NAMEN_KORT[rij.maand - 1]} {rij.jaar}</td>
      <td><Input type="number" value={omzet} onChange={(e) => setOmzet(Number(e.target.value))} /></td>
      <td><Input type="number" value={bezetting} onChange={(e) => setBezetting(Number(e.target.value))} /></td>
      <td className="space-y-1">
        <Input placeholder="Reden voor correctie" value={reden} onChange={(e) => setReden(e.target.value)} />
        {foutmelding && <p className="text-sm text-destructive">{foutmelding}</p>}
        <div className="flex gap-1">
          <Button size="sm" disabled={!reden.trim() || isPending} onClick={opslaan}>Opslaan</Button>
          <Button size="sm" variant="ghost" onClick={onKlaar}>Annuleren</Button>
        </div>
      </td>
    </tr>
  );
}
