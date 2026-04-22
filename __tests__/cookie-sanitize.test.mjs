// Standalone Node.js test for the cookie sanitization logic in launchBrowser.
// No test framework — runs with `node __tests__/cookie-sanitize.test.mjs`.
// Exits non-zero on any failure.

// Reproduce the sanitize helper and filter logic exactly as it lives in
// src/lib/SunoApi.ts::launchBrowser. If this file diverges from the source,
// update both.

const sanitize = (v) => String(v ?? '').replace(/[^\x20-\x7E]/g, '').trim();

function buildCookies({ currentToken, cookieMap }) {
  const cookies = [];
  const lax = 'Lax';
  const totalCandidates = Object.keys(cookieMap).length + 1;
  let filteredOut = 0;
  const sessionValue = sanitize(currentToken);
  if (sessionValue) {
    cookies.push({ name: '__session', value: sessionValue, domain: '.suno.com', path: '/', sameSite: lax });
  } else {
    filteredOut++;
  }
  for (const [key, rawValue] of Object.entries(cookieMap)) {
    const value = sanitize(rawValue);
    const name = sanitize(key);
    if (!name || !value) { filteredOut++; continue; }
    cookies.push({ name, value, domain: '.suno.com', path: '/', sameSite: lax });
  }
  return { cookies, filteredOut, totalCandidates };
}

let failures = 0;
function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`ok   ${label}`);
  } else {
    console.log(`FAIL ${label}\n  expected: ${e}\n  actual:   ${a}`);
    failures++;
  }
}

// --- Case 1: everything clean ---
{
  const { cookies, filteredOut } = buildCookies({
    currentToken: 'ey.Jabc.xyz',
    cookieMap: { __client: 'ey.Jclient.token', singular_device_id: 'abc-123' }
  });
  assertEqual(cookies.length, 3, 'clean input: 3 cookies pushed');
  assertEqual(filteredOut, 0, 'clean input: 0 filtered');
  assertEqual(cookies[0].name, '__session', 'clean input: __session first');
}

// --- Case 2: undefined currentToken (reproduces original bug #1) ---
{
  const { cookies, filteredOut } = buildCookies({
    currentToken: undefined,
    cookieMap: { __client: 'token' }
  });
  assertEqual(cookies.length, 1, 'undefined currentToken: only __client pushed');
  assertEqual(cookies.map(c => c.name), ['__client'], 'undefined currentToken: no __session');
  assertEqual(filteredOut, 1, 'undefined currentToken: 1 filtered');
}

// --- Case 3: empty string value (reproduces cookie.parse("foo=;bar=baz")) ---
{
  const { cookies, filteredOut } = buildCookies({
    currentToken: 'abc',
    cookieMap: { foo: '', bar: 'baz' }
  });
  assertEqual(cookies.length, 2, 'empty value: only non-empty cookies pushed');
  assertEqual(cookies.map(c => c.name), ['__session', 'bar'], 'empty value: foo filtered');
  assertEqual(filteredOut, 1, 'empty value: 1 filtered');
}

// --- Case 4: undefined value in cookie map ---
{
  const { cookies, filteredOut } = buildCookies({
    currentToken: 'abc',
    cookieMap: { x: undefined, y: 'value' }
  });
  assertEqual(cookies.map(c => c.name).sort(), ['__session', 'y'].sort(), 'undefined cookie: filtered');
  assertEqual(filteredOut, 1, 'undefined cookie: 1 filtered');
}

// --- Case 5: non-ASCII characters stripped ---
{
  const { cookies } = buildCookies({
    currentToken: 'abc\n\r\tdef',
    cookieMap: { kind: 'tÿpe\x01' }
  });
  assertEqual(cookies[0].value, 'abcdef', 'non-ASCII in token: stripped');
  assertEqual(cookies[1].value, 'tpe', 'non-ASCII in cookie value: stripped');
}

// --- Case 6: leading/trailing whitespace ---
{
  const { cookies } = buildCookies({
    currentToken: '  eyJxxx  ',
    cookieMap: { key: '  value  ' }
  });
  assertEqual(cookies[0].value, 'eyJxxx', 'whitespace in token: trimmed');
  assertEqual(cookies[1].value, 'value', 'whitespace in cookie: trimmed');
}

// --- Case 7: value becomes empty after sanitization (pure non-ASCII) ---
{
  const { cookies, filteredOut } = buildCookies({
    currentToken: 'valid',
    cookieMap: { junk: '\x00\x01\x02', ok: 'good' }
  });
  assertEqual(cookies.map(c => c.name).sort(), ['__session', 'ok'].sort(), 'junk-only value: filtered');
  assertEqual(filteredOut, 1, 'junk-only value: 1 filtered');
}

// --- Case 8: empty key (impossible via Object.entries but defensive) ---
{
  const cookieMap = {};
  Object.defineProperty(cookieMap, '', { value: 'value', enumerable: true });
  const { cookies, filteredOut } = buildCookies({ currentToken: 'abc', cookieMap });
  assertEqual(cookies.length, 1, 'empty key: only __session');
  assertEqual(filteredOut, 1, 'empty key: 1 filtered');
}

// --- Case 9: null values handled (String(null) used to be "null", now filtered via empty check? — "null" is not empty, so it WOULD be kept. This documents current behavior.) ---
{
  const { cookies } = buildCookies({
    currentToken: null,
    cookieMap: { k: null }
  });
  // sanitize(null) → "" via String(v ?? '') → branch returns ''
  assertEqual(cookies.length, 0, 'null values: filtered (via ?? default)');
}

// --- Case 10: all cookies invalid ---
{
  const { cookies, filteredOut } = buildCookies({
    currentToken: '',
    cookieMap: { a: undefined, b: '', c: null }
  });
  assertEqual(cookies.length, 0, 'all invalid: zero cookies');
  assertEqual(filteredOut, 4, 'all invalid: 4 filtered');
}

// --- Summary ---
console.log('');
if (failures === 0) {
  console.log('ALL PASSED');
  process.exit(0);
} else {
  console.log(`${failures} FAILURE(S)`);
  process.exit(1);
}
