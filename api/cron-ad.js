// api/cron-ad.js
// Called by Vercel Cron every 7 minutes — sends the next ad message to Discord.
// No browser involvement — runs entirely on the server.
// Vercel Cron requires the CRON_SECRET header to prevent unauthorized triggers.
//
// Add to vercel.json:
// { "crons": [{ "path": "/api/cron-ad", "schedule": "*/7 * * * *" }] }
//
// Add env var: CRON_SECRET = any random string (set in Vercel dashboard)

const MESSAGES = [
  {embeds:[{
    title:'🔥 LIMITED TIME SALE — All Prices Slashed!',
    description:'Our biggest sale is **still live** on the CookiesGenZ Store!\n\n💸 **Custom Rank** — ~~€17.99~~ **€12.99**\n💸 **Legend Rank** — ~~€11.99~~ **€8.99**\n💸 **Elite Rank** — ~~€8.99~~ **€5.99**\n💸 **VIP Rank** — ~~€4.99~~ **€2.99**',
    color:0xFF6B1A,
    fields:[{name:'🛒 Shop Now',value:'Head to the store and lock in your price before the timer resets!',inline:false}],
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
    description:'**64 Enchanted Golden Apples** dropped straight into your inventory.\n\nStop losing PvP fights — stock up now at **€8.99**.',
    color:0xFF4A1A,
    footer:{text:'CookiesGenZ Store · cookiesgenz.minehut.gg'},
  }]},
  {embeds:[{
    title:'🐉 Dragon Key — The Most Overpowered Loot on the Server',
    description:'Every key delivers real, guaranteed loot — no gambling.\n\nOn sale now: **€4.99** · Buy 3 for **€13.47**',
    color:0xE63000,
    footer:{text:'CookiesGenZ Store · cookiesgenz.minehut.gg'},
  }]},
  {embeds:[{
    title:'👑 The Ultimate Bundle — Everything. All of It.',
    description:'✅ Custom Rank\n✅ Dragon Key ×1\n✅ Cookie Key ×2\n✅ God Apple Stack\n\nOne purchase. Massive savings.',
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
    title:'✨ Heavenly Key — Pick Your Own Loot',
    description:'The rarest key on CookiesGenZ.\n\n**You hand-pick 5 items** from the full loot pool — no randomness, no gambling.\n\nAvailable now: **€19.99**',
    color:0xC77DFF,
    footer:{text:'CookiesGenZ Store · cookiesgenz.minehut.gg'},
  }]},
  {embeds:[{
    title:'⏰ The Sale Clock Is Ticking...',
    description:'Every rank, key and bundle on the CookiesGenZ Store is on sale right now.\n\nWhen the countdown hits zero, prices go back up. Grab what you want before it\'s gone.',
    color:0xE63000,
    footer:{text:'CookiesGenZ Store · cookiesgenz.minehut.gg'},
  }]},
];

// Persistent message index using a simple incrementing counter stored in memory.
// Vercel serverless functions don't share memory between invocations, so we use
// the current minute to deterministically pick a message instead.
function getMessageIndex() {
  const minutesSinceEpoch = Math.floor(Date.now() / 1000 / 60);
  return minutesSinceEpoch % MESSAGES.length;
}

export default async function handler(req, res) {
  // Vercel calls cron jobs with an Authorization header containing CRON_SECRET
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end('Unauthorized');
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_ADVERTISING;
  if (!webhookUrl) return res.status(500).end('Webhook not configured');

  const payload = MESSAGES[getMessageIndex()];

  try {
    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      console.error('Discord webhook failed:', r.status, await r.text());
      return res.status(502).end('Discord webhook failed');
    }

    return res.status(200).end('OK');
  } catch (e) {
    console.error('cron-ad error:', e.message);
    return res.status(500).end('Internal error');
  }
}
