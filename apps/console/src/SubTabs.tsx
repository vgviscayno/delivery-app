import { Link, type LinkProps } from "@tanstack/react-router";

type ConsolePath = NonNullable<LinkProps["to"]>;

export interface Tab {
  readonly label: string;
  readonly to: ConsolePath;
}

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
