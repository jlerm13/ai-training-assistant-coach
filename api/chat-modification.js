export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { message, currentProgram } = req.body;
    
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [{
                    role: 'system',
                    content: `You are a Three Anchor training methodology expert. Respond to program modification requests while maintaining ME/DE/SE/RE principles, CNS load management, and Vertical Integration sequencing (Speed→Power→Strength→Hypertrophy→Endurance). Provide specific, actionable guidance in under 100 words.`
                }, {
                    role: 'user',
                    content: `Current program summary: ${JSON.stringify(currentProgram, null, 2)}\n\nUser request: ${message}`
                }],
                max_tokens: 150,
                temperature: 0.3
            })
        });

        if (!response.ok) {
            throw new Error('OpenAI API request failed');
        }

        const data = await response.json();
        res.json({ response: data.choices[0].message.content });
    } catch (error) {
        console.error('LLM API Error:', error);
        res.status(500).json({ error: 'Failed to process request' });
    }
}
