import {
  BenchmarkForest,
  benchmarkStats,
} from './benchmark/generated';
import { RebuildTarget, rebuildToken } from './benchmark/rebuild-target';

export function App() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/90 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">
              Rsbuild Tailwind CSS benchmark
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-white">
              Dense utility-class stress fixture
            </h1>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-zinc-400">Screens</dt>
              <dd className="font-semibold">{benchmarkStats.screens}</dd>
            </div>
            <div>
              <dt className="text-zinc-400">Nodes</dt>
              <dd className="font-semibold">{benchmarkStats.nodes}</dd>
            </div>
            <div>
              <dt className="text-zinc-400">Class tokens</dt>
              <dd className="font-semibold">
                {benchmarkStats.classTokens.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-400">Rebuild token</dt>
              <dd className="font-semibold">{rebuildToken}</dd>
            </div>
          </dl>
        </div>
      </header>
      <section className="mx-auto grid max-w-7xl gap-5 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <BenchmarkForest />
        <aside className="sticky top-28 h-fit rounded-lg border border-cyan-300/25 bg-cyan-950/30 p-4 shadow-2xl shadow-cyan-950/40">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-cyan-200">
            Rebuild target
          </h2>
          <p className="mt-2 text-sm text-cyan-50/80">
            The benchmark runner rewrites this imported module during dev-server
            measurements so Tailwind has to process a changed utility surface.
          </p>
          <RebuildTarget />
        </aside>
      </section>
    </main>
  );
}
