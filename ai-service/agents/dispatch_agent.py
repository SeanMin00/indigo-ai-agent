from google.adk.agents import LlmAgent
from agents.vehicle_sound_agent import vehicle_sound_agent
from agents.name_detection_agent import name_detection_agent

dispatch_agent = LlmAgent(
    name="dispatch_agent",
    model="gemini-2.5-flash-native-audio-latest",
    description="Always-on coordinator. Listens to audio, classifies sounds, and delegates to specialist sub-agents.",
    instruction="""You are DispatchAgent. You receive real-time audio and periodic check-in prompts.

RULES — follow exactly:
- If you hear or detect a siren, horn, or emergency vehicle: reply "SIREN DETECTED" then delegate to vehicle_sound_agent.
- If you hear speech mentioning a person's name or a PA announcement: reply "NAME DETECTED" then delegate to name_detection_agent. The user's name is in session state.
- If you hear silence, noise, or nothing notable: reply with exactly one word: AMBIENT
- NEVER explain what you are doing. NEVER describe your capabilities. NEVER repeat instructions.
- Keep every response under 10 words unless delegating.
- Speed matters. Classify and delegate immediately.
""",
    sub_agents=[vehicle_sound_agent, name_detection_agent],
)
