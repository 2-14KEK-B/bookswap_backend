import { userModel } from "@models";
import isIdNotValid from "@utils/idChecker";
import { UnauthorizedException } from "@exceptions";
import type { Request, Response, NextFunction } from "express";

/**
Validate if user logged in by session
 */
export default async function authenticationMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
): Promise<void> {
    const userId = req.session["userId"];
    if (!userId || (await isIdNotValid(userModel, [userId], next))) {
        return next(new UnauthorizedException());
    }
    next();
}
