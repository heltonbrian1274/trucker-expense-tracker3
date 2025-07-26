// /api/validate-subscription.js
// Enhanced periodic subscription validation endpoint

import { Redis } from '@upstash/redis';
import Stripe from 'stripe';

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
  
  // Allow both GET and POST requests
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'Method not allowed' 
    });
  }
  
  try {
    // Get token from query params (GET) or body (POST)
    const token = req.method === 'GET' ? req.query.token : req.body?.token;
    
    if (!token) {
      return res.status(400).json({ 
        success: false, 
        message: 'Token is required',
        shouldDowngrade: true
      });
    }
    
    console.log('🔍 Validating subscription for token:', token);
    
    // Check if token exists in Redis
    const tokenData = await redis.get(`token:${token}`);
    if (!tokenData) {
      console.log('❌ Token not found in Redis');
      return res.status(404).json({ 
        success: false, 
        message: 'Invalid or expired token',
        shouldDowngrade: true
      });
    }
    
    // Parse token data
    let parsedTokenData;
    try {
      parsedTokenData = JSON.parse(tokenData);
    } catch (error) {
      console.error('❌ Failed to parse token data:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Invalid token data',
        shouldDowngrade: true
      });
    }
    
    const customerEmail = parsedTokenData.email;
    if (!customerEmail) {
      console.log('❌ No email found in token data');
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid token data',
        shouldDowngrade: true
      });
    }
    
    console.log('📧 Validating subscription for email:', customerEmail);
    
    // Search for customer by email in Stripe
    const customers = await stripe.customers.list({
      email: customerEmail,
      limit: 1
    });
    
    if (customers.data.length === 0) {
      console.log('❌ No customer found in Stripe for email:', customerEmail);
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
        shouldDowngrade: true
      });
    }
    
    const customer = customers.data[0];
    console.log('✅ Found customer in Stripe:', customer.id);
    
    // Get all subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      limit: 10
    });
    
    console.log('📋 Found subscriptions:', subscriptions.data.length);
    
    if (subscriptions.data.length === 0) {
      console.log('❌ No subscriptions found for customer');
      return res.status(404).json({
        success: false,
        message: 'No subscriptions found',
        shouldDowngrade: true
      });
    }
    
    // Check for active subscriptions
    const activeSubscriptions = subscriptions.data.filter(sub => 
      sub.status === 'active' && 
      sub.current_period_end > Math.floor(Date.now() / 1000)
    );
    
    if (activeSubscriptions.length === 0) {
      // Check for other subscription statuses
      const latestSub = subscriptions.data[0];
      console.log('⚠️ No active subscription found. Latest status:', latestSub.status);
      
      // Handle different subscription statuses
      let message = 'Subscription is not active';
      if (latestSub.status === 'canceled') {
        message = 'Subscription has been cancelled';
      } else if (latestSub.status === 'past_due') {
        message = 'Subscription payment is past due';
      } else if (latestSub.status === 'unpaid') {
        message = 'Subscription payment failed';
      } else if (latestSub.status === 'incomplete') {
        message = 'Subscription setup is incomplete';
      }
      
      return res.status(200).json({
        success: false,
        message: message,
        subscriptionStatus: latestSub.status,
        shouldDowngrade: true,
        details: {
          status: latestSub.status,
          endDate: new Date(latestSub.current_period_end * 1000).toISOString()
        }
      });
    }
    
    const activeSubscription = activeSubscriptions[0];
    console.log('✅ Active subscription verified:', activeSubscription.id);
    
    // Update Redis to confirm subscription is still active
    await redis.set(`user:${token}:isSubscribed`, 'true');
    await redis.set(`user:${token}:lastValidated`, Date.now().toString());
    
    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Subscription is active',
      active: true,
      shouldDowngrade: false,
      details: {
        subscriptionId: activeSubscription.id,
        status: activeSubscription.status,
        currentPeriodEnd: new Date(activeSubscription.current_period_end * 1000).toISOString(),
        planName: activeSubscription.items.data[0]?.price?.nickname || 'Pro Plan',
        lastValidated: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('💥 Subscription validation error:', error);
    
    // Handle specific Stripe errors
    if (error.type === 'StripeCardError') {
      return res.status(200).json({
        success: false,
        message: 'Payment issue detected with subscription',
        shouldDowngrade: true
      });
    }
    
    if (error.type === 'StripeRateLimitError') {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        shouldDowngrade: false // Don't downgrade for rate limits
      });
    }
    
    if (error.type === 'StripeConnectionError') {
      return res.status(503).json({
        success: false,
        message: 'Connection error. Please try again.',
        shouldDowngrade: false // Don't downgrade for connection issues
      });
    }
    
    // For unknown errors, don't downgrade immediately
    return res.status(500).json({
      success: false,
      message: 'Unable to validate subscription. Please try again.',
      shouldDowngrade: false
    });
  }
}
