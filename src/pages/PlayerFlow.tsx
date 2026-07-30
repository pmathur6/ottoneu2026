import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  fetchFlowData, teamsFromData, buildFlows, SOURCES, MIDDLES, DESTS, KIND_COLOR,
  type PlayerFlow,
} from "@/lib/playerFlow";

const W = 1040;
const NODE_W = 16;
const COL_X = [0, W / 2 - NODE_W / 2, W - NODE_W];
const NODE_PAD = 26;
const TOP = 20;

type Col = 0 | 1 | 2;

interface LaidNode {
  id: string;
  col: Col;
  y: number;
  h: number;
  count: number;
}

const ribbon = (x0: number, y0: number, x1: number, y1: number, h: number) => {
  const cx = (x0 + x1) / 2;
  return [
    `M${x0},${y0}`,
    `C${cx},${y0} ${cx},${y1} ${x1},${y1}`,
    `L${x1},${y1 + h}`,
    `C${cx},${y1 + h} ${cx},${y0 + h} ${x0},${y0 + h}`,
    "Z",
  ].join(" ");
};

const PlayerFlowPage = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["player-flow"],
    queryFn: fetchFlowData,
  });

  const teams = useMemo(() => (data ? teamsFromData(data) : []), [data]);
  const [team, setTeam] = useState("");
  const activeTeam = team || teams[0] || "";
  const [individual, setIndividual] = useState(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ adds: true, cuts: true, trades: true, retained: true });
  const [hover, setHover] = useState<string | null>(null);

  const flows = useMemo(
    () => (data ? buildFlows(data, activeTeam).filter(f => filters[f.category]) : []),
    [data, activeTeam, filters]
  );

  const layout = useMemo(() => {
    const cols: string[][] = [SOURCES, MIDDLES, DESTS];
    const counts = new Map<string, number>();
    flows.forEach(f => {
      [f.source, f.middle, f.dest].forEach(n => counts.set(n, (counts.get(n) ?? 0) + 1));
    });

    const maxCount = Math.max(1, ...cols.map(c => c.reduce((s, n) => s + (counts.get(n) ?? 0), 0)));
    const unit = individual ? 16 : Math.max(3, 560 / maxCount);
    const height =
      TOP * 2 + maxCount * unit + NODE_PAD * (Math.max(...cols.map(c => c.filter(n => counts.get(n)).length)) - 1);

    const nodes = new Map<string, LaidNode>();
    cols.forEach((names, ci) => {
      const visible = names.filter(n => (counts.get(n) ?? 0) > 0);
      const total = visible.reduce((s, n) => s + (counts.get(n) ?? 0) * unit, 0) + NODE_PAD * (visible.length - 1);
      let y = TOP + (height - TOP * 2 - total) / 2;
      visible.forEach(n => {
        const c = counts.get(n) ?? 0;
        nodes.set(n, { id: n, col: ci as Col, y, h: c * unit, count: c });
        y += c * unit + NODE_PAD;
      });
    });

    const order = (arr: string[], v: string) => arr.indexOf(v);
    const sorted = [...flows].sort(
      (a, b) =>
        order(SOURCES, a.source) - order(SOURCES, b.source) ||
        order(MIDDLES, a.middle) - order(MIDDLES, b.middle) ||
        order(DESTS, a.dest) - order(DESTS, b.dest) ||
        a.name.localeCompare(b.name)
    );

    const cursor = new Map<string, number>();
    const take = (id: string) => {
      const node = nodes.get(id)!;
      const i = cursor.get(id) ?? 0;
      cursor.set(id, i + 1);
      return node.y + i * unit;
    };

    const bands = sorted.map(f => ({
      flow: f,
      y1: take(f.source + "|s"), // placeholder replaced below
    }));
    // recompute properly (three independent cursors per node)
    cursor.clear();
    const laid = sorted.map(f => {
      const ys = take(f.source);
      return { flow: f, ys };
    });
    const midCursor = new Map<string, number>();
    const takeMid = (id: string) => {
      const node = nodes.get(id)!;
      const i = midCursor.get(id) ?? 0;
      midCursor.set(id, i + 1);
      return node.y + i * unit;
    };
    const dstCursor = new Map<string, number>();
    const takeDst = (id: string) => {
      const node = nodes.get(id)!;
      const i = dstCursor.get(id) ?? 0;
      dstCursor.set(id, i + 1);
      return node.y + i * unit;
    };

    const links = laid.map(({ flow, ys }) => ({
      flow,
      ys,
      ym: takeMid(flow.middle),
      yd: takeDst(flow.dest),
    }));

    void bands;
    return { nodes, links, unit, height };
  }, [flows, individual]);

  const matches = (f: PlayerFlow) =>
    search.trim() !== "" && f.name.toLowerCase().includes(search.trim().toLowerCase());

  const dimmed = (f: PlayerFlow) => {
    if (search.trim() !== "") return !matches(f);
    if (!hover) return false;
    return !(f.source === hover || f.middle === hover || f.dest === hover || f.playerId === hover);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading roster movement data…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-destructive font-medium">Failed to load Sheets data.</p>
      </div>
    );
  }

  const { nodes, links, unit, height } = layout;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Player Flow</h1>
        <p className="text-sm text-muted-foreground">
          Roster movement from Opening Day through today.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4">
        <Select value={activeTeam} onValueChange={setTeam}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="Select team" />
          </SelectTrigger>
          <SelectContent>
            {teams.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex rounded-md border border-border overflow-hidden text-sm">
          {[
            { label: "Aggregated", v: false },
            { label: "Individual players", v: true },
          ].map(o => (
            <button
              key={o.label}
              onClick={() => setIndividual(o.v)}
              className={cn(
                "px-3 py-1.5 transition-colors",
                individual === o.v
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>

        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search player…"
          className="w-[200px]"
        />

        <div className="flex items-center gap-4 text-sm">
          {([
            ["retained", "Retained"],
            ["adds", "Adds"],
            ["cuts", "Cuts"],
            ["trades", "Trades"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={filters[key]}
                onCheckedChange={v => setFilters(p => ({ ...p, [key]: !!v }))}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 overflow-x-auto">
        {flows.length === 0 ? (
          <p className="text-muted-foreground text-sm py-12 text-center">No movement to display.</p>
        ) : (
          <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} className="min-w-[900px]">
            {links.map(({ flow, ys, ym, yd }) => {
              const color = KIND_COLOR[flow.kind];
              const isDim = dimmed(flow);
              const op = isDim ? 0.06 : matches(flow) ? 0.85 : 0.42;
              return (
                <g
                  key={flow.playerId + flow.middle}
                  onMouseEnter={() => setHover(flow.playerId)}
                  onMouseLeave={() => setHover(null)}
                >
                  <path
                    d={ribbon(COL_X[0] + NODE_W, ys, COL_X[1], ym, unit)}
                    fill={color}
                    opacity={op}
                  />
                  <path
                    d={ribbon(COL_X[1] + NODE_W, ym, COL_X[2], yd, unit)}
                    fill={color}
                    opacity={op}
                  />
                  {individual && (
                    <text
                      x={COL_X[1] + NODE_W + 8}
                      y={ym + unit / 2 + 3.5}
                      fontSize={10}
                      fill="hsl(var(--foreground))"
                      opacity={isDim ? 0.15 : 1}
                      className="pointer-events-none"
                    >
                      {flow.name}
                    </text>
                  )}
                </g>
              );
            })}

            {Array.from(nodes.values()).map(n => {
              const x = COL_X[n.col];
              const anchor = n.col === 2 ? "end" : "start";
              const tx = n.col === 2 ? x - 8 : x + NODE_W + 8;
              const nodeDim = hover !== null && hover !== n.id && !links.some(
                l => l.flow.playerId === hover && (l.flow.source === n.id || l.flow.middle === n.id || l.flow.dest === n.id)
              );
              return (
                <g
                  key={n.id}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  className="cursor-pointer"
                >
                  <rect
                    x={x} y={n.y} width={NODE_W} height={Math.max(2, n.h)}
                    rx={3}
                    fill="hsl(var(--foreground))"
                    opacity={nodeDim ? 0.25 : 0.85}
                  />
                  <text
                    x={n.col === 1 ? x + NODE_W / 2 : tx}
                    y={n.col === 1 ? n.y - 8 : n.y + Math.max(2, n.h) / 2 + 4}
                    textAnchor={n.col === 1 ? "middle" : anchor}
                    fontSize={12}
                    fontWeight={600}
                    fill="hsl(var(--foreground))"
                    opacity={nodeDim ? 0.4 : 1}
                    className="pointer-events-none"
                  >
                    {n.id} ({n.count})
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <div className="flex flex-wrap gap-5 text-xs text-muted-foreground">
        {([
          ["Retained Opening Day", "retained"],
          ["Adds / Trades In", "add"],
          ["Drops / Cuts", "cut"],
          ["Trades Out", "tradeOut"],
        ] as const).map(([label, kind]) => (
          <span key={label} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ background: KIND_COLOR[kind] }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
};

export default PlayerFlowPage;
