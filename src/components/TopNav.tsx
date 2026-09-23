import { NavLink } from "@/components/NavLink";

const links = [
  { to: "/", label: "Standings" },
  { to: "/rosters", label: "Rosters" },
  { to: "/team-production", label: "Team Production" },
  { to: "/valor-calculator", label: "VALOR/EV Calculator" },
  { to: "/trade", label: "Trade Simulator" },
  { to: "/player-flow", label: "Player Flow" },
];

const TopNav = () => (
  <nav className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
    <div className="container flex items-center h-14 gap-8">
      <span className="text-primary font-bold text-lg tracking-tight mr-4">⚾ Ottoneu</span>
      {links.map(l => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.to === "/"}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
          activeClassName="text-primary font-semibold border-b-2 border-primary"
        >
          {l.label}
        </NavLink>
      ))}
    </div>
  </nav>
);

export default TopNav;
