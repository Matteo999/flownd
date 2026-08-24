export function geminiStructuredGenerationConfig(model, schema, maxOutputTokens) {
  const shared = {
    ...(String(model).startsWith('gemini-3')
      ? { thinkingConfig: { thinkingLevel: 'LOW' } }
      : {}),
    ...(maxOutputTokens ? { maxOutputTokens } : {}),
  }
  if (String(model).startsWith('gemini-3.7')) {
    return {
      ...shared,
      responseFormat: {
        text: { mimeType: 'APPLICATION_JSON', schema },
      },
    }
  }
  return {
    ...shared,
    responseMimeType: 'application/json',
    responseJsonSchema: schema,
  }
}
