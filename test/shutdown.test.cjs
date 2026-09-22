const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

async function scenario(body, signal) {
  const child = spawn(process.execPath, ['-e', `
    const { runService } = require('./dist/utils/shutdown.utils');
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    ${body}
  `], { cwd: require('node:path').resolve(__dirname, '..'), env: { ...process.env, LOG_LEVEL: 'silent' } });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => {
    stdout += chunk;
    if (signal && stdout.includes('ready')) { child.kill(signal); signal = undefined; }
  });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  const [code, exitSignal] = await once(child, 'exit');
  clearTimeout(timer);
  assert.equal(exitSignal, null, stderr);
  return { code, lines: stdout.trim().split('\n') };
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  test(`${signal} drains once before closing dependencies`, async () => {
    const result = await scenario(`
      const keepAlive = setInterval(() => {}, 1000);
      runService({ name: 'test', timeoutMs: 1000,
        async start() { console.log('ready'); },
        async drain() {
          console.log('drain');
          process.emit('SIGTERM');
          await delay(30);
          console.log('drained');
        },
        close: [async () => console.log('temporal'), async () => { console.log('redis'); clearInterval(keepAlive); }],
        forceClose() { console.log('forced'); }
      });
    `, signal);
    assert.equal(result.code, 0);
    assert.deepEqual(result.lines, ['ready', 'drain', 'drained', 'temporal', 'redis']);
  });
}

test('signal during startup waits for resources and cleans up after startup failure', async () => {
  const result = await scenario(`
    runService({ name: 'test', timeoutMs: 1000,
      async start() {
        process.emit('SIGTERM');
        await delay(20);
        console.log('acquired');
        throw new Error('startup failed');
      },
      async drain() { console.log('drain'); },
      close: [async () => { console.log('temporal'); throw new Error('close failed'); }, async () => console.log('redis')],
      forceClose() { console.log('forced'); }
    });
  `);
  assert.equal(result.code, 1);
  assert.deepEqual(result.lines, ['acquired', 'drain', 'temporal', 'redis']);
});

test('shutdown deadline forces an unsuccessful exit when drain hangs', async () => {
  const result = await scenario(`
    runService({ name: 'test', timeoutMs: 50,
      async start() { process.emit('SIGINT'); },
      async drain() { console.log('drain'); await new Promise(() => {}); },
      close: [async () => console.log('closed')],
      forceClose() { console.log('forced'); }
    });
  `);
  assert.equal(result.code, 1);
  assert.deepEqual(result.lines, ['drain', 'forced']);
});

test('Redis closes healthy connections with QUIT and always disconnects', async t => {
  const { redis, closeRedis } = require('../dist/config/db.config');
  const calls = [];
  t.mock.method(redis, 'quit', async () => { calls.push('quit'); throw new Error('connection lost'); });
  t.mock.method(redis, 'disconnect', () => calls.push('disconnect'));
  const previous = redis.status;
  try {
    redis.status = 'ready';
    await assert.rejects(closeRedis(), /connection lost/);
    redis.status = 'wait';
    await closeRedis();
    assert.deepEqual(calls, ['quit', 'disconnect', 'disconnect']);
  } finally { redis.status = previous; }
});
