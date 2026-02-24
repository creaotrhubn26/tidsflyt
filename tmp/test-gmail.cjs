const nodemailer = require('nodemailer');
require('dotenv').config();

(async () => {
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 465,
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  // Attempt 1: Send simple plain text (no HTML)
  const info = await t.sendMail({
    from: '"Tidum Tidsregistrering" <noreply@tidum.no>',
    to: 'danielqazi89@gmail.com',
    replyTo: 'noreply@tidum.no',
    subject: 'Test fra Tidum - ' + new Date().toLocaleTimeString('nb-NO'),
    text: 'Hei Daniel,\n\nDette er en test-epost fra Tidum tidsregistrering.\n\nMvh,\nTidum',
    // No HTML - keep it simple to avoid spam filters
  });
  console.log('Test 1 (plain text only):', info.response);

  // Attempt 2: Higher priority
  const info2 = await t.sendMail({
    from: '"Tidum" <noreply@tidum.no>',
    to: 'danielqazi89@gmail.com',
    subject: 'Viktig: Tidum epost-test',
    text: 'Denne eposten tester at Tidum kan sende epost til Gmail.',
    html: '<p>Denne eposten tester at Tidum kan sende epost til Gmail.</p>',
    priority: 'high',
  });
  console.log('Test 2 (high priority):', info2.response);

  console.log('\nBoth sent. Check inbox AND spam at danielqazi89@gmail.com.');
  console.log('If still nothing, log in to webmail at domene.no for noreply@tidum.no to check for bounce messages.');
})();
