import { useState } from "react";
import { Loader2, AlertCircle, Calculator } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  fetchAssumptions, calcHitter, calcPitcher, type ValorResult,
} from "@/lib/valor";

const HIT_POS = ["Util", "C", "1B", "2B", "SS", "MI", "3B", "OF"];
const PIT_POS = ["SP", "RP"];

type Mode = "hitter" | "pitcher";

const emptyHitter = { G: "", PA: "", HR: "", R: "", OBP: "", SLG: "", age: "" };
const emptyPitcher = { IP: "", K: "", ERA: "", WHIP: "", HR9: "", age: "" };

const n = (v: string) => parseFloat(v);
const fmtWAR = (v: number) => v.toFixed(2);
const fmtEV = (v: number) => `$${v.toFixed(0)}`;

const ValorCalculator = () => {
  const [mode, setMode] = useState<Mode>("hitter");
  const [h, setH] = useState({ ...emptyHitter });
  const [p, setP] = useState({ ...emptyPitcher });
  const [positions, setPositions] = useState<string[]>([]);
  const [result, setResult] = useState<ValorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const switchMode = (m: Mode) => {
    setMode(m);
    setPositions([]);
    setResult(null);
    setError(null);
  };

  const togglePos = (pos: string) =>
    setPositions(prev => (prev.includes(pos) ? prev.filter(x => x !== pos) : [...prev, pos]));

  const validate = (): string | null => {
    if (positions.length === 0) return "Select at least one position eligibility.";
    if (mode === "hitter") {
      const { G, PA, HR, R, OBP, SLG, age } = h;
      if (!(n(PA) > 0)) return "Plate Appearances must be greater than 0.";
      if (!(n(G) > 0)) return "Games must be greater than 0.";
      if (!(n(HR) >= 0) || !(n(R) >= 0)) return "HR and R must be zero or greater.";
      if (!(n(OBP) >= 0 && n(OBP) <= 1)) return "OBP must be between 0 and 1.";
      if (!(n(SLG) >= 0 && n(SLG) <= 5)) return "SLG must be between 0 and 5.";
      if (age !== "" && !(n(age) > 15 && n(age) < 60)) return "Age must be between 15 and 60.";
    } else {
      const { IP, K, ERA, WHIP, HR9, age } = p;
      if (!(n(IP) > 0)) return "Innings Pitched must be greater than 0.";
      if (!(n(K) >= 0)) return "Strikeouts must be zero or greater.";
      if (!(n(ERA) >= 0)) return "ERA cannot be negative.";
      if (!(n(WHIP) >= 0)) return "WHIP cannot be negative.";
      if (!(n(HR9) >= 0)) return "HR/9 cannot be negative.";
      if (age !== "" && !(n(age) > 15 && n(age) < 60)) return "Age must be between 15 and 60.";
    }
    return null;
  };

  const calculate = async () => {
    const v = validate();
    setError(v);
    if (v) { setResult(null); return; }
    setLoading(true);
    try {
      const a = await fetchAssumptions();
      const res =
        mode === "hitter"
          ? calcHitter(
              { G: n(h.G), PA: n(h.PA), HR: n(h.HR), R: n(h.R), OBP: n(h.OBP), SLG: n(h.SLG), age: h.age === "" ? null : n(h.age), positions },
              a
            )
          : calcPitcher(
              { IP: n(p.IP), K: n(p.K), ERA: n(p.ERA), WHIP: n(p.WHIP), HR9: n(p.HR9), age: p.age === "" ? null : n(p.age), positions },
              a
            );
      if (!Number.isFinite(res.totalWAR) || !Number.isFinite(res.proratedWAR)) {
        setError("Could not compute a value from these inputs. Check the stat line and try again.");
        setResult(null);
      } else {
        setResult(res);
      }
    } catch {
      setError("Failed to load live assumptions from the sheet. Try again.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const field = (label: string, key: string, value: string, onChange: (v: string) => void, placeholder = "", step = "any") => (
    <div key={key} className="space-y-1.5">
      <Label htmlFor={key} className="text-xs text-muted-foreground">{label}</Label>
      <Input
        id={key}
        type="number"
        step={step}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="font-mono"
      />
    </div>
  );

  const posList = mode === "hitter" ? HIT_POS : PIT_POS;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">VALOR / EV Calculator</h1>
        <p className="text-sm text-muted-foreground">
          Value any hypothetical stat line under the league scoring system — as entered and pro-rated to a full season.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-5">
        <div className="flex rounded-md border border-border overflow-hidden text-sm w-fit">
          {(["hitter", "pitcher"] as const).map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={cn(
                "px-4 py-1.5 transition-colors capitalize",
                mode === m ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          {mode === "hitter" ? (
            <>
              {field("Games (G)", "g", h.G, v => setH(s => ({ ...s, G: v })), "40")}
              {field("PA", "pa", h.PA, v => setH(s => ({ ...s, PA: v })), "170")}
              {field("HR", "hr", h.HR, v => setH(s => ({ ...s, HR: v })), "8")}
              {field("R", "r", h.R, v => setH(s => ({ ...s, R: v })), "24")}
              {field("OBP", "obp", h.OBP, v => setH(s => ({ ...s, OBP: v })), ".350")}
              {field("SLG", "slg", h.SLG, v => setH(s => ({ ...s, SLG: v })), ".480")}
              {field("Age (optional)", "age", h.age, v => setH(s => ({ ...s, age: v })), "27")}
            </>
          ) : (
            <>
              {field("IP", "ip", p.IP, v => setP(s => ({ ...s, IP: v })), "60")}
              {field("K", "k", p.K, v => setP(s => ({ ...s, K: v })), "72")}
              {field("ERA", "era", p.ERA, v => setP(s => ({ ...s, ERA: v })), "3.20")}
              {field("WHIP", "whip", p.WHIP, v => setP(s => ({ ...s, WHIP: v })), "1.10")}
              {field("HR/9", "hr9", p.HR9, v => setP(s => ({ ...s, HR9: v })), "0.95")}
              {field("Age (optional)", "page", p.age, v => setP(s => ({ ...s, age: v })), "27")}
            </>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Position eligibility</Label>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {posList.map(pos => (
              <label key={pos} className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={positions.includes(pos)} onCheckedChange={() => togglePos(pos)} />
                {pos}
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button onClick={calculate} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
            Calculate
          </Button>
          {error && (
            <span className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> {error}
            </span>
          )}
        </div>
      </div>

      {result && (
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left font-medium px-4 py-2.5"></th>
                  <th className="text-right font-medium px-4 py-2.5">VALOR (Total WAR)</th>
                  <th className="text-right font-medium px-4 py-2.5">EV ($)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 font-medium">Actual</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtWAR(result.totalWAR)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtEV(result.ev)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">
                    Pro-rated
                    <span className="text-muted-foreground font-normal">
                      {" "}(
                      {mode === "hitter"
                        ? "150 G"
                        : result.proratedInput && "IP" in result.proratedInput && result.proratedInput.IP === 80
                          ? "80 IP (RP-only)"
                          : "170 IP"}
                      )
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-primary">{fmtWAR(result.proratedWAR)}</td>
                  <td className="px-4 py-3 text-right font-mono text-primary">{fmtEV(result.proratedEV)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground max-w-3xl">
            Prospect Bonus not included — values for non-MLB prospects will read slightly low vs. the master sheet.
            Live league-average assumptions refresh each time you calculate, so results may shift slightly day to day
            as the player pool updates.
          </p>
        </div>
      )}
    </div>
  );
};

export default ValorCalculator;
