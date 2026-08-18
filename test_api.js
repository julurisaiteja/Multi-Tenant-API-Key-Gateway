#!/usr/bin/env node
'use strict';

const http = require('http');

const BASE = 'http://localhost:3000';

// ── HTTP helper ───────────────────────────────────────────────────────────
function request(method, path, body, headers = {}) {
  return new Promise((resolve) => {
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: { 'Content-Type': 'application/json', ...headers }
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${label}${detail ? ' | ' + detail : ''}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}${detail ? ' | ' + detail : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n════════════════════════════════════════════════════');
  console.log('   Multi-Tenant API Gateway — End-to-End Test Suite');
  console.log('════════════════════════════════════════════════════\n');

  // ── REQ 1: Health Check ────────────────────────────────────────────────
  console.log('REQ 1: Docker Services Health Check');
  const health = await request('GET', '/health');
  check('Health endpoint returns 200', health.status === 200, `status=${health.status}`);
  check('Health body has status=ok', health.body?.status === 'ok');

  // ── REQ 2: DB Schema / Tenants ────────────────────────────────────────
  console.log('\nREQ 2: Database Schema & Seeding');
  const tenants = await request('GET', '/api/tenants');
  check('GET /api/tenants returns 200', tenants.status === 200);
  check('At least 1 seeded tenant exists', Array.isArray(tenants.body) && tenants.body.length >= 1);
  check('Tenant has id and name fields', tenants.body?.[0]?.id && tenants.body?.[0]?.name,
    `First tenant: [${tenants.body?.[0]?.id}] ${tenants.body?.[0]?.name}`);

  const tenantId = tenants.body[0].id;

  // ── REQ 3: Key Issuance ───────────────────────────────────────────────
  console.log('\nREQ 3: API Key Issuance with SHA-256 Hashing');
  const issue = await request('POST', `/api/tenants/${tenantId}/keys`, { rateLimitPerMinute: 100 });
  check('POST /api/tenants/:id/keys returns 201', issue.status === 201, `status=${issue.status}`);
  check('Response contains apiKey field', typeof issue.body?.apiKey === 'string');
  check('apiKey starts with sk_live_', issue.body?.apiKey?.startsWith('sk_live_'));
  check('keyRecord.id is present', typeof issue.body?.keyRecord?.id === 'number');
  check('keyRecord.lastFour is 4 chars', issue.body?.keyRecord?.lastFour?.length === 4);
  check('keyRecord.rateLimitPerMinute=100', issue.body?.keyRecord?.rateLimitPerMinute === 100);
  const apiKey = issue.body.apiKey;
  const keyId = issue.body.keyRecord.id;
  console.log(`  ℹ️  Key ID: ${keyId}, masked: sk_live_...${issue.body.keyRecord.lastFour}`);

  // ── REQ 4: Key Listing (masked) ───────────────────────────────────────
  console.log('\nREQ 4: Key Listing with Masking');
  const keyList = await request('GET', `/api/tenants/${tenantId}/keys`);
  check('GET /api/tenants/:id/keys returns 200', keyList.status === 200);
  check('Response is an array', Array.isArray(keyList.body));
  const ourKey = keyList.body?.find(k => k.id === keyId);
  check('Newly created key appears in list', !!ourKey);
  check('maskedKey field is present', typeof ourKey?.maskedKey === 'string');
  check('maskedKey does NOT show full key', ourKey?.maskedKey?.length < apiKey?.length);
  check('maskedKey contains ...', ourKey?.maskedKey?.includes('...'));
  check('isActive=true', ourKey?.isActive === true);

  // ── REQ 5: Authentication ─────────────────────────────────────────────
  console.log('\nREQ 5: Authentication Middleware');
  const validResp = await request('GET', '/api/protected', null, { Authorization: `Bearer ${apiKey}` });
  check('Valid key → 200 OK', validResp.status === 200, `status=${validResp.status}`);
  check('Response has message field', !!validResp.body?.message);

  const invalidResp = await request('GET', '/api/protected', null, { Authorization: 'Bearer wrong_key_abc123' });
  check('Invalid key → 401 Unauthorized', invalidResp.status === 401, `status=${invalidResp.status}`);

  const noAuthResp = await request('GET', '/api/protected');
  check('No auth header → 401 Unauthorized', noAuthResp.status === 401, `status=${noAuthResp.status}`);

  // ── REQ 6: Rate Limiting ──────────────────────────────────────────────
  console.log('\nREQ 6: Sliding-Window Rate Limiting (limit=5)');
  const rateIssue = await request('POST', `/api/tenants/${tenantId}/keys`, { rateLimitPerMinute: 5 });
  check('Issue rate-limited key (limit=5)', rateIssue.status === 201);
  const rateKey = rateIssue.body.apiKey;
  const rateKeyId = rateIssue.body.keyRecord.id;
  console.log(`  ℹ️  Rate-limited key ID: ${rateKeyId}`);

  let twoHundreds = 0;
  let fourTwentyNine = null;

  for (let i = 1; i <= 6; i++) {
    const r = await request('GET', '/api/protected', null, { Authorization: `Bearer ${rateKey}` });
    if (r.status === 200) twoHundreds++;
    if (r.status === 429 && !fourTwentyNine) fourTwentyNine = r;
    process.stdout.write(`  → Request ${i}: ${r.status}\n`);
  }

  check('First 5 requests return 200', twoHundreds >= 5, `got ${twoHundreds} 200s`);
  check('6th request returns 429', !!fourTwentyNine, fourTwentyNine ? `status=${fourTwentyNine.status}` : 'never got 429');
  check('429 response has Retry-After header', !!fourTwentyNine?.headers?.['retry-after'],
    `Retry-After: ${fourTwentyNine?.headers?.['retry-after']}s`);

  // ── REQ 7: Key Revocation ─────────────────────────────────────────────
  console.log('\nREQ 7: Key Revocation');
  const revIssue = await request('POST', `/api/tenants/${tenantId}/keys`, { rateLimitPerMinute: 100 });
  const revKey = revIssue.body.apiKey;
  const revKeyId = revIssue.body.keyRecord.id;

  const preRevoke = await request('GET', '/api/protected', null, { Authorization: `Bearer ${revKey}` });
  check('Key works before revocation (200)', preRevoke.status === 200);

  const revokeResp = await request('DELETE', `/api/keys/${revKeyId}`);
  check('DELETE /api/keys/:id returns 204', revokeResp.status === 204, `status=${revokeResp.status}`);

  const postRevoke = await request('GET', '/api/protected', null, { Authorization: `Bearer ${revKey}` });
  check('Key returns 401 after revocation', postRevoke.status === 401, `status=${postRevoke.status}`);

  // ── REQ 8: Key Rotation ───────────────────────────────────────────────
  console.log('\nREQ 8: Key Rotation with Grace Period');
  const rotIssue = await request('POST', `/api/tenants/${tenantId}/keys`, { rateLimitPerMinute: 100 });
  const oldKey = rotIssue.body.apiKey;
  const oldKeyId = rotIssue.body.keyRecord.id;

  const rotateResp = await request('POST', `/api/keys/${oldKeyId}/rotate`);
  check('POST /api/keys/:id/rotate returns 200', rotateResp.status === 200, `status=${rotateResp.status}`);
  check('Response contains newApiKey', typeof rotateResp.body?.newApiKey === 'string');
  const newKey = rotateResp.body.newApiKey;
  console.log(`  ℹ️  Old key ID: ${oldKeyId}, New key: sk_live_...${newKey.slice(-4)}`);

  // Both keys should work immediately after rotation
  const oldKeyResp = await request('GET', '/api/protected', null, { Authorization: `Bearer ${oldKey}` });
  check('Old key still works during grace (200)', oldKeyResp.status === 200, `status=${oldKeyResp.status}`);

  const newKeyResp = await request('GET', '/api/protected', null, { Authorization: `Bearer ${newKey}` });
  check('New key works immediately (200)', newKeyResp.status === 200, `status=${newKeyResp.status}`);

  // Wait for grace period to expire (65 seconds)
  console.log('  ⏳ Waiting 65 seconds for grace period to expire...');
  await sleep(65000);

  const oldKeyExpired = await request('GET', '/api/protected', null, { Authorization: `Bearer ${oldKey}` });
  check('Old key expires after grace period (401)', oldKeyExpired.status === 401, `status=${oldKeyExpired.status}`);

  const newKeyStillWorks = await request('GET', '/api/protected', null, { Authorization: `Bearer ${newKey}` });
  check('New key still works after grace period (200)', newKeyStillWorks.status === 200, `status=${newKeyStillWorks.status}`);

  // ── REQ 9: Audit Logging ──────────────────────────────────────────────
  console.log('\nREQ 9: Audit Logging');
  const auditResp = await request('GET', `/api/tenants/${tenantId}/audit-logs?page=1&limit=50`);
  check('Audit log endpoint returns 200', auditResp.status === 200);
  check('Audit log has pagination info', typeof auditResp.body?.pagination?.total === 'number');
  check('Audit logs exist (requests were logged)', auditResp.body?.pagination?.total > 0,
    `total=${auditResp.body?.pagination?.total}`);

  // Check that 429 was logged
  const logs = auditResp.body?.logs || [];
  const has429 = logs.some(l => l.status_code === 429);
  const has200 = logs.some(l => l.status_code === 200);
  check('200 responses appear in audit log', has200);
  check('429 responses appear in audit log', has429);
  check('Audit logs have api_key_id field', logs[0]?.api_key_id != null, `api_key_id=${logs[0]?.api_key_id}`);
  check('Audit logs have endpoint field', typeof logs[0]?.endpoint === 'string', `endpoint=${logs[0]?.endpoint}`);
  check('Audit logs have status_code field', typeof logs[0]?.status_code === 'number');

  // ── Summary ───────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log('\n════════════════════════════════════════════════════');
  console.log(`   Results: ${passed}/${total} tests passed`);
  if (failed === 0) {
    console.log('   🏆 ALL TESTS PASSED — 100% requirements met!');
  } else {
    console.log(`   ⚠️  ${failed} test(s) failed`);
  }
  console.log('════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
