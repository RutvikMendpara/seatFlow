// k6 load test: many users try to hold seats on one show at the same time.
//
//   k6 run -e SCENARIO=mixed load/holds.js     (1-4 adjacent seats each)
//   k6 run -e SCENARIO=hot load/holds.js       (everyone wants the same 2 seats)
//
// Needs load/.data.json from prepare.ts and the API at API_URL.
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const data = JSON.parse(open('./.data.json'));
const API = __ENV.API_URL || 'http://localhost:4000';
const SCENARIO = __ENV.SCENARIO || 'mixed';

const held = new Counter('holds_won');
const conflicts = new Counter('holds_conflict');
const busy = new Counter('holds_busy');

export const options = {
  scenarios: {
    burst: {
      // Every user fires once, all at the same moment.
      executor: 'per-vu-iterations',
      vus: data.tokens.length,
      iterations: 1,
      maxDuration: '2m',
    },
  },
  thresholds: {
    // Anything other than 201/409/503 is a failure.
    checks: ['rate==1'],
  },
};

function pickSeats(vu) {
  if (SCENARIO === 'hot') return data.seatIds.slice(0, 2);
  // Deterministic per user, so runs are comparable.
  const count = 1 + (vu % 4);
  const row = Math.floor((vu * 7) % (data.seatIds.length / 10));
  const start = (vu * 3) % (10 - count + 1);
  return data.seatIds.slice(row * 10 + start, row * 10 + start + count);
}

export default function () {
  const res = http.post(
    `${API}/api/reservations`,
    JSON.stringify({ showtimeId: data.showtimeId, seatIds: pickSeats(__VU) }),
    {
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${data.tokens[__VU - 1]}`,
      },
    },
  );
  if (res.status === 201) held.add(1);
  else if (res.status === 409) conflicts.add(1);
  else if (res.status === 503) busy.add(1);
  check(res, { 'expected status': (r) => [201, 409, 503].includes(r.status) });
}
