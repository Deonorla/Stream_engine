const { expect } = require("chai");

const { createIndexerStore } = require("../services/indexerStore");

describe("Indexer store initialization", function () {
    const originalPostgresUrl = process.env.POSTGRES_URL;

    afterEach(() => {
        if (originalPostgresUrl == null) {
            delete process.env.POSTGRES_URL;
            return;
        }
        process.env.POSTGRES_URL = originalPostgresUrl;
    });

    it("uses the in-memory store when no postgres url is configured", async () => {
        delete process.env.POSTGRES_URL;
        const store = await createIndexerStore({ postgresUrl: "" });
        expect(store.kind).to.equal("memory");
    });

    it("uses the postgres store when a postgres pool can be created", async () => {
        const queries = [];
        const fakePool = {
            async query(sql) {
                queries.push(String(sql));
                return { rows: [] };
            },
        };

        const store = await createIndexerStore({
            postgresUrl: "postgres://example",
            createPgPool: () => fakePool,
        });

        expect(store.kind).to.equal("postgres");
        expect(queries.length).to.be.greaterThan(0);
    });

    it("fails fast when postgres is configured but unavailable", async () => {
        let error = null;
        try {
            await createIndexerStore({
                postgresUrl: "postgres://example",
                createPgPool: () => {
                    throw new Error("connect ECONNREFUSED");
                },
            });
        } catch (caught) {
            error = caught;
        }

        expect(error).to.be.instanceOf(Error);
        expect(error.code).to.equal("persistent_store_required");
        expect(error.message).to.include("Refusing to fall back to in-memory storage");
    });
});
