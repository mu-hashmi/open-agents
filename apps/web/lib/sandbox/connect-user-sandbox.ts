import {
  connectSandbox,
  type ConnectOptions,
  type SandboxState,
} from "@open-harness/sandbox";
import { getUserDaytonaApiKey } from "@/lib/daytona/api-key";

/**
 * Resolve Daytona BYOK credentials and connect to the requested sandbox.
 */
export async function connectUserSandbox(params: {
  userId: string;
  state: SandboxState;
  options?: ConnectOptions;
}) {
  const options: ConnectOptions = { ...params.options };

  if (params.state.type === "daytona") {
    const apiKey = await getUserDaytonaApiKey(params.userId);
    if (!apiKey) {
      throw new Error(
        "Daytona API key not configured. Go to Settings -> Connections to add it.",
      );
    }

    options.apiKey = apiKey;
  }

  return connectSandbox(params.state, options);
}
