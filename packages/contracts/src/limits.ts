export const API_LIMITS = {
  requestBytes: 1_048_576,
  featuresPerSubmission: 100,
  propertyCount: 200,
  propertyKeyCharacters: 100,
  propertyStringCharacters: 2_000,
  messageCharacters: 500,
  imagesPerSubmission: 5,
  imageBytes: 5 * 1_048_576,
  roomMembers: 100,
  webSocketMessageBytes: 64 * 1_024,
} as const;
