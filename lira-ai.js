const PERSONAL_QUESTION_PATTERN =
  /\b(?:my|mine|myself|me|i have|i am|i borrowed|i owe|student id|employee id|email address|password|my qr|my credential|my due date|my reservation|my penalty|my loan|my account)\b/i;
const PRIVATE_DATA_PATTERN = /\d|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/;

function isPersonalLiraQuestion(question) {
  return PERSONAL_QUESTION_PATTERN.test(question) || PRIVATE_DATA_PATTERN.test(question);
}

function readAnswer(data) {
  if (typeof data.output_text === 'string') return data.output_text.trim();

  return (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join('\n');
}

async function requestLiraAiAnswer({
  question,
  role,
  publicFaqs,
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.LIRA_AI_MODEL || 'gpt-4o-mini',
  fetchImpl = globalThis.fetch,
  timeoutMs = 12000,
}) {
  const key = String(apiKey || '').trim();
  if (!key || isPersonalLiraQuestion(question)) return null;
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable for LIRA AI.');

  const roleGuidance = {
    student: 'Help with books, reservations, QR access, borrowing, penalties, and registration.',
    teacher: 'Help teachers with the catalog, reservations, loans, borrowing limits, and QR access.',
    librarian: 'Help librarians with inventory, circulation, checkouts, returns, conditions, and reports.',
    administrator: 'Help administrators with applications, users, semesters, credentials, and monitoring.',
  }[role] || 'Help with ACLC Library workflows.';

  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      instructions: `You are LIRA, the ACLC Smart Library assistant. Role: ${role}. ${roleGuidance} Answer in concise, friendly steps. Treat the supplied FAQ as the only authoritative school policy. Never invent limits, loan durations, fees, approvals, or account status. If the FAQ does not answer a policy question, tell the user to ask library staff. Do not claim to perform actions; direct users to the relevant app page. Do not request passwords or QR secrets.`,
      input: `Verified student FAQ knowledge:\n${JSON.stringify(publicFaqs)}\n\nQuestion:\n${question}`,
      max_output_tokens: 220,
    }),
  });

  if (!response.ok) throw new Error(`LIRA AI provider returned HTTP ${response.status}.`);
  const data = await response.json();
  const answer = readAnswer(data);
  if (!answer) throw new Error('LIRA AI provider returned an empty answer.');
  return answer.slice(0, 2000);
}

module.exports = { isPersonalLiraQuestion, requestLiraAiAnswer };
