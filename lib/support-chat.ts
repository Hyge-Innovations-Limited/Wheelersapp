import { apiRequest } from "@/lib/api";

/** One message in a chat with Wheelers support. */
export type SupportMessage = {
  id: string;
  from: "you" | "support";
  /** The support person's name on their messages: "Ada". */
  senderName: string | null;
  content: string;
  createdAt: string;
};

export type SupportConversation = {
  id: string;
  status: "open" | "resolved";
  topic: string | null;
  rideId: string | null;
  /** Who is answering, once someone has. */
  agentName: string | null;
  createdAt: string;
};

export type SupportChat = {
  conversation: SupportConversation | null;
  messages: SupportMessage[];
};

export const SUPPORT_MESSAGE_MAX = 1000;

/** The person's conversation with support. Opening it marks replies as read. */
export function getSupportChat(accessToken: string): Promise<SupportChat> {
  return apiRequest<SupportChat>("GET", "/support/chat", {
    accessToken,
    fallbackError: "We could not load your chat. Please try again.",
  });
}

export function sendSupportMessage(input: {
  accessToken: string;
  content: string;
  rideId?: string | null;
  topic?: string | null;
}): Promise<{ conversation: SupportConversation; message: SupportMessage }> {
  return apiRequest("POST", "/support/chat/messages", {
    accessToken: input.accessToken,
    body: { content: input.content, rideId: input.rideId ?? undefined, topic: input.topic ?? undefined },
    fallbackError: "Your message was not sent. Please try again.",
  });
}

/**
 * The newer of two copies of a chat's messages, in order, with nothing twice:
 * what is on screen merged with what the server just returned.
 */
export function mergeSupportMessages(shown: SupportMessage[], fetched: SupportMessage[]): SupportMessage[] {
  const byId = new Map<string, SupportMessage>();
  for (const message of shown) byId.set(message.id, message);
  for (const message of fetched) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** "6:34 pm" for a message's time. */
export function messageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? "am" : "pm"}`;
}
