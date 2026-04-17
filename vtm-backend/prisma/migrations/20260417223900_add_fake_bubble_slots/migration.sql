/*
  Warnings:

  - A unique constraint covering the columns `[userId,slot]` on the table `FakeBubble` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `slot` to the `FakeBubble` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "FakeBubbleSlot" AS ENUM ('SLOT_1', 'SLOT_2', 'SLOT_3', 'SLOT_4');

-- AlterTable
ALTER TABLE "FakeBubble" ADD COLUMN     "slot" "FakeBubbleSlot" NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "FakeBubble_userId_slot_key" ON "FakeBubble"("userId", "slot");
