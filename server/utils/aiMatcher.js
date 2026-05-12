import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

export async function findBestMatch(lostItem, foundItems) {
  try {
    if (!foundItems || foundItems.length === 0) {
      return {
        matched: false,
        score: 0,
        reason: "No found items available"
      };
    }

    const prompt = `
You are an AI lost-and-found matching assistant.

Lost Item:
Title: ${lostItem.title}
Description: ${lostItem.description}
Category: ${lostItem.category}
Location: ${lostItem.location}

Found Items:
${foundItems
  .map(
    (item, index) => `
${index}.
Title: ${item.title}
Description: ${item.description}
Category: ${item.category}
Location: ${item.location}
`
  )
  .join("\n")}

Find the best matching found item.

Important:
- matchedIndex must be zero-based index.
- If first found item matches, return matchedIndex: 0.
- Score should be 0 to 100.
- Return only valid JSON.

Return format:
{
  "matched": true,
  "score": 85,
  "matchedIndex": 0,
  "reason": "Same category and similar location/description"
}
`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const text = completion.choices[0]?.message?.content || "";

    const cleaned = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const result = JSON.parse(cleaned);

    if (
      result.matched === true &&
      typeof result.matchedIndex === "number" &&
      foundItems[result.matchedIndex]
    ) {
      return {
        matched: true,
        score: Number(result.score) || 0,
        matchedIndex: result.matchedIndex,
        reason: result.reason || "Possible match found",
        item: foundItems[result.matchedIndex]
      };
    }

    return {
      matched: false,
      score: Number(result.score) || 0,
      reason: result.reason || "No strong match found"
    };
  } catch (error) {
    console.error("AI Match Error:", error);

    return {
      matched: false,
      score: 0,
      reason: "AI matching failed"
    };
  }
}