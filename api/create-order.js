// Hardcoded price list — never trust the client
const PRICES = {
  'VIP Rank':          2.99,
  'Legend Rank':       8.99,
  'Elite Rank':        5.99,
  'Custom Rank':      12.99,
  'Totem Pack':        0.99,
  'Lore Tokens':       0.50,
  'Super Compressor':  1.99,
  'Extra Vault Token': 1.99,
  'Vault Token':       1.99,
  'Dragon Pickaxe':    2.99,
  '64 EGaps':          8.99,
  'Cookie Key':        2.99,
  'Dragon Key':        4.99,
  'Heavenly Key':     19.99,
  'Starter Bundle':    3.99,
  'Ultimate Bundle':   9.99,
};

// Qty discounts — [qty, discountedUnitPrice]
const QTY_PRICES = {
  'Totem Pack':        [[3, 0.89], [5, 0.79]],
  'Dragon Key':        [[3, 4.49]],
  'Cookie Key':        [[3, 2.49]],
  '64 EGaps':          [[3, 7.99]],
  'Super Compressor':  [[3, 1.79]],
  'Dragon Pickaxe':    [[2, 2.49]],
  'Lore Tokens':       [[5, 0.40]],
};

async function getPayPalAccessToken() {
  const clientId     = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const base         = process.env.PAYPAL_SANDBOX === 'true'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();
  return { token: data.access_token, base };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const { productName, qty = 1, username, referral } = req.body;

  // Look up price server-side — ignore any price sent from client
  const basePrice = PRICES[productName];
  if (!basePrice) return res.status(400).json({ error: 'Unknown product: ' + productName });

  // Resolve qty price if applicable
  let unitPrice = basePrice;
  const qtyTiers = QTY_PRICES[productName];
  if (qtyTiers && qty > 1) {
    // Find highest matching tier
    const tier = [...qtyTiers].reverse().find(([q]) => qty >= q);
    if (tier) unitPrice = tier[1];
  }

  const totalPrice = (unitPrice * qty).toFixed(2);
  const description = `CookiesGenZ - ${productName}${qty > 1 ? ` x${qty}` : ''} for ${username}${referral ? ` [ref:${referral}]` : ''}`;

  try {
    const { token, base } = await getPayPalAccessToken();

    const orderRes = await fetch(`${base}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        application_context: { shipping_preference: 'NO_SHIPPING' },
        purchase_units: [{
          amount: { value: totalPrice, currency_code: 'EUR' },
          description,
          payee: { email_address: process.env.PAYPAL_RECEIVER_EMAIL },
        }],
      }),
    });

    const order = await orderRes.json();
    if (!order.id) return res.status(502).json({ error: 'PayPal order creation failed', detail: order });

    // Return only the order ID and the server-verified price (for display)
    res.status(200).json({ orderId: order.id, verifiedPrice: totalPrice });
  } catch (e) {
    res.status(500).json({ error: 'Internal error', detail: e.message });
  }
}
