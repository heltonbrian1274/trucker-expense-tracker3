// /api/validate-subscription.js
// Enhanced periodic subscription validation endpoint

import { redis, setCorsHeaders, handlePreflight, validateMethod, parseTokenData } from '../utils/api-middleware.js';
import { findCustomerByEmail, getActiveSubscriptions, handleStripeError } from '../utils/stripe-helpers.js';

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (handlePreflight(req, res)) return;
  if (validateMethod(req, res, ['GET', 'POST'])) return;

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
      parsedTokenData = parseTokenData(tokenData);
    } catch (error) {
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

    // Find customer by email
    const customerResult = await findCustomerByEmail(customerEmail);
    if (!customerResult.found) {
      console.log('❌ No customer found in Stripe for email:', customerEmail);
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
        shouldDowngrade: true
      });
    }

    const customer = customerResult.customer;
    console.log('✅ Found customer in Stripe:', customer.id);

    // Get active subscriptions
    const subscriptionResult = await getActiveSubscriptions(customer.id);
    if (!subscriptionResult.active) {
      console.log('⚠️ No active subscription found. Status:', subscriptionResult.status);

      return res.status(200).json({
        success: false,
        message: subscriptionResult.message,
        subscriptionStatus: subscriptionResult.status,
        shouldDowngrade: true,
        details: {
          status: subscriptionResult.status
        }
      });
    }

    const activeSubscription = subscriptionResult.subscription;
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
    const errorResponse = handleStripeError(error);

    // For validation, adjust shouldDowngrade based on error type
    const response = { ...errorResponse.response };
    if (errorResponse.status === 429 || errorResponse.status === 503) {
      response.shouldDowngrade = false;
    } else {
      response.shouldDowngrade = errorResponse.status !== 500;
    }

    return res.status(errorResponse.status).json(response);
  }
}