import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing");
}

export default defineConfig({
    schema: ["./src/db/schema.ts", "./src/db/credit-products-schema.ts", "./src/db/likelemba-groups-schema.ts", "./src/db/card-schema.ts", "./src/db/contracts-schema.ts"],
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL,
    },
});
