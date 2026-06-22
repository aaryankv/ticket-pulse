import net from "node:net";

type DatabaseReachabilityCache = {
  checkedAt: number;
  reachable: boolean;
};

let reachabilityCache: DatabaseReachabilityCache | null = null;

const cacheTtlMs = 10_000;
const probeTimeoutMs = 1_500;

export async function isDatabaseReachable() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return false;
  }

  const now = Date.now();
  if (reachabilityCache && now - reachabilityCache.checkedAt < cacheTtlMs) {
    return reachabilityCache.reachable;
  }

  const reachable = await probeDatabaseSocket(databaseUrl);
  reachabilityCache = { checkedAt: now, reachable };
  return reachable;
}

async function probeDatabaseSocket(databaseUrl: string) {
  const target = parseDatabaseTarget(databaseUrl);
  if (!target) {
    return true;
  }

  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection(target);
    let settled = false;

    function finish(reachable: boolean) {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(reachable);
    }

    socket.setTimeout(probeTimeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

function parseDatabaseTarget(databaseUrl: string) {
  try {
    const parsed = new URL(databaseUrl);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || "5432")
    };
  } catch {
    return null;
  }
}
