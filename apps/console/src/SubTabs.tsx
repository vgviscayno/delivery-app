import { Link, type LinkProps } from "@tanstack/react-router";

/** Any path a console link can go to, so a mistyped tab fails the typecheck. */
export type ConsolePath = NonNullable<LinkProps["to"]>;

export interface Tab {
  readonly label: string;
  readonly to: ConsolePath;
}

/** A mode's sections, one at a time. The open one is marked `aria-current="page"`. */
export function SubTabs({ label, tabs }: { label: string; tabs: readonly Tab[] }) {
  return (
    <nav aria-label={label} className="sub-tabs">
      {tabs.map((tab) => (
        <Link key={tab.to} to={tab.to}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
