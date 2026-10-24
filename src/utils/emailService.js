
import nodemailer from "nodemailer";

let transporter;

const getEmailCredentials = () => {
  const emailId = process.env.EMAIL_ID;
  const emailPassword = process.env.EMAIL_PASSWORD;
  if (!emailId || !emailPassword) {
    throw new Error("Email credentials are missing.");
  }

  return { emailId, emailPassword };
};

const getTransporter = ({ emailId, emailPassword }) => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || "smtp.gmail.com",
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === "true",
      requireTLS: true,
      auth: {
        user: emailId,
        pass: emailPassword,
      },
    });
  }
  return transporter;
};

export const verifyEmailConnection = async () => {
  const credentials = getEmailCredentials();
  await getTransporter(credentials).verify();
  console.log("Email SMTP connection verified successfully.");
};

export const sendEmail = async ({
  to,
  subject,
  text,
  html,
  replyTo,
}) => {
  const credentials = getEmailCredentials();

  if (!to || !subject || (!text && !html)) {
    throw new Error("Recipient, subject, and email content are required.");
  }

  const result = await getTransporter(credentials).sendMail({
    from: {
      name: "ZYORA",
      address: credentials.emailId,
    },
    to,
    subject,
    text,
    html,
    ...(replyTo ? { replyTo } : {}),
  });

  if (!result.accepted?.length) {
    throw new Error("SMTP server did not accept any email recipients.");
  }

  console.log("Email accepted by SMTP server:", {
    messageId: result.messageId,
    accepted: result.accepted,
    rejected: result.rejected,
  });

  return result;
};
