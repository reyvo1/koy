/**
 * Check that `describeTransportFailure` produces one distinct, actionable string per failure.
 *
 * Written as a file rather than an inline `-e` because the inline form tripped TypeScript's
 * inference on a heterogeneous tuple, and a probe that dies on its own type error reports
 * nothing about the code it was meant to check.
 */
import { describeTransportFailure } from '../src/webhook/webhook-runtime.service';

const cases: [string, unknown][] = [
  [
    'refused',
    Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:45098'), {
        code: 'ECONNREFUSED',
      }),
    }),
  ],
  [
    'unresolvable',
    Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('getaddrinfo ENOTFOUND receiver.invalid'), {
        code: 'ENOTFOUND',
      }),
    }),
  ],
  ['blocked port', Object.assign(new TypeError('fetch failed'), { cause: new Error('bad port') })],
  [
    'timeout',
    Object.assign(new DOMException('This operation was aborted', 'TimeoutError'), {
      cause: Object.assign(new Error('The operation was aborted due to timeout'), {
        code: 'UND_ERR_HEADERS_TIMEOUT',
      }),
    }),
  ],
  ['doubly wrapped', Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }),
    }),
  })],
  ['wrapper only', new TypeError('fetch failed')],
  ['not an error', 'a bare string'],
];

const rendered = cases.map(([name, error]) => {
  const value = describeTransportFailure(error);
  console.log(`${name.padEnd(16)} => ${JSON.stringify(value)}`);
  return value;
});

const distinct = new Set(rendered);
console.log(`\ndistinct: ${distinct.size} of ${rendered.length}`);

// The property that matters: no two different transport failures record the same string. A
// helper that collapsed them would satisfy every source-shaped assertion in the spec while
// leaving the console unable to tell an operator what broke.
//
// All seven are expected to differ, including the two deliberately uninformative ones:
// `fetch failed` is genuinely all Node gives when there is no cause, and `tidak diketahui` is
// the answer for a value that is not an error at all. Merging those two would be a small loss
// — a caller can still tell them apart by whether an error was thrown — so they are kept
// apart rather than collapsed into one "unknown".
let failed = 0;
if (distinct.size !== rendered.length) {
  const renderedBy = new Map<string, string>();
  rendered.forEach((value, index) => renderedBy.set(value, cases[index][0]));
  for (const [value, name] of renderedBy) {
    const collision = cases.find(([, error]) => describeTransportFailure(error) === value);
    if (collision && collision[0] !== name) {
      console.log(`      ${name} and ${collision[0]} both render as ${value}`);
    }
  }
  console.log('FAIL  two different transport failures record the same string');
  failed += 1;
}
if (rendered[0].includes('fetch failed')) {
  console.log('FAIL  the wrapper message survives alongside a real cause');
  failed += 1;
}
if (!rendered[0].includes('ECONNREFUSED')) {
  console.log('FAIL  the transport code is not in the recorded reason');
  failed += 1;
}
if (rendered[0].split(' <- ').length !== 1) {
  console.log('FAIL  a single-cause failure is rendered as a chain');
  failed += 1;
}
console.log(failed === 0 ? '\nOK' : `\n${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
