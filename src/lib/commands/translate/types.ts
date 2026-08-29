export type DictPart = {
  part: string;
  means: string[];
};

export type TranslateExample = {
  orig: string;
  trans: string;
};

export type WordForm = {
  kind: string;
  values: string[];
};

export type TranslateResponse = {
  from: string;
  to: string;
  sourceText: string;
  translatedText: string;
  phonetic?: string | null;
  phoneticUk?: string | null;
  phoneticUs?: string | null;
  tags: string[];
  forms: WordForm[];
  similar: string[];
  parts: DictPart[];
  sentences: TranslateExample[];
  hasDict: boolean;
};
