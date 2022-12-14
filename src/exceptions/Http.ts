import StatusCode from "@utils/statusCodes";
import env from "@config/validateEnv";

export default class HttpError extends Error {
    constructor(public message: string = "Something went wrong", public status: number = StatusCode.BadRequest) {
        super(message);

        Object.setPrototypeOf(this, new.target.prototype);
        this.name = Error.name;
        Error.captureStackTrace(this);
        if (env.isDev) {
            console.log(this);
        }
    }
}
