import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

interface EmailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export class EmailService {
  private transporter: Transporter | null = null;
  private isConfigured: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    const {
      SMTP_HOST,
      SMTP_PORT,
      SMTP_SECURE,
      SMTP_USER,
      SMTP_PASS,
      SMTP_FROM,
      NODE_ENV,
    } = process.env;

    // Allow test mode without SMTP
    if (NODE_ENV === 'test') {
      this.isConfigured = false;
      return;
    }

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      console.warn('Email service not configured: Missing SMTP credentials');
      this.isConfigured = false;
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: parseInt(SMTP_PORT || '587'),
        secure: SMTP_SECURE === 'true',
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      });

      this.isConfigured = true;
      console.log('✅ Email service configured successfully');
    } catch (error) {
      console.error('Failed to configure email service:', error);
      this.isConfigured = false;
    }
  }

  /**
   * Send an email
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.isConfigured || !this.transporter) {
      console.warn('Email not sent: Service not configured');
      return false;
    }

    try {
      const info = await this.transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
        bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments,
      });

      console.log('✉️ Email sent successfully:', info.messageId);
      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  }

  /**
   * Send time entry reminder
   */
  async sendTimeReminder(to: string, name: string, weekNumber: number): Promise<boolean> {
    return this.sendEmail({
      to,
      subject: 'Påminnelse: Registrer timene dine',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0066cc;">Timeregistrering</h2>
          <p>Hei ${name},</p>
          <p>Dette er en påminnelse om å registrere timene dine for uke ${weekNumber}.</p>
          <a href="${process.env.APP_URL || 'https://tidsflyt.no'}/time-tracking" 
             style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 4px; margin: 20px 0;">
            Registrer timer
          </a>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            Du mottar denne e-posten fordi du er registrert i Smart Timing.
          </p>
        </div>
      `,
      text: `Hei ${name},\n\nHusk å registrere timene dine for uke ${weekNumber}.\n\nGå til: ${
        process.env.APP_URL || 'https://tidsflyt.no'
      }/time-tracking`,
    });
  }

  /**
   * Send time approval notification
   */
  async sendApprovalNotification(
    to: string,
    name: string,
    hours: number,
    period: string,
    approverName: string,
    status: 'approved' | 'rejected',
    comment?: string
  ): Promise<boolean> {
    const isApproved = status === 'approved';
    const statusText = isApproved ? 'godkjent' : 'avvist';
    const color = isApproved ? '#22c55e' : '#ef4444';

    return this.sendEmail({
      to,
      subject: `Timene dine er ${statusText}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: ${color};">Timer ${statusText}</h2>
          <p>Hei ${name},</p>
          <p>Dine registrerte timer for ${period} (${hours} timer) har blitt <strong>${statusText}</strong> av ${approverName}.</p>
          ${comment ? `<div style="background: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <strong>Kommentar:</strong><br>${comment}
          </div>` : ''}
          <a href="${process.env.APP_URL || 'https://tidsflyt.no'}/time-tracking" 
             style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 4px; margin: 20px 0;">
            Se mine timer
          </a>
        </div>
      `,
      text: `Hei ${name},\n\nDine timer for ${period} (${hours} timer) har blitt ${statusText} av ${approverName}.${
        comment ? `\n\nKommentar: ${comment}` : ''
      }`,
    });
  }

  /**
   * Send leave request notification
   */
  async sendLeaveRequestNotification(
    to: string,
    employeeName: string,
    leaveType: string,
    startDate: string,
    endDate: string,
    days: number
  ): Promise<boolean> {
    return this.sendEmail({
      to,
      subject: `Ny ferieforespørsel fra ${employeeName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0066cc;">Ny ferieforespørsel</h2>
          <p>${employeeName} har sendt en forespørsel om fravær:</p>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <strong>Type:</strong> ${leaveType}<br>
            <strong>Fra:</strong> ${startDate}<br>
            <strong>Til:</strong> ${endDate}<br>
            <strong>Antall dager:</strong> ${days}
          </div>
          <a href="${process.env.APP_URL || 'https://tidsflyt.no'}/leave-requests" 
             style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 4px; margin: 20px 0;">
            Behandle forespørsel
          </a>
        </div>
      `,
      text: `${employeeName} har sendt en forespørsel om ${leaveType} fra ${startDate} til ${endDate} (${days} dager).`,
    });
  }

  /**
   * Send weekly timesheet
   */
  async sendWeeklyTimesheet(
    to: string,
    name: string,
    weekNumber: number,
    totalHours: number,
    attachment?: { filename: string; content: Buffer }
  ): Promise<boolean> {
    return this.sendEmail({
      to,
      subject: `Timeregistrering uke ${weekNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0066cc;">Timeregistrering uke ${weekNumber}</h2>
          <p>Hei ${name},</p>
          <p>Din timeregistrering for uke ${weekNumber} er vedlagt.</p>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <strong>Totalt timer:</strong> ${totalHours}
          </div>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            Generert automatisk av Smart Timing
          </p>
        </div>
      `,
      text: `Din timeregistrering for uke ${weekNumber} er vedlagt. Totalt timer: ${totalHours}`,
      attachments: attachment ? [attachment] : undefined,
    });
  }

  /**
   * Test email configuration
   */
  async testConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Email connection test failed:', error);
      return false;
    }
  }
}

// Singleton instance
export const emailService = new EmailService();
