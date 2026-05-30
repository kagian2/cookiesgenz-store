// api/store-message.js
// Public-facing route called by the browser for scheduled store promo messages.
// The browser sends a message index; this route selects the payload server-side
// and relays it to webhook-advertising.js with the INTERNAL_SECRET header.
// Rate-limited to one call per IP per 60 minutes to prevent Discord spam.
//
// Environment variables required: INTERNAL_SECRET, VERCEL_URL

// All promo message payloads defined server-side — browser never supplies embed content
const MESSAGES = [
  {embeds:[{
    title:'🔥 LIMITED TIME SALE — All Prices Slashed!',
    description:'Our biggest sale is **still live** on the CookiesGenZ Store! Grab your rank before the timer hits zero and prices reset.\n\n💸 **Custom Rank** — ~~€17.99~~ **€12.99**\n💸 **Legend Rank** — ~~€11.99~~ **€8.99**\n💸 **Elite Rank** — ~~€8.99~~ **€5.99**\n💸 **VIP Rank** — ~~€4.99~~ **€2.99**\n​',
    color:0xFF6B1A,
    fields:[{name:'🛒 Shop Now',value:'Head to the store and lock in your price before it\'s too late!',inline:false}],
    footer:{text:'CookiesGenZ Store · cookiesgenz.minehut.gg'},
  }]},
  {embeds:[{
    title:'👑 What Do You Get With Custom Rank?',
    description:'The **Custom Rank** is our most popular package.\n\n✅ /fly at spawn\n✅ 4 Private Vaults\n✅ Unlimited homes\n✅ /repair all\n✅ Your **own prefix** in any color & format\n✅ Everything from VIP, Elite & Legend\n\nAll for just **€12.99**',
    color:0xFFAA00,
    footer:{text:'CookiesGenZ Store · cookiesgenz.minehut.gg'},
  }]},
  {embeds:[{
    title:'⚔️ Dragon Slayer Bundle — Save Big!',
    description:'**Elite Rank** + **Dragon Key** in one bundle.\n\nGrab it at the store now.',
    color:0x7B2FF7,
    footer:{text:'CookiesGenZ Store · cookiesgenz.minehut.gg'},
  }]},
  {embeds:[{
    title:'🍎 God Apple Stack — PvP Dominance',
    description:'**64 Enchanted Golden Apples** dropped straight into your inventory. Stop losing fights — stock up now.',
    color:0xFF4A1A,
    footer:{text:'CookiesGenZ Store · cookiesgenz.minehut.gg'},
  }]},
  {embeds:[{
    title:'🐉 Dragon Key — The Most Overpowered Loot on the Server',
    description:'Every key delivers real, guaranteed loot. On sale now at the store.',
    color:0xE63000,
    footer:{text:'CookiesGenZ Store · cookiesgenz.minehut.gg'},
  }]},
  {embeds:[{
    title:'👑 The Ultimate Bundle — Everything. All of It.',
    description:'Custom Rank + Dragon Key × 1 + Cookie Key × 2 + God Apple Stack.\n\nOne purchase. Save big.',
    color:0xFFAA00,
    footer:{text:'CookiesGenZ Store · cookiesgenz.minehut.gg'},
  }]},
  {embeds:[{
    title:'🎁 Share Your Referral Code — Give Friends 10% Off',
    description:'**Supporters** on our Discord get a referral code they can share.\n\nWhen your friends use it at checkout they get **10% off**!\n\nOpen a ticket in **#support** to get your code.',
    color:0x2ECC40,
    footer:{text:'CookiesGenZ Store · cookiesgenz.minehut.gg'},
  }]},
  {embeds:[{
    title:'💚 VIP Rank — The Best €2.99 You\'ll Spend',
    description:'✅ /warp mines — exclusive private mines\n✅ /ec, /craft, /trash anywhere\n✅ 6 home slots\n✅ /kit vip — full Netherite armor\n✅ VIP tab priority & prefix\n\nOne-time purchase, yours forever.',
    color:0x5BF577,
    footer:{text:'CookiesGenZ Store · cookiesgenz.minehut.gg'},
  }]},
  {embeds:[{
    title:'⏰ The Sale Clock Is Ticking...',
    description:'Every rank, key and bundle on the CookiesGenZ Store is on sale right now. Grab what you want before prices reset.',
    color:0xE63000,
    footer:{text:'CookiesGenZ Store · cookiesgenz.minehut.gg'},
  }]},
];

// In-memory rate limit: IP → timestamp of last accepted call
// Resets on each serverless cold start, which is acceptable for this use case
const lastCallByIp = new Map();
const RATE_LIMIT_MS = 60 * 60 * 1000; // 1 hour per IP

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  // Rate limit by IP — prevents a single visitor from spamming Discord
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const last = lastCallByIp.get(ip) || 0;
  if (now - last < RATE_LIMIT_MS) {
    return res.status(429).end('Too Many Requests');
  }
  lastCallByIp.set(ip, now);

  // Browser sends a message index; server selects the payload
  const idx = parseInt(req.body?.idx ?? 0, 10);
  if (isNaN(idx)) return res.status(400).end('Bad Request');
  const payload = MESSAGES[idx % MESSAGES.length];

  // Relay to advertising webhook using INTERNAL_SECRET — browser never sees this
  const secret  = process.env.INTERNAL_SECRET;
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  try {
    const r = await fetch(`${baseUrl}/api/webhook-advertising`, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'X-Internal-Secret': secret,
      },
      body: JSON.stringify(payload),
    });
    res.status(r.ok ? 200 : 502).end();
  } catch (e) {
    console.error('store-message relay error:', e.message);
    res.status(500).end('Relay failed');
  }
}
