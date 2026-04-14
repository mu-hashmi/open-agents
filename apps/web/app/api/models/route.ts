import { GatewayAuthenticationError } from "@ai-sdk/gateway";
import { fetchAvailableLanguageModelsWithContext } from "@/lib/models-with-context";

const CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

export async function GET() {
  try {
    const models = await fetchAvailableLanguageModelsWithContext();

    return Response.json(
      { models },
      {
        headers: {
          "Cache-Control": CACHE_CONTROL,
        },
      },
    );
  } catch (error) {
    // Local development often omits AI Gateway auth entirely. Keep the app
    // usable and let the model selector render with no fetched catalog.
    if (GatewayAuthenticationError.isInstance(error)) {
      console.warn(
        "AI Gateway authentication is not configured; returning an empty model list.",
      );
      return Response.json(
        { models: [] },
        {
          headers: {
            "Cache-Control": CACHE_CONTROL,
          },
        },
      );
    }

    console.error("Failed to fetch available models:", error);
    return Response.json(
      { error: "Failed to fetch available models" },
      { status: 500 },
    );
  }
}
