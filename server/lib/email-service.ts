import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { getAppBaseUrl } from './app-base-url';
import { TIDUM_SUPPORT_EMAIL } from '@shared/brand';

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

interface OperationalNoticeOptions {
  to: string | string[];
  subject: string;
  title: string;
  intro: string;
  summary: string;
  affectedServices?: string[];
  actionLabel?: string;
  actionUrl?: string;
  details?: string[];
  footerNote?: string;
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

  private renderPanelEmail({
    badge,
    title,
    intro,
    bodyHtml,
    footerHtml,
  }: {
    badge: string;
    title: string;
    intro: string;
    bodyHtml: string;
    footerHtml?: string;
  }): string {
    return `
      <div style="margin:0;padding:24px;background:#f3f7f5;font-family:Arial,sans-serif;color:#17333c;">
        <div style="max-width:640px;margin:0 auto;overflow:hidden;border-radius:24px;border:1px solid #d8e5df;background:#ffffff;box-shadow:0 24px 60px rgba(16,35,41,0.08);">
          <div style="padding:32px 32px 24px;background:linear-gradient(135deg,#123b44 0%,#1d6e74 54%,#66b8aa 100%);color:#ffffff;">
            <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,0.14);font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">
              ${badge}
            </div>
            <h1 style="margin:18px 0 8px;font-size:30px;line-height:1.15;">${title}</h1>
            <p style="margin:0;font-size:16px;line-height:1.6;color:rgba(255,255,255,0.88);">
              ${intro}
            </p>
          </div>
          <div style="padding:32px;">
            ${bodyHtml}
            ${footerHtml || `
              <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#6a7f84;">
                Har du spørsmål? Kontakt oss på
                <a href="mailto:${TIDUM_SUPPORT_EMAIL}" style="color:#1a6b73;text-decoration:none;">${TIDUM_SUPPORT_EMAIL}</a>.
              </p>
            `}
          </div>
        </div>
      </div>
    `;
  }

  private renderBulletList(items?: string[], accentColor: string = "#587077"): string {
    if (!items || items.length === 0) {
      return "";
    }

    return `
      <ul style="margin:12px 0 0;padding-left:18px;color:${accentColor};font-size:14px;line-height:1.8;">
        ${items.map((item) => `<li>${item}</li>`).join("")}
      </ul>
    `;
  }

  private async sendOperationalNotice({
    to,
    subject,
    title,
    intro,
    summary,
    affectedServices,
    actionLabel,
    actionUrl,
    details,
    footerNote,
  }: OperationalNoticeOptions): Promise<boolean> {
    const actionHtml =
      actionLabel && actionUrl
        ? `
          <a href="${actionUrl}"
             style="display:inline-block;background:#1a6b73;color:#ffffff;padding:15px 28px;border-radius:14px;text-decoration:none;font-size:15px;font-weight:700;box-shadow:0 14px 28px rgba(26,107,115,0.24);">
            ${actionLabel}
          </a>
        `
        : "";

    const affectedServicesHtml =
      affectedServices && affectedServices.length > 0
        ? `
          <div style="margin-top:22px;padding:18px;border-radius:18px;background:#f6fbf8;border:1px solid #d9e8e1;">
            <div style="font-size:13px;font-weight:700;color:#2a6b62;">Berørte områder</div>
            ${this.renderBulletList(affectedServices)}
          </div>
        `
        : "";

    const detailsHtml =
      details && details.length > 0
        ? `
          <div style="margin-top:22px;padding:18px;border-radius:18px;background:#fffaf1;border:1px solid #f0dfb8;">
            <div style="font-size:13px;font-weight:700;color:#8a5b12;">Viktig informasjon</div>
            ${this.renderBulletList(details, "#5f5441")}
          </div>
        `
        : "";

    const footerText = footerNote
      ? `
          <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#6a7f84;">
            ${footerNote}
          </p>
        `
      : "";

    return this.sendEmail({
      to,
      replyTo: TIDUM_SUPPORT_EMAIL,
      subject,
      html: this.renderPanelEmail({
        badge: "Tidum Drift",
        title,
        intro,
        bodyHtml: `
          <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#486168;">
            ${summary}
          </p>
          ${actionHtml}
          ${affectedServicesHtml}
          ${detailsHtml}
          ${footerText}
        `,
      }),
      text: [
        title,
        "",
        intro,
        "",
        summary,
        affectedServices && affectedServices.length > 0
          ? `Berørte områder: ${affectedServices.join(", ")}`
          : "",
        details && details.length > 0
          ? `Viktig informasjon: ${details.join(" | ")}`
          : "",
        actionLabel && actionUrl ? `${actionLabel}: ${actionUrl}` : "",
        footerNote || "",
        `Kontakt: ${TIDUM_SUPPORT_EMAIL}`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }

  /**
   * Send time entry reminder
   */
  async sendTimeReminder(to: string, name: string, weekNumber: number): Promise<boolean> {
    const appBaseUrl = getAppBaseUrl();
    return this.sendEmail({
      to,
      subject: 'Påminnelse: Registrer timene dine',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0066cc;">Timeregistrering</h2>
          <p>Hei ${name},</p>
          <p>Dette er en påminnelse om å registrere timene dine for uke ${weekNumber}.</p>
          <a href="${appBaseUrl}/time-tracking" 
             style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 4px; margin: 20px 0;">
            Registrer timer
          </a>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            Du mottar denne e-posten fordi du er registrert i Smart Timing.
          </p>
        </div>
      `,
      text: `Hei ${name},\n\nHusk å registrere timene dine for uke ${weekNumber}.\n\nGå til: ${appBaseUrl}/time-tracking`,
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
    const appBaseUrl = getAppBaseUrl();

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
          <a href="${appBaseUrl}/time-tracking" 
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
    const appBaseUrl = getAppBaseUrl();
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
          <a href="${appBaseUrl}/leave-requests" 
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
    const appUrl = getAppBaseUrl();
    const companyLabel = company?.trim() || "virksomheten din";
    return this.sendEmail({
      to,
      replyTo: TIDUM_SUPPORT_EMAIL,
      subject: 'Velkommen til Tidum – tilgangen din er godkjent!',
      html: `
        <div style="margin:0;padding:24px;background:#f3f7f5;font-family:Arial,sans-serif;color:#17333c;">
          <div style="max-width:640px;margin:0 auto;overflow:hidden;border-radius:24px;border:1px solid #d8e5df;background:#ffffff;box-shadow:0 24px 60px rgba(16,35,41,0.08);">
            <div style="padding:32px 32px 24px;background:linear-gradient(135deg,#123b44 0%,#1d6e74 54%,#66b8aa 100%);color:#ffffff;">
              <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,0.14);font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">
                Tidum Access
              </div>
              <h1 style="margin:18px 0 8px;font-size:30px;line-height:1.15;">Velkommen til Tidum</h1>
              <p style="margin:0;font-size:16px;line-height:1.6;color:rgba(255,255,255,0.88);">
                Tilgangen din er godkjent, og du kan nå komme i gang i Tidum for ${companyLabel}.
              </p>
            </div>

            <div style="padding:32px;">
              <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hei ${fullName},</p>
              <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#486168;">
                Tilgangen din er godkjent, og kontoen din er aktivert i Tidum. Du kan nå logge inn og begynne å føre timer, sende inn rapporter og følge arbeidsflyten som gjelder for din rolle.
              </p>

              <a href="${appUrl}/auth"
                 style="display:inline-block;background:#1a6b73;color:#ffffff;padding:15px 28px;border-radius:14px;text-decoration:none;font-size:15px;font-weight:700;box-shadow:0 14px 28px rgba(26,107,115,0.24);">
                Gå til innlogging
              </a>

              <div style="margin-top:24px;padding:18px;border-radius:18px;background:#f6fbf8;border:1px solid #d9e8e1;">
                <div style="font-size:13px;font-weight:700;color:#2a6b62;">Kom i gang</div>
                <ul style="margin:12px 0 0;padding-left:18px;color:#587077;font-size:14px;line-height:1.8;">
                  <li>Logg inn med Google eller sikker e-postlenke</li>
                  <li>Se hvilke oppgaver og flater du har tilgang til</li>
                  <li>Ta kontakt med leder eller admin hvis du trenger mer tilgang</li>
                </ul>
              </div>

              <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#6a7f84;">
                Har du spørsmål? Kontakt oss på
                <a href="mailto:${TIDUM_SUPPORT_EMAIL}" style="color:#1a6b73;text-decoration:none;">${TIDUM_SUPPORT_EMAIL}</a>.
              </p>
            </div>
          </div>
        </div>
      `,
      text: [
        `Hei ${fullName},`,
        "",
        `Velkommen til Tidum. Tilgangen din er godkjent for ${companyLabel}.`,
        "",
        `Logg inn her: ${appUrl}/auth`,
        "",
        "Du kan logge inn med Google eller sikker e-postlenke.",
        "",
        `Har du spørsmål? Kontakt oss på ${TIDUM_SUPPORT_EMAIL}.`,
      ].join("\n"),
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
    const reasonHtml = reason
      ? `
        <div style="margin-top:20px;padding:16px;border-radius:16px;background:#fff7f4;border:1px solid #f1d6cb;color:#7b4a3f;">
          <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Begrunnelse</div>
          <p style="margin:10px 0 0;font-size:14px;line-height:1.7;">${reason}</p>
        </div>
      `
      : "";

    return this.sendEmail({
      to,
      replyTo: TIDUM_SUPPORT_EMAIL,
      subject: 'Oppdatering om din tilgangsforespørsel – Tidum',
      html: this.renderPanelEmail({
        badge: "Tidum Access",
        title: "Tilgangsforespørselen ble ikke godkjent",
        intro: "Vi kunne ikke aktivere kontoen din i denne omgang.",
        bodyHtml: `
          <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hei ${fullName},</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#486168;">
            Vi har gått gjennom forespørselen din, men kan ikke aktivere tilgang til Tidum akkurat nå.
            Du kan gjerne svare på denne e-posten dersom du ønsker å sende inn mer informasjon.
          </p>
          ${reasonHtml}
        `,
      }),
      text: `Hei ${fullName},\n\nDessverre kan vi ikke godkjenne din tilgangsforespørsel på dette tidspunktet.${reason ? `\n\nBegrunnelse: ${reason}` : ''}\n\nTa gjerne kontakt på ${TIDUM_SUPPORT_EMAIL} om du har spørsmål.`,
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
    const appUrl = getAppBaseUrl();
    return this.sendEmail({
      to,
      replyTo: TIDUM_SUPPORT_EMAIL,
      subject: 'Du er invitert til Tidum',
      html: this.renderPanelEmail({
        badge: "Tidum Invite",
        title: "Du er invitert inn i Tidum",
        intro: "En admin har gitt deg tilgang til en rolle i virksomheten.",
        bodyHtml: `
          <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hei,</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#486168;">
            ${inviterName ? `${inviterName} har invitert deg` : 'Du er invitert'} som <strong style="color:#16343d;">${roleName}</strong> i Tidum.
            Du kan logge inn med Google eller sikker e-postlenke fra innloggingssiden.
          </p>
          <a href="${appUrl}/auth"
             style="display:inline-block;background:#1a6b73;color:#ffffff;padding:15px 28px;border-radius:14px;text-decoration:none;font-size:15px;font-weight:700;box-shadow:0 14px 28px rgba(26,107,115,0.24);">
            Åpne innlogging
          </a>
        `,
      }),
      text: `Hei,\n\n${inviterName ? `${inviterName} har invitert deg` : 'Du er invitert'} som ${roleName} i Tidum Smart Timing.\n\nLogg inn her: ${appUrl}/auth\n\nKontakt: ${TIDUM_SUPPORT_EMAIL}`,
    });
  }

  async sendAccessRequestReceivedEmail(
    to: string,
    fullName: string,
    company?: string | null
  ): Promise<boolean> {
    const companyLabel = company?.trim() || "virksomheten din";

    return this.sendEmail({
      to,
      replyTo: TIDUM_SUPPORT_EMAIL,
      subject: "Vi har mottatt tilgangsforespørselen din",
      html: this.renderPanelEmail({
        badge: "Tidum Access",
        title: "Tilgangsforespørselen er mottatt",
        intro: `Vi har registrert forespørselen din for ${companyLabel}.`,
        bodyHtml: `
          <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hei ${fullName},</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#486168;">
            Forespørselen din er sendt til vurdering. Når virksomheten er godkjent, sender vi deg neste steg for innlogging og oppsett.
          </p>
          <div style="padding:18px;border-radius:18px;background:#f6fbf8;border:1px solid #d9e8e1;">
            <div style="font-size:13px;font-weight:700;color:#2a6b62;">Hva skjer nå</div>
            <ul style="margin:12px 0 0;padding-left:18px;color:#587077;font-size:14px;line-height:1.8;">
              <li>Vi går gjennom virksomhetsopplysningene</li>
              <li>En super admin godkjenner eller følger opp forespørselen</li>
              <li>Du får e-post så snart tilgangen er klar</li>
            </ul>
          </div>
        `,
      }),
      text: `Hei ${fullName},\n\nVi har mottatt tilgangsforespørselen din for ${companyLabel}.\n\nVi sender deg neste steg så snart den er behandlet.\n\nKontakt: ${TIDUM_SUPPORT_EMAIL}`,
    });
  }

  async sendEmailLoginLink(
    to: string,
    fullName: string,
    loginUrl: string
  ): Promise<boolean> {
    return this.sendEmail({
      to,
      replyTo: TIDUM_SUPPORT_EMAIL,
      subject: "Innloggingslenke til Tidum",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #0066cc, #0ea5e9); padding: 30px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Logg inn i Tidum</h1>
          </div>
          <div style="padding: 30px; border: 1px solid #e2e8f0; border-top: 0; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px;">Hei ${fullName || "der"},</p>
            <p>Klikk på knappen under for å logge inn i Tidum. Lenken er gyldig i 15 minutter.</p>
            <a href="${loginUrl}"
               style="display: inline-block; background: #0066cc; color: white; padding: 14px 28px;
                      text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600;">
              Logg inn nå
            </a>
            <p style="color: #64748b; font-size: 13px;">
              Hvis du ikke ba om denne lenken, kan du trygt ignorere e-posten.
            </p>
          </div>
        </div>
      `,
      text: `Hei ${fullName || "der"},\n\nLogg inn i Tidum her: ${loginUrl}\n\nLenken er gyldig i 15 minutter.\n\nHvis du ikke ba om denne lenken, kan du ignorere e-posten.`,
    });
  }

  async sendVendorAdminMagicLinkInviteEmail({
    to,
    fullName,
    company,
    institutionType,
    loginUrl,
  }: {
    to: string;
    fullName: string;
    company?: string | null;
    institutionType?: string | null;
    loginUrl: string;
  }): Promise<boolean> {
    const companyLabel = company?.trim() || "virksomheten din";
    const institutionLabel = institutionType?.trim() || "institusjon";

    return this.sendEmail({
      to,
      replyTo: TIDUM_SUPPORT_EMAIL,
      subject: `Tidum er klart for ${companyLabel}`,
      html: `
        <div style="margin:0;padding:24px;background:#f3f7f5;font-family:Arial,sans-serif;color:#17333c;">
          <div style="max-width:640px;margin:0 auto;overflow:hidden;border-radius:24px;border:1px solid #d8e5df;background:#ffffff;box-shadow:0 24px 60px rgba(16,35,41,0.08);">
            <div style="padding:32px 32px 24px;background:linear-gradient(135deg,#123b44 0%,#1d6e74 54%,#66b8aa 100%);color:#ffffff;">
              <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,0.14);font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">
                Tidum Institution Invite
              </div>
              <h1 style="margin:18px 0 8px;font-size:30px;line-height:1.15;">Dere er godkjent i Tidum</h1>
              <p style="margin:0;font-size:16px;line-height:1.6;color:rgba(255,255,255,0.88);">
                ${companyLabel} er nå opprettet som ${institutionLabel} i Tidum. Denne invitasjonen gir deg første admin-tilgang for virksomheten.
              </p>
            </div>

            <div style="padding:32px;">
              <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hei ${fullName || "der"},</p>
              <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#486168;">
                Du er satt opp som <strong style="color:#16343d;">vendor admin</strong> for <strong style="color:#16343d;">${companyLabel}</strong>.
                Når du åpner lenken under, kommer du rett inn i Tidum og kan begynne å konfigurere virksomheten.
              </p>

              <div style="margin:22px 0 24px;padding:18px;border-radius:18px;background:#f6fbf8;border:1px solid #d9e8e1;">
                <div style="font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#2a6b62;">Din rolle</div>
                <div style="margin-top:8px;font-size:20px;font-weight:700;color:#17333c;">Vendor admin</div>
                <div style="margin-top:6px;font-size:14px;line-height:1.6;color:#587077;">
                  Du kan invitere tiltaksledere, teamledere og miljøarbeidere, og godkjenne brukere i egen virksomhet.
                </div>
              </div>

              <a href="${loginUrl}"
                 style="display:inline-block;background:#1a6b73;color:#ffffff;padding:15px 28px;border-radius:14px;text-decoration:none;font-size:15px;font-weight:700;box-shadow:0 14px 28px rgba(26,107,115,0.24);">
                Åpne Tidum med magic link
              </a>

              <div style="margin-top:24px;padding:18px;border-radius:18px;background:#fffaf1;border:1px solid #f0dfb8;">
                <div style="font-size:13px;font-weight:700;color:#8a5b12;">Neste steg</div>
                <ul style="margin:12px 0 0;padding-left:18px;color:#5f5441;font-size:14px;line-height:1.8;">
                  <li>Bekreft virksomhetsopplysninger og tilgangsnivåer</li>
                  <li>Inviter tiltaksledere og miljøarbeidere</li>
                  <li>Kom i gang med timer, rapporter og godkjenninger</li>
                </ul>
              </div>

              <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#6a7f84;">
                Magic-linken er gyldig i 15 minutter. Hvis du ikke forventet denne invitasjonen, kan du ignorere e-posten eller kontakte oss på
                <a href="mailto:${TIDUM_SUPPORT_EMAIL}" style="color:#1a6b73;text-decoration:none;">${TIDUM_SUPPORT_EMAIL}</a>.
              </p>
            </div>
          </div>
        </div>
      `,
      text: [
        `Hei ${fullName || "der"},`,
        "",
        `${companyLabel} er nå godkjent i Tidum.`,
        "Du er satt opp som vendor admin for virksomheten.",
        "",
        "Åpne Tidum med magic link:",
        loginUrl,
        "",
        "Som vendor admin kan du invitere tiltaksledere, teamledere og miljøarbeidere, og godkjenne brukere i egen virksomhet.",
        "",
        "Lenken er gyldig i 15 minutter.",
      ].join("\n"),
    });
  }

  async sendAccountDeactivatedEmail(
    to: string,
    roleName: string,
    company?: string | null
  ): Promise<boolean> {
    const companyLabel = company?.trim() || "virksomheten din";

    return this.sendEmail({
      to,
      replyTo: TIDUM_SUPPORT_EMAIL,
      subject: "Kontoen din er deaktivert i Tidum",
      html: this.renderPanelEmail({
        badge: "Tidum Access",
        title: "Kontoen din er deaktivert",
        intro: `Tilgangen din til ${companyLabel} er slått av.`,
        bodyHtml: `
          <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hei,</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#486168;">
            Rollen din som <strong style="color:#16343d;">${roleName}</strong> er ikke lenger aktiv i Tidum. Du vil derfor ikke kunne logge inn eller bruke arbeidsflatene som hører til virksomheten.
          </p>
          <div style="padding:18px;border-radius:18px;background:#fff7f4;border:1px solid #f1d6cb;">
            <div style="font-size:13px;font-weight:700;color:#8a5b12;">Trenger du tilgang igjen?</div>
            <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#6c5742;">
              Ta kontakt med vendor admin eller virksomhetsleder hvis dette er feil, eller hvis du trenger å bli invitert på nytt.
            </p>
          </div>
        `,
      }),
      text: `Hei,\n\nKontoen din som ${roleName} er deaktivert i Tidum for ${companyLabel}.\n\nTa kontakt med vendor admin eller virksomhetsleder hvis dette er feil.\n\nKontakt: ${TIDUM_SUPPORT_EMAIL}`,
    });
  }

  async sendPlannedMaintenanceEmail({
    to,
    windowLabel,
    affectedServices,
    actionUrl,
  }: {
    to: string | string[];
    windowLabel: string;
    affectedServices?: string[];
    actionUrl?: string;
  }): Promise<boolean> {
    return this.sendOperationalNotice({
      to,
      subject: "Planlagt vedlikehold i Tidum",
      title: "Planlagt vedlikehold i Tidum",
      intro: "Vi gjennomfører et planlagt vedlikeholdsvindu for å forbedre stabilitet og ytelse.",
      summary: `Arbeidet er planlagt til ${windowLabel}. I denne perioden kan enkelte deler av løsningen være tregere eller midlertidig utilgjengelige.`,
      affectedServices,
      actionLabel: actionUrl ? "Se oppdatert driftsstatus" : undefined,
      actionUrl,
      details: [
        "Lagre arbeid før vedlikeholdsvinduet starter.",
        "Pågående økter kan kreve ny innlogging etter at arbeidet er ferdig.",
      ],
      footerNote: "Vi sender ny oppdatering dersom tidsvinduet endres.",
    });
  }

  async sendOperationalIncidentEmail({
    to,
    incidentTitle,
    summary,
    affectedServices,
    actionUrl,
    workaround,
  }: {
    to: string | string[];
    incidentTitle: string;
    summary: string;
    affectedServices?: string[];
    actionUrl?: string;
    workaround?: string;
  }): Promise<boolean> {
    return this.sendOperationalNotice({
      to,
      subject: `Driftsmelding: ${incidentTitle}`,
      title: "Vi undersøker en driftsfeil",
      intro: "Noen brukere kan oppleve redusert tilgang eller ustabilitet akkurat nå.",
      summary,
      affectedServices,
      actionLabel: actionUrl ? "Følg saken" : undefined,
      actionUrl,
      details: workaround ? [`Midlertidig løsning: ${workaround}`] : undefined,
      footerNote: "Teamet vårt jobber aktivt med saken og sender oppdatering så snart vi vet mer.",
    });
  }

  async sendOperationalResolvedEmail({
    to,
    incidentTitle,
    summary,
    affectedServices,
    actionUrl,
  }: {
    to: string | string[];
    incidentTitle: string;
    summary: string;
    affectedServices?: string[];
    actionUrl?: string;
  }): Promise<boolean> {
    return this.sendOperationalNotice({
      to,
      subject: `Løst: ${incidentTitle}`,
      title: "Driftsfeilen er løst",
      intro: "Tjenestene fungerer nå som normalt igjen.",
      summary,
      affectedServices,
      actionLabel: actionUrl ? "Se siste status" : undefined,
      actionUrl,
      details: [
        "Brukere som fortsatt opplever problemer bør laste siden på nytt og logge inn på nytt.",
      ],
      footerNote: "Takk for tålmodigheten mens vi håndterte hendelsen.",
    });
  }

  async sendGeneralOperationalNoticeEmail({
    to,
    subject,
    title,
    intro,
    summary,
    affectedServices,
    actionLabel,
    actionUrl,
    details,
  }: {
    to: string | string[];
    subject: string;
    title: string;
    intro: string;
    summary: string;
    affectedServices?: string[];
    actionLabel?: string;
    actionUrl?: string;
    details?: string[];
  }): Promise<boolean> {
    return this.sendOperationalNotice({
      to,
      subject,
      title,
      intro,
      summary,
      affectedServices,
      actionLabel,
      actionUrl,
      details,
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
