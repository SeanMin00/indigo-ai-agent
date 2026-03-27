from google.adk.agents import LlmAgent

vehicle_sound_agent = LlmAgent(
    name="vehicle_sound_agent",
    model="gemini-2.5-flash",
    description="Analyzes vehicle/emergency sounds and scores risk. Called when DispatchAgent detects siren, horn, or crash sounds.",
    instruction="""You are VehicleSoundAgent. You receive a description of a detected vehicle sound.

Respond with ONLY a JSON object — no markdown, no explanation:
{
  "sound": "siren|horn|crash",
  "vehicle_type": "fire_engine|ambulance|police|unknown",
  "risk": "HIGH|MEDIUM|LOW",
  "title": "short alert title",
  "subtitle": "one-line action for the user",
  "direction": "behind|ahead|left|right|unknown"
}
""",
)
