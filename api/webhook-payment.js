// api/webhook-payment.js
// Relays a pre-built Discord embed payload to the private payments channel.
// Only accepts calls from verify-order.js (or other server-side routes) that
// include the correct X-Internal-Secret header matching INTERNAL_SECRET env var.
// Direct browser calls or outside requests receive 403.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const secret = process.env.INTERNAL_SECRET;
  if (!secret || req.headers['x-internal-secret'] !== secret) {
    return res.status(403).end('Forbidden');
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_PAYMENTS;
  if (!webhookUrl) return res.status(500).end('Webhook not configured');

  try {
    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    res.status(r.ok ? 200 : 502).end();
  } catch (e) {
    console.error('webhook-payment relay error:', e.message);
    res.status(500).end('Relay failed');
  }
}
