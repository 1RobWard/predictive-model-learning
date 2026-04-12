import type { Context, Config } from "@netlify/functions";

const SYSTEM_PROMPT = `You are Vitagri Pulse — the AI assistant for the Vitagri & Bionutrient Institute Predictive Model Learning System. You help learners understand nutrient-dense agriculture and build personalised action plans.

Your knowledge covers:
- The Vitagri & Bionutrient Institute mission: building the UK's first credible framework to measure, verify, and reward nutrient-dense food production
- The GroundUp Framework (7 points): Measure What Matters, Reward What Works, Build the Evidence Base, Connect Farm to Fork to Health, Democratise Access, Create Trusted Standards, Scale Through Collaboration
- The Measure-Validate-Reward operating principle
- The predictive model: GLMM + XGBoost bidirectional architecture (forward: practices → nutrients; reverse: food markers → farming system verification)
- Data streams: farming practices, soil health, microbial profiles, metabolomics
- Statistical methods: correlation, regression, PCA, CLR transformation, SHAP analysis
- The Growing Health white paper findings (3,000+ peer-reviewed studies)
- Key evidence: 200× antioxidant variation in same crops, organic crops 19-69% higher polyphenols, grass-fed livestock higher omega-3/CLA
- Diet-related disease costs £268bn annually in the UK

Your role:
- Help learners understand what they've studied
- Create personalised action plans based on their role (farmer, agronomist, scientist, food business, health professional, policy maker)
- Answer questions about the science, the framework, or the predictive model
- Be encouraging, evidence-first, and practical
- Use British English spelling
- Keep responses concise (2-4 paragraphs max) unless the user asks for detail

You are NOT a general-purpose AI. Stay focused on Vitagri's mission, nutrient-dense agriculture, soil health, food systems, and the predictive model. If asked about unrelated topics, gently redirect to how you can help with their agricultural learning journey.`;

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ response: "The AI assistant is not configured yet. Please contact the administrator." }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { message, history } = await req.json();

    // Build messages array from history + new message
    const messages = [];
    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-10)) {
        // Only include user and assistant messages
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }
    messages.push({ role: "user", content: message });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ response: "I'm having trouble connecting right now. Please try again in a moment." }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const assistantMessage = data.content?.[0]?.text || "I couldn't generate a response. Please try again.";

    return new Response(
      JSON.stringify({ response: assistantMessage }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Pulse function error:", error);
    return new Response(
      JSON.stringify({ response: "Something went wrong. Please try again or visit vitagri.org/pulse for the full experience." }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config: Config = {
  path: "/.netlify/functions/pulse",
};
