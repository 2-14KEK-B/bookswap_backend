import { Router, Request, Response, NextFunction } from "express";
import validationMiddleware from "@middlewares/validation";
import authenticationMiddleware from "@middlewares/authentication";
import authorizationMiddleware from "@middlewares/authorization";
import bookModel from "@models/book";
import userModel from "@models/user";
import isIdNotValid from "@utils/idChecker";
import StatusCode from "@utils/statusCodes";
import { BookRatingDto } from "@validators/book";
import HttpError from "@exceptions/Http";
import sortByDate from "@utils/sortByDate";
import type { SortOrder } from "mongoose";
import type { Book } from "@interfaces/book";
import type Controller from "@interfaces/controller";
import type { BookRating, CreateBookRating } from "@interfaces/bookRating";

export default class BookRatingController implements Controller {
    path = "/";
    router = Router();
    book = bookModel;
    user = userModel;

    constructor() {
        this.initRoutes();
    }

    private initRoutes() {
        this.router
            .route(`${this.path}:id`)
            .get(this.getBookRatingByBookId)
            .post([authenticationMiddleware, validationMiddleware(BookRatingDto)], this.createBookRatingByBookId)
            .delete([authenticationMiddleware, authorizationMiddleware(["admin"])], this.deleteBookRatingByBookId);
    }

    private getBookRatingByBookId = async (
        req: Request<{ id: string }, unknown, unknown, { skip?: string; limit?: string; sort?: SortOrder }>,
        res: Response,
        next: NextFunction,
    ) => {
        try {
            const bookId = req.params["id"];
            if (await isIdNotValid(this.book, [bookId], next)) return;
            const { skip, limit, sort } = req.query;

            const { ratings } = await this.book //
                .findById(bookId, { ratings: 1 })
                .lean<{ ratings: BookRating[] }>()
                .exec();
            if (!ratings) return next(new HttpError("Failed to get rating of the book"));

            let sortedRatings = sortByDate(ratings, sort || "desc");
            sortedRatings = ratings.slice(Number.parseInt(skip as string) || 0, Number.parseInt(limit as string) || 10);

            res.json(sortedRatings);
        } catch (error) {
            next(new HttpError(error));
        }
    };

    private createBookRatingByBookId = async (
        req: Request<{ id: string }, unknown, CreateBookRating>,
        res: Response,
        next: NextFunction,
    ) => {
        try {
            const userId = req.session["userId"];
            const bookId = req.params["id"];
            if (await isIdNotValid(this.book, [bookId], next)) return;

            const alreadyRated = await this.book //
                .exists({ _id: bookId, "ratings.from_id": userId })
                .exec();
            if (alreadyRated) return next(new HttpError("Already rated this book."));

            const ratedBook = await this.book
                .findByIdAndUpdate(
                    bookId,
                    { $push: { ratings: { ...req.body, from_id: userId } } },
                    { returnDocument: "after" },
                )
                .lean<Book>()
                .exec();
            if (!ratedBook) return next(new HttpError("Failed to rate book"));

            const { acknowledged } = await this.user //
                .updateOne({ _id: userId }, { $push: { rated_books: ratedBook._id } })
                .exec();
            if (!acknowledged) return next(new HttpError("Failed to update the user"));

            res.json(ratedBook);
        } catch (error) {
            next(new HttpError(error));
        }
    };

    private deleteBookRatingByBookId = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const userId = req.session["userId"];
            const bookId = req.params["id"];
            if (await isIdNotValid(this.book, [bookId], next)) return;

            const book = await this.book //
                .findOne({ _id: bookId, "ratings.from_id": userId })
                .exec();
            if (!book) return next(new HttpError("You did not rate this book."));

            const { acknowledged: successfullBookUpdate } = await this.book
                .updateOne({ _id: bookId }, { $pull: { ratings: { from_id: userId } } })
                .exec();
            if (!successfullBookUpdate) return next(new HttpError("Failed to delete book"));

            const { acknowledged: successfullUserUpdate } = await this.user
                .updateOne({ _id: userId }, { $pull: { rated_books: book?._id } })
                .exec();
            if (!successfullUserUpdate) return next(new HttpError("Failed to update the user"));

            res.sendStatus(StatusCode.NoContent);
        } catch (error) {
            next(new HttpError(error));
        }
    };
}
