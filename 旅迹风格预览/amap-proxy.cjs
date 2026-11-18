const providers = require('./providers.cjs');

const LOCAL_HOSTS = new Set(['127.0.0.1:18647', 'localhost:18647']);
const PATH_PATTERN = /^\/_AMapService\/v[34]\/[A-Za-z0-9/_-]+$/;
const CALLBACK_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/;

function send(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

function isJsonpForCallback(body, callback) {
  if (typeof body !== 'string') return false;
  const escaped = callback.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = body.match(new RegExp('^\\s*' + escaped + '\\s*\\(([\\s\\S]*)\\)\\s*;?\\s*$'));
  if (!match) return false;
  try {
    const value = JSON.parse(match[1]);
    return value !== null && typeof value === 'object';
  } catch {
    return false;
  }
}

module.exports = async function amapProxy(req, res, url) {
  try {
    if (req.method !== 'GET' || !LOCAL_HOSTS.has(req.headers.host) || !PATH_PATTERN.test(url.pathname)) {
      return send(res, 400, { error: '无效的地图服务请求' });
    }
    if (req.headers.origin && !['http://127.0.0.1:18647', 'http://localhost:18647'].includes(req.headers.origin)) {
      return send(res, 403, { error: '拒绝跨站请求' });
    }

    const callbacks = url.searchParams.getAll('callback');
    let callback = null;
    if (callbacks.length) {
      if (callbacks.length !== 1 || !CALLBACK_PATTERN.test(callbacks[0])) {
        return send(res, 400, { error: '地图服务回调参数无效' });
      }
      callback = callbacks[0];
    }

    const config = await providers.config();
    if (!config.amapJsSecurity) {
      return send(res, 503, { error: '高德地图安全配置不可用' });
    }

    const destination = new URL('https://restapi.amap.com/' + url.pathname.slice('/_AMapService/'.length));
    for (const [key, value] of url.searchParams) {
      if (key !== 'jscode') destination.searchParams.append(key, value);
    }
    destination.searchParams.set('jscode', config.amapJsSecurity);

    const upstream = await fetch(destination, {
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) return send(res, 502, { error: '高德地图服务暂时不可用' });

    const body = await upstream.text();
    if (callback) {
      if (!isJsonpForCallback(body, callback)) {
        return send(res, 502, { error: '高德地图服务返回格式无法验证' });
      }
      res.writeHead(200, {
        'content-type': 'application/javascript; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      return res.end(body);
    }

    try {
      const value = JSON.parse(body);
      if (value === null || typeof value !== 'object') throw new Error('invalid JSON');
    } catch {
      return send(res, 502, { error: '高德地图服务返回格式无法验证' });
    }
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    return res.end(body);
  } catch {
    return send(res, 502, { error: '高德地图代理不可用，请检查安全配置及网络' });
  }
};

module.exports.isJsonpForCallback = isJsonpForCallback;
