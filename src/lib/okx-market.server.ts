import { OKX_INSTRUMENTS } from './okx-market';

function baseUrl() {
  const raw = process.env['OKX_API_BASE_URL'] || 'https://www.okx.com';
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !['www.okx.com', 'my.okx.com', 'app.okx.com', 'us.okx.com', 'eea.okx.com'].includes(url.hostname)) {
    throw new Error('OKX_API_BASE_URL must be an approved HTTPS OKX host');
  }
  return url.origin;
}

export function okxInstrument(symbol: string) {
  const instId = OKX_INSTRUMENTS[symbol];
  if (!instId) throw new Error('Real trading is available only for crypto markets listed by OKX');
  return instId;
}

async function okxGet<T>(path: string): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000), cache: 'no-store' });
  if (!response.ok) throw new Error('OKX market data is temporarily unavailable');
  const payload = await response.json() as { code?: string; msg?: string; data?: T };
  if (payload.code !== '0' || !payload.data) throw new Error('OKX did not return valid market data');
  return payload.data;
}

export async function getOkxEntryQuote(symbol: string) {
  const instId = okxInstrument(symbol);
  const rows = await okxGet<Array<{ last: string; ts: string }>>(`/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`);
  const row = rows[0];
  const price = Number(row?.last);
  const timestamp = Number(row?.ts);
  if (!Number.isFinite(price) || price <= 0 || !Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > 5000) {
    throw new Error('OKX quote is stale; try again when the market updates');
  }
  return { instId, price, timestamp };
}

export async function getOkxSettlementCandle(instId: string, expiresAt: string) {
  const expiryMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiryMs)) throw new Error('Invalid trade expiry');
  // Settlement uses the first completed 1-second candle whose close is at or after expiry.
  const candleTs = Math.floor((expiryMs - 1) / 1000) * 1000;
  const rows = await okxGet<string[][]>(`/api/v5/market/history-candles?instId=${encodeURIComponent(instId)}&bar=1s&after=${candleTs + 1000}&limit=20`);
  const row = rows.find((candidate) => Number(candidate[0]) === candleTs && candidate[8] === '1');
  const close = Number(row?.[4]);
  if (!row || !Number.isFinite(close) || close <= 0) return null;
  return { close, candleTs };
}
