

# Roster Table Enhancements

## 1. Reorder columns — move value columns left
Move "Total WAR", "Current Salary", "Expected Value", "Surplus Value", "Chg. vs. Preseason" to right after "PlayerName" and "Team", before the YTD section.

**New HITTER_COLS order:**
PlayerName, Team, Total WAR, Current Salary, Expected Value, Surplus Value, Chg. vs. Preseason, YTD_G, YTD_PA, ... BL_SLG

**New PITCHER_COLS order:**
PlayerName, Team, Total WAR, Current Salary, Expected Value, Surplus Value, Chg. vs. Preseason, YTD_IP, ... BL_HR/9

## 2. Number formatting in `formatCell`
Add rounding logic based on column name patterns:

**Hitters:**
- Columns containing `OBP`, `SLG`, `wOBA`, `AVG`, `BABIP` → `.toFixed(3)` (e.g. `.321`)
- Columns containing `wRC+` → round to nearest integer

**Pitchers:**
- Columns containing `ERA`, `FIP`, `WHIP`, `HR/9`, `K/9` → `.toFixed(2)`
- Columns containing `BABIP` → `.toFixed(3)`

## 3. Section dividers
Add a thicker left border (`border-l-2 border-border`) on the first column of each section transition:
- First YTD column (after the value columns)
- First ROS column
- First BL column

Detect section by checking if the column name starts with `YTD_`, `ROS_`, `BL_` and whether the previous visible column belongs to a different section. Apply the border class to both `TableHead` and `TableCell`.

## Files changed
- `src/pages/Rosters.tsx` — column reorder, formatCell rounding, section divider logic

