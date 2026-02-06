import { z } from "zod";

export const SpeechProviderIdSchema = z.enum(["openai", "local"]);
export type SpeechProviderId = z.infer<typeof SpeechProviderIdSchema>;

export type RequestedSpeechProviders = {
  dictationSttProvider: SpeechProviderId;
  voiceSttProvider: SpeechProviderId;
  voiceTtsProvider: SpeechProviderId;
};
