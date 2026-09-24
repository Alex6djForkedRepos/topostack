import { executeGeometryTask, type ProjectConfigV1 } from "@topostack/core";
import { ensureFonts } from "$lib/domain/fonts";
import type { TaskRequest, TaskResponse } from "$lib/workers/geometry-task-pool";

let configured: { batchId: number; config: ProjectConfigV1 } | undefined;
const reply = (message: TaskResponse) => self.postMessage(message);
self.onmessage = (event: MessageEvent<TaskRequest>) => { void handle(event.data); };
async function handle(message: TaskRequest): Promise<void> {
  try {
    if (message.type === "configure") {
      await ensureFonts([message.config.textStyle.font]);
      configured = { batchId: message.batchId, config: message.config };
      reply({ type: "ready", batchId: message.batchId });
    } else {
      if (!configured || configured.batchId !== message.batchId) throw new Error("Geometry helper needs configuration.");
      reply({ type: "result", batchId: message.batchId, requestId: message.requestId,
        results: message.tasks.map(task => executeGeometryTask(configured!.config, task)),
      });
    }
  } catch (error) {
    reply({ type: "error", batchId: message.batchId, error: error instanceof Error ? error.message : "Geometry helper failed." });
  }
}
