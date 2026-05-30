// api/create-order.js
// Creates a PayPal order server-side. All pricing and referral validation
// happens here — the client sends product name + qty + username only.
// Prices are never read from the request body.

// Valid Minecraft username format: 3–16 chars, alphanumeric + underscore only.
const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

// Referral codes and the discount multiplier they apply.
// Stored server-side only — never sent to the client.
const REFERRAL_CODES = {
  'DONTLOOKATTHESOURCECODE': 0.90,
  'YEADONT':                 0.90,
  'WMEMBERS':                0.90,
};

// Canonical server-side price list. Client-supplied prices are ignored entirely.
const PRICES = {
  'VIP Rank':          2.99,
  'Elite Rank':        5.99,
  'Legend Rank':       8.99,
  'Custom Rank':      12.99,
  'Totem Pack':        0.99,
  'Lore Token x5':     0.50,
  'Super Compressor':  1.99,
  'Extra Vault Token': 1.99,
  'Vault Token':       1.99,
  'Dragon Pickaxe':    2.99,
  'God Apple Stack':   8.99,
  'Cookie Key':        2.99,
  'Dragon Key':        4.99,
  'Heavenly Key':     19.99,
  'Starter Bundle':    3.99,
  'Dragon Slayer Bundle': 7.99,
  'Ultimate Bundle':  18.99,
  // Donation — amount comes from the request, but is clamped server-side
  'Donation':          null,
};

// Per-product qty discount tiers: [minimumQty, discountedUnitPrice]
// Tiers must be ordered ascending by qty.
const QTY_PRICES = {
  'Cookie Key': [[3, 2.49]],
  'Dragon Key': [[3, 4.49]],
};

async function getPayPalAccessToken() {
  const clientId     = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const base         = process.env.PAYPAL_SANDBOX === 'true'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

  const r = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });

  const data = await r.json();
  if (!data.access_token) throw new Error('PayPal auth failed');
  return { token: data.access_token, base };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const { productName, qty = 1, username, referral = '', donationAmount } = req.body;

  // --- Username validation ---
  if (!username || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Invalid Minecraft username.' });
  }

  // --- Qty validation: must be a positive integer, cap at 10 to prevent abuse ---
  const parsedQty = parseInt(qty, 10);
  if (!Number.isInteger(parsedQty) || parsedQty < 1 || parsedQty > 10) {
    return res.status(400).json({ error: 'Invalid quantity.' });
  }

  // --- Product validation ---
  if (!Object.prototype.hasOwnProperty.call(PRICES, productName)) {
    return res.status(400).json({ error: 'Unknown product.' });
  }

  // --- Referral code validation (server-side only) ---
  const code = referral.trim().toUpperCase();
  const discount = code ? (REFERRAL_CODES[code] ?? null) : null;
  if (code && discount === null) {
    // Code was supplied but is not valid — reject so the client shows the error
    return res.status(400).json({ error: 'invalid_referral' });
  }

  // --- Price resolution ---
  let totalPrice;
  let description;

  if (productName === 'Donation') {
    // Donation: client supplies amount, but we clamp it to a sane range server-side
    const raw = parseFloat(donationAmount);
    if (isNaN(raw) || raw < 1 || raw > 500) {
      return res.status(400).json({ error: 'Donation amount must be between €1 and €500.' });
    }
    totalPrice = (Math.round(raw * 100) / 100).toFixed(2);
    description = `CookiesGenZ - Donation from ${username}`;
  } else {
    let unitPrice = PRICES[productName];

    // Apply qty tier discount if applicable
    const tiers = QTY_PRICES[productName];
    if (tiers && parsedQty > 1) {
      // Walk tiers ascending, keep highest matching one
      for (const [minQty, tierPrice] of tiers) {
        if (parsedQty >= minQty) unitPrice = tierPrice;
      }
    }

    // Apply referral discount after qty pricing
    if (discount !== null) {
      unitPrice = Math.round(unitPrice * discount * 100) / 100;
    }

    totalPrice = (unitPrice * parsedQty).toFixed(2);
    description = `CookiesGenZ - ${productName}${parsedQty > 1 ? ` x${parsedQty}` : ''} for ${username}${code ? ` [ref:${code}]` : ''}`;
  }

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
    if (!order.id) {
      // Log the real error server-side; send only a generic message to the client
      console.error('PayPal order creation failed:', JSON.stringify(order));
      return res.status(502).json({ error: 'Order creation failed. Please try again.' });
    }

    // Return order ID and the server-verified price so the client can display it.
    // discountApplied lets the frontend show the "code applied" confirmation.
    res.status(200).json({
      orderId: order.id,
      verifiedPrice: totalPrice,
      discountApplied: discount !== null,
    });
  } catch (e) {
    // Log internally; never expose stack traces or PayPal internals to the client
    console.error('create-order error:', e.message);
    res.status(500).json({ error: 'Internal error. Please try again.' });
  }
}
