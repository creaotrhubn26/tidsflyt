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
  replyTo?: string;
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
      SMTP_USER,
      SMTP_PASS,
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

    const port = parseInt(SMTP_PORT || '587');

    try {
      this.transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port,
        secure: port === 465, // SSL on 465, STARTTLS on 587
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      });

      this.isConfigured = true;

      // Verify connection asynchronously
      this.transporter.verify().then(() => {
        console.log('✅ Email service connected to', SMTP_HOST);
      }).catch((err) => {
        console.error('⚠️ Email SMTP verify failed:', err.message);
        // Keep isConfigured true — verify can fail transiently
      });
    } catch (error) {
      console.error('Failed to configure email service:', error);
      this.isConfigured = false;
    }
  }

  /**
   * Check if SMTP is configured
   */
  getIsConfigured(): boolean {
    return this.isConfigured;
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
      const fromName = process.env.SMTP_FROM_NAME || 'Tidum';
      const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER;
      const from = `"${fromName}" <${fromEmail}>`;
      const replyTo = options.replyTo || process.env.SMTP_REPLY_TO || undefined;

      const info = await this.transporter.sendMail({
        from,
        replyTo,
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
   * Send welcome / access-approved email
   */
  async sendAccessApprovedEmail(
    to: string,
    fullName: string,
    company?: string
  ): Promise<boolean> {
    const appUrl = process.env.APP_URL || 'https://tidsflyt.no';
    return this.sendEmail({
      to,
      replyTo: 'daniel@tidum.no',
      subject: 'Velkommen til Tidum – tilgangen din er godkjent!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #0066cc, #0ea5e9); padding: 30px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Velkommen til Tidum!</h1>
          </div>
          <div style="padding: 30px; border: 1px solid #e2e8f0; border-top: 0; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px;">Hei ${fullName},</p>
            <p>Vi er glade for å bekrefte at tilgangsforespørselen din${company ? ` for <strong>${company}</strong>` : ''} er godkjent.</p>
            <p>Du kan nå logge inn og begynne å bruke Smart Timing for timeregistrering og rapportering.</p>
            <a href="${appUrl}/auth"
               style="display: inline-block; background: #0066cc; color: white; padding: 14px 28px;
                      text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600;">
              Logg inn nå
            </a>
            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px; color: #0f172a;">Kom i gang:</h3>
              <ul style="margin: 0; padding-left: 20px; color: #475569;">
                <li>Registrer timer under «Timeregistrering»</li>
                <li>Se rapporter og statistikk</li>
                <li>Kontakt din tiltaksleder ved spørsmål</li>
              </ul>
            </div>
            <p style="color: #64748b; font-size: 13px;">
              Har du spørsmål? Svar på denne e-posten eller kontakt oss på
              <a href="mailto:daniel@tidum.no" style="color: #0066cc;">daniel@tidum.no</a>.
            </p>
          </div>
        </div>
      `,
      text: `Hei ${fullName},\n\nTilgangsforespørselen din${company ? ` for ${company}` : ''} er godkjent!\n\nLogg inn her: ${appUrl}/auth\n\nVelkommen til Tidum!\n\nHar du spørsmål? Kontakt oss på daniel@tidum.no`,
    });
  }

  /**
   * Send rejection notification email
   */
  async sendAccessRejectedEmail(
    to: string,
    fullName: string,
    reason?: string
  ): Promise<boolean> {
    return this.sendEmail({
      to,
      replyTo: 'daniel@tidum.no',
      subject: 'Oppdatering om din tilgangsforespørsel – Tidum',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h2 style="color: #0f172a;">Tilgangsforespørsel</h2>
            <p>Hei ${fullName},</p>
            <p>Dessverre kan vi ikke godkjenne din tilgangsforespørsel på dette tidspunktet.</p>
            ${reason ? `<div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #94a3b8; margin: 20px 0;">
              <strong>Begrunnelse:</strong><br>${reason}
            </div>` : ''}
            <p>Ta gjerne kontakt med oss om du har spørsmål eller ønsker å sende inn en ny forespørsel.</p>
            <p style="color: #64748b; font-size: 13px;">
              Kontakt: <a href="mailto:daniel@tidum.no" style="color: #0066cc;">daniel@tidum.no</a>
            </p>
          </div>
        </div>
      `,
      text: `Hei ${fullName},\n\nDessverre kan vi ikke godkjenne din tilgangsforespørsel på dette tidspunktet.${reason ? `\n\nBegrunnelse: ${reason}` : ''}\n\nTa gjerne kontakt på daniel@tidum.no om du har spørsmål.`,
    });
  }

  /**
   * Send company invite email
   */
  async sendCompanyInviteEmail(
    to: string,
    roleName: string,
    inviterName?: string
  ): Promise<boolean> {
    const appUrl = process.env.APP_URL || 'https://tidsflyt.no';
    return this.sendEmail({
      to,
      replyTo: 'daniel@tidum.no',
      subject: 'Du er invitert til Tidum',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #0066cc, #0ea5e9); padding: 30px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Du er invitert!</h1>
          </div>
          <div style="padding: 30px; border: 1px solid #e2e8f0; border-top: 0; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px;">Hei,</p>
            <p>${inviterName ? `${inviterName} har invitert deg` : 'Du er invitert'} som <strong>${roleName}</strong> i Tidum Smart Timing.</p>
            <p>Klikk knappen nedenfor for å logge inn og komme i gang.</p>
            <a href="${appUrl}/auth"
               style="display: inline-block; background: #0066cc; color: white; padding: 14px 28px;
                      text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600;">
              Kom i gang
            </a>
            <p style="color: #64748b; font-size: 13px; margin-top: 30px;">
              Har du spørsmål? Kontakt oss på
              <a href="mailto:daniel@tidum.no" style="color: #0066cc;">daniel@tidum.no</a>.
            </p>
          </div>
        </div>
      `,
      text: `Hei,\n\n${inviterName ? `${inviterName} har invitert deg` : 'Du er invitert'} som ${roleName} i Tidum Smart Timing.\n\nLogg inn her: ${appUrl}/auth\n\nKontakt: daniel@tidum.no`,
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
