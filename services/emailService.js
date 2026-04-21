/**
 * Email Service - Placeholder for email functionality
 * Integrate with SendGrid, AWS SES, Nodemailer, etc.
 */

const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.isConfigured = false;
  }

  async sendEmail({ to, subject, html, text }) {
    // Placeholder - implement with your preferred email provider
    logger.info(`Email would be sent to: ${to}, Subject: ${subject}`);
    
    // Example with SendGrid:
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // await sgMail.send({ to, from: process.env.FROM_EMAIL, subject, html, text });
    
    return { success: true, messageId: 'placeholder' };
  }

  async sendWelcomeEmail(user) {
    return this.sendEmail({
      to: user.email,
      subject: 'Welcome to Docs Clone!',
      html: `<h1>Welcome ${user.name}!</h1><p>Start creating amazing documents.</p>`,
      text: `Welcome ${user.name}! Start creating amazing documents.`
    });
  }

  async sendPasswordResetEmail(user, resetToken) {
    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
    
    return this.sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      html: `
        <h1>Password Reset</h1>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}">Reset Password</a>
        <p>This link expires in 1 hour.</p>
      `,
      text: `Reset your password: ${resetUrl}`
    });
  }

  async sendShareNotification(sharedWith, document, sharedBy) {
    const docUrl = `${process.env.CLIENT_URL}/documents/${document._id}`;
    
    return this.sendEmail({
      to: sharedWith.email,
      subject: `${sharedBy.name} shared a document with you`,
      html: `
        <h1>New Document Shared</h1>
        <p>${sharedBy.name} shared "${document.title}" with you.</p>
        <a href="${docUrl}">Open Document</a>
      `,
      text: `${sharedBy.name} shared "${document.title}" with you. Open: ${docUrl}`
    });
  }
}

module.exports = new EmailService();
