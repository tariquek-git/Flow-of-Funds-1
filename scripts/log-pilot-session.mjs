import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/tarique/Downloads/banking-diagram-mvp';
const OUTPUT = path.join(ROOT, 'docs', 'LOCAL_PILOT_SESSION_LOG_V2.csv');

const HEADER = [
  'session_id',
  'timestamp_iso',
  'persona',
  'browser',
  'completed',
  'time_minutes',
  'intervention',
  'p0_count',
  'p1_count',
  'p2_count',
  'friction_1',
  'friction_2',
  'friction_3',
  'notes'
];

const parseArgs = () => {
  const args = process.argv.slice(2);
  const map = new Map();
  for (const arg of args) {
    if (!arg.startsWith('--')) continue;
    const [key, ...rest] = arg.slice(2).split('=');
    map.set(key, rest.join('='));
  }
  return map;
};

const sanitize = (value) => {
  const raw = (value ?? '').toString().replace(/\r?\n/g, ' ').trim();
  if (raw.includes(',') || raw.includes('"')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
};

const toInt = (value, fallback = 0) => {
  const parsed = Number.parseInt((value ?? '').toString(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const args = parseArgs();

const sessionId = args.get('id') || `pilot-${Date.now()}`;
const row = [
  sessionId,
  new Date().toISOString(),
  args.get('persona') || 'fintech-pm',
  args.get('browser') || 'chrome',
  args.get('completed') || 'yes',
  toInt(args.get('minutes'), 0),
  args.get('intervention') || 'no',
  toInt(args.get('p0'), 0),
  toInt(args.get('p1'), 0),
  toInt(args.get('p2'), 0),
  args.get('f1') || '',
  args.get('f2') || '',
  args.get('f3') || '',
  args.get('notes') || ''
].map(sanitize);

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });

if (!fs.existsSync(OUTPUT) || fs.readFileSync(OUTPUT, 'utf8').trim().length === 0) {
  fs.writeFileSync(OUTPUT, `${HEADER.join(',')}\n`);
}

fs.appendFileSync(OUTPUT, `${row.join(',')}\n`);

console.log(`Logged pilot session to ${OUTPUT}`);
console.log(`Session: ${sessionId}`);
