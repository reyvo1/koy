import { NextResponse } from 'next/server';
import { readSessionRole } from '../../../../lib/session';

export async function GET() {
  const role = await readSessionRole();
  return NextResponse.json({
    authenticated: role !== null,
    role,
  });
}
