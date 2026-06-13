// Claude API integration — key stored in localStorage only, never committed

const CLAUDE_MODEL = 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';

function getKey() {
  return localStorage.getItem('claude_api_key') || '';
}

// Stream a response token-by-token, calling onChunk(text) per delta
export async function streamMessage({ system, userPrompt, onChunk, onDone, onError }) {
  const key = getKey();
  if (!key) {
    onError?.('No Claude API key set. Click ⚙ Config to add one.');
    return;
  }

  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 512,
        stream: true,
        system,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      onError?.(err?.error?.message || `API error ${resp.status}`);
      return;
    }

    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (raw === '[DONE]') continue;
        try {
          const obj = JSON.parse(raw);
          if (obj.type === 'content_block_delta' && obj.delta?.type === 'text_delta') {
            onChunk?.(obj.delta.text);
          }
        } catch {}
      }
    }
    onDone?.();
  } catch (e) {
    onError?.(e.message || 'Network error');
  }
}

// One-shot summarise a news article
export async function summariseArticle(headline, description) {
  return new Promise((resolve, reject) => {
    let out = '';
    streamMessage({
      system: 'You are a sharp sports journalist covering FIFA World Cup 2026. Write concise, energetic 2-sentence summaries. No fluff.',
      userPrompt: `Summarise this World Cup news story in 2 vivid sentences:\nHeadline: ${headline}\n${description ? 'Description: ' + description : ''}`,
      onChunk: t => { out += t; },
      onDone: () => resolve(out.trim()),
      onError: reject,
    });
  });
}

// Stream match analysis into an element
export async function streamMatchAnalysis(matchInfo, targetEl) {
  targetEl.innerHTML = '<span class="cursor"></span>';
  let text = '';

  await streamMessage({
    system: 'You are an expert football analyst covering the FIFA World Cup 2026. Deliver punchy, insightful analysis in 3-4 short paragraphs. Use concrete details. No filler phrases.',
    userPrompt: `Provide tactical analysis and storylines for this World Cup match:\n${JSON.stringify(matchInfo, null, 2)}`,
    onChunk: (chunk) => {
      text += chunk;
      targetEl.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') + '<span class="cursor"></span>';
    },
    onDone: () => {
      targetEl.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    },
    onError: (err) => {
      targetEl.textContent = '⚠ ' + err;
    },
  });
}

// Stream a tournament overview / daily digest
export async function streamDailyDigest(matches, targetEl) {
  targetEl.innerHTML = '<span class="cursor"></span>';
  let text = '';

  const summary = matches.slice(0, 6).map(m =>
    `${m.away.flag}${m.away.name} ${m.away.score} – ${m.home.score} ${m.home.flag}${m.home.name} (${m.statusText})`
  ).join('\n');

  await streamMessage({
    system: 'You are an expert football journalist. Write a lively 3-paragraph World Cup daily digest. Lead with the biggest result, then tactical insight, then what to watch next. Be energetic and specific.',
    userPrompt: `Today's World Cup 2026 matches:\n${summary || 'No matches yet today.'}\n\nWrite the daily digest.`,
    onChunk: (chunk) => {
      text += chunk;
      targetEl.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') + '<span class="cursor"></span>';
    },
    onDone: () => {
      targetEl.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    },
    onError: (err) => {
      targetEl.textContent = '⚠ ' + err;
    },
  });
}
