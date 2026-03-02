// This file provides the Brevo email utility.
export const sendPasswordResetEmail = async (email, resetLink, userName) => {
    const brevoApiKey = process.env.BREVO_API_KEY;
    if (!brevoApiKey) {
        console.error("BREVO_API_KEY is not set in environment variables.");
        console.log(`\n================================`);
        console.log(`[DEV MODE] Password reset link for ${email}:`);
        console.log(`${resetLink}`);
        console.log(`================================\n`);
        return false;
    }

    const emailData = {
        sender: {
            name: "Blood Donation System",
            email: process.env.EMAIL_FROM || "noreply@blooddonation.com",
        },
        to: [
            {
                email: email,
                name: userName || "User",
            },
        ],
        subject: "Password Reset Request - Blood Donation System",
        htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #dc2626; color: white; padding: 25px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">Blood Donation System</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">Password Reset Request</p>
        </div>
        
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
          <h2 style="color: #111827; margin-top: 0;">Hello ${userName || "User"},</h2>
          
          <p style="color: #4b5563; line-height: 1.6;">
            You recently requested to reset your password for your Blood Donation System account. 
            Click the button below to reset it:
          </p>
          
          <div style="text-align: center; margin: 20px 0;">
            <a href="${resetLink}" 
               style="background: #dc2626; color: white; padding: 14px 32px; 
                      text-decoration: none; border-radius: 6px; font-weight: bold;
                      display: inline-block;">
              Reset Your Password
            </a>
          </div>
          
          <p style="color: #4b5563; line-height: 1.6;">
            If the button doesn't work, copy and paste the following link into your browser:
          </p>
          
          <div style="background: #f3f4f6; padding: 12px; border-radius: 4px; 
                     margin: 15px 0; word-break: break-all;">
            <code style="color: #1f2937;">${resetLink}</code>
          </div>
          
          <p style="color: #4b5563; line-height: 1.6;">
            This password reset link is only valid for the next 
            <span style="color: #dc2626; font-weight: bold;">15 minutes</span>.
          </p>
          
          <p style="color: #4b5563; line-height: 1.6;">
            If you did not request a password reset, please ignore this email or 
            contact support if you have concerns.
          </p>
        </div>
      </div>
    `,
    };

    try {
        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                "accept": "application/json",
                "api-key": brevoApiKey,
                "content-type": "application/json"
            },
            body: JSON.stringify(emailData),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Brevo API Error:", errorData);
            return false;
        }

        return true;
    } catch (error) {
        console.error("Error sending email via Brevo:", error);
        return false;
    }
};
