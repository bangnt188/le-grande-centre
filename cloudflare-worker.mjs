import worker from "./.open-next/worker.js";
import { dispatchScheduledNotifications } from "./src/server/notification-schedule.ts";

// Preserve all installed OpenNext durable-object exports as the adapter evolves.
export * from "./.open-next/worker.js";

export default {
  ...worker,
  async fetch(request, env, ctx) {
    const response = await worker.fetch(request, env, ctx);
    if (request.method === "POST" && /^\/api\/contact\/?$/.test(new URL(request.url).pathname) && response.status === 201) {
      // ponytail: event wake is best-effort; the durable outbox and sparse cron recover interrupted work.
      ctx.waitUntil(dispatchScheduledNotifications(env));
    }
    return response;
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(dispatchScheduledNotifications(env));
  },
};
