import type { Resources } from "@daytona/sdk";
import type { SandboxHooks } from "../interface";

export interface DaytonaSandboxConfig {
  apiKey: string;
  apiUrl?: string;
  name?: string;
  source?: {
    url: string;
    branch?: string;
    token?: string;
    newBranch?: string;
  };
  env?: Record<string, string>;
  githubToken?: string;
  gitUser?: {
    name: string;
    email: string;
  };
  hooks?: SandboxHooks;
  autoStopInterval?: number;
  image?: string;
  resources?: Pick<Resources, "cpu" | "memory" | "disk">;
  ports?: number[];
  snapshot?: string;
  sessionId: string;
}

export interface DaytonaSandboxConnectConfig {
  apiKey: string;
  apiUrl?: string;
  env?: Record<string, string>;
  githubToken?: string;
  hooks?: SandboxHooks;
  ports?: number[];
  resume?: boolean;
}
