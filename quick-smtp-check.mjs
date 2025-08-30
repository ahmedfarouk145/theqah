// quick-smtp-check.mjs
import nodemailer from 'nodemailer';

const t = nodemailer.createTransport({
  host: process.env.DMAIL_SMTP_HOST,
  port: Number(process.env.DMAIL_SMTP_PORT || 465),
  secure: true, // 465 = SSL/TLS
  auth: {
    user: process.env.DMAIL_SMTP_USER,
    pass: process.env.DMAIL_SMTP_PASS
  }
});

t.verify()
  .then(() => console.log('SMTP OK'))
  .catch(console.error);
