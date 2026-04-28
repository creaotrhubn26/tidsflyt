import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { getAppBaseUrl } from './app-base-url';
import { TIDUM_SUPPORT_EMAIL } from '@shared/brand';
import { renderEmailTemplate } from './email-template-renderer';

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

// ── CENTRAL TIDUM EMAIL LAYOUT ────────────────────────────────────────────────
// All Tidum emails use this layout for consistent branding.

interface TidumEmailOptions {
  badge: string;
  title: string;
  intro: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerHtml?: string;
  accentColor?: string; // override gradient start color
}

function renderTidumEmail(opts: TidumEmailOptions): string {
  const accent = opts.accentColor ?? "#123b44";
  const ctaHtml = opts.ctaLabel && opts.ctaUrl ? `
    <a href="${opts.ctaUrl}"
       style="display:inline-block;background:#1a6b73;color:#ffffff;padding:15px 28px;border-radius:14px;text-decoration:none;font-size:15px;font-weight:700;box-shadow:0 14px 28px rgba(26,107,115,0.24);margin:6px 0 12px;">
      ${opts.ctaLabel}
    </a>
  ` : "";

  const footer = opts.footerHtml ?? `
    <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#6a7f84;">
      Har du spørsmål? Kontakt oss på
      <a href="mailto:${TIDUM_SUPPORT_EMAIL}" style="color:#1a6b73;text-decoration:none;">${TIDUM_SUPPORT_EMAIL}</a>.
    </p>
  `;

  return `
    <div style="margin:0;padding:24px;background:#f3f7f5;font-family:'Segoe UI',Arial,sans-serif;color:#17333c;">
      <div style="max-width:640px;margin:0 auto;overflow:hidden;border-radius:24px;border:1px solid #d8e5df;background:#ffffff;box-shadow:0 24px 60px rgba(16,35,41,0.08);">
        <!-- HEADER -->
        <div style="padding:32px 32px 24px;background:linear-gradient(135deg,${accent} 0%,#1d6e74 54%,#66b8aa 100%);color:#ffffff;">
          <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,0.14);font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">
            ${opts.badge}
          </div>
          <h1 style="margin:18px 0 8px;font-size:28px;line-height:1.15;">${opts.title}</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.88);">
            ${opts.intro}
          </p>
        </div>
        <!-- BODY -->
        <div style="padding:32px;">
          ${opts.bodyHtml}
          ${ctaHtml}
          ${footer}
        </div>
        <!-- FOOTER BAR -->
        <div style="padding:16px 32px;background:#f6faf8;border-top:1px solid #e6ede9;text-align:center;">
          <span style="font-size:11px;color:#8fa3a8;letter-spacing:0.05em;">Tidum &mdash; Tidsregistrering og rapportering for barnevern og tiltak</span>
        </div>
      </div>
    </div>
  `;
}

function renderInfoBox(title: string, items: string[], bg = "#f6fbf8", border = "#d9e8e1", titleColor = "#2a6b62"): string {
  return `
    <div style="margin-top:22px;padding:18px;border-radius:18px;background:${bg};border:1px solid ${border};">
      <div style="font-size:13px;font-weight:700;color:${titleColor};">${title}</div>
      <ul style="margin:12px 0 0;padding-left:18px;color:#587077;font-size:14px;line-height:1.8;">
        ${items.map(i => `<li>${i}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderWarningBox(title: string, text: string): string {
  return `
    <div style="margin-top:20px;padding:18px;border-radius:18px;background:#fffaf1;border:1px solid #f0dfb8;">
      <div style="font-size:13px;font-weight:700;color:#8a5b12;">${title}</div>
      <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#5f5441;">${text}</p>
    </div>
  `;
}

// Plain-text fallback for templated emails
function stripHtml(html: string): string {
  return html
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "  • ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderRoleBox(role: string, description: string): string {
  return `
    <div style="margin:22px 0 24px;padding:18px;border-radius:18px;background:#f6fbf8;border:1px solid #d9e8e1;">
      <div style="font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#2a6b62;">Din rolle</div>
      <div style="margin-top:8px;font-size:20px;font-weight:700;color:#17333c;">${role}</div>
      <div style="margin-top:6px;font-size:14px;line-height:1.6;color:#587077;">${description}</div>
    </div>
  `;
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
    return renderTidumEmail({ badge, title, intro, bodyHtml, footerHtml });
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
      html: renderTidumEmail({
        badge: "Tidum Timer",
        title: "Husk å registrere timene dine",
        intro: `Uke ${weekNumber} mangler fortsatt timeregistrering.`,
        bodyHtml: `
          <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hei ${name},</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#486168;">
            Dette er en vennlig påminnelse om å registrere timene dine for uke ${weekNumber}.
            Jo raskere du fører, jo enklere blir det for tiltaksleder å godkjenne.
          </p>
        `,
        ctaLabel: "Registrer timer",
        ctaUrl: `${appBaseUrl}/time-tracking`,
      }),
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
      html: renderTidumEmail({
        badge: "Tidum Access",
        title: "Velkommen til Tidum",
        intro: `Tilgangen din er godkjent, og du kan nå komme i gang i Tidum for ${companyLabel}.`,
        bodyHtml: `
          <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hei ${fullName},</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#486168;">
            Tilgangen din er godkjent, og kontoen din er aktivert i Tidum. Du kan nå logge inn og begynne å føre timer, sende inn rapporter og følge arbeidsflyten som gjelder for din rolle.
          </p>
          ${renderInfoBox("Kom i gang", [
            "Logg inn med Google eller sikker e-postlenke",
            "Se hvilke oppgaver og flater du har tilgang til",
            "Ta kontakt med leder eller admin hvis du trenger mer tilgang",
          ])}
        `,
        ctaLabel: "Gå til innlogging",
        ctaUrl: `${appUrl}/auth`,
      }),
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
    const rendered = await renderEmailTemplate("access-request-received", {
      kunde_navn: fullName,
      kunde_company: company?.trim() || "virksomheten din",
    });

    if (!rendered) {
      // Fallback hvis admin har deaktivert malen
      return this.sendEmail({
        to, replyTo: TIDUM_SUPPORT_EMAIL,
        subject: "Vi har mottatt tilgangsforespørselen din",
        text: `Hei ${fullName},\n\nVi har mottatt tilgangsforespørselen din. Vi sender neste steg så snart den er behandlet.`,
      });
    }

    return this.sendEmail({
      to,
      replyTo: TIDUM_SUPPORT_EMAIL,
      subject: rendered.subject,
      html: this.renderPanelEmail({
        badge: rendered.badge,
        title: rendered.title,
        intro: rendered.intro,
        bodyHtml: rendered.bodyHtml,
      }),
      text: `${rendered.title}\n\n${rendered.intro}\n\n${stripHtml(rendered.bodyHtml)}`,
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
      html: renderTidumEmail({
        badge: "Tidum Login",
        title: "Logg inn i Tidum",
        intro: "Bruk lenken under for sikker innlogging.",
        bodyHtml: `
          <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hei ${fullName || "der"},</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#486168;">
            Klikk på knappen under for å logge inn. Lenken er gyldig i 15 minutter.
          </p>
        `,
        ctaLabel: "Logg inn nå",
        ctaUrl: loginUrl,
        footerHtml: `
          <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#6a7f84;">
            Hvis du ikke ba om denne lenken, kan du trygt ignorere e-posten.
          </p>
        `,
      }),
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
      html: renderTidumEmail({
        badge: "Tidum Institution Invite",
        title: "Dere er godkjent i Tidum",
        intro: `${companyLabel} er nå opprettet som ${institutionLabel} i Tidum. Denne invitasjonen gir deg første admin-tilgang for virksomheten.`,
        bodyHtml: `
          <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hei ${fullName || "der"},</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#486168;">
            Du er satt opp som <strong style="color:#16343d;">vendor admin</strong> for <strong style="color:#16343d;">${companyLabel}</strong>.
            Når du åpner lenken under, kommer du rett inn i Tidum og kan begynne å konfigurere virksomheten.
          </p>
          ${renderRoleBox("Vendor admin", "Du kan invitere tiltaksledere, teamledere og miljøarbeidere, og godkjenne brukere i egen virksomhet.")}
          ${renderInfoBox("Neste steg", [
            "Bekreft virksomhetsopplysninger og tilgangsnivåer",
            "Inviter tiltaksledere og miljøarbeidere",
            "Kom i gang med timer, rapporter og godkjenninger",
          ], "#fffaf1", "#f0dfb8", "#8a5b12")}
        `,
        ctaLabel: "Åpne Tidum med magic link",
        ctaUrl: loginUrl,
        footerHtml: `
          <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#6a7f84;">
            Magic-linken er gyldig i 15 minutter. Hvis du ikke forventet denne invitasjonen, kan du ignorere e-posten eller kontakte oss på
            <a href="mailto:${TIDUM_SUPPORT_EMAIL}" style="color:#1a6b73;text-decoration:none;">${TIDUM_SUPPORT_EMAIL}</a>.
          </p>
        `,
      }),
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

  /**
   * Sendt til hovedadmin når super_admin godkjenner en access-request.
   * Forskjell fra sendVendorAdminMagicLinkInviteEmail: denne er for primær-
   * adminen (én per kunde), ikke backup/co-admin. Tekst snakker om "hovedadmin"
   * og hvilke ansvarsområder som følger med (inkl. å invitere vendor_admin
   * som backup).
   */
  async sendHovedadminMagicLinkInviteEmail({
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
      html: renderTidumEmail({
        badge: "Tidum Hovedadmin Invite",
        title: "Dere er godkjent i Tidum",
        intro: `${companyLabel} er nå opprettet som ${institutionLabel} i Tidum. Denne invitasjonen gir deg hovedadmin-tilgang for virksomheten.`,
        bodyHtml: `
          <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hei ${fullName || "der"},</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#486168;">
            Du er satt opp som <strong style="color:#16343d;">hovedadmin</strong> for <strong style="color:#16343d;">${companyLabel}</strong>.
            Når du åpner lenken under, kommer du rett inn i Tidum og kan begynne å konfigurere virksomheten.
          </p>
          ${renderRoleBox("Hovedadmin", "Du har full tilgang til virksomhetens Tidum-konto. Du kan invitere ansatte, importere fra Planday, sette opp tiltaksledere — og opprette en eller flere leverandøradminer som backup.")}
          ${renderInfoBox("Neste steg", [
            "Bekreft virksomhetsopplysninger og tilgangsnivåer",
            "Importer ansatte fra Planday eller annet system",
            "Inviter tiltaksledere og miljøarbeidere",
            "Oppnevn én eller flere leverandøradminer som backup",
          ], "#fffaf1", "#f0dfb8", "#8a5b12")}
        `,
        ctaLabel: "Åpne Tidum med magic link",
        ctaUrl: loginUrl,
        footerHtml: `
          <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#6a7f84;">
            Magic-linken er gyldig i 15 minutter. Hvis du ikke forventet denne invitasjonen, kan du ignorere e-posten eller kontakte oss på
            <a href="mailto:${TIDUM_SUPPORT_EMAIL}" style="color:#1a6b73;text-decoration:none;">${TIDUM_SUPPORT_EMAIL}</a>.
          </p>
        `,
      }),
      text: [
        `Hei ${fullName || "der"},`,
        "",
        `${companyLabel} er nå godkjent i Tidum.`,
        "Du er satt opp som hovedadmin for virksomheten.",
        "",
        "Åpne Tidum med magic link:",
        loginUrl,
        "",
        "Som hovedadmin har du full tilgang. Du kan importere ansatte, opprette tiltaksledere, og oppnevne leverandøradmin som backup.",
        "",
        "Lenken er gyldig i 15 minutter.",
      ].join("\n"),
    });
  }

  /**
   * Admin-only: invite someone as a prototype tester (not a real vendor).
   * Testers get a magic link and clear expectations about what we want
   * feedback on. Different copy from the regular vendor admin invite.
   */
  async sendPrototypeTesterInviteEmail({
    to,
    fullName,
    loginUrl,
    focusAreas,
    feedbackUrl,
  }: {
    to: string;
    fullName?: string | null;
    loginUrl: string;
    focusAreas?: string[];
    feedbackUrl?: string;
  }): Promise<boolean> {
    const name = fullName?.trim() || "der";
    const defaultFocus = [
      "Timeføring og rapportering",
      "Fravær og overtid",
      "Faste oppgaver og saksrapporter",
    ];
    const areas = focusAreas && focusAreas.length > 0 ? focusAreas : defaultFocus;
    return this.sendEmail({
      to,
      replyTo: TIDUM_SUPPORT_EMAIL,
      subject: "Velkommen som prototype-tester i Tidum",
      html: renderTidumEmail({
        badge: "Tidum Prototype",
        title: "Du er invitert som prototype-tester",
        intro: "Takk for at du hjelper oss å gjøre Tidum bedre. Du får tidlig tilgang til funksjoner før de rulles ut til leverandører.",
        bodyHtml: `
          <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hei ${name},</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#486168;">
            Som <strong style="color:#16343d;">prototype-tester</strong> får du tilgang til Tidum-plattformen for å utforske arbeidsflyten til miljøarbeidere og tiltaksledere. Magic-lenken under logger deg rett inn — ingen passord trengs.
          </p>
          ${renderInfoBox("Vi vil særlig gjerne høre fra deg om", areas, "#f0f7fb", "#cce1eb", "#0b4b5c")}
          ${renderInfoBox("Slik gir du tilbakemelding", [
            "Bruk den flytende Tilbakemelding-knappen nederst til høyre på enhver side",
            "Velg kategori: bug, idé, ros eller annet",
            "Vi ser konteksten (hvilken side du var på) automatisk — du trenger bare beskrive det",
          ], "#fffaf1", "#f0dfb8", "#8a5b12")}
        `,
        ctaLabel: "Logg inn og begynn å teste",
        ctaUrl: loginUrl,
        footerHtml: `
          <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#6a7f84;">
            Magic-lenken er gyldig i 15 minutter. Spørsmål? Send e-post til
            <a href="mailto:${TIDUM_SUPPORT_EMAIL}" style="color:#1a6b73;text-decoration:none;">${TIDUM_SUPPORT_EMAIL}</a>.
          </p>
        `,
      }),
      text: [
        `Hei ${name},`,
        "",
        "Du er invitert som prototype-tester i Tidum.",
        "Magic-lenken under logger deg inn uten passord (gyldig 15 min):",
        loginUrl,
        "",
        "Vi vil gjerne høre hva du synes:",
        ...areas.map(a => `  • ${a}`),
        "",
        "Bruk Tilbakemelding-knappen nederst til høyre på enhver side for å rapportere.",
        feedbackUrl ? `Direkte link: ${feedbackUrl}` : "",
      ].filter(Boolean).join("\n"),
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

  // ── RAPPORT-SYSTEM EMAILS ──────────────────────────────────────────────────

  /**
   * Notify tiltaksleder that a rapport is submitted for approval
   */
  async sendRapportSubmittedEmail({
    to, tiltakslederName, konsulentName, periode, rapportId,
  }: {
    to: string; tiltakslederName: string; konsulentName: string;
    periode: string; rapportId: string;
  }): Promise<boolean> {
    const appUrl = getAppBaseUrl();
    return this.sendEmail({
      to,
      replyTo: TIDUM_SUPPORT_EMAIL,
      subject: `Rapport til godkjenning – ${konsulentName} (${periode})`,
      html: renderTidumEmail({
        badge: "Tidum Rapport",
        title: "Ny rapport venter på godkjenning",
        intro: `${konsulentName} har sendt inn en rapport for ${periode}.`,
        bodyHtml: `
          <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hei ${tiltakslederName},</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#486168;">
            <strong style="color:#16343d;">${konsulentName}</strong> har sendt inn en månedlig rapport for <strong style="color:#16343d;">${periode}</strong> til godkjenning.
            Du kan gå gjennom rapporten, legge til seksjonskommentarer, og enten godkjenne eller returnere den.
          </p>
          ${renderInfoBox("Sjekkliste for godkjenning", [
            "Ingen personopplysninger (GDPR-sjekk)",
            "Alle aktiviteter er dokumentert",
            "Mål er oppdatert med fremdrift",
            "Tidsregistrering stemmer med timer",
          ])}
        `,
        ctaLabel: "Gå til godkjenning",
        ctaUrl: `${appUrl}/rapporter/godkjenning`,
      }),
      text: `Hei ${tiltakslederName},\n\n${konsulentName} har sendt inn en rapport for ${periode}.\n\nGå til godkjenning: ${appUrl}/rapporter/godkjenning`,
    });
  }

  /**
   * Notify miljøarbeider that rapport was approved
   */
  async sendRapportApprovedEmail({
    to, konsulentName, periode, tiltakslederName, kommentar,
  }: {
    to: string; konsulentName: string; periode: string;
    tiltakslederName: string; kommentar?: string;
  }): Promise<boolean> {
    const appUrl = getAppBaseUrl();
    const kommentarHtml = kommentar ? `
      <div style="margin-top:20px;padding:18px;border-radius:18px;background:#f0fdf4;border:1px solid #bbf7d0;">
        <div style="font-size:13px;font-weight:700;color:#166534;">Kommentar fra ${tiltakslederName}</div>
        <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#15803d;">${kommentar}</p>
      </div>
    ` : "";

    return this.sendEmail({
      to,
      replyTo: TIDUM_SUPPORT_EMAIL,
      subject: `Rapport godkjent – ${periode}`,
      html: renderTidumEmail({
        badge: "Tidum Rapport",
        title: "Rapporten din er godkjent",
        intro: `${tiltakslederName} har godkjent rapporten for ${periode}.`,
        bodyHtml: `
          <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hei ${konsulentName},</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#486168;">
            Rapporten din for <strong style="color:#16343d;">${periode}</strong> er godkjent av ${tiltakslederName}.
            Du kan laste ned PDF-versjonen fra rapportoversikten.
          </p>
          ${kommentarHtml}
        `,
        ctaLabel: "Se mine rapporter",
        ctaUrl: `${appUrl}/rapporter`,
      }),
      text: `Hei ${konsulentName},\n\nRapporten din for ${periode} er godkjent av ${tiltakslederName}.${kommentar ? `\n\nKommentar: ${kommentar}` : ""}\n\nSe rapporter: ${appUrl}/rapporter`,
    });
  }

  /**
   * Notify miljøarbeider that rapport was returned with feedback
   */
  async sendRapportReturnedEmail({
    to, konsulentName, periode, tiltakslederName, kommentar, rapportId,
  }: {
    to: string; konsulentName: string; periode: string;
    tiltakslederName: string; kommentar?: string; rapportId: string;
  }): Promise<boolean> {
    const appUrl = getAppBaseUrl();
    const kommentarHtml = kommentar ? `
      <div style="margin-top:20px;padding:18px;border-radius:18px;background:#fff7f4;border:1px solid #f1d6cb;">
        <div style="font-size:13px;font-weight:700;color:#9a3412;">Tilbakemelding fra ${tiltakslederName}</div>
        <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#7c2d12;white-space:pre-line;">${kommentar}</p>
      </div>
    ` : "";

    return this.sendEmail({
      to,
      replyTo: TIDUM_SUPPORT_EMAIL,
      subject: `Rapport returnert – ${periode}`,
      html: renderTidumEmail({
        badge: "Tidum Rapport",
        title: "Rapporten er returnert for endring",
        intro: `${tiltakslederName} har returnert rapporten for ${periode} med tilbakemelding.`,
        accentColor: "#7c2d12",
        bodyHtml: `
          <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hei ${konsulentName},</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#486168;">
            Rapporten din for <strong style="color:#16343d;">${periode}</strong> er returnert av ${tiltakslederName} og trenger endringer før den kan godkjennes.
          </p>
          ${kommentarHtml}
        `,
        ctaLabel: "Åpne rapporten",
        ctaUrl: `${appUrl}/rapporter/${rapportId}`,
      }),
      text: `Hei ${konsulentName},\n\nRapporten din for ${periode} er returnert av ${tiltakslederName}.${kommentar ? `\n\nTilbakemelding:\n${kommentar}` : ""}\n\nÅpne rapporten: ${appUrl}/rapporter/${rapportId}`,
    });
  }

  /**
   * Tiltaksleder invites a miljøarbeider to the team
   */
  async sendTiltakslederInviteEmail({
    to, inviterName, roleName, company, loginUrl,
  }: {
    to: string; inviterName: string; roleName: string;
    company?: string; loginUrl: string;
  }): Promise<boolean> {
    const companyLabel = company?.trim() || "virksomheten";
    return this.sendEmail({
      to,
      replyTo: TIDUM_SUPPORT_EMAIL,
      subject: `${inviterName} har invitert deg til Tidum`,
      html: renderTidumEmail({
        badge: "Tidum Invite",
        title: "Du er invitert til Tidum",
        intro: `${inviterName} har gitt deg tilgang til ${companyLabel}.`,
        bodyHtml: `
          <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hei,</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#486168;">
            <strong style="color:#16343d;">${inviterName}</strong> har invitert deg som
            <strong style="color:#16343d;">${roleName}</strong> i Tidum for ${companyLabel}.
          </p>
          ${renderRoleBox(roleName, roleName === "Miljøarbeider"
            ? "Du kan registrere timer, skrive rapporter og følge opp tiltak."
            : roleName === "Tiltaksleder"
            ? "Du kan godkjenne timer, rapporter og invitere miljøarbeidere."
            : "Du har tilgang til arbeidsflater tilpasset din rolle."
          )}
          ${renderInfoBox("Slik kommer du i gang", [
            "Klikk på knappen under for å logge inn",
            "Fyll ut profilen din",
            "Begynn å registrere timer og aktiviteter",
          ])}
        `,
        ctaLabel: "Åpne Tidum",
        ctaUrl: loginUrl,
        footerHtml: `
          <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#6a7f84;">
            Lenken er gyldig i 15 minutter. Etter første innlogging kan du bruke Google eller e-postlenke.
          </p>
        `,
      }),
      text: `Hei,\n\n${inviterName} har invitert deg som ${roleName} i Tidum for ${companyLabel}.\n\nLogg inn her: ${loginUrl}\n\nLenken er gyldig i 15 minutter.`,
    });
  }

  /**
   * Notify the assigned segment owner (SDR/AE/Founder) about a new lead.
   * Routing rule + assignee email come from sales_routing_rules (DB).
   */
  async sendLeadAssignmentEmail({
    to, assigneeLabel, lead, tierLabel, userCount, responseTimeHours,
  }: {
    to: string;
    assigneeLabel: string;
    lead: { id: number; fullName: string; email: string; company?: string | null; phone?: string | null; orgNumber?: string | null; institutionType?: string | null; message?: string | null };
    tierLabel: string | null;
    userCount: number | null;
    responseTimeHours: number;
  }): Promise<boolean> {
    const messageSection = lead.message
      ? `> ${lead.message.replace(/\n/g, " ")}`
      : "";

    const rendered = await renderEmailTemplate("lead-assigned", {
      assignee_label: assigneeLabel,
      response_time_hours: String(responseTimeHours),
      kunde_company: lead.company || lead.fullName,
      kunde_navn: lead.fullName,
      kunde_email: lead.email,
      kunde_phone: lead.phone || "Ikke oppgitt",
      kunde_org_nr: lead.orgNumber || "Ikke oppgitt",
      kunde_institution: lead.institutionType || "Ikke oppgitt",
      bruker_antall: userCount ? String(userCount) : "Ikke oppgitt",
      tier_label: tierLabel || "Ikke matchet",
      lead_source: "—",
      lead_message_section: messageSection,
      lead_id: String(lead.id),
    });

    if (!rendered) {
      console.warn("lead-assigned template missing/inactive — using fallback");
      return this.sendEmail({
        to, replyTo: lead.email,
        subject: `[${assigneeLabel}] Nytt lead: ${lead.company || lead.fullName}`,
        text: `Nytt lead #${lead.id} tildelt ${assigneeLabel}. Åpne: ${getAppBaseUrl()}/admin/leads/${lead.id}`,
      });
    }

    return this.sendEmail({
      to,
      replyTo: lead.email,
      subject: rendered.subject,
      html: renderTidumEmail({
        badge: rendered.badge,
        title: rendered.title,
        intro: rendered.intro,
        bodyHtml: rendered.bodyHtml,
        ctaLabel: rendered.ctaLabel ?? undefined,
        ctaUrl: rendered.ctaUrl ?? undefined,
      }),
      text: `${rendered.title}\n\n${rendered.intro}\n\n${stripHtml(rendered.bodyHtml)}\n\n${rendered.ctaLabel && rendered.ctaUrl ? `${rendered.ctaLabel}: ${rendered.ctaUrl}` : ""}`,
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
