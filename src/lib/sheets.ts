const SHEET_ID = "1l9qGiGLZVAxlyBFpcIXJZsjNbD-rxQWjKZGoMH05Fvc";
const API_KEY = "AIzaSyDfSEwMoa5tNYKIHU0iJ-r1Hypn0IyHdQU";

export async function fetchSheet(tabName: string): Promise<Record<string, string>[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tabName)}?key=${API_KEY}`;
  const res = await fetch(url);
  const { values } = await res.json();
  if (!values || values.length < 2) return [];
  const [headers, ...rows] = values as string[][];
  return rows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""])));
}

export async function fetchSheetRange(tabName: string, range: string): Promise<string[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tabName)}!${range}?key=${API_KEY}`;
  const res = await fetch(url);
  const { values } = await res.json();
  return (values as string[][]) ?? [];
}

// Fetch raw 2D values for a whole tab (no header normalization).
export async function fetchSheetRaw(tabName: string): Promise<string[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tabName)}?key=${API_KEY}`;
  const res = await fetch(url);
  const { values } = await res.json();
  return (values as string[][]) ?? [];
}
