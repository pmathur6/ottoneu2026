

# Fantasy Baseball Analytics Hub

## Overview
A professional-grade fantasy baseball tool with a dark sports analytics aesthetic — dark navy backgrounds, clean white typography, and green/red accents. Three screens accessible via top nav.

## Design
- **Background**: Dark navy (#0a1128 / #1a1f3a)
- **Text**: Clean white/light gray
- **Accents**: Green for positive values, red for negative
- **WAR color coding**: Purple (5+), Blue (2-5), Gray (0-2), Red (below 0)
- **Feel**: Professional front office tool — dense data tables, minimal chrome

## Screen 1 — Standings
- Placeholder page with "Coming Soon" styling

## Screen 2 — Rosters (fully built)
- Fetch `Blended H`, `Blended P`, and `Roster Info` tabs from Google Sheets using the provided API key and sheet ID
- Dropdown to select from 12 fantasy teams (derived from Roster Info)
- Two data tables stacked vertically: Hitters table on top, Pitchers below
- All specified columns displayed with proper formatting
- WAR values color-coded per spec
- Surplus Value and Chg. vs. Preseason shown with green (positive) / red (negative) accents

## Screen 3 — Trade Simulator
- Placeholder page with "Coming Soon" styling

## Navigation
- Top nav bar with three tabs: Standings, Rosters, Trade Simulator
- Dark themed nav matching the overall aesthetic

## Data Layer
- Reusable `fetchSheet(tabName)` utility function
- React Query for data fetching with loading/error states
- All data comes from the public Google Sheets API

