export type EmojiCategoryId =
  | "people"
  | "nature"
  | "foods"
  | "activity"
  | "places"
  | "objects"
  | "symbols"
  | "flags";

export type EmojiCategory = {
  id: EmojiCategoryId;
  name: string;
  icon: string;
};

export type EmojiItem = {
  id: string;
  name: string;
  native: string;
  keywords: string[];
  emoticons: string[];
};
