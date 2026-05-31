const COMMANDS = {
  'VIP Rank':          (u) => `/lp user ${u} parent set vip`,
  'Elite Rank':        (u) => `/lp user ${u} parent set elite`,
  'Legend Rank':       (u) => `/lp user ${u} parent set legend`,
  'Custom Rank':       (u) => `/lp user ${u} parent set custom  ← set up prefix via Discord ticket`,
  'Cookie Key':        (u) => `/give ${u} cookie_key 1`,
  'Dragon Key':        (u) => `/give ${u} dragon_key 1`,
  'Heavenly Key':      (u) => `/give ${u} heavenly_key 1`,
  'Totem Pack':        (u) => `/give ${u} totem_of_undying 5`,
  'Lore Tokens':       (u) => `→ Add lore to items for ${u} via ItemEdit plugin`,
  '64 EGaps':          (u) => `/give ${u} enchanted_golden_apple 64`,
  'Dragon Pickaxe':    (u) => `/give ${u} netherite_pickaxe{Enchantments:[{id:efficiency,lvl:5},{id:fortune,lvl:3},{id:unbreaking,lvl:3},{id:mending,lvl:1}]} 1`,
  'Extra Vault Token': (u) => `/axvaults addvault ${u} 1`,
  'Vault Token':       (u) => `/axvaults addvault ${u} 1`,
  'Super Compressor':  (u) => `/give ${u} nether_star 1`,
  'Starter Bundle':    (u) => `/lp user ${u} parent set vip\n/give ${u} cookie_key 1`,
  'Ultimate Bundle':   (u) => `/lp user ${u} parent set custom\n/give ${u} dragon_key 1\n/give ${u} cookie_key 2\n/give ${u} enchanted_golden_apple 64`,
};

async function getPayPalAccessToken() {
  const base = process.env.PAYPAL_SANDBOX === 'true'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(
        `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
      ).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  return { token: data.access_token, base };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const { orderId, username, productName, qty } = req.body;
  if (!orderId || !username || !productName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // 1. Verify order with PayPal server-to-server
    const { token, base } = await getPayPalAccessToken();
    const orderRes = await fetch(`${base}/v2/checkout/orders/${orderId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const order = await orderRes.json();

    if (order.status !== 'COMPLETED') {
      console.error('Order not completed:', order.status, orderId);
      return res.status(402).json({ error: 'Order not completed', status: order.status });
    }

    // 2. Extract verified amount directly from PayPal response
    const amount = order.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value || '?';
    const currency = order.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.currency_code || 'EUR';
    const qtyNum = parseInt(qty) || 1;

    // 3. Build command
    const cmdFn = COMMANDS[productName];
    const command = cmdFn
      ? '```\n' + cmdFn(username) + '\n```'
      : '`Grant ' + productName + ' to ' + username + '`';

    // 4. Send to private payments webhook directly
    const paymentsWebhook = process.env.DISCORD_WEBHOOK_PAYMENTS;
    const advertisingWebhook = process.env.DISCORD_WEBHOOK_ADVERTISING;

    const privatePayload = {
      embeds: [{
        title: `🛒 New Purchase — ${productName}`,
        color: 0xFF6B1A,
        fields: [
          { name: '👤 Minecraft Username', value: '`' + username + '`', inline: true },
          { name: '📦 Package', value: productName + (qtyNum > 1 ? ` x${qtyNum}` : ''), inline: true },
          { name: '💰 Amount Paid', value: `€${amount} ${currency}`, inline: true },
          { name: '🧾 PayPal Order ID', value: '`' + orderId + '`', inline: false },
          { name: '⚡ Action Required', value: command, inline: false },
        ],
        footer: { text: 'CookiesGenZ Store · Verified by PayPal' },
        timestamp: new Date().toISOString(),
      }],
    };

    const publicPayload = {
      embeds: [{
        title: '🎉 New Purchase!',
        description: `**${username}** just bought **${productName}**!`,
        color: 0x2ECC40,
        footer: { text: 'CookiesGenZ Store' },
        timestamp: new Date().toISOString(),
      }],
    };

    // 5. Fire both webhooks directly — no middleman
    const [privateRes, publicRes] = await Promise.all([
      fetch(paymentsWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(privatePayload),
      }),
      fetch(advertisingWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(publicPayload),
      }),
    ]);

    if (!privateRes.ok) console.error('Private webhook failed:', await privateRes.text());
    if (!publicRes.ok) console.error('Public webhook failed:', await publicRes.text());

    return res.status(200).json({ success: true, amount, currency });

  } catch (e) {
    console.error('verify-order error:', e);
    return res.status(500).json({ error: 'Internal error', detail: e.message });
  }
}
