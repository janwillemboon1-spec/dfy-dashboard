import { NextResponse } from 'next/server';

// Temporary diagnostic route — deleted immediately after use, not part of the app.
export async function GET() {
  return NextResponse.json({
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL ?? null,
    constructed: `${process.env.NEXT_PUBLIC_BASE_URL}/auth/confirm`,
  });
}
