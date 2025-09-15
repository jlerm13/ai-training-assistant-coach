export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { message, currentProgram, userProfile } = req.body;
    
    // Basic input validation
    if (!message || typeof message !== 'string' || message.length > 500) {
        return res.status(400).json({ error: 'Invalid message format or too long' });
    }

    // Safety check for injury/medical keywords
    const dangerousKeywords = [
        'injury', 'injured', 'pain', 'hurt', 'ache', 'sore', 'surgery', 
        'doctor', 'physical therapy', 'medical', 'pregnant', 'diabetes',
        'heart condition', 'blood pressure', 'medication', 'rehab'
    ];
    
    const containsDangerousKeywords = dangerousKeywords.some(keyword => 
        message.toLowerCase().includes(keyword)
    );

    if (containsDangerousKeywords) {
        return res.json({ 
            response: "I cannot provide exercise advice for injuries, pain, or medical conditions. Please consult a qualified healthcare professional, physical therapist, or your doctor before modifying your training program."
        });
    }
    
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
                    content: `You are a Three Anchor training methodology expert. CRITICAL SAFETY RULES:
1. If user mentions ANY injury, pain, medical condition, or physical limitations, respond ONLY with "Please consult a healthcare professional for exercise modifications related to injuries or medical conditions."
2. Never recommend exercises for people with stated injuries
3. Always remind users this advice does not replace professional coaching
4. If unsure about safety, recommend consulting a qualified trainer

Respond to program modification requests while maintaining ME/DE/SE/RE principles, CNS load management, and Vertical Integration sequencing (Speed→Power→Strength→Hypertrophy→Endurance). Keep responses under 100 words and always end with "Consult a qualified trainer for personalized guidance."`
                }, {
                    role: 'user',
                    content: `User profile: ${JSON.stringify(userProfile, null, 2)}\n\nCurrent program: ${JSON.stringify(currentProgram, null, 2)}\n\nUser request: ${message}`
                }],
                max_tokens: 200,
                temperature: 0.2
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API request failed: ${response.status}`);
        }

        const data = await response.json();
        
        // Validate response exists
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('Invalid response from OpenAI');
        }

        res.json({ response: data.choices[0].message.content });
    } catch (error) {
        console.error('LLM API Error:', error);
        res.status(500).json({ 
            error: 'Unable to process request. Please try again or use basic modification commands.' 
        });
    }
}
