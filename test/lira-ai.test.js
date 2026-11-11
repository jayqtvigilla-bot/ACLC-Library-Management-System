const test = require('node:test');
const assert = require('node:assert/strict');
const { isPersonalLiraQuestion, requestLiraAiAnswer } = require('../lira-ai');

const requestOptions = {
  apiKey: 'test-key',
  question: 'How do I reserve a book?',
  role: 'student',
  publicFaqs: [{ question: 'How do I reserve a book?', answer: 'Open Books and tap Reserve.' }],
};

test('does not call the AI provider when no server key is configured', async () => {
  let called = false;
  const answer = await requestLiraAiAnswer({
    ...requestOptions,
    apiKey: '',
    fetchImpl: async () => { called = true; },
  });

  assert.equal(answer, null);
  assert.equal(called, false);
});

test('keeps account-specific questions on the private local path', async () => {
  assert.equal(isPersonalLiraQuestion('What is my current due date?'), true);
  assert.equal(isPersonalLiraQuestion('How do I reserve a book?'), false);

  let called = false;
  const answer = await requestLiraAiAnswer({
    ...requestOptions,
    question: 'What is my current due date?',
    fetchImpl: async () => { called = true; },
  });

  assert.equal(answer, null);
  assert.equal(called, false);
});

test('sends only the question and published FAQ guidance to the AI provider', async () => {
  let requestUrl;
  let requestInit;
  const answer = await requestLiraAiAnswer({
    ...requestOptions,
    fetchImpl: async (url, init) => {
      requestUrl = url;
      requestInit = init;
      return {
        ok: true,
        json: async () => ({ output_text: 'Open Books, find the title, and choose Reserve.' }),
      };
    },
  });

  assert.equal(requestUrl, 'https://api.openai.com/v1/responses');
  assert.equal(requestInit.method, 'POST');
  assert.equal(requestInit.headers.Authorization, 'Bearer test-key');
  assert.equal(answer, 'Open Books, find the title, and choose Reserve.');
  assert.equal(requestInit.signal.aborted, false);
  const body = JSON.parse(requestInit.body);
  assert.match(body.input, /How do I reserve a book/);
  assert.match(body.input, /Open Books and tap Reserve/);
  assert.doesNotMatch(body.input, /student id|password|email address/i);
});

test('reads text from the Responses API output content when output_text is omitted', async () => {
  const answer = await requestLiraAiAnswer({
    ...requestOptions,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        output: [{ content: [{ type: 'output_text', text: 'Ask a librarian for policy details.' }] }],
      }),
    }),
  });

  assert.equal(answer, 'Ask a librarian for policy details.');
});

test('reports provider and empty-answer failures for the server fallback to handle', async () => {
  await assert.rejects(
    requestLiraAiAnswer({
      ...requestOptions,
      fetchImpl: async () => ({ ok: false, status: 429 }),
    }),
    /HTTP 429/,
  );
  await assert.rejects(
    requestLiraAiAnswer({
      ...requestOptions,
      fetchImpl: async () => ({ ok: true, json: async () => ({ output_text: '  ' }) }),
    }),
    /empty answer/,
  );
});
