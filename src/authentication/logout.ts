import { NextFunction, Request, Response, Router } from "express";
import Controller from "@interfaces/controller";
import HttpError from "@exceptions/Http";
import authMiddleware from "@middlewares/authentication";

export default class LogoutController implements Controller {
    path: string;
    router: Router;

    constructor(path: string, router: Router) {
        this.path = path;
        this.router = router;
        this.initializeRoute();
    }

    private initializeRoute() {
        this.router.post(`${this.path}/logout`, authMiddleware, this.logout);
    }

    private logout = async (req: Request, res: Response, next: NextFunction) => {
        try {
            req.session.userId = null;
            req.session.destroy(err => {
                if (process.env.NODE_ENV == "development") console.log(err);
            });
            res.send("logout successfully");
        } catch (error) {
            next(new HttpError((error as Error).message));
        }
    };
}