# Database Conventions

## Transactions
- Use `prisma.$transaction()` for atomic operations.
- Ensure all business logic within a transaction is synchronous or awaited.
- Never perform I/O (network calls, Redis, MQTT) inside a database transaction block.

## Migration Strategy
- Migrations are managed via `prisma migrate`.
- All schema changes must be accompanied by a generated migration file.
- The `migrations` folder should be committed to version control.
- Manual SQL editing in migration files is allowed only when `prisma migrate dev` cannot represent the change (e.g., complex stored procedures).

## Seed Strategy
- Seeding is implemented in `prisma/seed.ts`.
- Use `ts-node` to run the seed script: `npx prisma db seed`.
- Seed data must be idempotent.
- Seeding is for initial configuration, reference data, and development data, not for production application data.
