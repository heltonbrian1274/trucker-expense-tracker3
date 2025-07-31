// /api/verify-and-activate.js
// Direct verification and activation endpoint - no email required!

import { randomBytes } from 'crypto';
import { redis, setCorsHeaders, handlePreflight, validateMethod } from '../utils/api-middleware.js';
import { validateEmail, findCustomerByEmail, getActiveSubscriptions, handleStripeError } from '../utils/stripe-helpers.js';

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (handlePreflight(req, res)) return;
  if (validateMethod(req, res, ['POST'])) return;

  try {
    const { email } = req.body;

    // Validate email input
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return res.status(400).json({
        success: false,
        message: emailValidation.message
      });
    }

    const customerEmail = emailValidation.email;
    console.log('🔍 Verifying subscription for email:', customerEmail);

    // Find customer by email
    const customerResult = await findCustomerByEmail(customerEmail);
    if (!customerResult.found) {
      console.log('❌ No customer found for email:', customerEmail);
      return res.status(404).json({
        success: false,
        message: customerResult.message
      });
    }

    const customer = customerResult.customer;
    console.log('✅ Found customer:', customer.id);

    // Get active subscriptions
    const subscriptionResult = await getActiveSubscriptions(customer.id);
    if (!subscriptionResult.active) {
      console.log('❌ No active subscription found');
      return res.status(200).json({
        success: false,
        message: subscriptionResult.message
      });
    }

    const activeSubscription = subscriptionResult.subscription;
    console.log('✅ Active subscription verified:', activeSubscription.id);

    // Generate activation token
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
      token: unlockToken,
      details: {
        email: customerEmail,
        subscriptionStatus: activeSubscription.status,
        planName: activeSubscription.items.data[0]?.price?.nickname || 'Pro Plan',
        activatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('💥 Direct verification error:', error);
    const errorResponse = handleStripeError(error);
    return res.status(errorResponse.status).json(errorResponse.response);
  }
}