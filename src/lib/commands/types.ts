export interface Command {
  id: string;
  prefix: string;
  title: string;
  description: string;
  icon?: string;
  run: (input: string) => void;
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export interface CalcHistoryEntry {
  id: string;
  expression: string;
  result: string;
  createdAt: number;
}

export interface CommandMatch {
  command: Command;
  rest: string;
}
