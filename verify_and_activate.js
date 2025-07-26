// /api/verify-and-activate.js
// Direct verification and activation endpoint - no email required!

import { Redis } from '@upstash/redis';
import Stripe from 'stripe';
import { randomBytes } from 'crypto';

// Initialize Redis and Stripe
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
    console.log('🔍 Verifying subscription for email:', customerEmail);
    
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
    
    // Generate activation token (same as your existing system)
    const unlockToken = randomBytes(24).toString('hex');
    
    // Store token in Redis with 7-day expiration
    await redis.set(
      `token:${unlockToken}`, 
      JSON.stringify({ 
        email: customerEmail, 
        used: false,
        subscriptionId: activeSubscription.id,
        customerId: customer.id,
        directActivation: true,
        timestamp: Date.now()
      }), 
      { ex: 604800 } // 7 days
    );
    
    // IMMEDIATELY activate the subscription for this token
    await redis.set(`user:${unlockToken}:isSubscribed`, 'true');
    
    console.log('🎉 Subscription activated immediately for token:', unlockToken);
    
    // Return success response with the token for frontend to use
    return res.status(200).json({
      success: true,
      message: 'Subscription verified and activated successfully!',
      token: unlockToken, // Frontend will use this to update localStorage
      details: {
        email: customerEmail,
        subscriptionStatus: activeSubscription.status,
        planName: activeSubscription.items.data[0]?.price?.nickname || 'Pro Plan',
        activatedAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('💥 Direct verification error:', error);
    
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
      message: 'Unable to verify subscription. Please try again or contact support.'
    });
  }
}

