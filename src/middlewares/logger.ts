import { Request, Response, NextFunction } from "express";

export default async function loggerMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
    if (process.env.NODE_ENV == "test") return next();
    const d = new Date();
    const hour: string = d.getHours().toString().padStart(2, "0");
    const minute: string = d.getMinutes().toString().padStart(2, "0");
    const secound: string = d.getSeconds().toString().padStart(2, "0");
    console.log(`${hour}:${minute}:${secound} - ${req.method} - ${req.path}`);
    next();
}
