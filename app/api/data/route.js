import { NextResponse } from 'next/server';

// In-memory fallback when Vercel KV is not configured
let memoryStore = {};

async function getKV() {
  try {
    const { kv } = await import('@vercel/kv');
    // Test if KV is configured
    if (process.env.KV_REST_API_URL) {
      return kv;
    }
  } catch (e) {
    // KV not available
  }
  return null;
}

// GET /api/data?key=xxx  or  GET /api/data (all keys)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  const kv = await getKV();

  if (key) {
    // Get single key
    let value;
    if (kv) {
      value = await kv.get(key);
    } else {
      value = memoryStore[key] || null;
    }
    return NextResponse.json({ key, value });
  }

  // Get all data (for initial app load)
  const allKeys = [
    'zhk-apartments', 'zhk-meters', 'zhk-payments',
    'zhk-employees', 'zhk-salary', 'zhk-expenses',
    'zhk-requests', 'zhk-common-meters', 'zhk-common-meter-defs',
    'zhk-global-tariffs', 'zhk-kaspi-phone', 'zhk-utility-bills'
  ];

  const data = {};
  if (kv) {
    const pipeline = kv.pipeline();
    for (const k of allKeys) {
      pipeline.get(k);
    }
    const results = await pipeline.exec();
    allKeys.forEach((k, i) => {
      if (results[i] !== null && results[i] !== undefined) {
        data[k] = results[i];
      }
    });
  } else {
    for (const k of allKeys) {
      if (memoryStore[k] !== undefined) {
        data[k] = memoryStore[k];
      }
    }
  }

  return NextResponse.json(data);
}

// POST /api/data  { key, value }
export async function POST(request) {
  const { key, value } = await request.json();

  if (!key) {
    return NextResponse.json({ error: 'Key required' }, { status: 400 });
  }

  const kv = await getKV();

  if (kv) {
    await kv.set(key, value);
  } else {
    memoryStore[key] = value;
  }

  return NextResponse.json({ success: true, key });
}

// POST /api/data/bulk  { data: { key1: value1, key2: value2, ... } }
export async function PUT(request) {
  const { data } = await request.json();

  if (!data || typeof data !== 'object') {
    return NextResponse.json({ error: 'Data object required' }, { status: 400 });
  }

  const kv = await getKV();

  if (kv) {
    const pipeline = kv.pipeline();
    for (const [key, value] of Object.entries(data)) {
      pipeline.set(key, value);
    }
    await pipeline.exec();
  } else {
    Object.assign(memoryStore, data);
  }

  return NextResponse.json({ success: true, keys: Object.keys(data) });
}
