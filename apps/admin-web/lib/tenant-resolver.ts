import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Resolve a tenant identifier that may be either the exact tenant UUID
 * or the tenant display name (case-insensitive). Returns null when no
 * unique match exists. Fail-closed: ambiguous or unknown input is null.
 */
export async function resolveTenantId(
  input: string,
): Promise<string | null> {
  const value = input.trim();
  if (value.length === 0 || value.length > 256) return null;

  const byId = await prisma.tenant.findUnique({ where: { id: value } });
  if (byId) return byId.id;

  const matches = await prisma.tenant.findMany({
    where: { name: { equals: value, mode: 'insensitive' as const } },
    select: { id: true },
    take: 2,
  });
  if (matches.length === 1) return matches[0].id;
  return null;
}
