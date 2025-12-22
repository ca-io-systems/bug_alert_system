import { OpenAI } from 'openai';

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are an AI analyst for a product feedback system. Analyze Discord messages for:
1. Bug reports and issues
2. Feature requests
3. User complaints
4. Positive feedback
5. Documentation requests

For each message, respond with a JSON object containing:
{
  "requiresAlert": boolean,
  "category": "bug|feature_request|complaint|praise|documentation|other",
  "severity": "critical|high|medium|low" (only for bugs/complaints),
  "summary": "Brief one-line summary",
  "recommendation": "Suggested action or response"
}

Only set requiresAlert to true if the message contains actionable feedback:
- Bugs or technical issues
- Clear feature requests
- Strong user complaints
- Documentation gaps (e.g., users asking how to do basic things that should be documented)

Ignore general chat, casual greetings, or off-topic conversations.`;

export async function analyzeMessageWithLLM(messageContent) {
    try {
        console.log('🤖 AI is analyzing message content...');
        const response = await client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: SYSTEM_PROMPT,
                },
                {
                    role: 'user',
                    content: messageContent,
                },
            ],
            temperature: 0.7,
            max_tokens: 300,
        });

        const content = response.choices[0].message.content;
        console.log('✅ AI analysis complete');

        // Parse JSON response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.warn('⚠️ Could not parse LLM response as JSON');
            return {
                requiresAlert: false,
                category: 'other',
                summary: 'Analysis inconclusive',
                recommendation: 'Review manually',
            };
        }

        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        console.error('❌ LLM analysis error:', error);
        throw error;
    }
}
