// /api/resend-activation.js
// Endpoint to resend activation email for existing subscribers

import { Redis } from '@upstash/redis';
import Stripe from 'stripe';
import { randomBytes } from 'crypto';

// Initialize Redis and Stripe
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ZeptoMail email sending function (reused from your existing code)
async function sendActivationEmail(recipientEmail, token) {
  const zeptoMailToken = process.env.ZEPTOMAIL_TOKEN;
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
        <h2>Activate Your Pro Subscription</h2>
        <p>We found your active subscription! Click the button below to activate your Pro account on this device.</p>
        <a href="https://www.truckerexpensetracker.com/?token=${token}" style="background-color: #2563eb; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Activate My Account</a>
        <p>If you have any trouble, you can copy and paste this link into your browser:</p>
        <p>https://www.truckerexpensetracker.com/?token=${token}</p>
        <p>If you have any questions, please contact support.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="font-size: 0.9rem; color: #666;">This email was sent because you requested to activate your subscription on a new device or browser.</p>
      </div>
    `,
  };

  try {
    const response = await fetch("https://api.zeptomail.com/v1.1/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": zeptoMailToken,
      },
      body: JSON.stringify(emailBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Failed to send email via ZeptoMail:", errorData);
      return false;
    } else {
      console.log(`✅ Activation email successfully sent to ${recipientEmail}`);
      return true;
    }
  } catch (error) {
    console.error("Error calling ZeptoMail API:", error);
    return false;
  }
}

export default async function handler(req, res) {
  // Enable CORS for frontend requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'Method not allowed' 
    });
  }
  
  try {
    const { email } = req.body;
    
    // Validate email input
    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }
    
    const customerEmail = email.trim().toLowerCase();
    console.log('🔍 Looking for subscription for email:', customerEmail);
    
    // Search for customer by email in Stripe
    const customers = await stripe.customers.list({
      email: customerEmail,
      limit: 1
    });
    
    if (customers.data.length === 0) {
      console.log('❌ No customer found for email:', customerEmail);
      return res.status(404).json({
        success: false,
        message: 'No subscription found for this email address. Please check your email or contact support.'
      });
    }
    
    const customer = customers.data[0];
    console.log('✅ Found customer:', customer.id);
    
    // Get active subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 10
    });
    
    console.log('📋 Found active subscriptions:', subscriptions.data.length);
    
    if (subscriptions.data.length === 0) {
      // Check for other subscription statuses
      const allSubscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        limit: 10
      });
      
      if (allSubscriptions.data.length > 0) {
        const latestSub = allSubscriptions.data[0];
        console.log('⚠️ Found inactive subscription:', latestSub.status);
        
        return res.status(200).json({
          success: false,
          message: `We found your subscription but it's currently ${latestSub.status}. Please contact support if you believe this is an error.`
        });
      }
      
      return res.status(404).json({
        success: false,
        message: 'No active subscription found for this email address. Please check your email or contact support.'
      });
    }
    
    // Check if any subscription is currently active
    const activeSubscription = subscriptions.data.find(sub => 
      sub.status === 'active' && 
      sub.current_period_end > Math.floor(Date.now() / 1000)
    );
    
    if (!activeSubscription) {
      console.log('❌ No currently active subscription found');
      return res.status(200).json({
        success: false,
        message: 'Your subscription has expired. Please renew your subscription to continue.'
      });
    }
    
    console.log('✅ Active subscription verified:', activeSubscription.id);
    
    // Generate new activation token
    const unlockToken = randomBytes(24).toString('hex');
    
    // Store token in Redis with 7-day expiration (same as your existing system)
    await redis.set(
      `token:${unlockToken}`, 
      JSON.stringify({ 
        email: customerEmail, 
        used: false,
        subscriptionId: activeSubscription.id,
        customerId: customer.id,
        resent: true,
        timestamp: Date.now()
      }), 
      { ex: 604800 } // 7 days
    );
    
    console.log('🔑 Generated new token:', unlockToken);
    
    // Send activation email
    const emailSent = await sendActivationEmail(customerEmail, unlockToken);
    
    if (!emailSent) {
      // Clean up the token if email failed
      await redis.del(`token:${unlockToken}`);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to send activation email. Please try again or contact support.'
      });
    }
    
    console.log('📧 Activation email sent successfully');
    
    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Activation email sent! Please check your inbox and click the link to activate your subscription.',
      details: {
        email: customerEmail,
        subscriptionStatus: activeSubscription.status,
        planName: activeSubscription.items.data[0]?.price?.nickname || 'Pro Plan'
      }
    });
    
  } catch (error) {
    console.error('💥 Resend activation error:', error);
    
    // Handle specific Stripe errors
    if (error.type === 'StripeCardError') {
      return res.status(400).json({
        success: false,
        message: 'Payment issue detected with your subscription. Please update your payment method.'
      });
    }
    
    if (error.type === 'StripeRateLimitError') {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again in a moment.'
      });
    }
    
    if (error.type === 'StripeConnectionError') {
      return res.status(503).json({
        success: false,
        message: 'Connection error. Please try again.'
      });
    }
    
    // Generic error response
    return res.status(500).json({
      success: false,
      message: 'Unable to process request. Please try again or contact support.'
    });
  }
}

