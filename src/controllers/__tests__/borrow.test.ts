import request, { Response, SuperAgentTest } from "supertest";
import App from "../../app";
import AuthenticationController from "@authentication/index";
import BorrowController from "@controllers/borrow";
import BookController from "@controllers/book";
import userModel from "@models/user";
import bookModel from "@models/book";
import borrowModel from "@models/borrow";
import StatusCode from "@utils/statusCodes";
import { Types } from "mongoose";
import type { Express } from "express";
import type { CreateBorrow, ModifyBorrow } from "@interfaces/borrow";
import type { Borrow } from "@interfaces/borrow";
import type { Book } from "@interfaces/book";
import type { User } from "@interfaces/user";

describe("BORROWS", () => {
    let server: Express;
    const pw = global.MOCK_PASSWORD,
        hpw = global.MOCK_HASHED_PASSWORD,
        mockBookFromUser1Id = new Types.ObjectId(),
        mockBook1FromUser2Id = new Types.ObjectId(),
        mockBook2FromUser2Id = new Types.ObjectId(),
        mockBorrowId = new Types.ObjectId(),
        mockUser1Id = new Types.ObjectId(),
        mockUser2Id = new Types.ObjectId(),
        mockAdminId = new Types.ObjectId(),
        mockBookFromUser1: Partial<Book> = {
            _id: mockBookFromUser1Id,
            uploader: mockUser1Id,
            author: "test",
            title: "test",
            for_borrow: true,
        },
        mockBook1FromUser2: Partial<Book> = {
            _id: mockBook1FromUser2Id,
            uploader: mockUser2Id,
            author: "test",
            title: "test",
            for_borrow: true,
        },
        mockBook2FromUser2: Partial<Book> = {
            _id: mockBook2FromUser2Id,
            uploader: mockUser2Id,
            author: "test",
            title: "test",
            for_borrow: true,
        },
        mockUser1: Partial<User> = {
            _id: mockUser1Id,
            email: "testuser1@test.com",
            password: pw,
            books: [mockBookFromUser1Id],
            borrows: [mockBorrowId],
        },
        mockUser2: Partial<User> = {
            _id: mockUser2Id,
            email: "testuser2@test.com",
            password: pw,
            books: [mockBook1FromUser2Id, mockBook2FromUser2Id],
            borrows: [mockBorrowId],
        },
        mockAdmin: Partial<User> = {
            _id: mockAdminId,
            email: "testadmin@test.com",
            password: pw,
            role: "admin",
            books: [],
            borrows: [],
        },
        mockBorrow: Partial<Borrow> = {
            _id: mockBorrowId,
            from_id: mockUser2Id,
            to_id: mockUser1Id,
            books: [{ _id: mockBook1FromUser2Id, _version: 1 }],
        };

    beforeAll(async () => {
        server = new App([new AuthenticationController(), new BorrowController(), new BookController()]).getServer();
        await userModel.create([
            { ...mockUser1, password: hpw },
            { ...mockUser2, password: hpw },
            { ...mockAdmin, password: hpw },
        ]);
        await bookModel.create([mockBookFromUser1, mockBook1FromUser2, mockBook2FromUser2]);
        await borrowModel.create(mockBorrow);
    });

    describe("BORROWS, not logged in", () => {
        it("any PATH, should return statuscode 401", async () => {
            expect.assertions(5);
            const allRes = await request(server).get(`/borrow/all`);
            const idRes = await request(server).get(`/borrow/:id`);
            const postRes = await request(server).post("/borrow");
            const patchRes = await request(server).patch("/borrow/id");
            const deleteRes = await request(server).delete(`/borrow/id`);
            expect(allRes.statusCode).toBe(StatusCode.Unauthorized);
            expect(idRes.statusCode).toBe(StatusCode.Unauthorized);
            expect(postRes.statusCode).toBe(StatusCode.Unauthorized);
            expect(patchRes.statusCode).toBe(StatusCode.Unauthorized);
            expect(deleteRes.statusCode).toBe(StatusCode.Unauthorized);
        });
    });

    describe("BORROWS, logged in as user", () => {
        let agentForUser1: SuperAgentTest;
        let agentForUser2: SuperAgentTest;
        let mockBorrowForLoggedInUser: Partial<Borrow>;

        beforeAll(async () => {
            agentForUser1 = request.agent(server);
            agentForUser2 = request.agent(server);
            await agentForUser1.post("/auth/login").send({ email: mockUser1.email, password: pw });
            await agentForUser2.post("/auth/login").send({ email: mockUser2.email, password: pw });
        });

        it("GET /borrow/all, should return statuscode 403", async () => {
            expect.assertions(2);
            const res: Response = await agentForUser1.get("/borrow/all");
            expect(res.statusCode).toBe(StatusCode.Forbidden);
            expect(res.body).toBe("Forbidden");
        });
        it("GET /borrow, should return statuscode 200 and array of borrows", async () => {
            expect.assertions(2);
            const res: Response = await agentForUser1.get("/borrow");
            expect(res.statusCode).toBe(StatusCode.OK);
            expect(res.body).toBeInstanceOf(Array<Borrow>);
        });
        it("GET /borrow?userId=id, should return statuscode 403", async () => {
            expect.assertions(2);
            const res: Response = await agentForUser1.get(`/borrow?userId=${mockUser2Id.toString()}`);
            expect(res.statusCode).toBe(StatusCode.Forbidden);
            expect(res.body).toBe("You cannot get other user's borrows.");
        });
        it("GET /borrow?userId=id, should return statuscode 404", async () => {
            expect.assertions(2);
            const mockId = new Types.ObjectId();
            const res: Response = await agentForUser1.get(`/borrow?userId=${mockId.toString()}`);
            expect(res.statusCode).toBe(StatusCode.NotFound);
            expect(res.body).toBe(`This ${mockId} id is not valid.`);
        });
        it("GET /borrow?limit=1, should return statuscode 200 and array of borrows with one borrow in it", async () => {
            expect.assertions(3);
            const book = await bookModel.create({
                _id: new Types.ObjectId(),
                title: "For Limit",
                author: "Jani",
                for_borrow: true,
                uploader: mockUser2Id,
            });
            const borrow = await borrowModel.create({
                _id: new Types.ObjectId(),
                to_id: mockUser1Id,
                from_id: mockUser2Id,
                books: [{ _id: book._id, _version: 1 }],
            });
            await userModel.updateMany(
                { $and: [{ _id: mockUser1Id }, { _id: mockUser2Id }] },
                { $push: { borrows: { _id: borrow._id } } },
            );
            const res: Response = await agentForUser1.get(`/borrow?limit=1`);
            expect(res.statusCode).toBe(StatusCode.OK);
            expect(res.body).toBeInstanceOf(Array<Borrow>);
            expect(res.body.length).toBe(1);
        });
        it("GET /borrow/:id, should return statuscode 200", async () => {
            expect.assertions(2);
            const res: Response = await agentForUser1.get(`/borrow/${mockBorrowId.toString()}`);
            expect(res.statusCode).toBe(StatusCode.OK);
            expect(res.body).toBeInstanceOf(Object as unknown as Borrow);
        });
        it("POST /borrow, should return statuscode 200", async () => {
            expect.assertions(2);
            const mockBorrow: CreateBorrow = {
                from_id: mockUser2Id.toString(),
                books: [{ _id: mockBook2FromUser2Id.toString(), _version: 1 }],
            };
            const res: Response = await agentForUser1.post("/borrow").send(mockBorrow);
            mockBorrowForLoggedInUser = res.body;
            expect(res.statusCode).toBe(StatusCode.OK);
            expect(res.body).toBeInstanceOf(Object as unknown as Borrow);
        });
        it("PATCH /borrow/:id, should return statuscode 401 if logged in user have nothing to do with the borrow", async () => {
            expect.assertions(2);
            const patch: ModifyBorrow = { verified: true };
            const thirdMockUserData = { email: "thirduser@test.com", password: pw };
            await userModel.create({ email: thirdMockUserData.email, password: hpw });
            await request(server).post("/auth/login").send(thirdMockUserData);
            const res: Response = await request(server).patch(`/borrow/${mockBorrowId.toString()}`).send(patch);
            expect(res.statusCode).toBe(StatusCode.Unauthorized);
            expect(res.body).toBe("Unauthorized");
        });
        it("PATCH /borrow/:id, should return statuscode 200 if logged in user who is lending the book and modify 'verified'", async () => {
            expect.assertions(2);
            const patch: ModifyBorrow = { verified: true };
            const res: Response = await agentForUser2.patch(`/borrow/${mockBorrowId.toString()}`).send(patch);
            expect(res.statusCode).toBe(StatusCode.OK);
            expect(res.body).toBeInstanceOf(Object as unknown as Borrow);
        });
        it("PATCH /borrow/:id, should return statuscode 401 if logged in user who is borrowing the book and modify 'verified'", async () => {
            expect.assertions(2);
            const patch: ModifyBorrow = { verified: true };
            const res: Response = await agentForUser1
                .patch(`/borrow/${mockBorrowForLoggedInUser._id?.toString()}`)
                .send(patch);
            expect(res.statusCode).toBe(StatusCode.Unauthorized);
            expect(res.body).toBe("You can not modify this value");
        });
        it("PATCH /borrow/:id, should return statuscode 200 if logged in user who is borrowing the book and modify the 'books'", async () => {
            expect.assertions(2);
            const patch: ModifyBorrow = {
                books: [
                    { _id: mockBook1FromUser2Id.toString(), _version: 1 },
                    { _id: mockBook2FromUser2Id.toString(), _version: 1 },
                ],
            };
            const res: Response = await agentForUser1
                .patch(`/borrow/${mockBorrowForLoggedInUser._id?.toString()}`)
                .send(patch);
            expect(res.statusCode).toBe(StatusCode.OK);
            expect(res.body).toBeInstanceOf(Object as unknown as Borrow);
        });
        it("DELETE /borrow/:id, should return statuscode 403", async () => {
            expect.assertions(1);
            const res: Response = await agentForUser1.delete(`/borrow/${mockBorrowForLoggedInUser._id}`);
            expect(res.statusCode).toBe(StatusCode.Forbidden);
        });
    });

    describe("BORROWS, logged in as admin", () => {
        let agent: SuperAgentTest;

        beforeAll(async () => {
            agent = request.agent(server);
            await agent.post("/auth/login").send({ email: mockAdmin.email, password: pw });
        });

        it("GET /borrow?userId=id&sort=asc&sortBy=title, should return statuscode 200", async () => {
            expect.assertions(3);
            const book = await bookModel.create({
                _id: new Types.ObjectId(),
                title: "Admin",
                author: "Zsolti",
                for_borrow: true,
                uploader: mockUser1Id,
            });
            const borrow = await borrowModel.create({
                _id: new Types.ObjectId(),
                to_id: mockUser2Id,
                from_id: mockUser1Id,
                books: [{ _id: book._id, _version: 1 }],
            });
            await userModel.updateMany(
                { $and: [{ _id: mockUser1Id }, { _id: mockUser2Id }] },
                { $push: { borrows: { _id: borrow._id } } },
            );
            const res: Response = await agent.get(`/borrow?userId=${mockUser2Id}&sort=asc&sortBy=createdAt`);
            expect(res.statusCode).toBe(StatusCode.OK);
            expect(res.body).toBeInstanceOf(Array<Borrow>);
            expect(res.body[res.body.length - 1].createdAt).toBe(borrow.createdAt.toISOString());
        });
        it("GET /borrow?userId=id, should return statuscode 200", async () => {
            expect.assertions(2);
            const res: Response = await agent.get(`/borrow?userId=${mockUser1Id}`);
            expect(res.statusCode).toBe(StatusCode.OK);
            expect(res.body).toBeInstanceOf(Array<Borrow>);
        });
        it("GET /borrow/all, should return statuscode 200", async () => {
            expect.assertions(2);
            const res: Response = await agent.get("/borrow/all");
            expect(res.statusCode).toBe(StatusCode.OK);
            expect(res.body).toBeInstanceOf(Array<Borrow>);
        });
        it("PATCH /borrow/:id, should return statuscode 200", async () => {
            expect.assertions(2);
            const patch: ModifyBorrow = { verified: true };
            const res: Response = await agent.patch(`/borrow/${mockBorrowId}`).send(patch);
            expect(res.statusCode).toBe(StatusCode.OK);
            expect(res.body).toBeInstanceOf(Object as unknown as Borrow);
        });
        it("DELETE /borrow/:id, should return statuscode 200", async () => {
            expect.assertions(1);
            const res: Response = await agent.delete(`/borrow/${mockBorrowId}`);
            expect(res.statusCode).toBe(StatusCode.NoContent);
        });
    });
});
