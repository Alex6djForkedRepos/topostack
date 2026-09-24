import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import ts from 'typescript';

/** Run the production pool scheduler against real Node threads, with identical structured cloning. */
export async function benchmarkPool(size, engineUrl, onFallback) {
  const cache = new URL('../../node_modules/.cache/topostack-parallel/', import.meta.url);
  await mkdir(cache, { recursive: true });
  const source = await readFile(new URL('../../apps/generator/src/lib/workers/geometry-task-pool.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const moduleUrl = new URL('pool.mjs', cache);
  await writeFile(moduleUrl, compiled);
  const { GeometryTaskPool } = await import(moduleUrl.href);
  return new GeometryTaskPool(() => {
    const worker = new Worker(new URL('./generation-task-worker.mjs', import.meta.url), { workerData: { engineUrl } });
    const adapter = { onmessage: null, onerror: null, onmessageerror: null,
      postMessage: message => worker.postMessage(message), terminate: () => { void worker.terminate(); },
    };
    worker.on('message', data => adapter.onmessage?.({ data }));
    worker.on('error', error => adapter.onerror?.({ message: error.message }));
    worker.on('messageerror', () => adapter.onmessageerror?.());
    return adapter;
  }, size, 30_000, onFallback);
}
