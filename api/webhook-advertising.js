// api/webhook-advertising.js
// Relays a pre-built Discord embed payload to the public advertising/store channel.
// Accepts calls from two sources:
//   1. verify-order.js — purchase announcements (requires X-Internal-Secret header)
//   2. store-message.js — scheduled store promo messages (also requires X-Internal-Secret)
// Direct browser calls receive 403.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const secret = process.env.INTERNAL_SECRET;
  if (!secret || req.headers['x-internal-secret'] !== secret) {
    return res.status(403).end('Forbidden');
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_ADVERTISING;
  if (!webhookUrl) return res.status(500).end('Webhook not configured');

  try {
    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    res.status(r.ok ? 200 : 502).end();
  } catch (e) {
    console.error('webhook-advertising relay error:', e.message);
    res.status(500).end('Relay failed');
  }
}
