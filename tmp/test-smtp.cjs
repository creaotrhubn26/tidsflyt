const nodemailer = require('nodemailer');
require('dotenv').config();

async function test() {
  console.log('SMTP_HOST:', process.env.SMTP_HOST);
  console.log('SMTP_PORT:', process.env.SMTP_PORT);
  console.log('SMTP_USER:', process.env.SMTP_USER);
  console.log('SMTP_PASS length:', (process.env.SMTP_PASS || '').length);
  console.log('SMTP_PASS value:', JSON.stringify(process.env.SMTP_PASS));

  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 465,
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    debug: true,
    logger: true,
  });

  try {
    const ok = await t.verify();
    console.log('\nVERIFY OK:', ok);
  } catch(e) {
    console.log('\nVERIFY FAILED:', e.message);
  }

  try {
    const info = await t.sendMail({
      from: '"Tidum" <noreply@tidum.no>',
      to: 'danielqazi89@gmail.com',
      subject: 'Tidum SMTP Test',
      text: 'This is a direct test from Tidum SMTP.',
      html: '<h2>Tidum SMTP Test</h2><p>If you see this, SMTP is working correctly.</p>',
    });
    console.log('\nSEND OK:', info.messageId, info.response);
  } catch(e) {
    console.log('\nSEND FAILED:', e.message);
  }
}
test();
