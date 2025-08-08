import { randomBytes } from 'crypto';
import { redis } from '../utils/api-middleware.js';
import { sendActivationEmail } from '../utils/email-service.js';
import Stripe from 'stripe';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Helper function to buffer the request
async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  console.log('🔔 Webhook received:', req.method, req.headers['stripe-signature'] ? 'with signature' : 'NO SIGNATURE');
  
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

  console.log('📝 Event type:', event.type);
  
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const customerEmail = session.customer_details.email;
    
    console.log('💳 Payment completed for:', customerEmail);

    if (!customerEmail) {
      console.error('⚠️ No customer email found in session.');
      return res.status(400).send('Customer email is missing.');
    }

    const unlockToken = randomBytes(24).toString('hex');
    console.log('🔑 Generated token:', unlockToken);
    
    await redis.set(`token:${unlockToken}`, JSON.stringify({ email: customerEmail, used: false }), { ex: 604800 });
    console.log('💾 Token stored in Redis');

    // Send webhook-style email
    const emailSent = await sendActivationEmail(customerEmail, unlockToken, 'webhook');
    console.log('📧 Email sent result:', emailSent);
  } else {
    console.log('ℹ️ Ignoring event type:', event.type);
  }

  res.status(200).json({ received: true });
}