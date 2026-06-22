import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

export type LocalJiraProfile = {
  connected: boolean;
  username: string;
  baseUrl: string;
  updatedAt: string | null;
};

type LocalJiraProfileRecord = {
  userId: string;
  username: string;
  encryptedAccessToken: string;
  baseUrl: string;
  createdAt: string;
  updatedAt: string;
};

type LocalJiraProfileStore = {
  profiles: LocalJiraProfileRecord[];
};

const emptyStore: LocalJiraProfileStore = { profiles: [] };
const defaultBaseUrl = "https://jira.oraclecorp.com/jira";

export async function getLocalJiraProfile(userId: string): Promise<LocalJiraProfile> {
  const record = await getLocalJiraProfileRecord(userId);

  if (!record) {
    return emptyProfile();
  }

  return {
    connected: Boolean(record.encryptedAccessToken),
    username: record.username,
    baseUrl: record.baseUrl,
    updatedAt: record.updatedAt
  };
}

export async function getLocalJiraAccessToken(userId: string) {
  const record = await getLocalJiraProfileRecord(userId);
  if (!record?.encryptedAccessToken) {
    return null;
  }

  return decryptSecret(record.encryptedAccessToken);
}

export async function saveLocalJiraProfile(input: {
  userId: string;
  username: string;
  personalAccessToken?: string;
  baseUrl?: string;
}) {
  const store = await readStore();
  const index = store.profiles.findIndex((profile) => profile.userId === input.userId);
  const existing = index >= 0 ? store.profiles[index] : null;
  const now = new Date().toISOString();
  const encryptedAccessToken = input.personalAccessToken
    ? encryptSecret(input.personalAccessToken)
    : existing?.encryptedAccessToken;

  if (!encryptedAccessToken) {
    throw new Error("Personal access token is required");
  }

  const record: LocalJiraProfileRecord = {
    userId: input.userId,
    username: input.username,
    encryptedAccessToken,
    baseUrl: input.baseUrl ?? existing?.baseUrl ?? process.env.JIRA_API_BASE_URL ?? defaultBaseUrl,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  if (index >= 0) {
    store.profiles[index] = record;
  } else {
    store.profiles.push(record);
  }

  await writeStore(store);
  return getLocalJiraProfile(input.userId);
}

export async function deleteLocalJiraProfile(userId: string) {
  const store = await readStore();
  store.profiles = store.profiles.filter((profile) => profile.userId !== userId);
  await writeStore(store);
  return emptyProfile();
}

function emptyProfile(): LocalJiraProfile {
  return {
    connected: false,
    username: "",
    baseUrl: process.env.JIRA_API_BASE_URL ?? defaultBaseUrl,
    updatedAt: null
  };
}

async function getLocalJiraProfileRecord(userId: string) {
  const store = await readStore();
  return store.profiles.find((profile) => profile.userId === userId) ?? null;
}

async function readStore(): Promise<LocalJiraProfileStore> {
  try {
    const content = await readFile(getStorePath(), "utf8");
    const parsed = JSON.parse(content) as Partial<LocalJiraProfileStore>;
    return {
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : []
    };
  } catch (error) {
    if (isFileMissing(error)) {
      return emptyStore;
    }
    throw error;
  }
}

async function writeStore(store: LocalJiraProfileStore) {
  const storePath = getStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function getStorePath() {
  return path.resolve(process.env.LOCAL_JIRA_PROFILE_STORE_PATH ?? ".local-data/jira-profiles.json");
}

function isFileMissing(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
