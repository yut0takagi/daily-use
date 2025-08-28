import OpenAI from 'openai'

let _openai = null
function getClient() {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is required')
  if (!_openai) _openai = new OpenAI({ apiKey: key })
  return _openai
}

const MODEL_TEXT = process.env.OPENAI_LLM_MODEL || 'gpt-4o-mini'
const MODEL_TTS = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts'
const TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'alloy'

export async function generateSummaryJa({ title, summary, authors, link }) {
  const sys = `あなたは厳密で簡潔な技術ライターです。論文の背景・課題・手法・結果・限界を日本語でMarkdownとして要約してください。`;
  const user = `論文情報:
タイトル: ${title}
著者: ${authors.join(', ')}
arXiv: ${link}
概要(英語): ${summary}

出力要件:
- Markdown見出しと箇条書きを活用
- 必ず「限界 / 今後の展望」を含める
- 200-350日本語単語程度
`;
  const res = await getClient().chat.completions.create({
    model: MODEL_TEXT,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
    temperature: 0.4,
  })
  return res.choices[0]?.message?.content?.trim() || ''
}

export async function generatePodcastScriptJa({ title, authors, link, summaryJa }) {
  const sys = `あなたは日本語のPodcast台本作家です。丁寧だが親しみやすい口語で、500–900字の原稿を作成します。`
  const user = `次の論文を1本のPodcast原稿にしてください。
条件:
- 冒頭に論文タイトルを自然に紹介
- 著者名とarXivリンクを言及
- 背景→貢献→仕組み→結果→限界→締め、の流れ
- 専門用語は簡単に噛み砕く
- 一文は短く、リズム良く

タイトル: ${title}
著者: ${authors.join(', ')}
リンク: ${link}
要約(素材):
${summaryJa}
`;
  const res = await getClient().chat.completions.create({
    model: MODEL_TEXT,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
    temperature: 0.7,
  })
  return res.choices[0]?.message?.content?.trim() || ''
}

export async function synthesizeTtsMp3(text) {
  const response = await getClient().audio.speech.create({
    model: MODEL_TTS,
    voice: TTS_VOICE,
    input: text,
    format: 'mp3',
  })
  const buf = Buffer.from(await response.arrayBuffer())
  return buf
}
