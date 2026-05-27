import type { BrowserContext } from "playwright";

export type BrowserSessionState = {
  profileDir: string;
  exists: boolean;
  mode: "headed" | "headless";
  browserHint: string;
  connectionMode: "existing-edge" | "managed-profile";
  cdpUrl?: string;
};

export type BrowserTrackerOptions = {
  headless?: boolean;
  keepOpenMs?: number;
};

export type OracleBrowserConnection = {
  context: BrowserContext;
  close: () => Promise<void>;
  source: "existing-edge" | "managed-profile";
};