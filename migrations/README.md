# Database Migrations

This folder contains versioned Drizzle SQL migration files.

## Preferred workflow for all future schema changes

**Always use `db:generate` + `db:migrate` — never `db:push`.**

```
1. Edit shared/schema.ts
2. npm run db:generate      # creates a new numbered .sql file here
3. git commit the .sql file alongside the code that depends on it
4. npm run db:migrate       # applies unapplied migrations to the database
```

`db:push` has been removed from `package.json`. Do not add it back —
it applies changes without generating a file, leaving no audit trail.

## Baseline

`0000_baseline.sql` captures the full schema as it existed at Task #89.
The file is for reference only — it has already been marked as applied
in the `drizzle.__drizzle_migrations` tracking table.
**Do NOT run it against the database** (tables already exist).

## Migration tracking

Drizzle records applied migrations in the `drizzle.__drizzle_migrations`
table in PostgreSQL. Each row stores the migration tag and a timestamp.

## Post-merge automation

`scripts/post-merge.sh` runs `npm run db:migrate` automatically after
every task merge, so any migration files committed in a task are applied
without manual intervention.
