// Leaderboard function using a simple JSON file approach via Netlify Blobs
// Stores leaderboard data as a single blob

const { getStore } = require("@netlify/blobs");

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const store = getStore({ name: "leaderboard", siteID: process.env.SITE_ID || context.site?.id, token: process.env.NETLIFY_BLOBS_TOKEN || process.env.DEPLOY_PRIME_URL ? undefined : process.env.NETLIFY_API_TOKEN });

    if (event.httpMethod === 'GET') {
      let entries = [];
      try {
        const data = await store.get("entries", { type: "json" });
        entries = data || [];
      } catch (e) {
        entries = [];
      }
      // Sort by points desc, then time asc for tiebreaker
      entries.sort((a, b) => b.points - a.points || a.timeSeconds - b.timeSeconds);
      return { statusCode: 200, headers, body: JSON.stringify({ entries: entries.slice(0, 50) }) };

    } else if (event.httpMethod === 'POST') {
      let rawBody = event.body || '{}';
      if (event.isBase64Encoded) rawBody = Buffer.from(rawBody, 'base64').toString('utf-8');
      const entry = JSON.parse(rawBody);

      if (!entry.email || !entry.name) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
      }

      let entries = [];
      try {
        const data = await store.get("entries", { type: "json" });
        entries = data || [];
      } catch (e) {
        entries = [];
      }

      // Find existing entry by email
      const existingIdx = entries.findIndex(e => e.email === entry.email);
      if (existingIdx >= 0) {
        const existing = entries[existingIdx];
        // Only update if new score is better (higher points, or same points with faster time)
        if (entry.points > existing.points || (entry.points === existing.points && entry.timeSeconds < existing.timeSeconds)) {
          entries[existingIdx] = { ...entry };
        }
      } else {
        entries.push({ ...entry });
      }

      // Sort and trim to top 100
      entries.sort((a, b) => b.points - a.points || a.timeSeconds - b.timeSeconds);
      entries = entries.slice(0, 100);

      await store.setJSON("entries", entries);

      return { statusCode: 200, headers, body: JSON.stringify({ status: 'updated', rank: entries.findIndex(e => e.email === entry.email) + 1 }) };

    } else {
      return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

  } catch (err) {
    console.error('Leaderboard error:', err.message);
    return { statusCode: 200, headers, body: JSON.stringify({ entries: [], error: err.message }) };
  }
};
