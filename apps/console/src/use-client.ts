import type { CourierClient } from "@courier/api-client";
import { useRouteContext } from "@tanstack/react-router";

export function useClient(): CourierClient {
  return useRouteContext({ from: "__root__", select: (context) => context.client });
}
