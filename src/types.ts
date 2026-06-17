export type UserRole = "Mr" | "Mrs";

export interface Review {
  id: string;
  message: string;
  createdAt: any; // ServerTimestamp or Date
}

export interface ChatMessage {
  id: string;
  sender: UserRole;
  text: string;
  type: "text" | "image" | "video";
  mediaData: string; // Base64 data-url
  createdAt: any;    // ServerTimestamp or Date
  seen: boolean;
  delivered: boolean;
  read?: boolean;
}

export type ActivePage = "main" | "auth" | "chat";
