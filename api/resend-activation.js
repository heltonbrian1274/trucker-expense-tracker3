// /api/resend-activation.js
// Endpoint to resend activation email for existing subscribers

import { randomBytes } from 'crypto';
import { redis, setCorsHeaders, handlePreflight, validateMethod } from '../utils/api-middleware.js';
import { validateEmail, findCustomerByEmail, getActiveSubscriptions, handleStripeError } from '../utils/stripe-helpers.js';
import { sendActivationEmail } from '../utils/email-service.js';

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
    console.log('🔍 Looking for subscription for email:', customerEmail);

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

    // Generate new activation token
    const unlockToken = randomBytes(24).toString('hex');

    // Store token in Redis with 7-day expiration
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
    const emailSent = await sendActivationEmail(customerEmail, unlockToken, 'activation');

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
    const errorResponse = handleStripeError(error);
    return res.status(errorResponse.status).json(errorResponse.response);
  }
}