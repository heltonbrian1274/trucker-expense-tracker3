import { Redis } from '@upstash/redis';
import Stripe from 'stripe';
import { randomBytes } from 'crypto';

// Initialize Upstash Redis client using the Vercel KV environment variables
const redis = new Redis({
  url: process.env.KV_REST_API_URL,      // CHANGED
  token: process.env.KV_REST_API_TOKEN,  // CHANGED
});

// Initialize Stripe with your secret key (must be an environment variable)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Your Stripe webhook secret for verifying the request (must be an environment variable)
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Helper function to buffer the request body for signature verification
async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export const config = {
  api: {
    bodyParser: false, // We need the raw body for Stripe signature verification
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error(`⚠️  Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the 'checkout.session.completed' event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const customerEmail = session.customer_details.email;

    if (!customerEmail) {
      console.error('⚠️ No customer email found in session.');
      return res.status(400).send('Customer email is missing.');
    }

    const unlockToken = randomBytes(24).toString('hex');

    // Store the token in your Upstash Redis database, expiring in 7 days
    await redis.set(`token:${unlockToken}`, JSON.stringify({ email: customerEmail, used: false }), { ex: 604800 });

    // --- Placeholder for Sending an Email ---
    // This is where you would trigger an email to the customer
    // with their unique unlock link.
    console.log(`✅ Token generated for ${customerEmail}: ${unlockToken}`);
    console.log(`📧 Unlock link to send: https://www.truckerexpensetracker.com/?token=${unlockToken}` );
  }

  res.status(200).json({ received: true });
}
