import { fetchSheetRaw } from "@/lib/sheets";

export interface Tier { min: number; max: number; rate: number }

export interface Assumptions {
  avgOBP: number; avgSLG: number; avgERA: number; avgWHIP: number; avgHR9: number;
  med: Record<string, number>;
  iqr: Record<string, number>;
  repl: Record<string, number>;
  hitW: { R: number; HR: number; OBP: number; SLG: number };
  pitW: { K: number; ERA: number; WHIP: number; HR9: number };
  versatility: number[];
  tiers: Tier[];
  medianAge: number; changePerYear: number; ageMax: number; ageMin: number;
}

const num = (v: unknown): number => {
  if (v == null) return 0;
  const s = String(v).replace(/[$,\s]/g, "");
  if (s.endsWith("%")) return parseFloat(s) / 100 || 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

const cell = (rows: string[][], r: number, c: number) => rows[r]?.[c] ?? "";

export async function fetchAssumptions(): Promise<Assumptions> {
  const rows = await fetchSheetRaw("Assumptions");
  const find = (label: string, col = 1) => {
    const i = rows.findIndex(r => (r?.[0] ?? "").trim().toLowerCase() === label.toLowerCase());
    return i < 0 ? 0 : num(cell(rows, i, col));
  };

  const repl: Record<string, number> = {};
  for (let r = 1; r < 12; r++) {
    const name = (cell(rows, r, 0) || "").trim();
    if (!name) break;
    repl[name] = num(cell(rows, r, 7));
  }

  const med: Record<string, number> = {};
  const iqr: Record<string, number> = {};
  const statRows = ["R", "HR", "OBP Impact", "SLG Impact", "Scaled OBP", "K", "ERA Impact", "WHIP Impact", "HR/9 Impact"];
  rows.forEach(r => {
    const name = (r?.[0] ?? "").trim();
    if (statRows.includes(name) && r.length >= 6) {
      med[name] = num(r[2]);
      iqr[name] = num(r[5]);
    }
  });

  const versatility: number[] = [];
  const vIdx = rows.findIndex(r => (r?.[0] ?? "").trim() === "Versatility Bonuses");
  if (vIdx >= 0) {
    for (let r = vIdx + 2; r < rows.length; r++) {
      const k = (rows[r]?.[0] ?? "").trim();
      if (!/^\d+$/.test(k)) break;
      versatility[parseInt(k, 10)] = num(rows[r][1]);
    }
  }

  const tiers: Tier[] = [];
  const tIdx = rows.findIndex(r => (r?.[0] ?? "").trim() === "$/WAR Calc");
  if (tIdx >= 0) {
    for (let r = tIdx + 2; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row[0] || !row[1]) break;
      tiers.push({ min: num(row[0]), max: num(row[1]), rate: num(row[7]) });
    }
  }

  return {
    avgOBP: find("Average OBP"),
    avgSLG: find("Average SLG"),
    avgERA: find("Average ERA"),
    avgWHIP: find("Average WHIP"),
    avgHR9: find("Average HR/9"),
    med, iqr, repl,
    hitW: { R: find("R Weight"), HR: find("HR Weight"), OBP: find("OBP Weight"), SLG: find("SLG Weight") },
    pitW: { K: find("K Weight"), ERA: find("ERA Weight"), WHIP: find("WHIP Weight"), HR9: find("HR/9 Weight") },
    versatility,
    tiers,
    medianAge: find("Median Age"),
    changePerYear: find("Change per year"),
    ...(() => {
      const i = rows.findIndex(r => (r?.[0] ?? "").trim() === "Aging Curves");
      return {
        ageMax: i >= 0 ? num(cell(rows, i + 3, 1)) : 0.25,
        ageMin: i >= 0 ? num(cell(rows, i + 4, 1)) : -0.25,
      };
    })(),
  };
}

export const warValuation = (totalWAR: number, base: number, tiers: Tier[]) =>
  base + tiers.reduce((sum, t) =>
    sum + Math.max(0, Math.min(Math.max(0, totalWAR), t.max) - Math.max(0, t.min)) * t.rate, 0);

export const expectedValue = (valuation: number, age: number | null, a: Assumptions) => {
  const mult = age == null ? 0 : Math.min(a.ageMax, Math.max(a.ageMin, (a.medianAge - age) * a.changePerYear));
  return Math.max(valuation * (1 + mult), 1);
};

export interface HitterInput { G: number; PA: number; HR: number; R: number; OBP: number; SLG: number; age: number | null; positions: string[] }
export interface PitcherInput { IP: number; K: number; ERA: number; WHIP: number; HR9: number; age: number | null; positions: string[] }

export interface ValorResult {
  rawScore: number;
  totalWAR: number;
  valuation: number;
  ev: number;
  proratedWAR: number;
  proratedValuation: number;
  proratedEV: number;
  proratedInput?: HitterInput | PitcherInput;
}

const safeDiv = (n: number, d: number) => (d === 0 ? 0 : n / d);

function hitterWAR(i: HitterInput, a: Assumptions) {
  const obpImpact = (i.OBP - a.avgOBP) * i.PA;
  const slgImpact = (i.SLG - a.avgSLG) * i.PA;
  const weightedOBP = safeDiv(a.iqr["SLG Impact"], a.iqr["OBP Impact"]) * obpImpact;

  const sR = safeDiv(i.R - a.med["R"], a.iqr["R"]);
  const sHR = safeDiv(i.HR - a.med["HR"], a.iqr["HR"]);
  const sOBP = safeDiv(weightedOBP - a.med["Scaled OBP"], a.iqr["Scaled OBP"]);
  const sSLG = safeDiv(slgImpact - a.med["SLG Impact"], a.iqr["SLG Impact"]);

  const raw = (sR * a.hitW.R + sHR * a.hitW.HR + sOBP * a.hitW.OBP + sSLG * a.hitW.SLG) * 4;
  const war = Math.max(...i.positions.map(p => raw - (a.repl[p] ?? 0)));
  return { raw, total: war + (a.versatility[i.positions.length] ?? 0) };
}

export function calcHitter(i: HitterInput, a: Assumptions): ValorResult {
  const actual = hitterWAR(i, a);
  const f = i.G > 0 ? 150 / i.G : 0;
  const proInput: HitterInput = { ...i, G: 150, PA: i.PA * f, HR: i.HR * f, R: i.R * f };
  const pro = hitterWAR(proInput, a);
  return { ...finish(actual.total, pro.total, 1, i.age, a, actual.raw), proratedInput: proInput };
}

function pitcherWAR(i: PitcherInput, a: Assumptions) {
  const eraImpact = (a.avgERA - i.ERA) * i.IP;
  const whipImpact = (a.avgWHIP - i.WHIP) * i.IP;
  const hr9Impact = (a.avgHR9 - i.HR9) * i.IP;

  const sK = safeDiv(i.K - a.med["K"], a.iqr["K"]);
  const sERA = safeDiv(eraImpact - a.med["ERA Impact"], a.iqr["ERA Impact"]);
  const sWHIP = safeDiv(whipImpact - a.med["WHIP Impact"], a.iqr["WHIP Impact"]);
  const sHR9 = safeDiv(hr9Impact - a.med["HR/9 Impact"], a.iqr["HR/9 Impact"]);

  const raw = (sK * a.pitW.K + sERA * a.pitW.ERA + sWHIP * a.pitW.WHIP + sHR9 * a.pitW.HR9) * 4;
  const war = Math.max(...i.positions.map(p => raw - (a.repl[p] ?? 0)));
  return { raw, total: war + (a.versatility[i.positions.length] ?? 0) };
}

export function calcPitcher(i: PitcherInput, a: Assumptions): ValorResult {
  const actual = pitcherWAR(i, a);
  const f = i.IP > 0 ? 180 / i.IP : 0;
  const pro = pitcherWAR({ ...i, IP: 180, K: i.K * f }, a);
  return finish(actual.total, pro.total, 2, i.age, a, actual.raw);
}

function finish(total: number, prorated: number, base: number, age: number | null, a: Assumptions, raw: number): ValorResult {
  const valuation = warValuation(total, base, a.tiers);
  const pv = warValuation(prorated, base, a.tiers);
  return {
    rawScore: raw,
    totalWAR: total,
    valuation,
    ev: expectedValue(valuation, age, a),
    proratedWAR: prorated,
    proratedValuation: pv,
    proratedEV: expectedValue(pv, age, a),
  };
}

