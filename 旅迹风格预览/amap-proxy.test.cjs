const { test } = require('node:test');
const assert = require('node:assert/strict');
const providers = require('./providers.cjs');
const amapProxy = require('./amap-proxy.cjs');

function responseRecorder() {
  return {
    status: null,
    headers: null,
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body) { this.body = String(body ?? ''); },
  };
}

async function invoke({ query = 'callback=jsonp_test_1', method = 'GET', host = '127.0.0.1:18647', origin = 'http://127.0.0.1:18647', upstream } = {}) {
  const oldConfig = providers.config;
  const oldFetch = global.fetch;
  const res = responseRecorder();
  let fetchCalls = 0;
  providers.config = async () => ({ amapJsSecurity: 'unit-test-security-code' });
  global.fetch = async (url, options) => {
    fetchCalls++;
    return upstream ? upstream(url, options) : new Response('jsonp_test_1({"status":"1","info":"OK"})', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const url = new URL('http://127.0.0.1:18647/_AMapService/v3/direction/driving' + (query ? '?' + query : ''));
    await amapProxy({ method, headers: { host, origin } }, res, url);
    return { res, fetchCalls };
  } finally {
    providers.config = oldConfig;
    global.fetch = oldFetch;
  }
}

test('合法高德 JSONP 响应改为 JavaScript MIME，且安全码由服务端覆盖', async () => {
  const { res, fetchCalls } = await invoke({
    query: 'callback=jsonp_test_1&key=public-js-key&jscode=attacker-value',
    upstream: async (url, options) => {
      assert.equal(url.origin, 'https://restapi.amap.com');
      assert.equal(url.pathname, '/v3/direction/driving');
      assert.equal(url.searchParams.get('callback'), 'jsonp_test_1');
      assert.equal(url.searchParams.get('key'), 'public-js-key');
      assert.equal(url.searchParams.get('jscode'), 'unit-test-security-code');
      assert.equal(options.redirect, 'error');
      return new Response('jsonp_test_1({"status":"1","info":"OK"});', {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      });
    },
  });
  assert.equal(fetchCalls, 1);
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'application/javascript; charset=utf-8');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.match(res.body, /^jsonp_test_1\(/);
});

test('拒绝不安全、重复或超长的 JSONP 回调，不请求上游', async () => {
  for (const query of [
    'callback=alert%281%29',
    'callback=window.foo',
    'callback=ok&callback=other',
    'callback=' + 'a'.repeat(129),
  ]) {
    const { res, fetchCalls } = await invoke({ query });
    assert.equal(res.status, 400, query);
    assert.equal(fetchCalls, 0, query);
  }
});

test('拒绝回调名不匹配或 JSON 无效的上游脚本', async () => {
  for (const body of [
    'jsonp_other({"status":"1"})',
    'jsonp_test_1({not-json})',
    'alert(1);jsonp_test_1({"status":"1"})',
    'jsonp_test_1({"status":"1"});alert(1)',
  ]) {
    const { res } = await invoke({
      upstream: async () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }),
    });
    assert.equal(res.status, 502);
    assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
    assert.equal(JSON.parse(res.body).error, '高德地图服务返回格式无法验证');
    assert.equal(res.body.includes('alert(1)'), false);
  }
});

test('无 callback 时只接受合法 JSON 并使用 JSON MIME', async () => {
  const { res } = await invoke({
    query: '',
    upstream: async () => new Response('{"status":"1","info":"OK"}', {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
    }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
  assert.deepEqual(JSON.parse(res.body), { status: '1', info: 'OK' });
});

test('拒绝非本机来源和不允许的主机', async () => {
  const wrongOrigin = await invoke({ origin: 'https://evil.example' });
  assert.equal(wrongOrigin.res.status, 403);
  assert.equal(wrongOrigin.fetchCalls, 0);
  const wrongHost = await invoke({ host: 'example.com' });
  assert.equal(wrongHost.res.status, 400);
  assert.equal(wrongHost.fetchCalls, 0);
});

test('上游失败时不把原始错误或安全码回传给浏览器', async () => {
  const { res } = await invoke({
    upstream: async () => { throw new Error('request failed: unit-test-security-code'); },
  });
  assert.equal(res.status, 502);
  assert.equal(res.body.includes('unit-test-security-code'), false);
  assert.equal(res.body.includes('request failed'), false);
});
