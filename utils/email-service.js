
// /utils/email-service.js
// Unified email sending service

export async function sendActivationEmail(recipientEmail, token, emailType = 'activation') {
  const zeptoMailToken = process.env.ZEPTOMAIL_TOKEN;
  const fromAddress = "support@truckerexpensetracker.com";
  
  // Different email templates based on type
  const templates = {
    webhook: {
      subject: "Activate Your Pro Subscription",
      heading: "Thank You for Subscribing!",
      message: "Your payment was successful. Please click the button below to activate your Pro account and unlock all features."
    },
    activation: {
      subject: "Activate Your Pro Subscription", 
      heading: "Activate Your Pro Subscription",
      message: "We found your active subscription! Click the button below to activate your Pro account on this device."
    }
  };
  
  const template = templates[emailType] || templates.activation;

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
    subject: template.subject,
    htmlbody: `
      <div style="font-family: sans-serif; padding: 20px; line-height: 1.6;">
        <h2>${template.heading}</h2>
        <p>${template.message}</p>
        <a href="https://www.truckerexpensetracker.com/?token=${token}" style="background-color: #2563eb; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Activate My Account</a>
        <p>If you have any trouble, you can copy and paste this link into your browser:</p>
        <p>https://www.truckerexpensetracker.com/?token=${token}</p>
        <p>If you have any questions, please contact support.</p>
        ${emailType === 'activation' ? '<hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;"><p style="font-size: 0.9rem; color: #666;">This email was sent because you requested to activate your subscription on a new device or browser.</p>' : ''}
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
      console.log(`✅ ${template.subject} email successfully sent to ${recipientEmail}`);
      return true;
    }
  } catch (error) {
    console.error("Error calling ZeptoMail API:", error);
    return false;
  }
}
