export type BrowserSessionState = {
  profileDir: string;
  exists: boolean;
  mode: "headed" | "headless";
  browserHint: string;
};

export type BrowserTrackerOptions = {
  headless?: boolean;
  keepOpenMs?: number;
};
