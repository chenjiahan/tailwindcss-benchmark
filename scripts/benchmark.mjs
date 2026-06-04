import { spawn } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  fixtureConfig,
  generateFixture,
  writeRebuildTarget,
} from './generate-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iterations = Number(process.env.BENCH_ITERATIONS ?? 3);
const rebuildIterations = Number(process.env.BENCH_REBUILD_ITERATIONS ?? 5);
const integrationFilter = new Set(
  (process.env.BENCH_INTEGRATIONS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

const allIntegrations = [
  {
    key: 'plugin-tailwindcss',
    label: '@rsbuild/plugin-tailwindcss',
    config: 'rsbuild.plugin.config.ts',
    port: 4321,
  },
  {
    key: 'plugin-tailwindcss-optimize',
    label: '@rsbuild/plugin-tailwindcss (optimize: true)',
    config: 'rsbuild.plugin.optimize.config.ts',
    port: 4331,
  },
  {
    key: 'postcss',
    label: '@tailwindcss/postcss',
    config: 'rsbuild.postcss.config.ts',
    port: 4322,
  },
];

const integrations =
  integrationFilter.size === 0
    ? allIntegrations
    : allIntegrations.filter((integration) => integrationFilter.has(integration.key));

if (integrations.length === 0) {
  throw new Error(
    `No integrations matched BENCH_INTEGRATIONS=${process.env.BENCH_INTEGRATIONS}`,
  );
}

const stripAnsi = (value) =>
  value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');

const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

const round = (value) => Math.round(value);

const runProcess = (args, env = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn('pnpm', args, {
      cwd: root,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';

    child.stdout.on('data', (chunk) => {
      output += stripAnsi(chunk.toString());
    });
    child.stderr.on('data', (chunk) => {
      output += stripAnsi(chunk.toString());
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(output);
        return;
      }

      reject(
        new Error(
          `Command failed (${code}): pnpm ${args.join(' ')}\n${output.slice(-4000)}`,
        ),
      );
    });
  });

class WatchedProcess {
  constructor(args, env) {
    this.output = '';
    this.waiters = new Set();
    this.child = spawn('pnpm', args, {
      cwd: root,
      detached: true,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const onData = (chunk) => {
      const text = stripAnsi(chunk.toString());
      this.output += text;
      for (const waiter of [...this.waiters]) {
        if (waiter.matcher(text)) {
          clearTimeout(waiter.timer);
          this.waiters.delete(waiter);
          waiter.resolve(text);
        }
      }
    };

    this.child.stdout.on('data', onData);
    this.child.stderr.on('data', onData);
    this.exit = new Promise((resolve) => {
      this.child.on('close', resolve);
    });
  }

  waitFor(matcher, timeoutMs) {
    return new Promise((resolve, reject) => {
      const waiter = {
        matcher,
        resolve,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(
            new Error(
              `Timed out waiting for dev output.\n${this.output.slice(-4000)}`,
            ),
          );
        }, timeoutMs),
      };
      this.waiters.add(waiter);
    });
  }

  async stop() {
    if (this.child.exitCode !== null) {
      return;
    }

    try {
      process.kill(-this.child.pid, 'SIGTERM');
    } catch {
      this.child.kill('SIGTERM');
    }

    const code = await Promise.race([
      this.exit,
      new Promise((resolve) => {
        setTimeout(() => {
          try {
            process.kill(-this.child.pid, 'SIGKILL');
          } catch {
            this.child.kill('SIGKILL');
          }
          resolve('killed');
        }, 5000);
      }),
    ]);

    if (code !== 0 && code !== null && code !== 'killed') {
      throw new Error(`Dev server exited with code ${code}.\n${this.output.slice(-4000)}`);
    }
  }
}

const readyMatcher = (text) =>
  /ready in\s+\d/i.test(text) ||
  /compiled successfully/i.test(text) ||
  /compiled in\s+\d/i.test(text) ||
  /built in\s+\d/i.test(text) ||
  /localhost:\d+/i.test(text);

const rebuildMatcher = (text) =>
  /compiled successfully/i.test(text) ||
  /compiled in\s+\d/i.test(text) ||
  /built in\s+\d/i.test(text) ||
  /done in\s+\d/i.test(text);

async function measureBuild(integration) {
  const samples = [];

  for (let i = 0; i < iterations; i += 1) {
    await rm(path.join(root, 'dist', integration.key), {
      recursive: true,
      force: true,
    });
    const start = performance.now();
    await runProcess(['exec', 'rsbuild', 'build', '--config', integration.config], {
      NODE_ENV: 'production',
    });
    samples.push(performance.now() - start);
  }

  return samples;
}

async function measureDevAndRebuild(integration) {
  const devSamples = [];
  const rebuildSamples = [];

  for (let i = 0; i < iterations; i += 1) {
    const dev = new WatchedProcess(
      ['exec', 'rsbuild', 'dev', '--config', integration.config],
      {
        NODE_ENV: 'development',
        PORT: String(integration.port + i),
      },
    );

    try {
      const start = performance.now();
      await dev.waitFor(readyMatcher, 180000);
      devSamples.push(performance.now() - start);

      for (let j = 0; j < rebuildIterations; j += 1) {
        const seed = i * rebuildIterations + j + 1;
        const rebuildStart = performance.now();
        await writeRebuildTarget(seed);
        await dev.waitFor(rebuildMatcher, 180000);
        rebuildSamples.push(performance.now() - rebuildStart);
      }
    } finally {
      await dev.stop();
      await writeRebuildTarget(0);
    }
  }

  return { devSamples, rebuildSamples };
}

async function main() {
  await generateFixture();

  const results = [];

  for (const integration of integrations) {
    console.log(`Measuring ${integration.label}...`);
    const build = await measureBuild(integration);
    const { devSamples, rebuildSamples } = await measureDevAndRebuild(integration);
    results.push({
      key: integration.key,
      label: integration.label,
      samples: {
        build: build.map(round),
        dev: devSamples.map(round),
        rebuild: rebuildSamples.map(round),
      },
      summary: {
        buildMeanMs: round(mean(build)),
        buildMedianMs: round(median(build)),
        devMeanMs: round(mean(devSamples)),
        devMedianMs: round(median(devSamples)),
        rebuildMeanMs: round(mean(rebuildSamples)),
        rebuildMedianMs: round(median(rebuildSamples)),
      },
    });
  }

  const payload = {
    date: new Date().toISOString(),
    iterations,
    rebuildIterations,
    fixture: fixtureConfig,
    results,
  };

  await writeFile(
    path.join(root, 'benchmark-results.json'),
    `${JSON.stringify(payload, null, 2)}\n`,
  );

  console.log(JSON.stringify(payload, null, 2));
}

await main();
