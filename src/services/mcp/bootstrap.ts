import { Logger } from "../../utils/logger";

/**
 * Dedupe and execute AMPP schema bootstrap for a server.
 * Accepts a shared in-flight tracker Map to prevent duplicate concurrent refreshes.
 */
export async function bootstrapSchemasOnce(
  serverId: string,
  callFn: (serverId: string, fn: string, args: any) => Promise<any>,
  inFlight: Map<string, Promise<void>>,
  logger: Logger
): Promise<void> {
  const existing = inFlight.get(serverId);
  if (existing) return existing;

  const p = (async () => {
    try {
      logger.info(`[${serverId}] Bootstrapping AMPP schemas...`);
      await callFn(serverId, "ampp_refresh_application_schemas", {});
      logger.info(`[${serverId}] AMPP schemas refreshed`);
    } catch (e) {
      logger.warn(
        `[${serverId}] Schema bootstrap failed: ${(e as any)?.message || e}`
      );
      throw e;
    } finally {
      inFlight.delete(serverId);
    }
  })();

  inFlight.set(serverId, p);
  return p;
}
