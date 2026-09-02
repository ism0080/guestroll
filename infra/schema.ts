import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  ownerId: text("ownerId").notNull(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  coverKey: text("coverKey"),
  filterPack: text("filterPack").notNull(),
  photoLimit: integer("photoLimit").notNull(),
  status: text("status").notNull(),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull()
})

export const cameras = sqliteTable("cameras", {
  id: text("id").primaryKey(),
  eventId: text("eventId")
    .notNull()
    .references(() => events.id),
  guestName: text("guestName"),
  usedCount: integer("usedCount").notNull().default(0),
  createdAt: text("createdAt").notNull()
})

export const photos = sqliteTable("photos", {
  id: text("id").primaryKey(),
  eventId: text("eventId")
    .notNull()
    .references(() => events.id),
  cameraId: text("cameraId")
    .notNull()
    .references(() => cameras.id),
  objectKey: text("objectKey").notNull(),
  thumbKey: text("thumbKey").notNull(),
  takenAt: text("takenAt").notNull()
})