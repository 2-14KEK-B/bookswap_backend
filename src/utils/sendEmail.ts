import env from "@config/validateEnv";
import { createTransport } from "nodemailer";
import { HttpError } from "@exceptions";
import type { NextFunction } from "express";

/* istanbul ignore next */
async function sendEmail(email: string, subject: string, body: string, next: NextFunction) {
    const transporter = createTransport({
        service: "gmail",
        auth: {
            user: env.EMAIL_ADDRESS,
            pass: env.EMAIL_PASSWORD,
        },
    });

    transporter.verify(err => {
        if (err) {
            return next(new HttpError(err.message));
        }
    });

    const mailConfigurations = {
        from: env.EMAIL_ADDRESS,
        to: email,
        subject: subject,
        html: body,
    };

    try {
        await transporter.sendMail(mailConfigurations);
    } catch (error) {
        return next(error);
    }
}

export { sendEmail };
