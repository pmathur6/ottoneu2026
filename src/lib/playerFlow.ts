import { fetchSheetRaw } from "@/lib/sheets";

export type FlowKind = "retained" | "add" | "cut" | "tradeIn" | "tradeOut";

export interface PlayerFlow {
  playerId: string;
  name: string;
  source: string;
  middle: string;
  dest: string;
  kind: FlowKind;
  /** category used by the transaction-type filter */
  category: "adds" | "cuts" | "trades" | "retained";
}

export const SOURCES = ["Opening Day Roster", "Free Agent Pool / Waiver Wire", "Acquired via Trade"];
export const MIDDLES = ["Retained", "Added (Free Agency)", "Traded In", "Cut / Dropped", "Traded Out"];
export const DESTS = ["Current Roster", "Dropped / Free Agents", "Traded Away"];

export interface RawFlowData {
  opening: string[][];
  live: string[][];
  tx: string[][];
}

export async function fetchFlowData(): Promise<RawFlowData> {
  const [opening, live, tx] = await Promise.all([
    fetchSheetRaw("Opening Rosters"),
    fetchSheetRaw("Live Rosters"),
    fetchSheetRaw("Transaction Log"),
  ]);
  return { opening: opening.slice(1), live: live.slice(1), tx: tx.slice(1) };
}

export function teamsFromData(d: RawFlowData): string[] {
  const s = new Set<string>();
  d.opening.forEach(r => r[1] && s.add(r[1].trim()));
  d.live.forEach(r => r[1] && s.add(r[1].trim()));
  return Array.from(s).sort();
}

interface Tx {
  date: number;
  type: string;
  name: string;
  id: string;
  team: string;
  from: string;
}

function parseDate(s: string): number {
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

export function buildFlows(d: RawFlowData, team: string): PlayerFlow[] {
  if (!team) return [];

  const openingIds = new Map<string, string>();
  d.opening.forEach(r => {
    if ((r[1] || "").trim() === team && r[2]) openingIds.set(r[2].trim(), (r[3] || "").trim());
  });

  const currentIds = new Map<string, string>();
  d.live.forEach(r => {
    if ((r[1] || "").trim() === team && r[2]) currentIds.set(r[2].trim(), (r[5] || "").trim());
  });

  const events: Tx[] = d.tx
    .filter(r => r[3])
    .map(r => ({
      date: parseDate(r[0] || ""),
      type: (r[1] || "").trim().toLowerCase(),
      name: (r[2] || "").trim(),
      id: (r[3] || "").trim(),
      team: (r[4] || "").trim(),
      from: (r[5] || "").trim(),
    }))
    .filter(e => e.team === team || e.from === team)
    .sort((a, b) => a.date - b.date);

  const byPlayer = new Map<string, Tx[]>();
  events.forEach(e => {
    const list = byPlayer.get(e.id) ?? [];
    list.push(e);
    byPlayer.set(e.id, list);
  });

  const ids = new Set<string>([...openingIds.keys(), ...currentIds.keys(), ...byPlayer.keys()]);
  const flows: PlayerFlow[] = [];

  ids.forEach(id => {
    const evs = byPlayer.get(id) ?? [];
    const name = currentIds.get(id) || openingIds.get(id) || evs[evs.length - 1]?.name || id;

    // ---- starting status ----
    let source: string;
    if (openingIds.has(id)) {
      source = SOURCES[0];
    } else {
      const firstIn = evs.find(e => e.team === team);
      if (!firstIn) return; // never actually on this roster
      source = firstIn.type === "move" ? SOURCES[2] : SOURCES[1];
    }

    // ---- ending status ----
    let dest: string;
    if (currentIds.has(id)) {
      dest = DESTS[0];
    } else {
      const lastOut = [...evs].reverse().find(e => e.type === "cut" ? e.team === team : e.from === team);
      if (!lastOut) return;
      dest = lastOut.type === "move" ? DESTS[2] : DESTS[1];
    }

    let middle: string;
    let kind: FlowKind;
    if (dest === DESTS[0]) {
      if (source === SOURCES[0]) { middle = MIDDLES[0]; kind = "retained"; }
      else if (source === SOURCES[1]) { middle = MIDDLES[1]; kind = "add"; }
      else { middle = MIDDLES[2]; kind = "tradeIn"; }
    } else if (dest === DESTS[1]) {
      middle = MIDDLES[3]; kind = "cut";
    } else {
      middle = MIDDLES[4]; kind = "tradeOut";
    }

    const category =
      kind === "retained" ? "retained" :
      kind === "add" ? "adds" :
      kind === "cut" ? "cuts" : "trades";

    flows.push({ playerId: id, name, source, middle, dest, kind, category });
  });

  return flows.sort((a, b) => a.name.localeCompare(b.name));
}

export const KIND_COLOR: Record<FlowKind, string> = {
  retained: "hsl(var(--war-blue))",
  add: "hsl(var(--positive))",
  tradeIn: "hsl(var(--positive))",
  cut: "hsl(var(--negative))",
  tradeOut: "hsl(var(--war-purple))",
};
