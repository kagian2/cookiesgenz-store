export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');
  if (req.headers['x-internal-secret'] !== process.env.INTERNAL_SECRET) {
    return res.status(403).end('Forbidden');
  }
  const webhookUrl = process.env.DISCORD_WEBHOOK_PAYMENTS;
  if (!webhookUrl) return res.status(500).end('Webhook not configured');
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    res.status(response.ok ? 200 : 502).end();
  } catch (e) {
    res.status(500).end('Failed to send webhook');
  }
}
