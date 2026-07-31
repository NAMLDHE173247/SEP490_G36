import { ILlmProvider } from './ILlmProvider';

/** Pins a model selected by the UI without coupling domain services to providers. */
export class FixedModelProvider implements ILlmProvider {
  constructor(private readonly inner: ILlmProvider, private readonly model: string) {}

  generateContent(prompt: string, _modelOverride?: string, systemPrompt?: string): Promise<string> {
    return this.inner.generateContent(prompt, this.model, systemPrompt);
  }
}
