declare module "node-cron" {
  export type ScheduledTask = {
    start(): void;
    stop(): void;
    destroy(): void;
  };

  export function schedule(
    expression: string,
    callback: () => void | Promise<void>,
    options?: {
      scheduled?: boolean;
      timezone?: string;
    }
  ): ScheduledTask;
}
