-- CreateEnum
CREATE TYPE "RejoinInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "ConversationMember" ADD COLUMN     "leftAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ConversationRejoinInvite" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" "RejoinInviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationRejoinInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversationRejoinInvite_toUserId_status_idx" ON "ConversationRejoinInvite"("toUserId", "status");

-- CreateIndex
CREATE INDEX "ConversationRejoinInvite_fromUserId_status_idx" ON "ConversationRejoinInvite"("fromUserId", "status");

-- CreateIndex
CREATE INDEX "ConversationRejoinInvite_conversationId_idx" ON "ConversationRejoinInvite"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationRejoinInvite_conversationId_toUserId_key" ON "ConversationRejoinInvite"("conversationId", "toUserId");

-- CreateIndex
CREATE INDEX "ConversationMember_userId_leftAt_idx" ON "ConversationMember"("userId", "leftAt");

-- CreateIndex
CREATE INDEX "ConversationMember_conversationId_leftAt_idx" ON "ConversationMember"("conversationId", "leftAt");

-- AddForeignKey
ALTER TABLE "ConversationRejoinInvite" ADD CONSTRAINT "ConversationRejoinInvite_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationRejoinInvite" ADD CONSTRAINT "ConversationRejoinInvite_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationRejoinInvite" ADD CONSTRAINT "ConversationRejoinInvite_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
