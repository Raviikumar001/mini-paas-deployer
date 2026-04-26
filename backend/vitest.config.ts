import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Use an in-memory DB so tests never touch the real SQLite file
    env: { DATABASE_PATH: ':memory:' },
    // Each test file gets its own worker process → fresh module singletons
    pool: 'forks',
  },
})
