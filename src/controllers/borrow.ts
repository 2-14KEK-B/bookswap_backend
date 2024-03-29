import { Router, type Request, type Response, type NextFunction } from "express";
import {
    authenticationMiddleware as authentication,
    authorizationMiddleware as authorization,
    validationMiddleware as validation,
} from "@middlewares";
import { bookModel, borrowModel, userModel } from "@models";
import { isIdNotValid, getPaginated, StatusCode } from "@utils";
import { CreateBorrowDto, ModifyBorrowDto } from "@validators";
import { HttpError } from "@exceptions";
import type { Controller, Borrow, CreateBorrow, ModifyBorrow } from "@interfaces";
import type { FilterQuery, Types } from "mongoose";

export default class BorrowController implements Controller {
    router = Router();
    private user = userModel;
    private book = bookModel;
    private borrow = borrowModel;

    constructor() {
        this.initializeRoutes();
    }

    private initializeRoutes() {
        this.router.get("/user/me/borrow", authentication, this.getLoggedInUserBorrows);
        this.router.post("/borrow", [authentication, validation(CreateBorrowDto)], this.createBorrow);
        this.router.patch("/borrow/:id([0-9a-fA-F]{24})/verify", authentication, this.modifyVerificationByBorrowId);
        this.router
            .route(`/borrow/:id([0-9a-fA-F]{24})`)
            .all(authentication)
            .get(this.getBorrowById)
            .patch(validation(ModifyBorrowDto, true), this.modifyBorrowById)
            .delete(this.deleteBorrowById);
        // ADMIN
        this.router.get(`/admin/borrow`, [authentication, authorization(["admin"])], this.adminGetBorrows);
        this.router
            .route("/admin/borrow/:id([0-9a-fA-F]{24})")
            .all([authentication, authorization(["admin"])])
            .get(this.adminGetBorrowById)
            .patch(this.adminModifyBorrowById)
            .delete(this.adminDeleteBorrowById);
    }

    private getLoggedInUserBorrows = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const loggedInUserId = req.session["userId"];

            const borrow = await this.borrow //
                .findOne({ $or: [{ from: loggedInUserId }, { to: loggedInUserId }] })
                .populate("books from to")
                .populate({
                    path: "from to",
                    select: "username fullname email picture",
                })
                .populate({
                    path: "user_rates",
                    populate: {
                        path: "from to",
                        select: "comment rate createdAt",
                    },
                })
                .lean<Borrow>()
                .exec();
            if (!borrow) return next(new HttpError(`error.borrow.failedGetBorrows`));

            res.json(borrow);
        } catch (error) {
            /* istanbul ignore next */
            next(error);
        }
    };
    private getBorrowById = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const borrowId = req.params["id"];
            if (await isIdNotValid(this.borrow, [borrowId], next)) return;
            const loggedInUserId = req.session["userId"];

            const borrow = await this.borrow //
                .findOne({ _id: borrowId, $or: [{ from: loggedInUserId }, { to: loggedInUserId }] })
                .populate({ path: "from to", select: "username fullname email picture" })
                .populate({
                    path: "user_rates",
                    populate: { path: "from to", select: "username fullname email picture" },
                })
                .populate({
                    path: "books",
                    populate: [
                        { path: "uploader", select: "username fullname email picture" },
                        {
                            path: "rates",
                            populate: { path: "from", select: "username fullname email picture" },
                        },
                    ],
                })
                .lean<Borrow>()
                .exec();
            if (!borrow) return next(new HttpError(`error.borrow.failedGetBorrowById`));

            res.json(borrow);
        } catch (error) {
            /* istanbul ignore next */
            next(error);
        }
    };
    private createBorrow = async (req: Request<unknown, unknown, CreateBorrow>, res: Response, next: NextFunction) => {
        try {
            const { to, from, books } = req.body;
            if (await isIdNotValid(this.book, books, next)) return;
            const loggedInUserId = req.session["userId"] as string;

            const existQuery: FilterQuery<Borrow> = { books: { $in: books } };
            const newBorrow: Partial<Borrow> = { books: books };
            let otherUser: string | undefined = undefined;

            if (to /* lend book to someone */) {
                if (await isBooksNotValidForBorrow(books, "lend")) {
                    return next(new HttpError("error.lend.booksAreForBorrow"));
                }
                if (loggedInUserId == to) {
                    return next(new HttpError("error.lend.lendToYourself"));
                }
                if (await isIdNotValid(this.user, [to], next)) return;
                existQuery["from"] = newBorrow["from"] = loggedInUserId;
                existQuery["to"] = newBorrow["to"] = to;

                newBorrow["type"] = "lend";
                otherUser = to;
            } else if (from) {
                if (await isBooksNotValidForBorrow(books, "borrow")) {
                    return next(new HttpError("error.borrow.booksAreForLend"));
                }
                if (loggedInUserId == from) {
                    return next(new HttpError("error.borrow.borrowFromYourself"));
                }
                if (await isIdNotValid(this.user, [from], next)) return;
                existQuery["from"] = newBorrow["from"] = from;
                existQuery["to"] = newBorrow["to"] = loggedInUserId;

                newBorrow["type"] = "borrow";
                otherUser = from;
            } else {
                return next(new HttpError("error.fromOrTo"));
            }

            const alreadyExist = await this.borrow //
                .exists(existQuery)
                .exec();
            if (alreadyExist != null) return next(new HttpError("error.alreadyInBorrow"));

            // const createdNewBorrow = await this.borrow //
            //     .create(newBorrow);
            const createdNewBorrow = new this.borrow(newBorrow);
            await createdNewBorrow.save({ validateBeforeSave: true });
            if (!newBorrow) return next(new HttpError("error.borrow.failedCreateBorrow"));

            const { modifiedCount } = await this.user //
                .updateMany(
                    {
                        _id: { $in: [otherUser, loggedInUserId] },
                    },
                    { $push: { borrows: { _id: createdNewBorrow._id } } },
                )
                .exec();
            if (modifiedCount != 2) return next(new HttpError("error.user.failedUpdateUser"));

            await this.user.createNotification(
                otherUser,
                loggedInUserId,
                createdNewBorrow._id.toString(),
                newBorrow["type"],
                "create",
            );

            res.json(
                await createdNewBorrow.populate([
                    { path: "from to", select: "username fullname email picture" },
                    { path: "books", select: "author title picture" },
                    { path: "user_rates", populate: { path: "from to", select: "username fullname email picture" } },
                ]),
            );
        } catch (error) {
            /* istanbul ignore next */
            next(error);
        }
    };
    private modifyBorrowById = async (
        req: Request<{ id: string }, unknown, ModifyBorrow>,
        res: Response,
        next: NextFunction,
    ) => {
        try {
            const books = req.body["books"];
            if (await isIdNotValid(this.book, books, next)) return;

            const borrowId = req.params["id"];
            if (await isIdNotValid(this.borrow, [borrowId], next)) return;
            const loggedInUserId = req.session["userId"] as string;

            const borrowToModify = await this.borrow
                .findOne({ _id: borrowId, $or: [{ from: loggedInUserId }, { to: loggedInUserId }], verified: false })
                .lean<Borrow>()
                .exec();
            if (borrowToModify == null) return next(new HttpError("error.borrow.cannotModifyBorrow"));

            if (await isBooksNotValidForBorrow(books, borrowToModify["type"])) {
                return next(new HttpError("error.borrow.cannotBorrowBook"));
            }

            const modifiedBorrow = await this.borrow
                .findByIdAndUpdate(borrowId, { ...req.body, updatedAt: new Date() }, { new: true, runValidators: true })
                .populate({ path: "from to", select: "username fullname email picture" })
                .populate({ path: "books", select: "username fullname email picture" })
                .lean<Borrow>()
                .exec();
            if (!modifiedBorrow) return next(new HttpError("error.borrow.failedUpdateBorrow"));

            const otherUserId =
                modifiedBorrow["type"] == "borrow" ? borrowToModify.from.toString() : borrowToModify.to.toString();

            await this.user.createNotification(otherUserId, loggedInUserId, borrowId, modifiedBorrow["type"], "update");

            res.json(modifiedBorrow);
        } catch (error) {
            /* istanbul ignore next */
            next(error);
        }
    };
    private modifyVerificationByBorrowId = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const borrowId = req.params["id"];
            if (await isIdNotValid(this.borrow, [borrowId], next)) return;
            const loggedInUserId = req.session["userId"] as string;

            const borrowToModify = await this.borrow
                .findOne({ _id: borrowId, $or: [{ from: loggedInUserId }, { to: loggedInUserId }], verified: false })
                .lean<Borrow>()
                .exec();
            if (borrowToModify == null) return next(new HttpError("error.borrow.cannotModifyBorrow"));

            let otherUser: string | undefined = undefined;

            if (borrowToModify.type == "borrow") {
                if (loggedInUserId != borrowToModify.from.toString()) {
                    return next(new HttpError("error.borrow.cannotModifyVerified"));
                }
                otherUser = borrowToModify.to.toString();
            } else {
                if (loggedInUserId != borrowToModify.to.toString()) {
                    return next(new HttpError("error.borrow.cannotModifyVerified"));
                }
                otherUser = borrowToModify.from.toString();
            }

            if (!otherUser) return;

            const { modifiedCount } = await this.borrow
                .updateOne({ _id: borrowId }, { $set: { verified: true } }, { runValidators: true })
                .exec();
            if (modifiedCount != 1) return next(new HttpError("error.borrow.failedUpdateBorrow"));

            await this.user.createNotification(otherUser, loggedInUserId, borrowId, borrowToModify["type"], "verify");

            res.sendStatus(StatusCode.NoContent);
        } catch (error) {
            /* istanbul ignore next */
            next(error);
        }
    };
    private deleteBorrowById = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const borrowId = req.params["id"];
            if (await isIdNotValid(this.borrow, [borrowId], next)) return;
            const loggedInUserId = req.session["userId"] as string;

            const borrowToDelete = await this.borrow //
                .findOne({ _id: borrowId, $or: [{ from: loggedInUserId }, { to: loggedInUserId }], verified: false })
                .lean<Borrow>()
                .exec();
            if (borrowToDelete == null) return next(new HttpError("error.borrow.cannotDeleteBorrow"));

            const { from, to } = borrowToDelete;

            const { deletedCount } = await this.borrow //
                .deleteOne({ _id: borrowId })
                .exec();
            if (!deletedCount && deletedCount != 1) return next(new HttpError("error.borrow.failedDeleteBorrow"));

            const otherUserId = borrowToDelete["type"] == "borrow" ? from.toString() : to.toString();

            await this.user.createNotification(otherUserId, loggedInUserId, borrowId, borrowToDelete["type"], "delete");

            const { modifiedCount } = await this.user
                .updateMany({ _id: { $in: [from, to] } }, { $pull: { borrows: borrowId } }, { runValidators: true })
                .exec();
            if (modifiedCount != 2) return next(new HttpError("error.user.failedUpdateUsers"));

            res.sendStatus(StatusCode.NoContent);
        } catch (error) {
            /* istanbul ignore next */
            next(error);
        }
    };

    // ADMIN
    private adminGetBorrows = async (
        req: Request<
            unknown,
            unknown,
            unknown,
            { skip?: string; limit?: string; sort?: "asc" | "desc"; sortBy?: string; keyword?: string }
        >,
        res: Response,
        next: NextFunction,
    ) => {
        try {
            const { skip, limit, sort, sortBy } = req.query;

            const borrows = await getPaginated(this.borrow, {}, skip, limit, sort, sortBy);

            res.json(borrows);
        } catch (error) {
            /* istanbul ignore next */
            next(error);
        }
    };
    private adminGetBorrowById = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const borrowId = req.params["id"];
            if (await isIdNotValid(this.borrow, [borrowId], next)) return;

            const borrow = await this.borrow //
                .findById(borrowId)
                .populate("books")
                .lean<Borrow>()
                .exec();
            if (!borrow) return next(new HttpError("error.borrow.failedGetBorrowById"));

            res.json(borrow);
        } catch (error) {
            /* istanbul ignore next */
            next(error);
        }
    };
    private adminModifyBorrowById = async (
        req: Request<{ id: string }, unknown, ModifyBorrow>,
        res: Response,
        next: NextFunction,
    ) => {
        try {
            const borrowId = req.params["id"];
            if (await isIdNotValid(this.borrow, [borrowId], next)) return;

            const modifiedBorrow = await this.borrow
                .findByIdAndUpdate(borrowId, { ...req.body, updatedAt: new Date() }, { new: true, runValidators: true })
                .lean<Borrow>()
                .exec();
            if (!modifiedBorrow) return next(new HttpError("error.borrow.failedUpdateBorrow"));

            res.json(modifiedBorrow);
        } catch (error) {
            /* istanbul ignore next */
            next(error);
        }
    };
    private adminDeleteBorrowById = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const borrowId = req.params["id"];
            if (await isIdNotValid(this.borrow, [borrowId], next)) return;

            const borrow = await this.borrow //
                .findById(borrowId, { from: 1, to: 1 })
                .lean<{ from: Types.ObjectId; to: Types.ObjectId }>()
                .exec();
            if (borrow == null) return;
            const { from, to } = borrow;

            const { deletedCount } = await this.borrow //
                .deleteOne({ _id: borrowId })
                .exec();
            if (deletedCount != 1) return next(new HttpError("error.borrow.failedDeleteBorrow"));

            const { modifiedCount } = await this.user
                .updateMany({ _id: { $in: [from, to] } }, { $pull: { borrows: borrowId } }, { runValidators: true })
                .exec();
            if (modifiedCount != 2) return next(new HttpError("error.user.failedUpdateUsers"));

            res.sendStatus(StatusCode.NoContent);
        } catch (error) {
            /* istanbul ignore next */
            next(error);
        }
    };
}

async function isBooksNotValidForBorrow(books: string[] | undefined, type: "borrow" | "lend") {
    try {
        if (!books) return true;
        const forBorrow = type == "borrow";
        const validBooks = await bookModel
            .find({ _id: { $in: books }, for_borrow: forBorrow }, { _id: 1 })
            .lean()
            .exec();
        return validBooks.length != books.length;
    } catch {
        /* istanbul ignore next */
        return true;
    }
}
