const { ImapFlow } = require('imapflow');
require('dotenv').config();

async function checkInbox() {
  const client = new ImapFlow({
    host: 'heimdall.domene.no',
    port: 993,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    logger: false,
  });

  try {
    await client.connect();
    console.log('Connected to IMAP');

    const mailbox = await client.mailboxOpen('INBOX');
    console.log('Messages in inbox:', mailbox.exists);

    if (mailbox.exists > 0) {
      const last = Math.max(1, mailbox.exists - 9);
      for await (const msg of client.fetch(`${last}:*`, { envelope: true, source: false })) {
        console.log(`\n--- Message ${msg.seq} ---`);
        console.log('From:', msg.envelope.from?.map(f => f.address).join(', '));
        console.log('Subject:', msg.envelope.subject);
        console.log('Date:', msg.envelope.date);
      }
    }

    await client.logout();
  } catch (e) {
    console.log('IMAP Error:', e.message);
    
    // Fallback: try without imapflow, just test connectivity
    console.log('\nTrying alternate approach...');
    const nodemailer = require('nodemailer');
    
    // Send test to the noreply address itself as a loopback test
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: 465,
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    try {
      const info = await t.sendMail({
        from: '"Tidum" <noreply@tidum.no>',
        to: 'danielqazi89@gmail.com',
        subject: 'Tidum Test 2 - ' + new Date().toISOString(),
        text: 'Second test email from Tidum. Check spam folder.',
        headers: {
          'X-Priority': '1',
          'Precedence': 'bulk',
          'List-Unsubscribe': '<mailto:noreply@tidum.no>',
        },
      });
      console.log('Sent another test:', info.messageId, info.response);
    } catch (e2) {
      console.log('Send error:', e2.message);
    }
  }
}
checkInbox();
