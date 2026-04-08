

# Rosters: Sorting, Column Visibility, and Data Fix

## 1. Fix roster filtering logic (critical bug)
- Stop using `Roster Info` for team mapping. Instead, filter directly on the `Roster` column (column C) in `Blended H` and `Blended P`.
- Use `PlayerName` (column B) instead of `Name` for display — rename the first entry in `HITTER_COLS` and `PITCHER_COLS` from `"Name"` to `"PlayerName"`.
- Derive the team dropdown list from unique values of the `Roster` column across both `Blended H` and `Blended P`.
- Remove the `Roster Info` query entirely.

## 2. Add column sorting to DataTable
- Add `sortCol` and `sortDir` (`asc`/`desc`) state to `DataTable`.
- Clicking a column header toggles sort direction (default asc, click again for desc, third click clears).
- Sort logic: parse as number if possible, otherwise string comparison.
- Show a small arrow indicator (▲/▼) next to the active sort column header.

## 3. Add column visibility toggling
- Add `hiddenCols` state (a `Set<string>`) to each `DataTable`.
- Render a dropdown button (using the existing `DropdownMenu` component) next to the table title with checkboxes for each column.
- Unchecked columns are excluded from rendering in both header and body.
- `PlayerName` column is always visible (cannot be hidden).

## Files changed
- `src/pages/Rosters.tsx` — all three changes in this single file.

