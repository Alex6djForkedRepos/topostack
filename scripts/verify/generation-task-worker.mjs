import { parentPort, workerData } from 'node:worker_threads';
const { executeGeometryTask } = await import(workerData.engineUrl);
let configured;
parentPort.on('message', message => {
  try {
    if (message.type === 'configure') {
      configured = { config: message.config, batchId: message.batchId };
      parentPort.postMessage({ type: 'ready', batchId: message.batchId });
    } else {
      if (!configured || configured.batchId !== message.batchId) throw new Error('Missing task configuration');
      parentPort.postMessage({ type: 'result', batchId: message.batchId, requestId: message.requestId,
        results: message.tasks.map(task => executeGeometryTask(configured.config, task)),
      });
    }
  } catch (error) { parentPort.postMessage({ type: 'error', batchId: message.batchId, error: error.message }); }
});
