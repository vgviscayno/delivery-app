import type { CourierClient } from "@courier/api-client";
import { useRouteContext } from "@tanstack/react-router";

/** The server, as the router was given it. For route components, which take no props. */
export function useClient(): CourierClient {
  return useRouteContext({ from: "__root__", select: (context) => context.client });
}
