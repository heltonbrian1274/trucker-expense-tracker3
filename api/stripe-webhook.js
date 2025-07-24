import { Redis } from '@upstash/redis';
import Stripe from 'stripe';
import { randomBytes } from 'crypto';

// Initialize Redis and Stripe
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// --- ZOHO EMAIL SENDING FUNCTION ---
// A helper function to send the email using the ZeptoMail API
async function sendActivationEmail(recipientEmail, token) {
  const zeptoMailToken = process.env.ZEPTOMAIL_TOKEN;
  // IMPORTANT: This "from" address must be an address from your verified domain in ZeptoMail
  const fromAddress = "support@truckerexpensetracker.com";

  const emailBody = {
    from: {
      address: fromAddress,
      name: "Trucker Expense Tracker",
    },
    to: [
      {
        email_address: {
          address: recipientEmail,
          name: recipientEmail,
        },
      },
    ],
    subject: "Activate Your Pro Subscription",
    htmlbody: `
      <div style="font-family: sans-serif; padding: 20px; line-height: 1.6;">
        <h2>Thank You for Subscribing!</h2>
        <p>Your payment was successful. Please click the button below to activate your Pro account and unlock all features.</p>
        <a href="https://www.truckerexpensetracker.com/?token=${token}" style="background-color: #2563eb; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Activate My Account</a>
        <p>If you have any trouble, you can copy and paste this link into your browser:</p>
        <p>https://www.truckerexpensetracker.com/?token=${token}</p>
        <p>If you have any questions, please contact support.</p>
      </div>
    `,
  };

  try {
    const response = await fetch("https://api.zeptomail.com/v1.1/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // THIS IS THE ONLY LINE THAT HAS CHANGED
        "Authorization": zeptoMailToken,
      },
      body: JSON.stringify(emailBody ),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Failed to send email via Zoho:", errorData);
    } else {
      console.log(`✅ Activation email successfully sent to ${recipientEmail} via Zoho.`);
    }
  } catch (error) {
    console.error("Error calling Zoho API:", error);
  }
}
// --- END OF ZOHO FUNCTION ---

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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const customerEmail = session.customer_details.email;

    if (!customerEmail) {
      console.error('⚠️ No customer email found in session.');
      return res.status(400).send('Customer email is missing.');
    }

    const unlockToken = randomBytes(24).toString('hex');
    await redis.set(`token:${unlockToken}`, JSON.stringify({ email: customerEmail, used: false }), { ex: 604800 });
    
    // Call our Zoho function to send the email
    await sendActivationEmail(customerEmail, unlockToken);
  }

  res.status(200).json({ received: true });
}
