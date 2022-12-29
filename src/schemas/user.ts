import { Schema } from "mongoose";
import type { User } from "@interfaces/user";
import paginate from "mongoose-paginate-v2";

const userSchema = new Schema<User>(
    {
        username: { type: String },
        fullname: { type: String },
        password: { type: String, required: true, select: 0 },
        email: { type: String, required: true },
        email_is_verified: { type: Boolean, default: false },
        locale: { type: String, default: "hu-HU" },
        picture: { type: String },
        role: { type: String },
        books: [{ type: Schema.Types.ObjectId, ref: "Book" }],
        rated_books: [{ type: Schema.Types.ObjectId, ref: "Book" }],
        messages: [{ type: Schema.Types.ObjectId, ref: "Message" }],
        borrows: [{ type: Schema.Types.ObjectId, ref: "Borrow" }],
        user_ratings: {
            from_me: [{ type: Schema.Types.ObjectId, ref: "UserRating" }],
            to_me: [{ type: Schema.Types.ObjectId, ref: "UserRating" }],
        },
    },
    { timestamps: true, versionKey: false },
);

userSchema.statics["getInitialData"] = function (userId: string): User {
    return this.findById(userId)
        .populate(["borrows", "rated_books", "books"])
        .populate({
            path: "messages",
            options: {
                projection: {
                    message_contents: { $slice: -25 },
                },
            },
            populate: {
                path: "users",
                select: "fullname username email picture",
            },
        })
        .populate({ path: "user_ratings", populate: { path: "from_me to_me" } })
        .exec();
};

userSchema.plugin(paginate);

export default userSchema;
