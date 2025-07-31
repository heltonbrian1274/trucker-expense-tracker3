
// /utils/stripe-helpers.js
// Shared utilities for Stripe operations

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Email validation utility
export function validateEmail(email) {
  if (!email || !email.trim()) {
    return { valid: false, message: 'Email address is required' };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return { valid: false, message: 'Please enter a valid email address' };
  }
  
  return { valid: true, email: email.trim().toLowerCase() };
}

// Find customer by email
export async function findCustomerByEmail(email) {
  const customers = await stripe.customers.list({
    email: email,
    limit: 1
  });
  
  if (customers.data.length === 0) {
    return { found: false, message: 'No subscription found for this email address. Please check your email or contact support.' };
  }
  
  return { found: true, customer: customers.data[0] };
}

// Get active subscriptions for customer
export async function getActiveSubscriptions(customerId) {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'active',
    limit: 10
  });
  
  // Check if any subscription is currently active
  const activeSubscription = subscriptions.data.find(sub => 
    sub.status === 'active' && 
    sub.current_period_end > Math.floor(Date.now() / 1000)
  );
  
  if (!activeSubscription) {
    // Check for other subscription statuses
    const allSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 10
    });
    
    if (allSubscriptions.data.length > 0) {
      const latestSub = allSubscriptions.data[0];
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
      
      return { 
        active: false, 
        message: `We found your subscription but it's currently ${latestSub.status}. Please contact support if you believe this is an error.`,
        status: latestSub.status 
      };
    }
    
    return { 
      active: false, 
      message: 'No active subscription found for this email address. Please check your email or contact support.' 
    };
  }
  
  return { active: true, subscription: activeSubscription };
}

// Handle Stripe errors consistently
export function handleStripeError(error) {
  console.error('Stripe error:', error);
  
  if (error.type === 'StripeCardError') {
    return {
      status: 400,
      response: {
        success: false,
        message: 'Payment issue detected with your subscription. Please update your payment method.'
      }
    };
  }
  
  if (error.type === 'StripeRateLimitError') {
    return {
      status: 429,
      response: {
        success: false,
        message: 'Too many requests. Please try again in a moment.'
      }
    };
  }
  
  if (error.type === 'StripeConnectionError') {
    return {
      status: 503,
      response: {
        success: false,
        message: 'Connection error. Please try again.'
      }
    };
  }
  
  return {
    status: 500,
    response: {
      success: false,
      message: 'Unable to process request. Please try again or contact support.'
    }
  };
}
