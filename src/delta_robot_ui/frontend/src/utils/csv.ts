import type { Waypoint } from '../api/types';

export function waypointsToCsv(waypoints: Waypoint[]): string {
  const rows = [['name', 'x', 'y', 'z', 'dwell_seconds']];
  for (const waypoint of waypoints) {
    rows.push([
      waypoint.name,
      String(waypoint.target.x),
      String(waypoint.target.y),
      String(waypoint.target.z),
      String(waypoint.dwell_seconds),
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function csvToWaypoints(text: string): Waypoint[] {
  const rows = parseCsv(text.trim());
  const dataRows = hasHeader(rows[0]) ? rows.slice(1) : rows;
  return dataRows
    .filter((row) => row.length >= 4)
    .map((row, index) => ({
      name: row[0]?.trim() || `Waypoint ${index + 1}`,
      target: {
        x: finiteNumber(row[1], 0),
        y: finiteNumber(row[2], 0),
        z: finiteNumber(row[3], -100),
      },
      dwell_seconds: Math.max(0, finiteNumber(row[4], 0)),
    }));
}

function hasHeader(row: string[] | undefined): boolean {
  return Boolean(row && row[0]?.toLowerCase() === 'name' && row[1]?.toLowerCase() === 'x');
}

function finiteNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}
