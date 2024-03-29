import type { MongoMemoryServer } from "mongodb-memory-server";

export default async function globalTeardown() {
    // Config to decided if an mongodb-memory-server instance should be used
    if (global.mongoInstance) {
        const instance: MongoMemoryServer = global.mongoInstance;
        await instance.stop({ doCleanup: true });
    }
}
