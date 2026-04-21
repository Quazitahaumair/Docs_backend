const nodemailer = require('nodemailer');
const logger = require('./logger');

/**
 * Email Service - SendGrid via Nodemailer
 */
class EmailService {
  constructor() {
    this.isEnabled = true; // FORCE ENABLED FOR TESTING
    this.fromEmail = process.env.EMAIL_FROM || 'quazitahaumair92@gmail.com';
    const apiKey = process.env.SENDGRID_API_KEY;
    logger.info(`Email config - Enabled: ${this.isEnabled}, From: ${this.fromEmail}, API Key: ${apiKey ? apiKey.substring(0, 10) + '...' : 'MISSING'}`);
    if (!apiKey) {
      logger.warn('⚠️ SENDGRID_API_KEY not found - emails disabled');
      this.isEnabled = false;
      return;
    }
    // Use SendGrid SMTP
    this.transporter = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: apiKey
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    
    // Verify connection on startup
    if (this.isEnabled && apiKey) {
      this.transporter.verify((error, success) => {
        if (error) {
          logger.error(`Email transporter verify failed: ${error.message}`);
        } else {
          logger.info('✅ Email server is ready to send messages');
        }
      });
    }
  }

  /**
   * Send document share notification to existing user
   */
  async sendShareNotification(toEmail, documentTitle, fromUserName, permission) {
    const subject = `${fromUserName} shared a document with you`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a73e8;">Document Shared</h2>
        <p><strong>${fromUserName}</strong> has shared <strong>"${documentTitle}"</strong> with you.</p>
        <p>Permission level: <strong>${permission}</strong></p>
        <p>You can access this document in your Docs Clone dashboard.</p>
        <a href="http://localhost:8080" 
           style="display: inline-block; background: #1a73e8; color: white; padding: 12px 24px; 
                  text-decoration: none; border-radius: 4px; margin-top: 16px;">
          Open Document
        </a>
        <hr style="margin-top: 32px; border: none; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 12px;">
          This is an automated message from Docs Clone.
        </p>
      </div>
    `;

    return this.sendEmail(toEmail, subject, html);
  }

  /**
   * Send invitation email to unregistered user
   */
  async sendInvitation(toEmail, documentTitle, fromUserName) {
    const subject = `${fromUserName} invited you to collaborate on a document`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a73e8;">You're Invited!</h2>
        <p><strong>${fromUserName}</strong> has invited you to collaborate on <strong>"${documentTitle}"</strong>.</p>
        <p>To access this document, please create an account using this email address (${toEmail}).</p>
        <a href="http://localhost:8080/auth" 
           style="display: inline-block; background: #1a73e8; color: white; padding: 12px 24px; 
                  text-decoration: none; border-radius: 4px; margin-top: 16px;">
          Create Free Account
        </a>
        <hr style="margin-top: 32px; border: none; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 12px;">
          This invitation expires in 7 days. If you don't have an account yet, 
          you'll automatically get access to the shared document when you register.
        </p>
      </div>
    `;

    return this.sendEmail(toEmail, subject, html);
  }

  /**
   * Generic email sender
   */
  async sendEmail(to, subject, html) {
    // Always log
    logger.info(`📧 EMAIL [${to}] ${subject}`);
    
    if (!this.isEnabled) {
      return { success: true, message: 'Email logged (disabled)' };
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"Docs Clone" <${this.fromEmail}>`,
        to,
        subject,
        html
      });
      
      logger.info(`✅ Email sent: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error(`❌ Email failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();
