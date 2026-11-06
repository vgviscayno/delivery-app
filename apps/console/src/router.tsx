import type { CourierClient } from "@courier/api-client";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  type RouterHistory,
  redirect,
} from "@tanstack/react-router";
import { App } from "./App.js";
import { Catalog, CategoriesSection, ProductsSection } from "./Catalog.js";
import {
  ClosuresSection,
  DriversSection,
  OrderingWindowSection,
  QrPhSection,
  RulesSection,
  Settings,
} from "./Settings.js";

/** What every route can reach without props: the server, and how long idle may last. */
export interface ConsoleContext {
  readonly client: CourierClient;
  readonly idleTimeoutMs: number;
}

/**
 * The root renders the session gate. Signed out, it shows sign-in at whatever URL is
 * open and never reaches the matched route, so after signing in the dispatcher is
 * already where the URL says.
 */
const rootRoute = createRootRouteWithContext<ConsoleContext>()({ component: Root });

function Root() {
  const { client, idleTimeoutMs } = rootRoute.useRouteContext();
  return <App client={client} idleTimeoutMs={idleTimeoutMs} />;
}

/** A mode with no content yet says so. */
function Placeholder() {
  return <p className="detail">Nothing here yet.</p>;
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/dispatch" });
  },
});

/** Anything the console does not route, such as an old bookmark, lands on Dispatch. */
const unknownRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  beforeLoad: () => {
    throw redirect({ to: "/dispatch" });
  },
});

const dispatchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "dispatch",
  component: Placeholder,
});

const packingBenchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "packing-bench",
  component: Placeholder,
});

const catalogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "catalog",
  component: Catalog,
});

const catalogIndexRoute = createRoute({
  getParentRoute: () => catalogRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/catalog/products" });
  },
});

const productsRoute = createRoute({
  getParentRoute: () => catalogRoute,
  path: "products",
  component: ProductsSection,
});

const categoriesRoute = createRoute({
  getParentRoute: () => catalogRoute,
  path: "categories",
  component: CategoriesSection,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings",
  component: Settings,
});

const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/settings/rules" });
  },
});

const rulesRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "rules",
  component: RulesSection,
});

const orderingWindowRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "ordering-window",
  component: OrderingWindowSection,
});

const closuresRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "closures",
  component: ClosuresSection,
});

const qrPhRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "qr-ph",
  component: QrPhSection,
});

const driversRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "drivers",
  component: DriversSection,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  unknownRoute,
  dispatchRoute,
  packingBenchRoute,
  catalogRoute.addChildren([catalogIndexRoute, productsRoute, categoriesRoute]),
  settingsRoute.addChildren([
    settingsIndexRoute,
    rulesRoute,
    orderingWindowRoute,
    closuresRoute,
    qrPhRoute,
    driversRoute,
  ]),
]);

export interface ConsoleRouterOptions extends ConsoleContext {
  /** Browser history when omitted; tests pass a memory history. */
  readonly history?: RouterHistory;
}

export function createConsoleRouter({ history, ...context }: ConsoleRouterOptions) {
  return createRouter({ routeTree, context, ...(history && { history }) });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createConsoleRouter>;
  }
}
