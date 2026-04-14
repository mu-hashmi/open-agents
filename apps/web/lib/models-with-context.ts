import "server-only";

import { hasAnthropicApiKey } from "@open-harness/agent";
import { gateway } from "ai";
import { filterDisabledModels } from "./model-availability";
import type { AvailableModel, AvailableModelCost } from "./models";

const MODELS_DEV_URL = "https://models.dev/api.json";
const MODELS_DEV_TIMEOUT_MS = 750;
const ANTHROPIC_CONTEXT_WINDOW = 200_000;

type GatewayModel = Awaited<
  ReturnType<typeof gateway.getAvailableModels>
>["models"][number];

interface ModelsDevMetadata {
  contextWindow?: number;
  cost?: AvailableModelCost;
}

const DIRECT_ANTHROPIC_MODELS: AvailableModel[] = [
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    description: "Fast Anthropic model",
    modelType: "language",
    context_window: ANTHROPIC_CONTEXT_WINDOW,
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    description: "Balanced Anthropic model",
    modelType: "language",
    context_window: ANTHROPIC_CONTEXT_WINDOW,
  },
  {
    id: "anthropic/claude-opus-4.6",
    name: "Claude Opus 4.6",
    description: "Highest-capability Anthropic model",
    modelType: "language",
    context_window: ANTHROPIC_CONTEXT_WINDOW,
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function getModelsDevCostTier(
  value: unknown,
): AvailableModelCost | AvailableModelCost["context_over_200k"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const input = toOptionalNumber(value.input);
  const output = toOptionalNumber(value.output);
  const cacheRead = toOptionalNumber(value.cache_read);

  if (
    typeof input !== "number" &&
    typeof output !== "number" &&
    typeof cacheRead !== "number"
  ) {
    return undefined;
  }

  return {
    input,
    output,
    cache_read: cacheRead,
  };
}

function getModelsDevCost(value: unknown): AvailableModelCost | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const baseCost = getModelsDevCostTier(value);
  const contextOver200k = getModelsDevCostTier(value.context_over_200k);

  if (!baseCost && !contextOver200k) {
    return undefined;
  }

  return {
    ...baseCost,
    ...(contextOver200k ? { context_over_200k: contextOver200k } : {}),
  };
}

function getModelsDevMetadataMap(
  data: unknown,
): Map<string, ModelsDevMetadata> {
  const metadataMap = new Map<string, ModelsDevMetadata>();
  if (!isRecord(data)) {
    return metadataMap;
  }

  for (const [providerKey, providerValue] of Object.entries(data)) {
    if (!isRecord(providerValue)) {
      continue;
    }

    const modelsValue = providerValue.models;
    if (!isRecord(modelsValue)) {
      continue;
    }

    for (const [modelKey, modelValue] of Object.entries(modelsValue)) {
      if (!isRecord(modelValue)) {
        continue;
      }

      const idValue = modelValue.id;
      const rawId = typeof idValue === "string" ? idValue : modelKey;
      const modelId = rawId.includes("/") ? rawId : `${providerKey}/${rawId}`;

      const limitValue = modelValue.limit;
      const contextWindow = isRecord(limitValue)
        ? toOptionalNumber(limitValue.context)
        : undefined;
      const cost = getModelsDevCost(modelValue.cost);

      if (
        (typeof contextWindow !== "number" || contextWindow <= 0) &&
        cost === undefined
      ) {
        continue;
      }

      metadataMap.set(modelId, {
        contextWindow:
          typeof contextWindow === "number" && contextWindow > 0
            ? contextWindow
            : undefined,
        cost,
      });
    }
  }

  return metadataMap;
}

async function fetchModelsDevMetadataMap(): Promise<
  Map<string, ModelsDevMetadata>
> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MODELS_DEV_TIMEOUT_MS);

  try {
    const response = await fetch(MODELS_DEV_URL, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return new Map();
    }
    const data: unknown = await response.json();
    return getModelsDevMetadataMap(data);
  } catch {
    return new Map();
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeGatewayModel(model: GatewayModel): AvailableModel {
  return {
    id: model.id,
    name: model.name ?? undefined,
    description: model.description ?? undefined,
    modelType: model.modelType ?? undefined,
  };
}

function addModelsDevMetadata(
  model: AvailableModel,
  metadataMap: Map<string, ModelsDevMetadata>,
): AvailableModel {
  const metadata = metadataMap.get(model.id);
  if (!metadata) {
    return model;
  }

  const nextModel: AvailableModel = { ...model };

  if (
    typeof metadata.contextWindow === "number" &&
    metadata.contextWindow > 0
  ) {
    nextModel.context_window = metadata.contextWindow;
  }

  if (metadata.cost) {
    nextModel.cost = metadata.cost;
  }

  return nextModel;
}

export async function fetchAvailableLanguageModels(): Promise<
  AvailableModel[]
> {
  if (hasAnthropicApiKey()) {
    return filterDisabledModels(DIRECT_ANTHROPIC_MODELS);
  }

  const { models } = await gateway.getAvailableModels();
  return filterDisabledModels(
    models
      .filter((model) => model.modelType === "language")
      .map(normalizeGatewayModel),
  );
}

export async function fetchAvailableLanguageModelsWithContext(): Promise<
  AvailableModel[]
> {
  const [models, modelsDevMetadataMap] = await Promise.all([
    fetchAvailableLanguageModels(),
    fetchModelsDevMetadataMap(),
  ]);

  return models.map((model) =>
    addModelsDevMetadata(model, modelsDevMetadataMap),
  );
}
