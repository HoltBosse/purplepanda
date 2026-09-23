// Runs the built Astro `node` standalone server (dist/server/entry.mjs) as one worker per CPU
// core instead of a single unmanaged process. A single process serializes every request's
// CPU-bound work (React SSR, JSON tree walks) on one event loop/one core; under `ab -c 1000`
// that's what was blowing out tail latency (95th/99th/max all ~3x worse) even after fixing the
// DB-side bottlenecks (see content-cache.ts, db/index.ts pool size). PM2's cluster mode spreads
// incoming connections across `instances` workers via Node's native `cluster` module.
module.exports = {
  apps: [
    {
      name: "purplepanda",
      script: "./dist/server/entry.mjs",
      cwd: __dirname,
      exec_mode: "cluster",
      instances: "max",
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: "3012",
      },
    },
  ],
};
