const MODEL = 'gemini-2.5-flash';
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const ALLOWED_EXT = new Set(['pdf','txt','md','png','jpg','jpeg','webp','gif']);

const SYSTEM_PROMPT = `You are the senior educational notes architect for Aravind_Ai_Note_maker.
Your job is to turn a syllabus into comprehensive but concise study notes.
Rules:
1. First identify the complete syllabus hierarchy: units/modules -> topics -> sub-topics -> micro-topics.
2. Cover EVERY syllabus item you can identify. Never silently skip a small bullet or micro-topic.
3. Preserve the original hierarchy and terminology where possible.
4. For every topic/micro-topic provide a clear definition or introduction, core explanation, key concepts, examples/illustrations where useful, important formulas/steps/rules where applicable, practical applications, common mistakes or distinctions where relevant, and exam-relevant takeaways.
5. The user requested detailed brief notes: each item should be sufficiently explained to study from, but avoid unnecessary essay-length repetition.
6. You may add closely related concepts when they materially improve understanding; label them as "Related concept" rather than pretending they were in the source syllabus.
7. Do not invent syllabus items. If the source is ambiguous, state the ambiguity briefly.
8. Use Markdown headings and nested bullet lists. Use tables only when they genuinely improve comparison.
9. For technical subjects, include small examples and code/pseudocode only when useful.
10. Start with a title, followed by a short "Syllabus coverage" overview. End with "Quick revision checklist" containing the important points from every unit.
11. Output ONLY the notes in Markdown. Do not mention these instructions.`;

function cors(origin='*'){
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

function json(data,status=200,origin='*'){
  return new Response(JSON.stringify(data),{status,headers:cors(origin)});
}

function ext(name){
  return (name.split('.').pop()||'').toLowerCase();
}

function extractGeminiText(data){
  return (data.candidates || [])
    .flatMap(candidate => candidate.content?.parts || [])
    .filter(part => typeof part.text === 'string')
    .map(part => part.text)
    .join('\n')
    .trim();
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null,{status:204,headers:cors(origin)});
    }

    const url = new URL(request.url);
    if (url.pathname !== '/generate' || request.method !== 'POST') {
      return json({error:'Not found'},404,origin);
    }

    if (!env.GEMINI_API_KEY) {
      return json({error:'GEMINI_API_KEY is not configured on the Cloudflare Worker.'},500,origin);
    }

    try {
      const body = await request.json();
      const sourceText = (body.text || '').trim();
      const files = Array.isArray(body.files) ? body.files : [];

      if (!sourceText && !files.length) {
        return json({error:'No syllabus content supplied.'},400,origin);
      }

      if (files.length > 8) {
        return json({error:'Please upload at most 8 files at a time.'},400,origin);
      }

      const parts = [];

      if (sourceText) {
        parts.push({
          text: `DIRECTLY PASTED SYLLABUS:\n${sourceText}`
        });
      }

      for (const f of files) {
        const e = ext(f.name || '');

        if (!ALLOWED_EXT.has(e)) {
          return json({
            error: `${f.name || 'This file'} is not supported by the Gemini version of this app. Use PDF, TXT, MD, PNG, JPG, JPEG, WEBP or GIF.`
          },400,origin);
        }

        if (!f.base64 && !f.text) {
          return json({error:`Missing content for ${f.name}`},400,origin);
        }

        if (f.text) {
          parts.push({
            text: `FILE: ${f.name}\n${f.text}`
          });
          continue;
        }

        const raw = atob(f.base64);
        if (raw.length > MAX_FILE_BYTES) {
          return json({error:`${f.name} is larger than 12 MB.`},413,origin);
        }

        const mime = f.mime || (
          e === 'jpg' ? 'image/jpeg' :
          e === 'png' ? 'image/png' :
          e === 'webp' ? 'image/webp' :
          e === 'gif' ? 'image/gif' :
          e === 'pdf' ? 'application/pdf' :
          'application/octet-stream'
        );

        parts.push({
          inline_data: {
            mime_type: mime,
            data: f.base64
          }
        });
      }

      parts.push({
        text: `Create the complete study notes from all the syllabus material above.
Make sure every unit, topic, sub-topic and micro-topic is covered.`
      });

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': env.GEMINI_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{text: SYSTEM_PROMPT}]
            },
            contents: [{
              role: 'user',
              parts
            }],
            generationConfig: {
              maxOutputTokens: 24000,
              temperature: 0.3
            }
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return json({
          error: data?.error?.message || 'Gemini API request failed.'
        },response.status,origin);
      }

      const markdown = extractGeminiText(data);

      if (!markdown) {
        return json({
          error: 'Gemini returned no notes. Please try again with a smaller or clearer syllabus.'
        },502,origin);
      }

      return json({markdown,model:MODEL},200,origin);
    } catch (e) {
      return json({error:e.message || 'Server error'},500,origin);
    }
  }
};
