import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const todosTable = pgTable("todos", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  todo: text().notNull(),
  createdAt: timestamp('createdAt').defaultNow(), 
  updatedAt: timestamp('updatedAt').$onUpdate(() => new Date()),
});
