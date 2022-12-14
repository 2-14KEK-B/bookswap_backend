import request, { Response, SuperAgentTest } from "supertest";
import App from "../../app";
import AuthenticationController from "@authentication/index";
import userModel from "@models/user";
import StatusCode from "@utils/statusCodes";
import type { Express } from "express";
import type { User } from "@interfaces/user";

describe("POST /auth/logout", () => {
    let server: Express;
    let agent: SuperAgentTest;
    const pw = global.MOCK_PASSWORD,
        hpw = global.MOCK_HASHED_PASSWORD,
        mockUser: Partial<User> = { email: "test@test.com", password: pw };

    beforeAll(async () => {
        server = new App([new AuthenticationController()]).getServer();
        agent = request.agent(server);
        await userModel.create({ email: mockUser.email, password: hpw });
    });

    it("returns statuscode 401 if not already logged in", async () => {
        expect.assertions(3);
        const res: Response = await request(server).post("/auth/logout");
        expect(res.statusCode).toEqual(StatusCode.Unauthorized);
        expect(res.body).toEqual("Unauthorized");
        expect(res.headers["set-cookie"]).toBeFalsy();
    });

    it("returns statuscode 200 if logout successfully", async () => {
        expect.assertions(2);
        await agent.post("/auth/login").send({ email: mockUser.email, password: pw });
        const res: Response = await agent.post("/auth/logout");
        expect(res.statusCode).toEqual(StatusCode.OK);
        expect(res.body).toEqual("Logged out successfully.");
    });
});
