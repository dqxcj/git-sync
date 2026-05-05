import { DeepSeekMessage, DeepSeekResponse } from "./types";

export class DeepSeekClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = "https://api.deepseek.com") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async chat(messages: DeepSeekMessage[]): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        temperature: 0.3,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
    }

    const data: DeepSeekResponse = await response.json();
    return data.choices[0].message.content;
  }

  async resolveConflict(oursContent: string, theirsContent: string): Promise<string> {
    const messages: DeepSeekMessage[] = [
      {
        role: "system",
        content:
          "You are a Git merge assistant. Merge two conflicting versions of a file. Preserve all meaningful changes from both sides. Output ONLY the merged file content, no explanations, no markdown fences.",
      },
      {
        role: "user",
        content: `<<<<<<< HEAD\n${oursContent}\n=======\n${theirsContent}\n>>>>>>> remote`,
      },
    ];
    return await this.chat(messages);
  }

  async generateCommitMessage(diffs: string[]): Promise<string> {
    const combinedDiff = diffs.join("\n\n---\n\n");
    const messages: DeepSeekMessage[] = [
      {
        role: "system",
        content:
          "You are a commit message generator. Summarize the following git diff(s) into ONE concise commit message in Chinese. Max 50 characters. Output ONLY the commit message, no quotes, no markdown.",
      },
      {
        role: "user",
        content: combinedDiff,
      },
    ];
    return await this.chat(messages);
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }
}
