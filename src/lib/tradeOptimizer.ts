// Trade simulator optimizer logic — pure functions, no React.
// Computes ROS-only optimization; banked YTD stats are added separately.

export type Player = Record<string, string>;

export interface PositionCaps {
  C: number;
  "1B": number;
  "2B": number;
  SS: number;
  MI: number;
  "3B": number;
  OF: number;
  UTIL: number;
}

export interface OptimizerCaps {
  positions: PositionCaps;
  maxIP: number;
}

// ROS-only counting/rate accumulators from optimizer allocation.
export interface HitterROS {
  G: number;
  PA: number;
  AB: number; // approximated from PA when needed
  HR: number;
  R: number;
  obpNum: number; // OBP weighted by PA
  slgNum: number; // SLG weighted by PA
}

export interface PitcherROS {
  IP: number;
  K: number;
  eraNum: number; // weighted by IP
  whipNum: number;
  hr9Num: number;
}

export interface OptimizedROS {
  hitters: HitterROS;
  pitchers: PitcherROS;
}

// Banked YTD stats from Team Production tab, summed across positions for one team.
export interface BankedHitting {
  R: number;
  HR: number;
  AB: number;
  obpNum: number; // OBP weighted by (AB * 1.13) per spec
  slgNum: number; // SLG weighted by (AB * 1.13) per spec
  paWeight: number; // total weight = sum(AB * 1.13)
}
export interface BankedPitching {
  IP: number;
  K: number;
  eraNum: number; // ERA weighted by IP
  whipNum: number;
  hr9Num: number;
}

export interface FullSeasonCategories {
  R: number;
  HR: number;
  OBP: number;
  SLG: number;
  K: number;
  ERA: number;
  WHIP: number;
  HR9: number;
}

const num = (v: string | undefined): number => {
  if (!v) return 0;
  const cleaned = String(v).replace(/[$,]/g, "").replace(/\((.+)\)/, "-$1").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};

const isEligibleHitter = (p: Player, pos: string): boolean => {
  const positions = p["Positions"] || "";
  if (pos === "MI") return /\b(2B|SS)\b/.test(positions);
  if (pos === "UTIL") return true; // any hitter qualifies
  const re = new RegExp(`(^|[^A-Z0-9])${pos}([^A-Z0-9]|$)`);
  return re.test(positions);
};

// Returns position-specific WAR for a player. Falls back to Total WAR if missing.
const warAtPos = (p: Player, pos: string): number => {
  const colMap: Record<string, string> = {
    UTIL: "Util", C: "C", "1B": "1B", "2B": "2B", SS: "SS", MI: "MI", "3B": "3B", OF: "OF",
  };
  const col = colMap[pos];
  if (!col) return 0;
  const v = num(p[col]);
  return v || num(p["Total WAR"]);
};

// =====================================================================
// HITTER OPTIMIZER — ROS only
// =====================================================================
function optimizeHitters(hitters: Player[], caps: PositionCaps): HitterROS {
  const order: (keyof PositionCaps)[] = ["C", "SS", "2B", "MI", "3B", "1B", "OF", "UTIL"];
  const used: Record<string, number> = {};
  const allocG: Record<string, number> = {};

  for (const pos of order) {
    let cap = caps[pos] ?? 0;
    if (cap <= 0) continue;

    const candidates = hitters
      .filter(p => {
        const blG = num(p["BL_G"]);
        const remaining = blG - (used[p["playerid"]] ?? 0);
        return remaining > 0 && isEligibleHitter(p, pos);
      })
      .map(p => {
        const blG = num(p["BL_G"]);
        const w = warAtPos(p, pos);
        const warG = blG > 0 ? w / blG : 0;
        return { p, warG };
      })
      .sort((a, b) => b.warG - a.warG);

    for (const { p } of candidates) {
      if (cap <= 0) break;
      const id = p["playerid"];
      const blG = num(p["BL_G"]);
      const remaining = blG - (used[id] ?? 0);
      if (remaining <= 0) continue;
      const games = Math.min(cap, remaining);
      used[id] = (used[id] ?? 0) + games;
      allocG[id] = (allocG[id] ?? 0) + games;
      cap -= games;
    }
  }

  let G = 0, PA = 0, AB = 0, HR = 0, R = 0, obpNum = 0, slgNum = 0;
  for (const p of hitters) {
    const id = p["playerid"];
    const g = allocG[id] ?? 0;
    if (g <= 0) continue;
    const blG = num(p["BL_G"]);
    if (blG <= 0) continue;
    const share = g / blG;
    const blPA = num(p["BL_PA"]);
    const blHR = num(p["BL_HR"]);
    const blR = num(p["BL_R"]);
    const blOBP = num(p["BL_OBP"]);
    const blSLG = num(p["BL_SLG"]);
    const allocPA = blPA * share;

    G += g;
    PA += allocPA;
    AB += allocPA / 1.13; // approx AB from PA
    HR += blHR * share;
    R += blR * share;
    obpNum += blOBP * allocPA;
    slgNum += blSLG * allocPA;
  }

  return { G, PA, AB, HR, R, obpNum, slgNum };
}

// =====================================================================
// PITCHER OPTIMIZER — ROS only
// =====================================================================
function optimizePitchers(pitchers: Player[], maxIP: number): PitcherROS {
  const ranked = pitchers
    .map(p => {
      const ip = num(p["BL_IP"]);
      const sp = num(p["SP"]);
      const rp = num(p["RP"]);
      const bestWar = Math.max(sp, rp) || num(p["Total WAR"]);
      const warIp = ip > 0 ? bestWar / ip : 0;
      return { p, warIp, ip };
    })
    .filter(x => x.ip > 0)
    .sort((a, b) => b.warIp - a.warIp);

  let cap = maxIP;
  let IP = 0, K = 0, eraNum = 0, whipNum = 0, hr9Num = 0;

  for (const { p, ip } of ranked) {
    if (cap <= 0) break;
    const usedIp = Math.min(cap, ip);
    const share = usedIp / ip;
    const k = num(p["BL_SO"]);
    const era = num(p["BL_ERA"]);
    const whip = num(p["BL_WHIP"]);
    const hr9 = num(p["BL_HR/9"]);

    IP += usedIp;
    K += k * share;
    eraNum += era * usedIp;
    whipNum += whip * usedIp;
    hr9Num += hr9 * usedIp;
    cap -= usedIp;
  }

  return { IP, K, eraNum, whipNum, hr9Num };
}

export function optimizeTeam(
  hitters: Player[],
  pitchers: Player[],
  caps: OptimizerCaps,
): OptimizedROS {
  return {
    hitters: optimizeHitters(hitters, caps.positions),
    pitchers: optimizePitchers(pitchers, caps.maxIP),
  };
}

// =====================================================================
// Combine banked YTD + ROS optimizer output → full season categories
// =====================================================================
export function combineFullSeason(
  banked: { hitting: BankedHitting; pitching: BankedPitching },
  ros: OptimizedROS,
): FullSeasonCategories {
  const { hitting: bh, pitching: bp } = banked;

  // OBP / SLG: weighted average. Banked weight = AB*1.13 (already in bh.paWeight). ROS weight = ROS PA.
  const obpDen = bh.paWeight + ros.hitters.PA;
  const slgDen = bh.paWeight + ros.hitters.PA;
  const OBP = obpDen > 0 ? (bh.obpNum + ros.hitters.obpNum) / obpDen : 0;
  const SLG = slgDen > 0 ? (bh.slgNum + ros.hitters.slgNum) / slgDen : 0;

  // ERA / WHIP / HR9: weighted by IP
  const ipDen = bp.IP + ros.pitchers.IP;
  const ERA = ipDen > 0 ? (bp.eraNum + ros.pitchers.eraNum) / ipDen : 0;
  const WHIP = ipDen > 0 ? (bp.whipNum + ros.pitchers.whipNum) / ipDen : 0;
  const HR9 = ipDen > 0 ? (bp.hr9Num + ros.pitchers.hr9Num) / ipDen : 0;

  return {
    R: bh.R + ros.hitters.R,
    HR: bh.HR + ros.hitters.HR,
    OBP,
    SLG,
    K: bp.K + ros.pitchers.K,
    ERA,
    WHIP,
    HR9,
  };
}

// =====================================================================
// Parse Assumptions caps tab.
// Rows 108-115 column B → UTIL, C, 1B, 2B, SS, MI, 3B, OF.  Row 120 → max IP.
// =====================================================================
export function parseCaps(rows: string[][]): OptimizerCaps {
  const get = (rowIdx1: number) => num(rows[rowIdx1 - 1]?.[1] ?? "0");
  return {
    positions: {
      UTIL: get(108),
      C: get(109),
      "1B": get(110),
      "2B": get(111),
      SS: get(112),
      MI: get(113),
      "3B": get(114),
      OF: get(115),
    },
    maxIP: get(120),
  };
}

// =====================================================================
// Parse Team Production tab → banked YTD stats per team.
// Hitter rows: cols A-I = TeamID, TeamName, POS, G, AB, R, HR, OBP, SLG (exclude Bench).
// Pitcher rows: cols K-S = TeamID, TeamName, POS, G, IP, K, HR9, ERA, WHIP (exclude Bench).
// Returns map keyed by TeamName.
// =====================================================================
export function parseTeamProduction(rows: string[][]): Record<string, { hitting: BankedHitting; pitching: BankedPitching }> {
  const teams: Record<string, { hitting: BankedHitting; pitching: BankedPitching }> = {};

  const ensure = (team: string) => {
    if (!teams[team]) {
      teams[team] = {
        hitting: { R: 0, HR: 0, AB: 0, obpNum: 0, slgNum: 0, paWeight: 0 },
        pitching: { IP: 0, K: 0, eraNum: 0, whipNum: 0, hr9Num: 0 },
      };
    }
    return teams[team];
  };

  // Skip header row (index 0).
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];

    // Hitter side (A-I, indexes 0-8)
    const hTeam = (row[1] || "").trim();
    const hPos = (row[2] || "").trim();
    if (hTeam && hPos && hPos.toLowerCase() !== "bench") {
      const t = ensure(hTeam);
      const ab = num(row[4]);
      const r = num(row[5]);
      const hr = num(row[6]);
      const obp = num(row[7]);
      const slg = num(row[8]);
      const w = ab * 1.13;
      t.hitting.AB += ab;
      t.hitting.R += r;
      t.hitting.HR += hr;
      t.hitting.obpNum += obp * w;
      t.hitting.slgNum += slg * w;
      t.hitting.paWeight += w;
    }

    // Pitcher side (K-S, indexes 10-18)
    const pTeam = (row[11] || "").trim();
    const pPos = (row[12] || "").trim();
    if (pTeam && pPos && pPos.toLowerCase() !== "bench") {
      const t = ensure(pTeam);
      const ip = num(row[14]);
      const k = num(row[15]);
      const hr9 = num(row[16]);
      const era = num(row[17]);
      const whip = num(row[18]);
      t.pitching.IP += ip;
      t.pitching.K += k;
      t.pitching.eraNum += era * ip;
      t.pitching.whipNum += whip * ip;
      t.pitching.hr9Num += hr9 * ip;
    }
  }

  return teams;
}

// =====================================================================
// Parse EOS Standings tab → projected full-season stats per team.
// Row 1 is title, row 2 is header, rows 3-14 are 12 teams.
// Cols A-I: Team, R, HR, OBP, SLG, K, ERA, WHIP, HR9.
// =====================================================================
export function parseEosStandings(rows: string[][]): Record<string, FullSeasonCategories> {
  const out: Record<string, FullSeasonCategories> = {};
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i] || [];
    const team = (r[0] || "").trim();
    if (!team) continue;
    out[team] = {
      R: num(r[1]),
      HR: num(r[2]),
      OBP: num(r[3]),
      SLG: num(r[4]),
      K: num(r[5]),
      ERA: num(r[6]),
      WHIP: num(r[7]),
      HR9: num(r[8]),
    };
  }
  return out;
}

// =====================================================================
// Roto ranking: ranks 1 (worst) → N (best). Higher-better cats rank ascending.
// Lower-better cats: invert. Ties get average rank.
// =====================================================================
export type Category = keyof FullSeasonCategories;
export const HIGHER_BETTER: Category[] = ["R", "HR", "OBP", "SLG", "K"];
export const LOWER_BETTER: Category[] = ["ERA", "WHIP", "HR9"];
export const ALL_CATS: Category[] = [...HIGHER_BETTER, ...LOWER_BETTER];

export function rankTeams(
  values: Record<string, number>,
  higherBetter: boolean,
): Record<string, number> {
  const entries = Object.entries(values);
  // Sort by score, worst-first so worst → rank 1.
  entries.sort((a, b) => higherBetter ? a[1] - b[1] : b[1] - a[1]);

  const ranks: Record<string, number> = {};
  let i = 0;
  while (i < entries.length) {
    let j = i;
    while (j < entries.length && entries[j][1] === entries[i][1]) j++;
    // Tied indices [i, j). Average rank.
    const avgRank = ((i + 1) + j) / 2;
    for (let k = i; k < j; k++) ranks[entries[k][0]] = avgRank;
    i = j;
  }
  return ranks;
}

export function computeRotoPoints(
  teamStats: Record<string, FullSeasonCategories>,
): Record<string, Record<Category, number>> {
  const out: Record<string, Record<Category, number>> = {};
  for (const team of Object.keys(teamStats)) {
    out[team] = {} as Record<Category, number>;
  }
  for (const cat of ALL_CATS) {
    const vals: Record<string, number> = {};
    for (const team of Object.keys(teamStats)) vals[team] = teamStats[team][cat];
    const ranks = rankTeams(vals, HIGHER_BETTER.includes(cat));
    for (const team of Object.keys(ranks)) out[team][cat] = ranks[team];
  }
  return out;
}
