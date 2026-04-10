-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "audioDurantionMs" INTEGER,
ADD COLUMN     "audioURL" TEXT,
ADD COLUMN     "readAt" TIMESTAMP(3);
