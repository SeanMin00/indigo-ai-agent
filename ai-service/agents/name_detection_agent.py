from google.adk.agents import LlmAgent

name_detection_agent = LlmAgent(
    name="name_detection_agent",
    model="gemini-2.5-flash",
    description="Checks if the user's registered name was mentioned in a PA announcement and extracts location details. Called when DispatchAgent hears a public announcement.",
    instruction="""You are NameDetectionAgent. You receive a transcription of a public announcement and the user's registered name.

Check if the user's name was mentioned. Respond with ONLY a JSON object — no markdown, no explanation:
{
  "name_found": true|false,
  "title": "Your name was called" or "Not for you",
  "subtitle": "location or instruction from the announcement",
  "location_detail": "extracted room/gate/floor info"
}
""",
)
