import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { getActiveRunId } from "../run-context";

type LogLevel = "info" | "warn" | "error";

function sanitizeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) {
    return undefined;
  }
  const blocked = ["secret", "token", "key", "password", "authorization"];
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => {
      const lowerKey = key.toLowerCase();
      if (blocked.some((part) => lowerKey.includes(part))) {
        return [key, "[redacted]"];
      }
      return [key, value];
    })
  );
}

export async function logBot(level: LogLevel, message: string, context?: Record<string, unknown>): Promise<void> {
  const runId = getActiveRunId();
  await prisma.botLog.create({
    data: {
      ...(runId ? { runId } : {}),
      level,
      message,
      context: sanitizeContext(context) as Prisma.InputJsonValue | undefined
    }
  });
}
