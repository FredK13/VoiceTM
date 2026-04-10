/*
  Warnings:

  - A unique constraint covering the columns `[fromUserId,toUserId]` on the table `ConversationInvite` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "ConversationInvite" DROP CONSTRAINT "ConversationInvite_conversationId_fkey";

-- DropIndex
DROP INDEX "ConversationInvite_conversationId_toUserId_key";

-- AlterTable
ALTER TABLE "ConversationInvite" ALTER COLUMN "conversationId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ConversationInvite_fromUserId_status_idx" ON "ConversationInvite"("fromUserId", "status");

-- CreateIndex
CREATE INDEX "ConversationInvite_conversationId_idx" ON "ConversationInvite"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationInvite_fromUserId_toUserId_key" ON "ConversationInvite"("fromUserId", "toUserId");

-- AddForeignKey
ALTER TABLE "ConversationInvite" ADD CONSTRAINT "ConversationInvite_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
