// api/verify-order.js
// Step 8-12 of the payment flow:
//   - Receives the PayPal Order ID from the browser after onApprove fires
//   - Verifies the order status is COMPLETED directly via PayPal's API (server-to-server)
//   - Fires the private payments webhook (Discord #purchases channel) via webhook-payment.js
//   - Fires the public advertising webhook (Discord #store-purchases channel) via webhook-advertising.js
//   - Returns success to the browser
//
// Environment variables required:
//   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_SANDBOX,
//   DISCORD_WEBHOOK_PAYMENTS, DISCORD_WEBHOOK_ADVERTISING, INTERNAL_SECRET

const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

// All Minecraft commands live server-side only — never sent to the browser
function getCommand(username, productName) {
  const cmds = {
    'VIP Rank':             `/lp user ${username} parent set vip`,
    'Elite Rank':           `/lp user ${username} parent set elite`,
    'Legend Rank':          `/lp user ${username} parent set legend`,
    'Custom Rank':          `/lp user ${username} parent set custom  ← open a Discord ticket to configure prefix`,
    'Cookie Key':           `/give ${username} cookie_key 1`,
    'Dragon Key':           `/give ${username} dragon_key 1`,
    'Totem Pack':           `/give ${username} totem_of_undying 5`,
    'Lore Token x5':        `→ Add lore to 5 items for ${username} via ItemEdit plugin`,
    'God Apple Stack':      `/give ${username} enchanted_golden_apple 64`,
    'Dragon Pickaxe':       `/give ${username} netherite_pickaxe{Enchantments:[{id:efficiency,lvl:5},{id:fortune,lvl:3},{id:unbreaking,lvl:3},{id:mending,lvl:1}]} 1`,
    'Extra Vault Token':    `/axvaults addvault ${username} 1`,
    'Super Compressor':     `/give ${username} nether_star{display:{Name:'{"text":"Super Compressor"}'},SkullOwner:"SuperCompressor"} 1`,
    'Starter Bundle':       `/lp user ${username} parent set vip\n/give ${username} cookie_key 1`,
    'Dragon Slayer Bundle': `/lp user ${username} parent set elite\n/give ${username} dragon_key 1`,
    'Ultimate Bundle':      `/lp user ${username} parent set custom\n/give ${username} dragon_key 1\n/give ${username} cookie_key 2\n/give ${username} enchanted_golden_apple 64`,
  };
  const cmd = cmds[productName];
  return cmd ? `\`\`\`\n${cmd}\n\`\`\`` : `Grant ${productName} to ${username} manually`;
}

async function getPayPalAccessToken() {
  const base = process.env.PAYPAL_SANDBOX === 'true'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

  const r = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(
        `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
      ).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });

  const data = await r.json();
  if (!data.access_token) throw new Error('PayPal auth failed');
  return { token: data.access_token, base };
}

// Sends a payload to one of the internal webhook relay routes.
// Uses INTERNAL_SECRET so the relay endpoint rejects direct outside calls.
async function fireWebhook(route, payload) {
  const secret = process.env.INTERNAL_SECRET;
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  const r = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': secret,
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    console.error(`Webhook relay ${route} returned ${r.status}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const { orderId, username } = req.body;

  // Basic format validation before hitting PayPal
  if (!orderId || typeof orderId !== 'string' || !/^[A-Z0-9]{17}$/.test(orderId)) {
    return res.status(400).json({ error: 'Invalid order ID format.' });
  }
  if (!username || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Invalid username.' });
  }

  try {
    const { token, base } = await getPayPalAccessToken();

    // Verify the order directly with PayPal — never trust client-supplied status
    const orderRes = await fetch(`${base}/v2/checkout/orders/${orderId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const order = await orderRes.json();

    if (order.status !== 'COMPLETED') {
      console.error('Order not COMPLETED:', order.status, orderId);
      return res.status(402).json({ error: 'Payment not confirmed by PayPal.' });
    }

    // Extract verified values from the PayPal record — never use client-supplied price
    const unit        = order.purchase_units?.[0];
    const capture     = unit?.payments?.captures?.[0];
    const verifiedAmt = capture?.amount?.value || unit?.amount?.value || '?';
    const description = unit?.description || '';
    const isDonation  = description.includes('Donation from');

    // Parse product name from description written by create-order.js:
    // Regular:  "CookiesGenZ - {productName}[ x{qty}] for {username}[ [ref:CODE]]"
    // Donation: "CookiesGenZ - Donation from {username}"
    let productName = 'Unknown Product';
    if (isDonation) {
      productName = 'Donation';
    } else {
      const m = description.match(/^CookiesGenZ - (.+?)(?:\s+x\d+)?\s+for /);
      if (m) productName = m[1];
    }

    // ── Step 10: Private channel — full purchase details for staff ──
    if (!isDonation) {
      await fireWebhook('/api/webhook-payment', {
        embeds: [{
          title: `🛒 New Purchase — ${productName}`,
          color: 0xFF6B1A,
          fields: [
            { name: '👤 Minecraft Username', value: `\`${username}\``,                                    inline: true  },
            { name: '📦 Package',            value: productName,                                           inline: true  },
            { name: '💰 Amount Verified',    value: `€${verifiedAmt} EUR (PayPal confirmed)`,             inline: true  },
            { name: '🧾 PayPal Order ID',    value: `\`${orderId}\``,                                     inline: false },
            { name: '⚡ Action Required',    value: getCommand(username, productName),                    inline: false },
          ],
          footer:    { text: 'CookiesGenZ Store · Verified by PayPal API' },
          timestamp: new Date().toISOString(),
        }],
      });
    } else {
      // Donations go to private channel too, with a different format
      await fireWebhook('/api/webhook-payment', {
        embeds: [{
          title:       '❤️ Donation Received!',
          description: `**${username}** donated **€${verifiedAmt}**\n\nThank you for supporting CookiesGenZ!`,
          color:       0x2ECC40,
          footer:      { text: 'CookiesGenZ Store · Verified by PayPal API' },
          timestamp:   new Date().toISOString(),
        }],
      });
    }

    // ── Step 11: Public channel — clean announcement for the community ──
    const publicEmbed = isDonation
      ? {
          embeds: [{
            title:       '❤️ Generous Supporter!',
            description: `Someone just supported CookiesGenZ with a donation!\n\nThank you for keeping the server alive! 🙏`,
            color:       0x2ECC40,
            footer:      { text: 'cookiesgenz.minehut.gg' },
            timestamp:   new Date().toISOString(),
          }],
        }
      : {
          embeds: [{
            title:       `🎉 New Purchase!`,
            description: `A player just grabbed **${productName}** from the store!\n\n[🛒 Shop Now](https://cookiesgenz.vercel.app)`,
            color:       0xFF6B1A,
            footer:      { text: 'cookiesgenz.minehut.gg' },
            timestamp:   new Date().toISOString(),
          }],
        };

    await fireWebhook('/api/webhook-advertising', publicEmbed);

    // ── Step 12: Respond to browser ──
    res.status(200).json({ ok: true });

  } catch (e) {
    console.error('verify-order error:', e.message);
    res.status(500).json({
      error: 'Verification failed. Contact us on Discord with your PayPal receipt.',
    });
  }
}
