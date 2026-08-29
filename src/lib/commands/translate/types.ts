export type DictPart = {
  part: string;
  means: string[];
};

export type TranslateExample = {
  orig: string;
  trans: string;
};

export type TranslateResponse = {
  from: string;
  to: string;
  sourceText: string;
  translatedText: string;
  phonetic?: string | null;
  parts: DictPart[];
  sentences: TranslateExample[];
  hasDict: boolean;
};
