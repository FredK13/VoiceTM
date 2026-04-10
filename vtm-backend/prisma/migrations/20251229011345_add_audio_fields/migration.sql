/*
  Warnings:

  - You are about to drop the column `audioDurantionMs` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `audioURL` on the `Message` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Message" DROP COLUMN "audioDurantionMs",
DROP COLUMN "audioURL",
ADD COLUMN     "audioDurationMs" INTEGER,
ADD COLUMN     "audioUrl" TEXT;
