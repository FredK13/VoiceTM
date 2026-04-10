-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "ConversationInvite" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversationInvite_toUserId_status_idx" ON "ConversationInvite"("toUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationInvite_conversationId_toUserId_key" ON "ConversationInvite"("conversationId", "toUserId");

-- AddForeignKey
ALTER TABLE "ConversationInvite" ADD CONSTRAINT "ConversationInvite_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationInvite" ADD CONSTRAINT "ConversationInvite_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationInvite" ADD CONSTRAINT "ConversationInvite_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
