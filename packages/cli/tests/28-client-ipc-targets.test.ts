#!/usr/bin/env npx tsx

import assert from 'node:assert'
import { resolveDaemonTarget } from '../src/utils/client.js'

console.log('=== CLI IPC Target Helpers ===\n')

{
  console.log('Test 1: unix hosts resolve to ws+unix URLs')
  const target = resolveDaemonTarget('unix:///tmp/paseo.sock')
  assert.deepStrictEqual(target, {
    type: 'ipc',
    url: 'ws+unix:///tmp/paseo.sock:/ws',
    socketPath: '/tmp/paseo.sock',
  })
  console.log('✓ unix hosts resolve to ws+unix URLs\n')
}

{
  console.log('Test 2: pipe hosts preserve the Node socketPath transport form')
  const target = resolveDaemonTarget('pipe://\\\\.\\pipe\\paseo-managed-test')
  assert.deepStrictEqual(target, {
    type: 'ipc',
    url: 'ws://localhost/ws',
    socketPath: '\\\\.\\pipe\\paseo-managed-test',
  })
  console.log('✓ pipe hosts preserve Node socketPath transport form\n')
}

console.log('=== All CLI IPC target tests passed ===')
