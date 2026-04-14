import { createGateway } from "@ai-sdk/gateway";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { createAnthropic } from "@ai-sdk/anthropic";
import { devToolsMiddleware } from "@ai-sdk/devtools";
import type { AnthropicLanguageModelOptions } from "@ai-sdk/anthropic";
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import * as ai from "ai";
import type { GatewayModelId, JSONValue, LanguageModel } from "ai";

// Models with 4.5+ support adaptive thinking with effort control.
// Older models use the legacy extended thinking API with a budget.
function getAnthropicSettings(modelId: string): AnthropicLanguageModelOptions {
  if (modelId.includes("4.6")) {
    return {
      effort: "medium",
      thinking: { type: "adaptive" },
    } satisfies AnthropicLanguageModelOptions;
  }

  return {
    thinking: { type: "enabled", budgetTokens: 8000 },
  };
}

function isJsonObject(value: unknown): value is Record<string, JSONValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toProviderOptionsRecord(
  options: Record<string, unknown>,
): Record<string, JSONValue> {
  return options as Record<string, JSONValue>;
}

function mergeRecords(
  base: Record<string, JSONValue>,
  override: Record<string, JSONValue>,
): Record<string, JSONValue> {
  const merged: Record<string, JSONValue> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const existingValue = merged[key];

    if (isJsonObject(existingValue) && isJsonObject(value)) {
      merged[key] = mergeRecords(existingValue, value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

export type ProviderOptionsByProvider = Record<
  string,
  Record<string, JSONValue>
>;

export function mergeProviderOptions(
  defaults: ProviderOptionsByProvider,
  overrides?: ProviderOptionsByProvider,
): ProviderOptionsByProvider {
  if (!overrides || Object.keys(overrides).length === 0) {
    return defaults;
  }

  const merged: ProviderOptionsByProvider = { ...defaults };

  for (const [provider, providerOverrides] of Object.entries(overrides)) {
    const providerDefaults = merged[provider];

    if (!providerDefaults) {
      merged[provider] = providerOverrides;
      continue;
    }

    merged[provider] = mergeRecords(providerDefaults, providerOverrides);
  }

  return merged;
}

export interface GatewayConfig {
  baseURL: string;
  apiKey: string;
}

export interface GatewayOptions {
  devtools?: boolean;
  config?: GatewayConfig;
  providerOptionsOverrides?: ProviderOptionsByProvider;
}

export type { GatewayModelId, LanguageModel, JSONValue };

function getConfiguredEnvValue(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Return the configured Anthropic API key, if one is available.
 */
export function getAnthropicApiKey(): string | null {
  return getConfiguredEnvValue(process.env.ANTHROPIC_API_KEY);
}

/**
 * Whether direct Anthropic access is available for model execution.
 */
export function hasAnthropicApiKey(): boolean {
  return getAnthropicApiKey() !== null;
}

/**
 * Return the configured AI Gateway auth value, if one is available.
 *
 * The AI SDK accepts either a long-lived API key or a Vercel OIDC token.
 */
export function getAiGatewayAuthValue(): string | null {
  return (
    getConfiguredEnvValue(process.env.AI_GATEWAY_API_KEY) ??
    getConfiguredEnvValue(process.env.VERCEL_OIDC_TOKEN)
  );
}

/**
 * Whether AI Gateway auth is available in the current runtime.
 */
export function hasAiGatewayAuth(): boolean {
  return getAiGatewayAuthValue() !== null;
}

function stripModelProviderPrefix(modelId: string): string {
  const slashIndex = modelId.indexOf("/");
  return slashIndex === -1 ? modelId : modelId.slice(slashIndex + 1);
}

const ANTHROPIC_MODEL_ID_ALIASES: Record<string, string> = {
  "claude-haiku-4.5": "claude-haiku-4-5",
  "claude-sonnet-4.5": "claude-sonnet-4-5",
  "claude-sonnet-4.6": "claude-sonnet-4-6",
  "claude-opus-4.5": "claude-opus-4-5",
  "claude-opus-4.6": "claude-opus-4-6",
};

/**
 * Normalize app-facing Anthropic aliases to the provider's accepted model IDs.
 *
 * The app stores dotted aliases such as `anthropic/claude-opus-4.6`, while the
 * direct Anthropic provider expects hyphenated versions like `claude-opus-4-6`.
 */
export function normalizeAnthropicModelId(modelId: string): string {
  return ANTHROPIC_MODEL_ID_ALIASES[modelId] ?? modelId;
}

let sharedAnthropicProvider:
  | ReturnType<typeof createAnthropic>
  | null
  | undefined;

function getAnthropicProvider() {
  if (sharedAnthropicProvider !== undefined) {
    return sharedAnthropicProvider;
  }

  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    sharedAnthropicProvider = null;
    return sharedAnthropicProvider;
  }

  sharedAnthropicProvider = createAnthropic({ apiKey });
  return sharedAnthropicProvider;
}

function createBaseLanguageModel(
  modelId: GatewayModelId,
  config?: GatewayConfig,
): LanguageModelV3 {
  if (modelId.startsWith("anthropic/")) {
    const anthropicProvider = getAnthropicProvider();
    if (anthropicProvider) {
      return anthropicProvider(
        normalizeAnthropicModelId(stripModelProviderPrefix(modelId)),
      );
    }
  }

  const baseGateway = config
    ? createGateway({ baseURL: config.baseURL, apiKey: config.apiKey })
    : ai.gateway;

  return baseGateway(modelId);
}

export function shouldApplyOpenAIReasoningDefaults(modelId: string): boolean {
  return modelId.startsWith("openai/gpt-5");
}

function shouldApplyOpenAITextVerbosityDefaults(modelId: string): boolean {
  return modelId.startsWith("openai/gpt-5.4");
}

export function getProviderOptionsForModel(
  modelId: string,
  providerOptionsOverrides?: ProviderOptionsByProvider,
): ProviderOptionsByProvider {
  const defaultProviderOptions: ProviderOptionsByProvider = {};

  // Apply anthropic defaults
  if (modelId.startsWith("anthropic/")) {
    defaultProviderOptions.anthropic = toProviderOptionsRecord(
      getAnthropicSettings(modelId),
    );
  }

  // OpenAI model responses should never be persisted.
  if (modelId.startsWith("openai/")) {
    defaultProviderOptions.openai = toProviderOptionsRecord({
      store: false,
    } satisfies OpenAIResponsesProviderOptions);
  }

  // Apply OpenAI defaults for all GPT-5 variants to expose encrypted reasoning content.
  // This avoids Responses API failures when `store: false`, e.g.:
  // "Item with id 'rs_...' not found. Items are not persisted when `store` is set to false."
  if (shouldApplyOpenAIReasoningDefaults(modelId)) {
    defaultProviderOptions.openai = mergeRecords(
      defaultProviderOptions.openai ?? {},
      toProviderOptionsRecord({
        reasoningSummary: "detailed",
        include: ["reasoning.encrypted_content"],
      } satisfies OpenAIResponsesProviderOptions),
    );
  }

  if (shouldApplyOpenAITextVerbosityDefaults(modelId)) {
    defaultProviderOptions.openai = mergeRecords(
      defaultProviderOptions.openai ?? {},
      toProviderOptionsRecord({
        textVerbosity: "low",
      } satisfies OpenAIResponsesProviderOptions),
    );
  }

  const providerOptions = mergeProviderOptions(
    defaultProviderOptions,
    providerOptionsOverrides,
  );

  // Enforce OpenAI non-persistence even when custom provider overrides are present.
  if (modelId.startsWith("openai/")) {
    providerOptions.openai = mergeRecords(
      providerOptions.openai ?? {},
      toProviderOptionsRecord({
        store: false,
      } satisfies OpenAIResponsesProviderOptions),
    );
  }

  return providerOptions;
}

export function gateway(
  modelId: GatewayModelId,
  options: GatewayOptions = {},
): LanguageModel {
  const { devtools = false, config, providerOptionsOverrides } = options;
  let model: LanguageModelV3 = createBaseLanguageModel(modelId, config);

  const providerOptions = getProviderOptionsForModel(
    modelId,
    providerOptionsOverrides,
  );

  if (Object.keys(providerOptions).length > 0) {
    if (
      typeof ai.wrapLanguageModel === "function" &&
      typeof ai.defaultSettingsMiddleware === "function"
    ) {
      model = ai.wrapLanguageModel({
        model,
        middleware: ai.defaultSettingsMiddleware({
          settings: { providerOptions },
        }),
      });
    }
  }

  // Apply devtools middleware if requested
  if (devtools && typeof ai.wrapLanguageModel === "function") {
    model = ai.wrapLanguageModel({ model, middleware: devToolsMiddleware() });
  }

  return model;
}
