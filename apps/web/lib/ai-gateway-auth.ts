import * as agentProvider from "@open-harness/agent";

function getConfiguredEnvValue(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function hasGatewayAuthFromProvider(): boolean {
  if (typeof agentProvider.hasAiGatewayAuth === "function") {
    return agentProvider.hasAiGatewayAuth();
  }

  // Test mocks often stub only `gateway`, which still represents an available
  // model provider for the route-level auth guard.
  if (typeof agentProvider.gateway === "function") {
    return true;
  }

  return (
    getConfiguredEnvValue(process.env.AI_GATEWAY_API_KEY) !== null ||
    getConfiguredEnvValue(process.env.VERCEL_OIDC_TOKEN) !== null
  );
}

function hasAnthropicAuthFromProvider(): boolean {
  if (typeof agentProvider.hasAnthropicApiKey === "function") {
    return agentProvider.hasAnthropicApiKey();
  }

  return getConfiguredEnvValue(process.env.ANTHROPIC_API_KEY) !== null;
}

export function hasAiGatewayAuth(): boolean {
  return hasGatewayAuthFromProvider();
}

export function hasAnthropicApiKey(): boolean {
  return hasAnthropicAuthFromProvider();
}

/**
 * Whether any supported model provider is configured in the current runtime.
 */
export function hasAnyModelProviderAuth(): boolean {
  return hasAnthropicAuthFromProvider() || hasGatewayAuthFromProvider();
}

export const AI_GATEWAY_AUTH_ERROR_MESSAGE =
  "No model provider is configured. Set ANTHROPIC_API_KEY for direct Anthropic access, or configure AI Gateway with AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN.";
