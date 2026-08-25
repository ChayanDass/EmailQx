import nodemailer, { Transporter } from "nodemailer";

let transporter: Transporter | null = null;

export async function getEtherealTransporter(): Promise<Transporter> {
  if (transporter) return transporter;

  console.log("[Ethereal] Creating test account for fake SMTP...");
  const testAccount = await nodemailer.createTestAccount();
  console.log(`[Ethereal] Test account created: ${testAccount.user}`);

  transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });

  return transporter;
}

// Pre-initialize on startup
getEtherealTransporter().catch((err) => {
  console.warn("[Ethereal] Initial pre-fetch warning:", err.message);
});

export interface AttachmentData {
  name: string;
  type: string;
  data: string; // base64
}

export interface SendEmailOptions {
  senderEmail?: string;
  to: string;
  subject: string;
  body: string;
  attachments?: AttachmentData[];
}

export interface SendEmailResult {
  messageId: string;
  previewUrl: string | false;
}

export async function sendEmailViaEthereal(options: SendEmailOptions): Promise<SendEmailResult> {
  const mailTransporter = await getEtherealTransporter();

  const fromHeader = options.senderEmail
    ? `"ReachInbox Sender" <${options.senderEmail}>`
    : '"ReachInbox Outbox" <outbox@reachinbox.ai>';

  const nodemailerAttachments = (options.attachments || []).map((att) => ({
    filename: att.name,
    content: Buffer.from(att.data, "base64"),
    contentType: att.type,
  }));

  const info = await mailTransporter.sendMail({
    from: fromHeader,
    to: options.to,
    subject: options.subject,
    text: options.body,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f6f8; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="border-bottom: 2px solid #6366f1; padding-bottom: 15px; margin-bottom: 20px;">
            <h2 style="color: #4f46e5; margin: 0;">${options.subject}</h2>
            <p style="color: #6b7280; font-size: 14px; margin-top: 5px;">From: <strong>${options.senderEmail || "outbox@reachinbox.ai"}</strong></p>
          </div>
          <div style="font-size: 16px; line-height: 1.6; white-space: pre-wrap;">${options.body}</div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0 15px 0;" />
          <p style="font-size: 12px; color: #9ca3af; text-align: center;">Sent by ReachInbox Scheduler (Ethereal Fake SMTP)</p>
        </div>
      </div>
    `,
    attachments: nodemailerAttachments,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  console.log(`[Ethereal] Sent from ${options.senderEmail || "default"} to ${options.to}. ID: ${info.messageId}`);
  if (previewUrl) console.log(`[Ethereal] Preview: ${previewUrl}`);

  return { messageId: info.messageId, previewUrl };
}
