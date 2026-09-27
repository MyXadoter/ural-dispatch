const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.transpileModule(readFileSync(require.resolve('../src/yandex.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup() {
  const scripts = [], timers = new Map();
  let timerId = 0;
  const context = {
    exports: {},
    window: {
      setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
      clearTimeout(id) { timers.delete(id); },
    },
    document: {
      createElement() { return { removed: false, remove() { this.removed = true; } }; },
      head: { appendChild(script) { scripts.push(script); } },
    },
  };
  vm.runInNewContext(source, context);
  return { context, scripts, timers, load: context.exports.loadYandexMaps };
}

test('shares SDK load across mounts and waits for SDK readiness', async () => {
  const { load, context, scripts, timers } = setup();
  let ready;
  context.ymaps3 = { ready: new Promise(resolve => { ready = resolve; }) };
  const first = load('test-key'), second = load('test-key');
  assert.equal(first, second);
  assert.equal(scripts.length, 1);
  assert.equal(new URL(scripts[0].src).host, 'api-maps.yandex.ru');
  let resolved = false;
  first.then(() => { resolved = true; });
  const loading = scripts[0].onload();
  await Promise.resolve();
  assert.equal(resolved, false);
  ready();
  await loading;
  assert.equal(await first, context.ymaps3);
  assert.equal(timers.size, 0);
  assert.equal(load('test-key'), first);
});

test('a failed script can be retried with a fresh SDK request', async () => {
  const { load, context, scripts } = setup();
  const failed = load('test-key');
  const rejection = assert.rejects(failed, /Не удалось загрузить/);
  scripts[0].onerror();
  await rejection;
  assert.equal(scripts[0].removed, true);
  context.ymaps3 = { ready: Promise.resolve() };
  const retried = load('test-key');
  assert.equal(scripts.length, 2);
  await scripts[1].onload();
  assert.equal(await retried, context.ymaps3);
});

test('SDK authorization rejection is actionable and clears pending timers', async () => {
  const { load, context, scripts, timers } = setup();
  context.ymaps3 = { ready: Promise.reject(new Error('Forbidden')) };
  const pending = load('test-key');
  const rejection = assert.rejects(pending, /HTTP Referer/);
  await scripts[0].onload();
  await rejection;
  assert.equal(timers.size, 0);
});

test('timeout does not let a stale callback resolve a retry', async () => {
  const { load, context, scripts, timers } = setup();
  context.ymaps3 = { ready: Promise.resolve() };
  const pending = load('test-key');
  const rejection = assert.rejects(pending, /не ответили/);
  [...timers.values()][0]();
  await rejection;
  const retry = load('test-key');
  await scripts[0].onload();
  assert.equal(load('test-key'), retry);
  await scripts[1].onload();
  await retry;
});

test('encodes keys and requires page refresh for replacing an already loaded SDK', async () => {
  const { load, context, scripts } = setup();
  context.ymaps3 = { ready: Promise.resolve() };
  const pending = load('key&lang=other');
  assert.equal(new URL(scripts[0].src).searchParams.get('apikey'), 'key&lang=other');
  assert.equal(new URL(scripts[0].src).searchParams.get('lang'), 'ru_RU');
  await scripts[0].onload();
  await pending;
  await assert.rejects(load('replacement'), /Обновите страницу/);
  assert.equal(scripts.length, 1);
});
