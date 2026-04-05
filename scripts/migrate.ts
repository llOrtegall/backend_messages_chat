import { migrate } from "../src/infrastructure/db/migrator.ts";

await migrate();
process.exit(0);
