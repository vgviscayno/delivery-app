import type { CourierClient } from "@courier/api-client";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  type RouterHistory,
  redirect,
} from "@tanstack/react-router";
import { App } from "./App.js";
import { Catalog, CategoriesSection } from "./Catalog.js";
import { ProductsSection } from "./ProductsGrid.js";
import { readProductsSearch } from "./products-search.js";
import {
  ClosuresSection,
  DriversSection,
  OrderingWindowSection,
  QrPhSection,
  RulesSection,
  Settings,
} from "./Settings.js";

export interface ConsoleContext {
  readonly client: CourierClient;
  readonly idleTimeoutMs: number;
}

const rootRoute = createRootRouteWithContext<ConsoleContext>()({ component: Root });

function Root() {
  const { client, idleTimeoutMs } = rootRoute.useRouteContext();
  return <App client={client} idleTimeoutMs={idleTimeoutMs} />;
}

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
  validateSearch: readProductsSearch,
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
