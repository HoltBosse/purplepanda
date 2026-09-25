/// <reference types="node" />
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  // purplepanda_rate_limits and purplepanda_csrf_used_tokens are created at runtime by
  // rate-limiter-flexible, not declared in schema.ts. Without this, every `push` offers to drop
  // them (or treat a new table as a rename of one), which also makes it fail in a non-TTY shell.
  tablesFilter: ['!purplepanda_*'],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
